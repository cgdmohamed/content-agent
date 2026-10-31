<?php
/**
 * Inline SVG icons — replaces the demo's iconify CDN.
 * UI icons (lucide/mdi subset) live in assets/icons/ui.json, brand marks (simple-icons, CC0)
 * in assets/icons/brands.json.
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

function cc_json_asset( string $rel ): array {
	static $cache = [];
	if ( ! isset( $cache[ $rel ] ) ) {
		$raw             = file_get_contents( CC_DIR . '/' . $rel );
		$cache[ $rel ]   = $raw ? ( json_decode( $raw, true ) ?: [] ) : [];
	}
	return $cache[ $rel ];
}

function cc_brands(): array {
	return cc_json_asset( 'assets/icons/brands.json' );
}

/** iconify names the demo replaced with brand marks. */
const CC_BRAND_ICON_MAP = [
	'mdi:whatsapp' => 'whatsapp', 'mdi:facebook' => 'facebook', 'mdi:instagram' => 'instagram',
	'mdi:linkedin' => 'linkedin', 'ic:baseline-tiktok' => 'tiktok',
];

/** Brand mark as inline SVG. */
function cc_brand_svg( string $slug, string $class = 'w-5 h-5', bool $color = false ): string {
	$brands = cc_brands();
	if ( ! isset( $brands[ $slug ] ) ) {
		return '';
	}
	$b     = $brands[ $slug ];
	$style = $color ? ' style="color:' . esc_attr( $b['hex'] ) . '"' : '';
	return '<svg class="' . esc_attr( $class ) . ' shrink-0" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="' . esc_attr( $b['title'] ) . '"' . $style . '><path d="' . esc_attr( $b['path'] ) . '"/></svg>';
}

/** UI icon. $name is an iconify-style name, e.g. "lucide:check"; sized by font-size classes (text-2xl …). */
function cc_icon( string $name, string $class = '' ): string {
	if ( isset( CC_BRAND_ICON_MAP[ $name ] ) ) {
		$sizes = [ 'text-xl' => 'w-5 h-5', 'text-2xl' => 'w-6 h-6', 'text-3xl' => 'w-8 h-8', 'text-4xl' => 'w-9 h-9' ];
		$size  = 'w-5 h-5';
		$rest  = [];
		foreach ( preg_split( '/\s+/', trim( $class ) ) as $c ) {
			if ( isset( $sizes[ $c ] ) ) {
				$size = $sizes[ $c ];
			} elseif ( $c !== '' ) {
				$rest[] = $c;
			}
		}
		return cc_brand_svg( CC_BRAND_ICON_MAP[ $name ], trim( $size . ' ' . implode( ' ', $rest ) ) );
	}
	$icons = cc_json_asset( 'assets/icons/ui.json' );
	if ( ! isset( $icons[ $name ] ) ) {
		return '';
	}
	return '<svg class="cc-i ' . esc_attr( $class ) . '" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' . $icons[ $name ] . '</svg>';
}

/** Icon that is either a brand slug (feature cards) or an iconify name. */
function cc_feat_icon( string $ic ): string {
	return isset( cc_brands()[ $ic ] ) ? cc_brand_svg( $ic, 'w-8 h-8' ) : cc_icon( str_contains( $ic, ':' ) ? $ic : 'lucide:' . $ic, 'text-3xl' );
}

/** Chip with brand mark. $item = slug | [slug, label] | plain text. */
function cc_brand_chip( $item, bool $dark = false ): string {
	[ $slug, $label ] = is_array( $item ) ? [ $item[0], $item[1] ?? null ] : [ $item, null ];
	$brands = cc_brands();
	$base   = $dark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-100';
	if ( isset( $brands[ $slug ] ) ) {
		$b = $brands[ $slug ];
		return '<span class="brand-chip inline-flex items-center gap-2 px-4 py-2 rounded-xl ' . $base . ' border font-bold text-sm" style="--brand:' . esc_attr( $b['hex'] ) . '" dir="ltr">'
			. cc_brand_svg( $slug ) . esc_html( $label ?: $b['title'] ) . '</span>';
	}
	return '<span class="inline-flex items-center px-4 py-2 rounded-xl ' . $base . ' border font-bold text-sm" dir="ltr">' . esc_html( $label ?: $slug ) . '</span>';
}
