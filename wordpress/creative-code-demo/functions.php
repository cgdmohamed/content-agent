<?php
/**
 * Creative Code Demo — functions.php
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'CC_VERSION', '3.0.0' );
define( 'CC_DIR',     get_template_directory() );
define( 'CC_URI',     get_template_directory_uri() );
define( 'CC_INC',     CC_DIR . '/inc/' );

/* Keep PHP notices from breaking customize.php inline JSON. */
global $pagenow;
if ( is_admin() && $pagenow === 'customize.php' ) {
	@ini_set( 'display_errors', '0' );
}
add_filter( 'customize_loaded_components', function ( array $components ): array {
	global $pagenow;
	return ( is_admin() && $pagenow === 'customize.php' ) ? [] : $components;
}, 99 );

/* Data model (unchanged from Creative Code 2026) */
require_once CC_INC . 'post-types.php';
require_once CC_INC . 'meta-boxes.php';
require_once CC_INC . 'settings-page.php';
require_once CC_INC . 'customizer.php';
require_once CC_INC . 'legacy.php';

/* New design layer */
require_once CC_INC . 'helpers.php';
require_once CC_INC . 'icons.php';
require_once CC_INC . 'data.php';
require_once CC_INC . 'meta-demo.php';
require_once CC_INC . 'ui.php';
require_once CC_INC . 'ui-service.php';
require_once CC_INC . 'forms.php';
require_once CC_INC . 'seo.php';
require_once CC_INC . 'seed.php';
require_once CC_INC . 'importer.php';

/* ============================================================
   THEME SETUP
   ============================================================ */
add_action( 'after_setup_theme', function () {
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'custom-logo', [
		'height' => 100, 'width' => 400, 'flex-height' => true, 'flex-width' => true,
		'unlink-homepage-logo' => true,
	] );
	add_theme_support( 'title-tag' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'html5', [ 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' ] );
	add_theme_support( 'align-wide' );
	add_theme_support( 'responsive-embeds' );

	register_nav_menus( [
		'primary' => __( 'القائمة الرئيسية', 'creativecode' ),
		'footer'  => __( 'قائمة التذييل', 'creativecode' ),
	] );

	$GLOBALS['content_width'] = 1280;
	load_theme_textdomain( 'creativecode', CC_DIR . '/languages' );
} );

/* ============================================================
   ASSETS
   ============================================================ */
add_action( 'wp_enqueue_scripts', function () {
	wp_enqueue_style( 'cc-fonts', 'https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800;900&display=swap', [], null );
	wp_enqueue_style( 'cc-app', CC_URI . '/assets/css/app.css', [], cc_asset_ver( 'assets/css/app.css' ) );
	wp_enqueue_style( 'cc-theme', CC_URI . '/assets/css/theme.css', [ 'cc-app' ], cc_asset_ver( 'assets/css/theme.css' ) );

	// Prices come from the cc_package CPT (or demo defaults); theme.js reads window.CC_PRICING.
	wp_register_script( 'cc-pricing', false, [], CC_VERSION, true );
	wp_enqueue_script( 'cc-pricing' );
	wp_add_inline_script( 'cc-pricing', 'window.CC_PRICING = ' . wp_json_encode( cc_pricing_config(), JSON_UNESCAPED_UNICODE ) . ';' );
	wp_enqueue_script( 'cc-theme', CC_URI . '/assets/js/theme.js', [ 'cc-pricing' ], cc_asset_ver( 'assets/js/theme.js' ), true );

	if ( is_singular() && comments_open() && get_option( 'thread_comments' ) ) {
		wp_enqueue_script( 'comment-reply' );
	}
} );

function cc_asset_ver( string $rel ): string {
	$path = CC_DIR . '/' . $rel;
	return file_exists( $path ) ? (string) filemtime( $path ) : CC_VERSION;
}

/* Landing-page mode class is set before first paint to avoid a flash. */
add_action( 'wp_head', function () {
	echo '<script>(function(){var d=document.documentElement;if(/[?&]lp=1(&|$)/.test(location.search)||d.hasAttribute("data-lp"))d.classList.add("lp-mode")})();</script>' . "\n";
	echo '<meta name="theme-color" content="#680bd6">' . "\n";
	echo '<meta name="view-transition" content="same-origin">' . "\n";
}, 1 );

add_filter( 'language_attributes', function ( string $attrs ): string {
	if ( ! str_contains( $attrs, 'dir=' ) ) {
		$attrs .= ' dir="rtl"';
	}
	$attrs .= ' data-country="' . esc_attr( cc_default_country() ) . '"';
	if ( cc_is_lp_page() ) {
		$attrs .= ' data-lp';
	}
	return $attrs;
} );

/* The emoji loader pulls images from s.w.org; the design only uses two flag glyphs. */
remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
remove_action( 'wp_print_styles', 'print_emoji_styles' );

/* Gutenberg front-end noise the design does not use. */
add_action( 'wp_enqueue_scripts', function () {
	wp_dequeue_style( 'wp-block-library' );
	wp_dequeue_style( 'wp-block-library-theme' );
	wp_dequeue_style( 'classic-theme-styles' );
	wp_dequeue_style( 'global-styles' );
}, 100 );
remove_action( 'wp_enqueue_scripts', 'wp_enqueue_global_styles' );
add_filter( 'wp_default_scripts', function ( $scripts ) {
	if ( ! is_admin() && isset( $scripts->registered['jquery'] ) ) {
		$scripts->registered['jquery']->deps = array_diff( $scripts->registered['jquery']->deps, [ 'jquery-migrate' ] );
	}
} );
add_action( 'wp_enqueue_scripts', function () {
	if ( ! is_user_logged_in() ) {
		wp_deregister_style( 'dashicons' );
	}
} );
