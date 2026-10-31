<?php
/**
 * FAQ page (slug: faq). Uses the page's own "الأسئلة الشائعة" repeater when filled,
 * otherwise the demo's four groups with category filters.
 *
 * @package CreativeCode
 */
get_header();
cc_page_header( 'الأسئلة الشائعة', 'إجابات <span class="text-accent">واضحة</span>', 'أكثر الأسئلة التي تصلنا عن الخدمات والأسعار والتنفيذ والدعم.' );
$groups = cc_faq_groups( get_queried_object_id() );
$multi  = count( $groups ) > 1;
?>
<section class="pb-24 px-6"><div class="max-w-7xl mx-auto grid lg:grid-cols-3 gap-12">
<aside class="space-y-8 lg:sticky lg:top-28 self-start">
  <?php if ( $multi ) : ?><div class="flex flex-wrap lg:flex-col gap-3" data-filter-group="#faq-list">
    <button class="cat-btn active px-5 py-2.5 rounded-xl border border-gray-200 font-bold transition-all" data-f="all">الكل</button>
    <?php foreach ( $groups as [ $k, $t ] ) : ?><button class="cat-btn px-5 py-2.5 rounded-xl border border-gray-200 font-bold transition-all" data-f="<?php echo esc_attr( $k ); ?>"><?php echo esc_html( $t ); ?></button><?php endforeach; ?>
  </div><?php endif; ?>
  <div class="bg-dark text-white rounded-[2rem] p-8 space-y-4"><p class="text-xl font-bold">لم تجد إجابتك؟</p><p class="text-gray-400">راسلنا على واتساب ونرد عليك مباشرة.</p>
  <a href="<?php echo esc_url( cc_site( 'whatsapp' ) ); ?>" target="_blank" rel="noopener" class="inline-flex items-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-2xl font-bold"><?php echo cc_icon( 'mdi:whatsapp', 'text-xl' ); ?>تواصل الآن</a></div>
</aside>
<div id="faq-list" class="lg:col-span-2 space-y-4">
  <?php foreach ( $groups as [ $k, $t, $items ] ) : ?><div data-filter="<?php echo esc_attr( $k ); ?>" class="space-y-4"><?php if ( $t ) : ?><h2 class="text-accent font-bold text-sm tracking-widest pt-6"><?php echo esc_html( $t ); ?></h2><?php endif; cc_faq_list( $items ); ?></div><?php endforeach; ?>
</div>
</div></section>
<?php
cc_cta_band();
get_footer();
