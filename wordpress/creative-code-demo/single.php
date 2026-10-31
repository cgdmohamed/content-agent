<?php
/**
 * Single article.
 *
 * @package CreativeCode
 */
get_header();
while ( have_posts() ) :
	the_post();
	[ $content, $toc ] = cc_content_with_toc( apply_filters( 'the_content', get_the_content() ) );
	$cat   = get_the_category();
	$thumb = get_the_post_thumbnail_url( null, 'full' );
	$name  = get_the_author();
	?>
<header class="pt-36 pb-12 px-6"><div class="max-w-4xl mx-auto space-y-6 text-center">
  <div class="flex justify-center"><?php cc_breadcrumbs( [ [ 'المدونة', cc_url( 'blog' ) ], [ get_the_title(), '' ] ] ); ?></div>
  <?php if ( $cat ) : ?><span class="block text-accent font-bold"><?php echo esc_html( $cat[0]->name ); ?></span><?php endif; ?>
  <h1 class="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight"><?php the_title(); ?></h1>
  <div class="flex justify-center items-center gap-3 text-gray-400"><span class="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-black"><?php echo esc_html( mb_substr( $name, 0, 1 ) ); ?></span><span class="font-bold text-dark"><?php echo esc_html( $name ); ?></span><span>•</span><span><?php echo esc_html( cc_ar_date( get_the_date( 'Y-m-d' ) ) ); ?></span><span>•</span><span><?php echo esc_html( cc_minutes_label( cc_reading_time() ) ); ?> قراءة</span></div>
</div></header>
	<?php if ( $thumb ) : ?><div class="px-6"><div class="max-w-6xl mx-auto aspect-[21/9] rounded-[3rem] overflow-hidden"><img src="<?php echo esc_url( $thumb ); ?>" alt="<?php echo esc_attr( get_the_title() ); ?>" class="w-full h-full object-cover"></div></div><?php endif; ?>
<section class="py-16 px-6"><div class="max-w-6xl mx-auto grid lg:grid-cols-4 gap-12">
  <aside class="lg:sticky lg:top-28 self-start space-y-6">
    <?php if ( $toc ) : ?><div class="bg-gray-50 rounded-3xl p-6"><p class="font-bold mb-3">محتويات المقال</p><ul><?php foreach ( $toc as $t ) : ?><li><a href="#<?php echo esc_attr( $t['id'] ); ?>" class="block py-2 text-gray-500 hover:text-accent"><?php echo esc_html( $t['text'] ); ?></a></li><?php endforeach; ?></ul></div><?php endif; ?>
    <div class="bg-gray-50 rounded-3xl p-6"><p class="font-bold mb-3">شارك المقال</p><div class="flex gap-3">
      <?php foreach ( [ 'whatsapp', 'facebook', 'linkedin' ] as $net ) : ?><a href="<?php echo esc_url( cc_share_url( $net ) ); ?>" target="_blank" rel="noopener" aria-label="<?php echo esc_attr( $net ); ?>" class="w-10 h-10 rounded-xl bg-white flex items-center justify-center hover:bg-accent hover:text-white"><?php echo cc_brand_svg( $net, 'w-5 h-5' ); ?></a><?php endforeach; ?>
    </div></div>
  </aside>
  <article class="lg:col-span-3 prose-cc"><?php echo $content; // phpcs:ignore -- the_content output ?></article>
</div></section>
	<?php
	$related = new WP_Query( [ 'post_type' => 'post', 'posts_per_page' => 3, 'post__not_in' => [ get_the_ID() ], 'category__in' => wp_get_post_categories( get_the_ID() ), 'ignore_sticky_posts' => true, 'no_found_rows' => true ] );
	if ( ! $related->have_posts() ) {
		$related = new WP_Query( [ 'post_type' => 'post', 'posts_per_page' => 3, 'post__not_in' => [ get_the_ID() ], 'ignore_sticky_posts' => true, 'no_found_rows' => true ] );
	}
	if ( $related->have_posts() ) : ?>
<section class="pb-12 px-6"><div class="max-w-6xl mx-auto"><h2 class="text-3xl font-extrabold mb-8">مقالات ذات صلة</h2><div class="grid md:grid-cols-3 gap-8"><?php while ( $related->have_posts() ) { $related->the_post(); cc_post_card( get_the_ID() ); } wp_reset_postdata(); ?></div></div></section>
	<?php endif;
	cc_cta_band( 'عايز موقع يعكس حجم نشاطك؟', 'شوف إزاي اشتغلنا مع مصانع وشركات في مصر والخليج.', [ 'كلمنا على واتساب', cc_site( 'whatsapp' ) ], [ 'شاهد دراسات الحالة', cc_url( 'work' ) ] );
endwhile;
get_footer();
