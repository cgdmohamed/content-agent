<?php
/**
 * Blog index (posts page).
 *
 * @package CreativeCode
 */
get_header();
cc_page_header( 'المدونة', 'أفكار عملية<br><span class="text-accent">لنمو نشاطك رقمياً</span>', 'مقالات في تطوير المواقع، والتسويق الرقمي، وأنظمة الأعمال — من خبرة مشاريع حقيقية.' );
$latest = new WP_Query( [ 'post_type' => 'post', 'posts_per_page' => 3, 'ignore_sticky_posts' => true, 'no_found_rows' => true ] );
?>
<section class="pb-24 px-6"><div class="max-w-7xl mx-auto grid lg:grid-cols-3 gap-12">
<div class="lg:col-span-2 grid md:grid-cols-2 gap-8 self-start"><h2 class="sr-only md:col-span-2">كل المقالات</h2>
  <?php if ( have_posts() ) : $i = 0; while ( have_posts() ) : the_post(); cc_post_card( get_the_ID(), $i === 0 && ! is_paged() ); $i++; endwhile; else : ?>
    <p class="md:col-span-2 text-gray-500 text-lg">لا توجد مقالات بعد.</p>
  <?php endif; ?>
  <div class="md:col-span-2 flex justify-center pt-4"><?php the_posts_pagination( [ 'mid_size' => 1, 'prev_text' => 'الأحدث', 'next_text' => 'الأقدم' ] ); ?></div>
</div>
<aside class="space-y-8">
  <?php $cats = get_categories( [ 'hide_empty' => true ] ); if ( $cats ) : ?>
  <div class="bg-gray-50 rounded-[2rem] p-8"><h3 class="text-xl font-bold mb-4">التصنيفات</h3><ul class="text-gray-600"><?php foreach ( $cats as $c ) : ?><li><a href="<?php echo esc_url( get_category_link( $c ) ); ?>" class="flex justify-between py-3 border-b border-gray-100 hover:text-accent"><span><?php echo esc_html( $c->name ); ?></span><?php echo cc_icon( 'lucide:chevron-left' ); ?></a></li><?php endforeach; ?></ul></div>
  <?php endif; ?>
  <?php if ( $latest->have_posts() ) : ?>
  <div class="bg-gray-50 rounded-[2rem] p-8"><h3 class="text-xl font-bold mb-6">أحدث المقالات</h3><ul class="space-y-5">
    <?php while ( $latest->have_posts() ) : $latest->the_post(); ?>
    <li><a href="<?php the_permalink(); ?>" class="flex gap-4 items-center group"><?php if ( has_post_thumbnail() ) : ?><img src="<?php echo esc_url( get_the_post_thumbnail_url( null, 'thumbnail' ) ); ?>" alt="" class="w-20 h-20 rounded-2xl object-cover"><?php endif; ?><div><h4 class="font-bold leading-snug group-hover:text-accent"><?php the_title(); ?></h4><span class="text-xs text-gray-400"><?php echo esc_html( cc_ar_date( get_the_date( 'Y-m-d' ) ) ); ?></span></div></a></li>
    <?php endwhile; wp_reset_postdata(); ?></ul></div>
  <?php endif; ?>
  <div class="bg-accent text-white rounded-[2rem] p-8 space-y-4"><h3 class="text-xl font-bold">محتاج استشارة؟</h3><p class="text-white/80">ابعتلنا سؤالك على واتساب وهنرد عليك.</p><a href="<?php echo esc_url( cc_site( 'whatsapp' ) ); ?>" target="_blank" rel="noopener" class="inline-flex items-center gap-2 bg-white text-dark px-6 py-3 rounded-2xl font-bold"><?php echo cc_icon( 'mdi:whatsapp', 'text-xl' ); ?>واتساب</a></div>
</aside></div></section>
<?php
get_footer();
