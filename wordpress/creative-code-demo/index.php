<?php
/**
 * Fallback template (blog index, archives, search all use the same card grid).
 *
 * @package CreativeCode
 */
get_header();

if ( is_search() ) {
	$eyebrow = 'نتائج البحث';
	$title   = 'نتائج البحث عن<br><span class="text-accent">' . esc_html( get_search_query() ) . '</span>';
} elseif ( is_archive() ) {
	$eyebrow = 'أرشيف';
	$title   = esc_html( get_the_archive_title() );
} else {
	$eyebrow = 'المدونة';
	$title   = 'أفكار عملية<br><span class="text-accent">لنمو نشاطك رقمياً</span>';
}
cc_page_header( $eyebrow, $title, is_archive() ? wp_strip_all_tags( get_the_archive_description() ) : '' );
?>
<section class="pb-24 px-6"><div class="max-w-7xl mx-auto">
<?php if ( have_posts() ) : ?>
  <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8"><?php while ( have_posts() ) { the_post(); cc_post_card( get_the_ID() ); } ?></div>
  <div class="mt-12 flex justify-center"><?php the_posts_pagination( [ 'mid_size' => 1, 'prev_text' => 'السابق', 'next_text' => 'التالي' ] ); ?></div>
<?php else : ?>
  <p class="text-center text-gray-500 text-lg">لا توجد نتائج.</p>
<?php endif; ?>
</div></section>
<?php
get_footer();
