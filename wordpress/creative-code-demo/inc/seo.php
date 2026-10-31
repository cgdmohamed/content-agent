<?php
/**
 * Fallback SEO output (description, canonical, Open Graph, JSON-LD), as in the demo's <head>.
 * Skipped entirely when Rank Math / Yoast / AIOSEO / SEOPress is active — the Rank Math
 * schema extras in legacy.php keep working for the live site.
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

function cc_seo_plugin_active(): bool {
	return defined( 'RANK_MATH_VERSION' ) || class_exists( 'RankMath' ) || defined( 'WPSEO_VERSION' ) || defined( 'AIOSEO_VERSION' ) || defined( 'SEOPRESS_VERSION' );
}

function cc_seo_org_id(): string {
	return home_url( '/#organization' );
}

function cc_seo_noindex(): bool {
	return is_404() || is_search() || ( is_page() && get_post_field( 'post_name', get_queried_object_id() ) === 'thank-you' );
}

function cc_seo_description(): string {
	if ( is_singular( 'cc_service' ) ) {
		return cc_service_lp( get_queried_object_id() )['seo_desc'];
	}
	if ( is_singular() ) {
		$id = get_queried_object_id();
		$d  = has_excerpt( $id ) ? get_the_excerpt( $id ) : wp_trim_words( wp_strip_all_tags( strip_shortcodes( get_post_field( 'post_content', $id ) ) ), 32, '' );
		if ( $d ) {
			return $d;
		}
	}
	if ( is_front_page() ) {
		return 'شركة Creative Code لتصميم وتطوير المواقع والمتاجر الإلكترونية وأنظمة Odoo وإدارة إعلانات ميتا وجوجل. خبرة ' . cc_ar_digits( (string) cc_site( 'years' ) ) . '+ سنة مع عملاء في مصر والسعودية والإمارات.';
	}
	if ( is_post_type_archive( 'cc_service' ) ) {
		return 'تصميم مواقع ومتاجر WooCommerce، تطبيق Odoo ERP، ربط واتساب بزنس API وChatwoot، وإدارة إعلانات Meta وGoogle وTikTok — كل ما يحتاجه نشاطك تحت سقف واحد.';
	}
	if ( is_post_type_archive( 'cc_project' ) ) {
		return 'أعمال Creative Code مع مصانع وشركات وعيادات في مصر والسعودية والإمارات: مواقع، تسويق رقمي، إعلانات، وتحسين ظهور في محركات البحث.';
	}
	if ( is_home() ) {
		return 'مقالات عملية من Creative Code عن تصميم المواقع والمتاجر، إعلانات ميتا وجوجل، واتساب بزنس API، وتحسين الظهور في جوجل وإجابات الذكاء الاصطناعي.';
	}
	return (string) cc_site( 'tagline' );
}

function cc_seo_breadcrumb_items(): array {
	$items = [];
	if ( is_singular( 'cc_service' ) ) {
		$items = [ [ 'الخدمات', cc_url( 'services' ) ], [ cc_service_lp( get_queried_object_id() )['nav'], get_permalink() ] ];
	} elseif ( is_singular( 'cc_project' ) ) {
		$items = [ [ 'أعمالنا', cc_url( 'work' ) ], [ get_the_title(), get_permalink() ] ];
	} elseif ( is_singular( 'post' ) ) {
		$items = [ [ 'المدونة', cc_url( 'blog' ) ], [ get_the_title(), get_permalink() ] ];
	} elseif ( is_post_type_archive( 'cc_service' ) ) {
		$items = [ [ 'الخدمات', cc_url( 'services' ) ] ];
	} elseif ( is_post_type_archive( 'cc_project' ) ) {
		$items = [ [ 'أعمالنا', cc_url( 'work' ) ] ];
	} elseif ( is_home() ) {
		$items = [ [ 'المدونة', cc_url( 'blog' ) ] ];
	} elseif ( is_page() && ! is_front_page() ) {
		$items = [ [ get_the_title(), get_permalink() ] ];
	}
	return $items;
}

add_action( 'wp_head', function () {
	if ( cc_seo_plugin_active() ) {
		return;
	}
	$site  = cc_site();
	$desc  = cc_seo_description();
	$title = wp_get_document_title();
	$url   = is_singular() ? get_permalink() : home_url( add_query_arg( [] ) );
	$url   = strtok( (string) $url, '?' );
	$img   = ( is_singular() && has_post_thumbnail() ) ? get_the_post_thumbnail_url( null, 'full' ) : CC_URI . '/assets/img/og-default.jpg';
	$type  = is_singular( 'post' ) ? 'article' : 'website';

	echo "<!-- SEO (theme fallback) -->\n";
	if ( $desc ) echo '<meta name="description" content="' . esc_attr( $desc ) . '">' . "\n";
	echo '<meta name="robots" content="' . ( cc_seo_noindex() ? 'noindex, follow' : 'index, follow, max-image-preview:large' ) . '">' . "\n";
	echo '<link rel="canonical" href="' . esc_url( $url ) . '">' . "\n";
	echo '<meta property="og:locale" content="ar_AR"><meta property="og:type" content="' . esc_attr( $type ) . '"><meta property="og:site_name" content="' . esc_attr( $site['brand'] ) . '">' . "\n";
	echo '<meta property="og:title" content="' . esc_attr( $title ) . '"><meta property="og:description" content="' . esc_attr( $desc ) . '"><meta property="og:url" content="' . esc_url( $url ) . '">' . "\n";
	echo '<meta property="og:image" content="' . esc_url( $img ) . '"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' . esc_attr( $title ) . '"><meta name="twitter:description" content="' . esc_attr( $desc ) . '"><meta name="twitter:image" content="' . esc_url( $img ) . '">' . "\n";

	$org = [ '@type' => 'ProfessionalService', '@id' => cc_seo_org_id(), 'name' => $site['brand'], 'alternateName' => $site['brand_ar'], 'url' => home_url( '/' ),
		'logo' => CC_URI . '/assets/img/logo-white.svg', 'image' => CC_URI . '/assets/img/og-default.jpg', 'email' => $site['email'], 'telephone' => $site['phone_tel'],
		'address' => [ '@type' => 'PostalAddress', 'addressLocality' => 'Zagazig', 'addressRegion' => 'Sharqia', 'addressCountry' => 'EG' ],
		'areaServed' => array_map( fn( $n ) => [ '@type' => 'Country', 'name' => $n ], [ 'Egypt', 'Saudi Arabia', 'United Arab Emirates', 'United Kingdom' ] ),
		'founder' => [ '@type' => 'Person', 'name' => 'Mohamed Mostafa', 'jobTitle' => 'Software Engineer, CEO' ],
		'sameAs' => array_values( array_filter( array_map( fn( $s ) => $s[1] !== '#' ? $s[1] : '', $site['social'] ) ) ) ];
	$graph = [];
	if ( is_front_page() ) {
		$graph[] = $org;
		$graph[] = [ '@type' => 'WebSite', '@id' => home_url( '/#website' ), 'url' => home_url( '/' ), 'name' => $site['brand'], 'inLanguage' => 'ar', 'publisher' => [ '@id' => cc_seo_org_id() ] ];
	} else {
		$crumbs = cc_seo_breadcrumb_items();
		if ( $crumbs ) {
			array_unshift( $crumbs, [ 'الرئيسية', home_url( '/' ) ] );
			$graph[] = [ '@type' => 'BreadcrumbList', 'itemListElement' => array_map( fn( $c, $i ) => [ '@type' => 'ListItem', 'position' => $i + 1, 'name' => $c[0], 'item' => $c[1] ], $crumbs, array_keys( $crumbs ) ) ];
		}
	}
	$faq = [];
	if ( is_singular( 'cc_service' ) ) {
		$sp    = cc_service_lp( get_queried_object_id() );
		$faq   = $sp['faq'];
		$graph[] = [ '@type' => 'Service', 'name' => $sp['seo_title'], 'serviceType' => $sp['keyword'], 'description' => $sp['seo_desc'], 'provider' => [ '@id' => cc_seo_org_id() ],
			'areaServed' => [ 'Egypt', 'Saudi Arabia', 'United Arab Emirates', 'United Kingdom' ], 'url' => get_permalink() ];
	} elseif ( is_singular( 'post' ) ) {
		$graph[] = [ '@type' => 'BlogPosting', 'headline' => get_the_title(), 'description' => $desc, 'image' => $img, 'inLanguage' => 'ar', 'datePublished' => get_the_date( 'c' ), 'dateModified' => get_the_modified_date( 'c' ),
			'mainEntityOfPage' => get_permalink(), 'author' => [ '@type' => 'Person', 'name' => get_the_author() ], 'publisher' => [ '@id' => cc_seo_org_id() ] ];
	} elseif ( is_page() && in_array( get_post_field( 'post_name', get_queried_object_id() ), [ 'faq', 'pricing' ], true ) ) {
		foreach ( cc_faq_groups( get_queried_object_id() ) as $g ) {
			if ( get_post_field( 'post_name', get_queried_object_id() ) === 'faq' || $g[0] === 'pricing' ) {
				$faq = array_merge( $faq, $g[2] );
			}
		}
	}
	if ( $faq ) {
		$graph[] = [ '@type' => 'FAQPage', 'mainEntity' => array_map( fn( $qa ) => [ '@type' => 'Question', 'name' => $qa[0], 'acceptedAnswer' => [ '@type' => 'Answer', 'text' => $qa[1] ] ], $faq ) ];
	}
	if ( $graph ) {
		echo '<script type="application/ld+json">' . wp_json_encode( [ '@context' => 'https://schema.org', '@graph' => $graph ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . "</script>\n";
	}
	echo "<!-- /SEO -->\n";
}, 3 );

/* Service pages use their landing-page title when no SEO plugin controls <title>. */
add_filter( 'document_title_parts', function ( array $parts ): array {
	if ( ! cc_seo_plugin_active() && is_singular( 'cc_service' ) ) {
		$parts['title'] = cc_service_lp( get_queried_object_id() )['seo_title'];
	}
	return $parts;
} );

/* Favicon fallback (a Site Icon set in the Customizer wins). */
add_action( 'wp_head', function () {
	if ( ! has_site_icon() ) {
		echo '<link rel="icon" href="' . esc_url( CC_URI . '/assets/img/favicon.svg' ) . '" type="image/svg+xml">' . "\n";
	}
}, 2 );
