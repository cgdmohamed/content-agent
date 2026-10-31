<?php
/**
 * Content layer. Everything the templates show comes from the existing Creative Code
 * data model (CPTs + Appearance → إعدادات القالب). When a collection is empty the demo
 * defaults in demo-data.json are used, so the theme looks right on a fresh install.
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

/** Demo defaults (exported from the demo's _source/*.py). */
function cc_demo( string $key = '' ) {
	static $data = null;
	if ( $data === null ) {
		$data = json_decode( (string) file_get_contents( CC_INC . 'demo-data.json' ), true ) ?: [];
		// Bundled stock photos are stored as theme-relative paths.
		array_walk_recursive( $data, function ( &$v ) {
			if ( is_string( $v ) && str_starts_with( $v, 'assets/img/stock/' ) ) {
				$v = CC_URI . '/' . $v;
			}
		} );
	}
	return $key === '' ? $data : ( $data[ $key ] ?? [] );
}

function cc_digits( string $s ): string {
	return preg_replace( '/\D+/', '', $s );
}

/** Site-wide facts: demo defaults overridden by Appearance → إعدادات القالب. */
function cc_site( string $key = '' ) {
	static $site = null;
	if ( $site === null ) {
		$d    = cc_demo( 'SITE' );
		$site = $d;

		$phone = cc_opt( 'phone' );
		if ( $phone !== '' ) {
			$site['phone_display'] = $phone;
			$site['phone_tel']     = '+' . cc_digits( $phone );
		}
		$wa = cc_digits( cc_opt( 'whatsapp' ) );
		if ( $wa !== '' ) {
			$site['whatsapp'] = 'https://wa.me/' . $wa;
		} elseif ( $phone !== '' ) {
			$site['whatsapp'] = 'https://wa.me/' . cc_digits( $phone );
		}
		foreach ( [ 'email' => 'email', 'address' => 'city', 'footer_about' => 'tagline', 'founder' => 'founder', 'founder_title' => 'founder_title', 'markets' => 'markets' ] as $opt => $k ) {
			if ( cc_opt( $opt ) !== '' ) {
				$site[ $k ] = cc_opt( $opt );
			}
		}
		if ( (int) cc_opt( 'years' ) > 0 ) {
			$site['years'] = (int) cc_opt( 'years' );
		}

		$social = [];
		foreach ( [ 'facebook', 'instagram', 'tiktok', 'linkedin' ] as $net ) {
			$social[] = [ $net, cc_opt( 'social_' . $net ) ?: '#' ];
		}
		$site['social'] = $social;
	}
	return $key === '' ? $site : ( $site[ $key ] ?? '' );
}

function cc_img( string $key ): string {
	$img = cc_demo( 'IMG' );
	return $img[ $key ] ?? reset( $img );
}

/* ------------------------------------------------------------------ URLs */

function cc_url( string $what ): string {
	switch ( $what ) {
		case 'home':     return home_url( '/' );
		case 'contact':  return home_url( '/#contact' );
		case 'services': return get_post_type_archive_link( 'cc_service' ) ?: home_url( '/services/' );
		case 'work':     return get_post_type_archive_link( 'cc_project' ) ?: home_url( '/projects/' );
		case 'blog':
			$id = (int) get_option( 'page_for_posts' );
			return $id ? get_permalink( $id ) : home_url( '/blog/' );
		default:
			$page = get_page_by_path( $what );
			return $page ? get_permalink( $page ) : home_url( '/' . $what . '/' );
	}
}

/** Main navigation entries (key, label, url). */
function cc_nav_items(): array {
	$urls = [
		'home' => cc_url( 'home' ), 'services' => cc_url( 'services' ), 'pricing' => cc_url( 'pricing' ), 'work' => cc_url( 'work' ),
		'about' => cc_url( 'about' ), 'blog' => cc_url( 'blog' ), 'faq' => cc_url( 'faq' ),
	];
	$items = [];
	foreach ( cc_demo( 'NAV' ) as [ $key, $label ] ) {
		$items[] = [ $key, $label, $urls[ $key ] ?? home_url( '/' ) ];
	}
	return $items;
}

/** Which nav entry is current. */
function cc_active_nav(): string {
	if ( is_front_page() )                                   return 'home';
	if ( is_post_type_archive( 'cc_service' ) || is_singular( 'cc_service' ) ) return 'services';
	if ( is_post_type_archive( 'cc_project' ) || is_singular( 'cc_project' ) ) return 'work';
	if ( is_post_type_archive( 'cc_package' ) || is_singular( 'cc_package' ) ) return 'pricing';
	if ( is_home() || is_singular( 'post' ) || is_category() || is_tag() || is_search() ) return 'blog';
	if ( is_page() ) {
		$slug = get_post_field( 'post_name', get_queried_object_id() );
		return in_array( $slug, [ 'pricing', 'about', 'faq' ], true ) ? $slug : '';
	}
	return '';
}

function cc_default_country(): string {
	$cf = strtoupper( sanitize_text_field( wp_unslash( $_SERVER['HTTP_CF_IPCOUNTRY'] ?? '' ) ) );
	return $cf === 'SA' ? 'SA' : 'EG';
}

/** Landing mode forced for this page (service meta or legacy "custom layout" page toggle). */
function cc_is_lp_page(): bool {
	if ( is_singular( 'cc_service' ) && get_post_meta( get_queried_object_id(), 'lp_mode', true ) === '1' ) {
		return true;
	}
	return false;
}

/* -------------------------------------------------------------- services */

function cc_wa_service( string $name ): string {
	return cc_site( 'whatsapp' ) . '?text=' . rawurlencode( 'مرحباً، أريد الاستفسار عن خدمة ' . $name );
}

function cc_demo_service_by_slug( string $slug ): ?array {
	foreach ( cc_demo( 'SERVICE_PAGES' ) as $sp ) {
		if ( $sp['slug'] === $slug ) {
			return $sp;
		}
	}
	return null;
}

function cc_demo_service_card( string $id ): array {
	foreach ( cc_demo( 'SERVICES' ) as $s ) {
		if ( $s['id'] === $id ) {
			return $s;
		}
	}
	return [];
}

/** Normalized services for cards, nav dropdown, footer and the contact form select. */
function cc_get_services(): array {
	static $list = null;
	if ( $list !== null ) {
		return $list;
	}
	$posts = get_posts( [ 'post_type' => 'cc_service', 'post_status' => 'publish', 'posts_per_page' => 24, 'orderby' => [ 'menu_order' => 'ASC', 'title' => 'ASC' ], 'suppress_filters' => false ] );
	$list  = [];
	if ( $posts ) {
		foreach ( $posts as $p ) {
			$sp   = cc_demo_service_by_slug( $p->post_name );
			$card = $sp ? cc_demo_service_card( $sp['id'] ) : [];
			$text = has_excerpt( $p ) ? get_the_excerpt( $p ) : ( $card['text'] ?? wp_trim_words( wp_strip_all_tags( $p->post_content ), 24 ) );
			$icon = get_post_meta( $p->ID, 'lp_icon', true ) ?: ( $card['icon'] ?? 'lucide:layout-template' );
			$list[] = [
				'id' => $sp['id'] ?? $p->post_name, 'slug' => $p->post_name, 'post_id' => $p->ID, 'url' => get_permalink( $p ),
				'icon' => str_contains( $icon, ':' ) ? $icon : 'lucide:' . $icon, 'title' => get_the_title( $p ),
				'text' => $text, 'nav' => get_post_meta( $p->ID, 'lp_nav', true ) ?: ( $sp['nav'] ?? get_the_title( $p ) ),
			];
		}
		return $list;
	}
	foreach ( cc_demo( 'SERVICES' ) as $s ) {
		$sp = null;
		foreach ( cc_demo( 'SERVICE_PAGES' ) as $x ) {
			if ( $x['id'] === $s['id'] ) { $sp = $x; break; }
		}
		$list[] = [
			'id' => $s['id'], 'slug' => $sp['slug'] ?? $s['id'], 'post_id' => 0, 'url' => home_url( '/services/' . ( $sp['slug'] ?? $s['id'] ) . '/' ),
			'icon' => $s['icon'], 'title' => $s['title'], 'text' => $s['text'], 'nav' => $sp['nav'] ?? $s['title'],
		];
	}
	return $list;
}

/** Landing-page content for one service: meta overrides → demo page of the same slug → generic fallback. */
function cc_service_lp( int $post_id ): array {
	$p    = get_post( $post_id );
	$demo = cc_demo_service_by_slug( $p->post_name ) ?: [];
	$m    = fn( string $k ) => trim( (string) get_post_meta( $post_id, $k, true ) );
	$lines = fn( string $k, array $fb ) => ( $v = $m( $k ) ) !== '' ? cc_meta_lines( $v ) : $fb;

	$features = $demo['features'] ?? [];
	if ( $m( 'lp_features' ) !== '' ) {
		$features = [];
		foreach ( cc_meta_lines( $m( 'lp_features' ) ) as $ln ) {
			$c = array_map( 'trim', explode( '|', $ln, 3 ) );
			if ( count( $c ) >= 3 ) {
				$features[] = $c;
			}
		}
	}
	$tools = $demo['tools'] ?? [];
	if ( $m( 'lp_tools' ) !== '' ) {
		$tools = [];
		foreach ( cc_meta_lines( $m( 'lp_tools' ) ) as $ln ) {
			$c       = array_map( 'trim', explode( '|', $ln, 2 ) );
			$tools[] = isset( $c[1] ) ? [ $c[0], $c[1] ] : $c[0];
		}
	}
	$faq = [];
	foreach ( cc_get_faq_items( $post_id ) as $f ) {
		$faq[] = [ $f['question'], $f['answer'] ];
	}
	$faq = $faq ?: ( $demo['faq'] ?? [] );

	$solutions = $lines( 'lp_solutions', $demo['solutions'] ?? cc_meta_lines( (string) get_post_meta( $post_id, 'service_features', true ) ) );
	$title     = get_the_title( $p );
	$thumb     = get_the_post_thumbnail_url( $p, 'large' );

	return [
		'id' => $demo['id'] ?? $p->post_name, 'slug' => $p->post_name, 'post_id' => $post_id,
		'nav' => $m( 'lp_nav' ) ?: ( $demo['nav'] ?? $title ),
		'keyword' => $demo['keyword'] ?? $title,
		'seo_title' => $m( 'lp_seo_title' ) ?: ( $demo['seo_title'] ?? $title ),
		'seo_desc' => $m( 'lp_seo_desc' ) ?: ( $demo['seo_desc'] ?? cc_schema_excerpt( $post_id ) ),
		'h1' => $m( 'lp_h1' ) ?: ( $demo['h1'] ?? $title ),
		'h1_accent' => $m( 'lp_h1' ) !== '' ? $m( 'lp_h1_accent' ) : ( $demo['h1_accent'] ?? '' ),
		'lead' => $m( 'lp_lead' ) ?: ( $demo['lead'] ?? cc_schema_excerpt( $post_id ) ),
		'badges' => $lines( 'lp_badges', $demo['badges'] ?? [] ),
		'img' => $thumb ?: ( $demo['img'] ?? cc_img( 'analytics' ) ),
		'tools' => $tools, 'problems' => $lines( 'lp_problems', $demo['problems'] ?? [] ),
		'solutions' => $solutions, 'features' => $features,
		'pricing' => $m( 'lp_pricing' ) ?: ( $demo['pricing'] ?? 'quote' ),
		'case' => $m( 'lp_case' ) ?: ( $demo['case'] ?? '' ),
		'faq' => $faq,
	];
}

/* ------------------------------------------------------------ case studies */

function cc_case_from_post( WP_Post $p ): array {
	$cats = get_the_terms( $p, 'project_category' );
	$cat  = ( $cats && ! is_wp_error( $cats ) ) ? reset( $cats ) : null;
	$tags = get_the_terms( $p, 'project_tag' );
	$svcs = ( $tags && ! is_wp_error( $tags ) ) ? wp_list_pluck( $tags, 'name' ) : array_filter( array_map( 'trim', explode( ',', (string) get_post_meta( $p->ID, 'project_technologies', true ) ) ) );
	$img  = get_the_post_thumbnail_url( $p, 'large' );
	return [
		'slug' => $p->post_name, 'post_id' => $p->ID, 'url' => get_permalink( $p ),
		'client' => get_post_meta( $p->ID, 'project_client', true ) ?: get_the_title( $p ),
		'sector' => (string) get_post_meta( $p->ID, 'project_sector', true ) ?: ( $cat ? $cat->name : '' ), 'filter' => $cat ? $cat->slug : 'all', 'filter_label' => $cat ? $cat->name : '',
		'country' => (string) get_post_meta( $p->ID, 'project_country', true ),
		'img' => $img ?: cc_img( 'chip' ), 'services' => array_values( $svcs ),
		'summary' => has_excerpt( $p ) ? get_the_excerpt( $p ) : wp_trim_words( wp_strip_all_tags( $p->post_content ), 30 ),
	];
}

function cc_get_cases( int $limit = 24 ): array {
	$posts = get_posts( [ 'post_type' => 'cc_project', 'post_status' => 'publish', 'posts_per_page' => $limit, 'orderby' => [ 'menu_order' => 'ASC', 'date' => 'DESC' ], 'suppress_filters' => false ] );
	if ( $posts ) {
		return array_map( 'cc_case_from_post', $posts );
	}
	return array_map( function ( $c ) {
		$c['url']     = home_url( '/projects/' . $c['slug'] . '/' );
		$c['post_id'] = 0;
		return $c;
	}, cc_demo( 'CASES' ) );
}

function cc_get_case_by_slug( string $slug ): ?array {
	foreach ( cc_get_cases() as $c ) {
		if ( $c['slug'] === $slug ) {
			return $c;
		}
	}
	return null;
}

/* ----------------------------------------------------------------- packages */

function cc_get_packages( string $group ): array {
	$posts = get_posts( [ 'post_type' => 'cc_package', 'post_status' => 'publish', 'posts_per_page' => 24, 'orderby' => [ 'menu_order' => 'ASC', 'date' => 'ASC' ], 'suppress_filters' => false ] );
	if ( ! $posts ) {
		$src = $group === 'social' ? cc_demo( 'SOCIAL_PACKAGES' ) : cc_demo( 'WEB_PACKAGES' );
		return array_map( function ( $p ) {
			return $p + [ 'price_eg' => '', 'price_sa' => '', 'badge' => 'الأكثر طلباً', 'cta_text' => 'اطلب الباقة', 'cta_url' => '' ];
		}, $src );
	}
	$out = [];
	foreach ( $posts as $p ) {
		if ( ( get_post_meta( $p->ID, 'pkg_group', true ) ?: 'web' ) !== $group ) {
			continue;
		}
		$out[] = [
			'key' => $p->post_name, 'name' => get_the_title( $p ), 'name_ar' => (string) get_post_meta( $p->ID, 'pkg_name_ar', true ),
			'desc' => has_excerpt( $p ) ? get_the_excerpt( $p ) : '',
			'features' => cc_meta_lines( (string) get_post_meta( $p->ID, 'package_features', true ) ),
			'featured' => get_post_meta( $p->ID, 'package_highlighted', true ) === '1',
			'price_eg' => cc_digits( (string) get_post_meta( $p->ID, 'package_price', true ) ),
			'price_sa' => cc_digits( (string) get_post_meta( $p->ID, 'pkg_price_sa', true ) ),
			'badge' => (string) get_post_meta( $p->ID, 'package_badge', true ) ?: 'الأكثر طلباً',
			'cta_text' => (string) get_post_meta( $p->ID, 'package_cta_text', true ) ?: 'اطلب الباقة',
			'cta_url' => (string) get_post_meta( $p->ID, 'package_cta_url', true ),
		];
	}
	return $out;
}

/** window.CC_PRICING (read by assets/js/theme.js). */
function cc_pricing_config(): array {
	$cfg = [ 'default' => cc_default_country(), 'EG' => [ 'label' => 'مصر', 'currency' => 'ج.م', 'web' => [], 'social' => [] ], 'SA' => [ 'label' => 'السعودية', 'currency' => 'ر.س', 'web' => [], 'social' => [] ] ];
	foreach ( [ 'web', 'social' ] as $g ) {
		foreach ( cc_get_packages( $g ) as $p ) {
			$cfg['EG'][ $g ][ $p['key'] ] = $p['price_eg'];
			$cfg['SA'][ $g ][ $p['key'] ] = $p['price_sa'];
		}
	}
	return $cfg;
}

/* ------------------------------------------------------------ testimonials */

function cc_get_testimonials( int $limit = 9 ): array {
	$posts = get_posts( [ 'post_type' => 'cc_testimonial', 'post_status' => 'publish', 'posts_per_page' => $limit, 'suppress_filters' => false ] );
	$out   = [];
	foreach ( $posts as $p ) {
		$role = trim( implode( '، ', array_filter( [ get_post_meta( $p->ID, 'client_position', true ), get_post_meta( $p->ID, 'client_company', true ) ] ) ) );
		$out[] = [
			'text' => wp_strip_all_tags( $p->post_content ), 'name' => get_post_meta( $p->ID, 'client_name', true ) ?: get_the_title( $p ),
			'role' => $role, 'rating' => max( 1, min( 5, (int) get_post_meta( $p->ID, 'rating', true ) ?: 5 ) ),
		];
	}
	return $out;
}

/* ------------------------------------------------------------------ pricing FAQ */

/** FAQ groups: [ [key, title, [[q, a], …]], … ] — demo defaults, or a page's own repeater as one group. */
function cc_faq_groups( int $page_id = 0 ): array {
	if ( $page_id ) {
		$own = cc_get_faq_items( $page_id );
		if ( $own ) {
			return [ [ 'all', '', array_map( fn( $f ) => [ $f['question'], $f['answer'] ], $own ) ] ];
		}
	}
	return cc_demo( 'FAQ' );
}

/** URL of a service by slug (falls back to the conventional /services/{slug}/). */
function cc_svc_url( string $slug ): string {
	foreach ( cc_get_services() as $s ) {
		if ( $s['slug'] === $slug ) {
			return $s['url'];
		}
	}
	return home_url( '/services/' . $slug . '/' );
}
