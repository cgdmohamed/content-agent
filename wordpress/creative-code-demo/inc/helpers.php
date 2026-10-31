<?php
/**
 * Small template helpers (kept from Creative Code 2026, neon-specific ones removed).
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

/** Estimate reading time in minutes. */
function cc_reading_time( int $post_id = 0 ): int {
	$content = get_post_field( 'post_content', $post_id );
	$words   = str_word_count( wp_strip_all_tags( $content ), 0, 'أبتثجحخدذرزسشصضطظعغفقكلمنهوي' );
	return max( 1, (int) round( $words / 200 ) );
}

/** Western digits -> Arabic-Indic digits (the demo prints dates and counts this way). */
function cc_ar_digits( string $s ): string {
	return strtr( $s, [ '0' => '٠', '1' => '١', '2' => '٢', '3' => '٣', '4' => '٤', '5' => '٥', '6' => '٦', '7' => '٧', '8' => '٨', '9' => '٩' ] );
}

/** Format an Arabic date, e.g. ٢٠ أكتوبر ٢٠٢٦. */
function cc_ar_date( string $date = '', string $format = 'd F Y' ): string {
	$timestamp = $date ? strtotime( $date ) : time();
	$months_ar = [
		1 => 'يناير', 2 => 'فبراير', 3 => 'مارس', 4 => 'أبريل', 5 => 'مايو', 6 => 'يونيو',
		7 => 'يوليو', 8 => 'أغسطس', 9 => 'سبتمبر', 10 => 'أكتوبر', 11 => 'نوفمبر', 12 => 'ديسمبر',
	];
	return cc_ar_digits( (int) date( 'd', $timestamp ) . ' ' . $months_ar[ (int) date( 'n', $timestamp ) ] . ' ' . date( 'Y', $timestamp ) );
}

/** Parse a newline-separated meta field into an array. */
function cc_meta_lines( string $meta_value ): array {
	return array_values( array_filter( array_map( 'trim', explode( "\n", $meta_value ) ), fn( $l ) => $l !== '' ) );
}

/** Parse pipe-separated rows: label|value. */
function cc_pipe_rows( string $value ): array {
	$rows = [];
	foreach ( cc_meta_lines( $value ) as $line ) {
		$parts = array_map( 'trim', explode( '|', $line, 2 ) );
		if ( count( $parts ) < 2 || $parts[0] === '' || $parts[1] === '' ) {
			continue;
		}
		$rows[] = [ 'label' => $parts[0], 'value' => $parts[1] ];
	}
	return $rows;
}

/** FAQ repeater items (meta cc_faq_items) for any supported post type. */
function cc_get_faq_items( int $post_id = 0, array $fallback = [] ): array {
	$post_id = $post_id ?: get_the_ID();
	$items   = get_post_meta( $post_id, 'cc_faq_items', true );
	$items   = is_array( $items ) ? $items : [];
	$clean   = [];
	foreach ( $items as $item ) {
		$q = isset( $item['question'] ) ? trim( (string) $item['question'] ) : '';
		$a = isset( $item['answer'] ) ? trim( (string) $item['answer'] ) : '';
		if ( $q !== '' && $a !== '' ) {
			$clean[] = [ 'question' => $q, 'answer' => $a ];
		}
	}
	return $clean ?: $fallback;
}

/** Share URL for a social network. */
function cc_share_url( string $network, int $post_id = 0 ): string {
	$url   = urlencode( get_permalink( $post_id ) );
	$title = urlencode( get_the_title( $post_id ) );
	return match ( $network ) {
		'facebook' => "https://www.facebook.com/sharer/sharer.php?u={$url}",
		'linkedin' => "https://www.linkedin.com/sharing/share-offsite/?url={$url}",
		'whatsapp' => "https://wa.me/?text={$title}%20{$url}",
		default    => get_permalink( $post_id ),
	};
}

/** Add ids to <h2> in article content and return [content, toc]. */
function cc_content_with_toc( string $html ): array {
	$toc = [];
	$out = preg_replace_callback( '#<h2([^>]*)>(.*?)</h2>#is', function ( $m ) use ( &$toc ) {
		$text = trim( wp_strip_all_tags( $m[2] ) );
		if ( preg_match( '/\sid=["\']([^"\']+)["\']/', $m[1], $idm ) ) {
			$id = $idm[1];
			$attrs = $m[1];
		} else {
			$id    = 'h-' . ( count( $toc ) + 1 );
			$attrs = $m[1] . ' id="' . $id . '"';
		}
		$toc[] = [ 'id' => $id, 'text' => $text ];
		return '<h2' . $attrs . '>' . $m[2] . '</h2>';
	}, $html );
	return [ $out ?? $html, $toc ];
}

/** "٦ دقائق" / "دقيقة" / "دقيقتان" with correct Arabic number agreement. */
function cc_minutes_label( int $m ): string {
	if ( $m === 1 ) return 'دقيقة';
	if ( $m === 2 ) return 'دقيقتان';
	return cc_ar_digits( (string) $m ) . ( $m <= 10 ? ' دقائق' : ' دقيقة' );
}
