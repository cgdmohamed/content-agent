<?php
/**
 * Lead forms: native handler (honeypot + referer check + per-IP throttle), stores the lead
 * as a private `cc_lead` post, e-mails it, and redirects to the thank-you page.
 * No nonce on purpose — landing pages are page-cached and nonces would expire there.
 * If a Fluent Forms id is saved in Appearance → إعدادات القالب, that form replaces the native one.
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'init', function () {
	register_post_type( 'cc_lead', [
		'labels' => [ 'name' => 'الطلبات', 'singular_name' => 'طلب', 'menu_name' => 'الطلبات' ],
		'public' => false, 'show_ui' => true, 'show_in_menu' => true, 'menu_icon' => 'dashicons-email-alt',
		'menu_position' => 21, 'supports' => [ 'title' ], 'capability_type' => 'post',
		'capabilities' => [ 'create_posts' => 'do_not_allow' ], 'map_meta_cap' => true,
	] );
} );

const CC_ATTR_KEYS = [ 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'landing_page' ];

/** Hidden inputs shared by every lead form (attribution values are filled by theme.js). */
function cc_lead_hidden_fields( string $service_page = '', string $form = 'contact' ): string {
	$h  = '<input type="hidden" name="action" value="cc_lead"><input type="hidden" name="form_id" value="' . esc_attr( $form ) . '">';
	$h .= '<div class="hidden" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>';
	foreach ( CC_ATTR_KEYS as $k ) {
		$h .= '<input type="hidden" name="' . esc_attr( $k ) . '">';
	}
	if ( $service_page !== '' ) {
		$h .= '<input type="hidden" name="service_page" value="' . esc_attr( $service_page ) . '">';
	}
	return $h;
}

function cc_lead_action_url(): string {
	return admin_url( 'admin-post.php' );
}

/** Fluent Forms replacement, wrapped so theme.js still fills the attribution fields. */
function cc_fluent_embed( string $opt_key, string $form_key ): string {
	$html = function_exists( 'cc_fluent_form' ) ? cc_fluent_form( $opt_key ) : '';
	return $html ? '<div class="cc-lead-form" data-form="' . esc_attr( $form_key ) . '">' . $html . '</div>' : '';
}

add_action( 'admin_post_nopriv_cc_lead', 'cc_handle_lead' );
add_action( 'admin_post_cc_lead', 'cc_handle_lead' );

function cc_handle_lead(): void {
	$thanks = cc_url( 'thank-you' );

	// Bots fill the honeypot; answer like a success so they do not retry.
	if ( ! empty( $_POST['website'] ) ) {
		wp_safe_redirect( $thanks );
		exit;
	}
	$ref = wp_parse_url( wp_get_referer() ?: '', PHP_URL_HOST );
	if ( $ref && $ref !== wp_parse_url( home_url(), PHP_URL_HOST ) ) {
		wp_die( 'طلب غير صالح', '', [ 'response' => 400 ] );
	}
	$ip  = sanitize_text_field( wp_unslash( $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '' ) );
	$key = 'cc_lead_' . md5( $ip );
	$n   = (int) get_transient( $key );
	if ( $n >= 5 ) {
		wp_die( 'تم إرسال عدد كبير من الطلبات، حاول لاحقاً أو تواصل عبر واتساب.', '', [ 'response' => 429 ] );
	}
	set_transient( $key, $n + 1, HOUR_IN_SECONDS );

	$f = fn( string $k ) => sanitize_text_field( wp_unslash( $_POST[ $k ] ?? '' ) );
	$name  = $f( 'name' );
	$phone = $f( 'phone' );
	if ( $name === '' || $phone === '' ) {
		wp_safe_redirect( wp_get_referer() ?: home_url( '/' ) );
		exit;
	}
	$service = $f( 'service' );
	$data    = [
		'name' => $name, 'phone' => $phone, 'service' => $service, 'country' => $f( 'country' ),
		'message' => sanitize_textarea_field( wp_unslash( $_POST['message'] ?? '' ) ), 'service_page' => $f( 'service_page' ), 'form_id' => $f( 'form_id' ),
	];
	foreach ( CC_ATTR_KEYS as $k ) {
		$data[ $k ] = $f( $k );
	}

	$id = wp_insert_post( [ 'post_type' => 'cc_lead', 'post_status' => 'publish', 'post_title' => $name . ' — ' . ( $service ?: 'طلب' ) ] );
	if ( $id && ! is_wp_error( $id ) ) {
		foreach ( $data as $k => $v ) {
			update_post_meta( $id, 'lead_' . $k, $v );
		}
	}

	$lines = [];
	foreach ( $data as $k => $v ) {
		if ( $v !== '' ) {
			$lines[] = $k . ': ' . $v;
		}
	}
	$to = cc_opt( 'email' ) ?: get_option( 'admin_email' );
	wp_mail( $to, 'طلب جديد من الموقع — ' . ( $service ?: $name ), implode( "\n", $lines ) );

	wp_safe_redirect( add_query_arg( 'service', rawurlencode( $service ), $thanks ) );
	exit;
}
