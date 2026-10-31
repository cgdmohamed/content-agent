<?php
/**
 * Single package — package details in the demo style, order CTA to the contact form.
 *
 * @package CreativeCode
 */
get_header();
while ( have_posts() ) :
	the_post();
	$id       = get_the_ID();
	$features = cc_meta_lines( (string) get_post_meta( $id, 'package_features', true ) );
	$includes = cc_meta_lines( (string) get_post_meta( $id, 'package_includes', true ) );
	$ideal    = cc_meta_lines( (string) get_post_meta( $id, 'package_ideal_for', true ) );
	$cta_url  = get_post_meta( $id, 'package_cta_url', true ) ?: cc_url( 'contact' );
	$cta_text = get_post_meta( $id, 'package_cta_text', true ) ?: 'اطلب هذه الباقة';
	cc_page_header( 'الباقات', esc_html( get_the_title() ), has_excerpt() ? get_the_excerpt() : '' );
	?>
<section class="pb-24 px-6"><div class="max-w-5xl mx-auto grid lg:grid-cols-3 gap-12">
  <article class="lg:col-span-2 prose-cc">
    <?php the_content(); ?>
    <?php if ( $includes ) : ?><h2>مكونات الباقة</h2><ul><?php foreach ( $includes as $x ) : ?><li><?php echo esc_html( $x ); ?></li><?php endforeach; ?></ul><?php endif; ?>
    <?php if ( $ideal ) : ?><h2>مناسبة لمن؟</h2><ul><?php foreach ( $ideal as $x ) : ?><li><?php echo esc_html( $x ); ?></li><?php endforeach; ?></ul><?php endif; ?>
  </article>
  <aside class="bg-dark text-white rounded-[2.5rem] p-10 space-y-6 self-start lg:sticky lg:top-28">
    <?php if ( get_post_meta( $id, 'package_price', true ) ) : ?><div><span class="text-xs text-gray-400 block mb-1">يبدأ من</span><span class="text-4xl font-black"><?php echo esc_html( get_post_meta( $id, 'package_price', true ) ); ?></span></div><?php endif; ?>
    <ul class="space-y-4 text-gray-200"><?php foreach ( $features as $f ) : ?><li class="flex items-start gap-3"><?php echo cc_icon( 'lucide:check', 'text-accent text-xl shrink-0 mt-0.5' ); ?><span><?php echo esc_html( $f ); ?></span></li><?php endforeach; ?></ul>
    <a href="<?php echo esc_url( $cta_url ); ?>" class="block text-center py-4 rounded-2xl font-bold bg-accent text-white hover:shadow-xl hover:shadow-accent/40 transition-all ripple"><?php echo esc_html( $cta_text ); ?></a>
  </aside>
</div></section>
	<?php
	$faq = array_map( fn( $f ) => [ $f['question'], $f['answer'] ], cc_get_faq_items( $id ) );
	if ( $faq ) : ?><section class="pb-24 px-6"><div class="max-w-3xl mx-auto space-y-4"><h2 class="text-3xl font-extrabold text-dark text-center mb-10">أسئلة شائعة</h2><?php cc_faq_list( $faq ); ?></div></section><?php endif;
	cc_cta_band( 'محتاج باقة مخصصة؟', 'قولنا هدفك وميزانيتك، ونقترح عليك أنسب حل.' );
endwhile;
get_footer();
