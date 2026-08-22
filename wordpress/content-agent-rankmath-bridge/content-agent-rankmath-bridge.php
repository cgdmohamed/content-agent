<?php
/**
 * Plugin Name: Content Agent Rank Math Bridge
 * Plugin URI: https://github.com/cgdmohamed/content-agent
 * Description: Enables Content Agent to write Rank Math SEO fields through the WordPress REST API.
 * Version: 0.1.0
 * Author: Content Agent
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Text Domain: content-agent-rankmath-bridge
 */

if (!defined('ABSPATH')) {
    exit;
}

const CONTENT_AGENT_RANKMATH_META_KEYS = [
    'rank_math_title',
    'rank_math_description',
    'rank_math_focus_keyword',
    'rank_math_pillar_content',
    'rank_math_robots',
    'rank_math_canonical_url',
    'rank_math_schema_Article'
];

add_action('init', 'content_agent_rankmath_register_post_meta');
add_action('rest_api_init', 'content_agent_rankmath_register_routes');

function content_agent_rankmath_register_post_meta(): void
{
    foreach (CONTENT_AGENT_RANKMATH_META_KEYS as $key) {
        register_post_meta('post', $key, [
            'type' => 'string',
            'single' => true,
            'show_in_rest' => true,
            'auth_callback' => 'content_agent_rankmath_can_edit_meta',
            'sanitize_callback' => 'content_agent_rankmath_sanitize_meta'
        ]);
    }
}

function content_agent_rankmath_can_edit_meta(): bool
{
    return current_user_can('edit_posts');
}

function content_agent_rankmath_sanitize_meta($value): string
{
    if (is_array($value) || is_object($value)) {
        return wp_json_encode($value);
    }

    return sanitize_text_field((string) $value);
}

function content_agent_rankmath_register_routes(): void
{
    register_rest_route('content-agent/v1', '/rankmath', [
        [
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'content_agent_rankmath_health',
            'permission_callback' => 'content_agent_rankmath_can_edit_meta'
        ],
        [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'content_agent_rankmath_update_post_meta',
            'permission_callback' => 'content_agent_rankmath_can_edit_meta',
            'args' => [
                'postId' => [
                    'required' => true,
                    'type' => 'integer',
                    'minimum' => 1
                ]
            ]
        ]
    ]);
}

function content_agent_rankmath_health(): WP_REST_Response
{
    return new WP_REST_Response([
        'ok' => true,
        'plugin' => 'content-agent-rankmath-bridge',
        'rankMathActive' => defined('RANK_MATH_VERSION'),
        'version' => '0.1.0'
    ], 200);
}

function content_agent_rankmath_update_post_meta(WP_REST_Request $request)
{
    $post_id = (int) $request->get_param('postId');
    $post = get_post($post_id);

    if (!$post || $post->post_type !== 'post') {
        return new WP_Error('content_agent_post_not_found', 'Post not found.', ['status' => 404]);
    }

    if (!current_user_can('edit_post', $post_id)) {
        return new WP_Error('content_agent_forbidden', 'You cannot edit this post.', ['status' => 403]);
    }

    $payload = $request->get_json_params();
    if (!is_array($payload)) {
        return new WP_Error('content_agent_invalid_payload', 'Invalid JSON payload.', ['status' => 400]);
    }

    $updated = [];
    foreach (CONTENT_AGENT_RANKMATH_META_KEYS as $key) {
        if (!array_key_exists($key, $payload)) {
            continue;
        }

        update_post_meta($post_id, $key, content_agent_rankmath_sanitize_meta($payload[$key]));
        $updated[] = $key;
    }

    return new WP_REST_Response([
        'ok' => true,
        'postId' => $post_id,
        'updated' => $updated
    ], 200);
}
