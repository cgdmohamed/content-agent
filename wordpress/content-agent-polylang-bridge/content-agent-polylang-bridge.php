<?php
/**
 * Plugin Name: Content Agent Polylang Bridge
 * Plugin URI: https://github.com/cgdmohamed/content-agent
 * Description: Lets Content Agent set the language of posts, categories and tags and link translations through the WordPress REST API (the free Polylang plugin does not expose this).
 * Version: 0.1.0
 * Author: Content Agent
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Text Domain: content-agent-polylang-bridge
 */

if (!defined('ABSPATH')) {
    exit;
}

const CONTENT_AGENT_POLYLANG_BRIDGE_VERSION = '0.1.0';

add_action('rest_api_init', 'content_agent_polylang_register_routes');
add_action('rest_api_init', 'content_agent_polylang_register_fields');
add_filter('rest_post_query', 'content_agent_polylang_filter_query', 10, 2);
add_filter('rest_category_query', 'content_agent_polylang_filter_query', 10, 2);
add_filter('rest_post_tag_query', 'content_agent_polylang_filter_query', 10, 2);

function content_agent_polylang_can_edit(): bool
{
    return current_user_can('edit_posts');
}

/** Polylang's own REST fields (Polylang Pro) take over when they exist; registering them twice would conflict. */
function content_agent_polylang_is_ready(): bool
{
    return function_exists('pll_languages_list') && function_exists('pll_set_post_language');
}

function content_agent_polylang_pro_active(): bool
{
    return defined('POLYLANG_PRO') || class_exists('PLL_REST_Post');
}

function content_agent_polylang_languages(): array
{
    if (!content_agent_polylang_is_ready()) {
        return [];
    }

    $default = function_exists('pll_default_language') ? pll_default_language('slug') : '';
    $rows = [];
    foreach ((array) pll_languages_list(['fields' => '']) as $language) {
        $rows[] = [
            'code' => $language->slug,
            'name' => $language->name,
            'locale' => $language->locale,
            'isRtl' => (bool) $language->is_rtl,
            'isDefault' => $language->slug === $default,
        ];
    }

    return $rows;
}

function content_agent_polylang_register_routes(): void
{
    register_rest_route('content-agent/v1', '/polylang', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'content_agent_polylang_health',
        'permission_callback' => 'content_agent_polylang_can_edit',
    ]);
}

function content_agent_polylang_health(): WP_REST_Response
{
    return new WP_REST_Response([
        'ok' => true,
        'plugin' => 'content-agent-polylang-bridge',
        'version' => CONTENT_AGENT_POLYLANG_BRIDGE_VERSION,
        'polylangActive' => content_agent_polylang_is_ready(),
        'polylangPro' => content_agent_polylang_pro_active(),
        'languages' => content_agent_polylang_languages(),
    ], 200);
}

function content_agent_polylang_register_fields(): void
{
    if (!content_agent_polylang_is_ready() || content_agent_polylang_pro_active()) {
        return;
    }

    // Every post type Polylang translates (posts, pages, custom types such as services) reports its language,
    // so Content Agent can build a per-language index of the site's pages.
    $post_types = array_values(array_filter(
        get_post_types(['show_in_rest' => true]),
        static function ($type) {
            return function_exists('pll_is_translated_post_type') && pll_is_translated_post_type($type);
        }
    ));
    if (!in_array('post', $post_types, true)) {
        $post_types[] = 'post';
    }

    $lang_schema = [
        'description' => 'Polylang language slug.',
        'type' => 'string',
        'context' => ['view', 'edit'],
    ];
    $translations_schema = [
        'description' => 'Polylang translations as {language slug: object ID}.',
        'type' => 'object',
        'context' => ['view', 'edit'],
        'additionalProperties' => ['type' => 'integer'],
    ];

    register_rest_field($post_types, 'lang', [
        'get_callback' => static function (array $object) {
            return pll_get_post_language((int) $object['id'], 'slug') ?: null;
        },
        'update_callback' => static function ($value, $post) {
            return content_agent_polylang_set_language('post', (int) $post->ID, $value);
        },
        'schema' => $lang_schema,
    ]);
    register_rest_field('post', 'translations', [
        'get_callback' => static function (array $object) {
            return (object) pll_get_post_translations((int) $object['id']);
        },
        'update_callback' => static function ($value, $post) {
            return content_agent_polylang_link_translations('post', (int) $post->ID, $value);
        },
        'schema' => $translations_schema,
    ]);

    foreach (['category', 'post_tag'] as $taxonomy) {
        register_rest_field($taxonomy, 'lang', [
            'get_callback' => static function (array $object) {
                return pll_get_term_language((int) $object['id'], 'slug') ?: null;
            },
            'update_callback' => static function ($value, $term) {
                return content_agent_polylang_set_language('term', (int) $term->term_id, $value);
            },
            'schema' => $lang_schema,
        ]);
    }
}

function content_agent_polylang_valid_language($value): ?string
{
    if (!is_string($value) || $value === '') {
        return null;
    }

    $slug = sanitize_key($value);

    return in_array($slug, (array) pll_languages_list(), true) ? $slug : null;
}

function content_agent_polylang_set_language(string $kind, int $id, $value)
{
    $slug = content_agent_polylang_valid_language($value);
    if ($slug === null) {
        return new WP_Error('content_agent_invalid_language', 'Unknown Polylang language.', ['status' => 400]);
    }

    if ($kind === 'post') {
        if (!current_user_can('edit_post', $id)) {
            return new WP_Error('content_agent_forbidden', 'You cannot edit this post.', ['status' => 403]);
        }
        pll_set_post_language($id, $slug);
    } else {
        if (!current_user_can('edit_term', $id)) {
            return new WP_Error('content_agent_forbidden', 'You cannot edit this term.', ['status' => 403]);
        }
        pll_set_term_language($id, $slug);
    }

    return true;
}

/** Saves the whole translation group; `$id` must be part of it so one request cannot rewire unrelated posts. */
function content_agent_polylang_link_translations(string $kind, int $id, $value)
{
    if (!is_array($value) && !is_object($value)) {
        return new WP_Error('content_agent_invalid_translations', 'translations must be an object.', ['status' => 400]);
    }

    $group = [];
    foreach ((array) $value as $code => $object_id) {
        $slug = content_agent_polylang_valid_language((string) $code);
        $object_id = (int) $object_id;
        if ($slug === null || $object_id <= 0) {
            return new WP_Error('content_agent_invalid_translations', 'Invalid language or object ID in translations.', ['status' => 400]);
        }
        if (!current_user_can('edit_post', $object_id)) {
            return new WP_Error('content_agent_forbidden', 'You cannot edit one of the translated posts.', ['status' => 403]);
        }
        if (pll_get_post_language($object_id, 'slug') !== $slug) {
            return new WP_Error('content_agent_language_mismatch', 'A post in translations has a different language.', ['status' => 400]);
        }
        $group[$slug] = $object_id;
    }

    if (!in_array($id, $group, true)) {
        return new WP_Error('content_agent_invalid_translations', 'translations must include the post being updated.', ['status' => 400]);
    }

    pll_save_post_translations($group);

    return true;
}

/** `?lang=en` on list requests, so Content Agent finds categories/tags/posts of one language only. */
function content_agent_polylang_filter_query(array $args, WP_REST_Request $request): array
{
    $lang = $request->get_param('lang');
    if (is_string($lang) && $lang !== '' && content_agent_polylang_is_ready()) {
        $args['lang'] = sanitize_key($lang);
    }

    return $args;
}
