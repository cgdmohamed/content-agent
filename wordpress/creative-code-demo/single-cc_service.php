<?php
/**
 * Service landing page (demo: service-*.html). `?lp=1` or the "landing mode" meta hides the
 * menu/footer and shows the phone number.
 *
 * @package CreativeCode
 */
get_header();
while ( have_posts() ) {
	the_post();
	cc_lp_render( cc_service_lp( get_the_ID() ) );
	if ( trim( get_the_content() ) !== '' ) : ?>
<section class="py-24 px-6"><article class="max-w-3xl mx-auto prose-cc"><?php the_content(); ?></article></section>
	<?php endif;
}
get_footer();
