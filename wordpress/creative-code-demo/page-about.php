<?php
/**
 * About page (slug: about). Page content, if any, is appended after the story.
 *
 * @package CreativeCode
 */
get_header();
$site  = cc_site();
$years = (int) $site['years'];
cc_page_header( 'من نحن', 'وكالة رقمية<br><span class="text-accent">يقودها مهندس برمجيات</span>', 'نؤمن أن نجاحنا يُقاس بنتائج عملائنا — مبيعات أكثر، عملاء أكثر، وإدارة أسهل — لا بعدد الصفحات أو جمال التصميم فقط.' );
?>
<section class="py-20 px-6"><div class="max-w-7xl mx-auto grid lg:grid-cols-5 gap-12 items-center">
  <div class="lg:col-span-2 reveal-on-scroll"><div class="bg-navy rounded-[3rem] p-10 text-white text-center relative overflow-hidden"><div class="blob bg-accent/40 w-56 h-56 -top-16 -right-16"></div>
    <div class="relative z-10">
      <?php if ( has_post_thumbnail() ) : the_post_thumbnail( 'medium', [ 'class' => 'w-40 h-40 mx-auto rounded-full border-4 border-accent object-cover', 'alt' => esc_attr( $site['founder'] ) ] );
	  else : ?><div class="w-40 h-40 mx-auto rounded-full bg-accent/20 border-4 border-accent flex items-center justify-center text-6xl font-black text-accent"><?php echo esc_html( mb_substr( preg_replace( '/^م\.\s*/u', '', $site['founder'] ), 0, 1 ) ); ?></div><?php endif; ?>
      <h2 class="text-3xl font-extrabold mt-8"><?php echo esc_html( $site['founder'] ); ?></h2><p class="text-accent font-bold mt-2"><?php echo esc_html( $site['founder_title'] ); ?></p>
      <div class="flex justify-center gap-3 mt-6"><?php cc_social_icons( 'w-10 h-10 rounded-xl bg-white/10 hover:bg-accent flex items-center justify-center transition-all' ); ?></div></div></div></div>
  <div class="lg:col-span-3 space-y-6 reveal-on-scroll"><?php echo cc_eyebrow( 'القصة' ); ?>
    <h2 class="text-4xl md:text-5xl font-extrabold tracking-tight text-dark">من كتب HTML<br>إلى <?php echo esc_html( cc_ar_digits( (string) $years ) ); ?>+ سنة من المشاريع</h2>
    <p class="text-gray-500 text-lg leading-relaxed">بدأت رحلتي مع البرمجة طفلاً أقرأ كتب HTML، وتحولت مع السنين إلى خبرة عملية في ووردبريس وWooCommerce وLaravel وأنظمة الأعمال، ثم إلى التسويق بالأداء على Meta وGoogle وواتساب بزنس.</p>
    <p class="text-gray-500 text-lg leading-relaxed">أسست Creative Code لتكون شريكاً يفهم الجانبين: كيف يُبنى الحل تقنياً، وكيف يجلب عملاء فعلياً. اليوم نخدم عملاء في مصر والسعودية والإمارات والمملكة المتحدة، في قطاعات من الذهب والمجوهرات إلى السياحة والطب والصناعة.</p>
    <div class="grid grid-cols-3 gap-6 pt-6 counter-wrap"><?php echo cc_stat( $years, 'سنة خبرة', '+', false ) . cc_stat( 4, 'أسواق', '', false ) . cc_stat( 8, 'حلول برمجية', '', false ); // phpcs:ignore ?></div>
  </div>
</div></section>
<?php
$values = [ [ 'lucide:target', 'النتائج قبل الشكل', 'كل قرار تصميم أو تقنية يخدم هدفاً واضحاً: مبيعات، عملاء، أو وقت أقل.' ], [ 'lucide:layers', 'قوالب مجرّبة لكل قطاع', 'نبني على حلول اختُبرت مع عملاء حقيقيين، فننفذ أسرع وبجودة ثابتة.' ],
	[ 'lucide:sparkles', 'مدعومة بالذكاء الاصطناعي', 'نستخدم أدوات AI في التحليل والمحتوى والتطوير لنختصر الوقت دون التنازل عن الجودة.' ], [ 'lucide:handshake', 'وضوح وشفافية', 'نطاق وسعر ومراحل واضحة من البداية، ودفع على مرحلتين، وتدريب ودعم بعد التسليم.' ] ];
?>
<section class="py-24 px-6 bg-gray-50"><div class="max-w-7xl mx-auto">
<div class="text-center mb-16 reveal-on-scroll space-y-4"><?php echo cc_eyebrow( 'قيمنا' ); ?><h2 class="text-4xl md:text-5xl font-extrabold text-dark">كيف نعمل</h2></div>
<div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6"><?php foreach ( $values as $i => [ $ic, $t, $d ] ) : ?>
  <div class="bg-white p-10 rounded-[2.5rem] border border-gray-100 reveal-on-scroll" style="transition-delay:<?php echo esc_attr( $i * 0.1 ); ?>s"><div class="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-6"><?php echo cc_icon( $ic, 'text-3xl' ); ?></div><h3 class="text-xl font-bold mb-3"><?php echo esc_html( $t ); ?></h3><p class="text-gray-500 leading-relaxed"><?php echo esc_html( $d ); ?></p></div>
<?php endforeach; ?></div></div></section>
<section class="py-24 px-6 bg-navy text-white relative overflow-hidden"><div class="blob bg-accent/20 w-96 h-96 -bottom-20 -left-20"></div><div class="max-w-7xl mx-auto relative z-10">
<div class="text-center mb-16 reveal-on-scroll space-y-4"><?php echo cc_eyebrow( 'أين نعمل' ); ?><h2 class="text-4xl md:text-5xl font-extrabold">نخدم عملاء في ٤ أسواق</h2></div>
<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"><?php foreach ( cc_demo( 'MARKETS' ) as [ $m, $d ] ) : ?><div class="bg-white/5 border border-white/10 rounded-3xl p-8 reveal-on-scroll"><?php echo cc_icon( 'lucide:map-pin', 'text-accent text-3xl' ); ?><h3 class="text-2xl font-bold mt-4"><?php echo esc_html( $m ); ?></h3><p class="text-gray-400 mt-2"><?php echo esc_html( $d ); ?></p></div><?php endforeach; ?></div>
</div></section>
<?php
cc_sectors_strip( 'bg-white' );
while ( have_posts() ) {
	the_post();
	if ( trim( get_the_content() ) !== '' ) {
		echo '<section class="py-16 px-6"><article class="max-w-3xl mx-auto prose-cc">';
		the_content();
		echo '</article></section>';
	}
}
cc_cta_band( 'خلينا نشتغل سوا', 'احكيلنا عن نشاطك، ونقولك بصراحة إيه اللي هيفرق معاك.' );
get_footer();
