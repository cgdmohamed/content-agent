<?php
/**
 * Generic page (privacy policy, terms, …) — page header + article body.
 *
 * @package CreativeCode
 */
get_header();
while ( have_posts() ) :
	the_post();
	cc_page_header( get_the_title(), esc_html( get_the_title() ), has_excerpt() ? get_the_excerpt() : '' );
	?>
<section class="pb-24 px-6"><article class="max-w-3xl mx-auto prose-cc"><?php the_content(); ?></article></section>
	<?php
endwhile;
get_footer();
