<?php
/**
 * Service landing-page blocks (single-cc_service.php) — port of the demo's pages_services.py.
 * Built for Google Ads: one goal (lead), CTA above the fold and after every persuasion block,
 * sticky mobile CTA bar, risk reversal, objection-handling FAQ, attribution fields.
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

function cc_lp_list( array $items, string $icon, string $class ): void {
	foreach ( $items as $x ) {
		echo '<li class="flex items-start gap-3">' . cc_icon( $icon, $class . ' text-2xl shrink-0' ) . '<span>' . esc_html( $x ) . '</span></li>';
	}
}

function cc_lp_hero_form( array $sp ): void {
	$inp    = 'w-full px-5 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-accent focus:bg-white transition-all outline-none';
	$fluent = cc_fluent_embed( 'fluent_service_form_id', 'hero' );
	?>
<div id="quote" class="bg-white rounded-[2rem] shadow-2xl shadow-accent/10 border border-gray-100 p-7 md:p-9 space-y-5 scroll-mt-28">
  <div class="space-y-1"><p class="text-2xl font-extrabold text-dark">احصل على عرض سعر مجاني</p><p class="text-gray-500">بدون أي التزام — اترك رقمك ونتواصل معك.</p></div>
  <?php if ( $fluent ) : echo $fluent; // phpcs:ignore
	else : ?>
  <form action="<?php echo esc_url( cc_lead_action_url() ); ?>" method="post" class="space-y-4 cc-lead-form" data-form="hero"><?php echo cc_lead_hidden_fields( $sp['id'], 'hero' ); // phpcs:ignore ?>
    <input type="hidden" name="service" value="<?php echo esc_attr( $sp['nav'] ); ?>">
    <label class="sr-only" for="q-name">الاسم</label><input id="q-name" name="name" required autocomplete="name" placeholder="الاسم" class="<?php echo esc_attr( $inp ); ?>">
    <label class="sr-only" for="q-phone">رقم الجوال / واتساب</label><input id="q-phone" name="phone" required type="tel" autocomplete="tel" inputmode="tel" dir="ltr" placeholder="رقم الجوال / واتساب" class="<?php echo esc_attr( $inp ); ?> text-right">
    <label class="sr-only" for="q-country">الدولة</label><select id="q-country" name="country" class="<?php echo esc_attr( $inp ); ?>"><option>مصر</option><option>السعودية</option><option>الإمارات</option><option>المملكة المتحدة</option><option>أخرى</option></select>
    <button type="submit" class="w-full bg-accent text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-accent/30 hover:shadow-accent/50 transition-all active:scale-95 ripple">اطلب عرض السعر</button>
  </form>
  <?php endif; ?>
  <div class="flex items-center gap-3 text-sm text-gray-400"><span class="h-px flex-1 bg-gray-100"></span>أو<span class="h-px flex-1 bg-gray-100"></span></div>
  <a href="<?php echo esc_url( cc_wa_service( $sp['nav'] ) ); ?>" target="_blank" rel="noopener" class="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-bold bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366] hover:text-white transition-all"><?php echo cc_icon( 'mdi:whatsapp', 'text-2xl' ); ?>كلمنا على واتساب الآن</a>
  <?php cc_consent_note(); ?>
</div>
	<?php
}

function cc_lp_mid_cta( array $sp, string $text = 'جاهز تبدأ؟ اطلب عرض سعر مجاني خلال دقيقة.' ): void {
	?>
<div class="mt-14 flex flex-col sm:flex-row items-center justify-center gap-4 reveal-on-scroll">
  <a href="#quote" class="bg-accent text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-accent/20 ripple inline-flex items-center gap-2">اطلب عرض سعر مجاني<?php echo cc_icon( 'lucide:arrow-left' ); ?></a>
  <a href="<?php echo esc_url( cc_wa_service( $sp['nav'] ) ); ?>" target="_blank" rel="noopener" class="border-2 border-dark/10 hover:border-[#25D366] hover:text-[#128C7E] px-8 py-4 rounded-2xl font-bold transition-all inline-flex items-center gap-2"><?php echo cc_icon( 'mdi:whatsapp', 'text-xl' ); ?>واتساب</a>
</div><p class="text-center text-sm text-gray-400 mt-3"><?php echo esc_html( $text ); ?></p>
	<?php
}

function cc_lp_sticky_bar( array $sp ): void {
	?>
<div class="sticky-cta md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur border-t border-gray-200 grid grid-cols-3 text-sm font-bold">
  <a href="tel:<?php echo esc_attr( cc_site( 'phone_tel' ) ); ?>" class="flex flex-col items-center gap-1 py-3"><?php echo cc_icon( 'lucide:phone', 'text-xl text-accent' ); ?>اتصل</a>
  <a href="<?php echo esc_url( cc_wa_service( $sp['nav'] ) ); ?>" target="_blank" rel="noopener" class="flex flex-col items-center gap-1 py-3 text-[#128C7E]"><?php echo cc_icon( 'mdi:whatsapp', 'text-xl' ); ?>واتساب</a>
  <a href="#quote" class="flex flex-col items-center justify-center gap-1 py-3 bg-accent text-white"><?php echo cc_icon( 'lucide:file-text', 'text-xl' ); ?>عرض سعر</a>
</div>
	<?php
}

/** Whole landing page body for one service. */
function cc_lp_render( array $sp ): void {
	$site = cc_site();
	$trust = [ [ 'lucide:award', cc_ar_digits( (string) $site['years'] ) . '+ سنة خبرة' ], [ 'lucide:globe', 'عملاء في ٤ دول' ], [ 'lucide:wallet', '٥٠٪ فقط مقدماً' ], [ 'lucide:graduation-cap', 'تدريب + دعم بعد التسليم' ] ];
	?>
<header class="relative pt-32 md:pt-36 pb-16 px-6 overflow-hidden"><div class="hero-shape"></div>
<div class="max-w-7xl mx-auto grid lg:grid-cols-5 gap-x-12 gap-y-8 items-start">
  <div class="lg:col-span-3 space-y-6">
    <div class="lp-hide"><?php cc_breadcrumbs( [ [ 'الخدمات', cc_url( 'services' ) ], [ $sp['nav'], '' ] ] ); ?></div>
    <?php if ( $sp['badges'] ) : ?><div class="flex flex-wrap gap-2"><?php foreach ( $sp['badges'] as $b ) : ?><span class="bg-accent/10 text-accent px-4 py-1.5 rounded-full text-sm font-bold"><?php echo esc_html( $b ); ?></span><?php endforeach; ?></div><?php endif; ?>
    <h1 class="text-5xl md:text-7xl font-extrabold tracking-tighter leading-[1.1]"><?php echo esc_html( $sp['h1'] ); ?><?php if ( $sp['h1_accent'] ) : ?><br><span class="text-accent"><?php echo esc_html( $sp['h1_accent'] ); ?></span><?php endif; ?></h1>
    <p class="text-xl text-gray-500 leading-relaxed max-w-2xl"><?php echo esc_html( $sp['lead'] ); ?></p>
  </div>
  <div class="lg:col-span-2 lg:row-span-2 lg:sticky lg:top-28"><?php cc_lp_hero_form( $sp ); ?></div>
  <div class="lg:col-span-3 space-y-6">
    <ul class="grid sm:grid-cols-2 gap-3 text-gray-700 font-medium"><?php cc_lp_list( $sp['solutions'], 'lucide:check-circle-2', 'text-accent' ); ?></ul>
    <div class="flex flex-wrap gap-x-8 gap-y-3 pt-6 border-t border-gray-100">
      <?php foreach ( $trust as [ $i, $t ] ) : ?><div class="flex items-center gap-2 text-sm font-bold text-gray-600"><?php echo cc_icon( $i, 'text-accent text-xl' ); ?><?php echo esc_html( $t ); ?></div><?php endforeach; ?>
    </div>
  </div>
</div></header>
	<?php
	$tool_slugs = array_map( fn( $t ) => is_array( $t ) ? $t[0] : $t, $sp['tools'] );
	cc_brands_strip( $tool_slugs, 'الأدوات والتقنيات التي نستخدمها', 'bg-gray-50' );

	if ( $sp['problems'] ) : ?>
<section id="problem" class="py-24 px-6"><div class="max-w-6xl mx-auto">
<div class="text-center mb-14 reveal-on-scroll space-y-4"><?php echo cc_eyebrow( 'المشكلة والحل' ); ?><h2 class="text-4xl md:text-5xl font-extrabold text-dark">لو بتعاني من ده… إحنا عندنا الحل</h2></div>
<div class="grid md:grid-cols-2 gap-8">
<div class="bg-gray-50 rounded-[2.5rem] p-10 reveal-on-scroll"><p class="text-xl font-bold mb-6 text-gray-400">بدون حل مناسب</p><ul class="space-y-5 text-gray-600"><?php cc_lp_list( $sp['problems'], 'lucide:x-circle', 'text-red-400' ); ?></ul></div>
<div class="bg-dark text-white rounded-[2.5rem] p-10 reveal-on-scroll"><p class="text-xl font-bold mb-6 text-accent">مع Creative Code</p><ul class="space-y-5"><?php cc_lp_list( $sp['solutions'], 'lucide:check-circle-2', 'text-accent' ); ?></ul></div>
</div><?php cc_lp_mid_cta( $sp ); ?></div></section>
	<?php endif;

	if ( $sp['features'] ) : ?>
<section id="features" class="py-24 px-6 bg-gray-50"><div class="max-w-7xl mx-auto">
<div class="text-center mb-14 reveal-on-scroll space-y-4"><?php echo cc_eyebrow( 'ماذا تحصل عليه' ); ?><h2 class="text-4xl md:text-5xl font-extrabold text-dark">كل اللي تحتاجه في <?php echo esc_html( $sp['nav'] ); ?></h2></div>
<div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
  <?php foreach ( $sp['features'] as [ $ic, $t, $d ] ) : ?>
  <div class="bg-white p-8 rounded-[2rem] border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all reveal-on-scroll"><div class="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-5"><?php echo cc_feat_icon( $ic ); ?></div><h3 class="text-xl font-bold mb-2"><?php echo esc_html( $t ); ?></h3><p class="text-gray-500"><?php echo esc_html( $d ); ?></p></div>
  <?php endforeach; ?>
</div><?php cc_lp_mid_cta( $sp, 'استشارة أولى مجانية لتحديد الحل المناسب لنشاطك.' ); ?></div></section>
	<?php endif;

	$why = [ [ 'lucide:target', 'النتيجة قبل الشكل', 'نبدأ بهدفك: طلبات، مبيعات، أو وقت أقل — ونبني عليه.' ], [ 'lucide:wallet', 'مخاطرة أقل', '٥٠٪ مقدماً و٥٠٪ بعد مراجعتك واعتمادك للتسليم.' ],
		[ 'lucide:layers', 'قوالب مجرّبة', 'حلول اشتغلت مع عملاء حقيقيين في قطاعك، فننفذ أسرع.' ], [ 'lucide:life-buoy', 'مش هنسيبك', 'تدريب على الاستخدام ودعم فني بعد التسليم.' ] ];
	?>
<section id="why" class="py-24 px-6 bg-navy text-white relative overflow-hidden"><div class="blob bg-accent/20 w-96 h-96 -top-20 -left-20"></div><div class="max-w-7xl mx-auto relative z-10">
<div class="text-center mb-14 reveal-on-scroll space-y-4"><?php echo cc_eyebrow( 'لماذا Creative Code' ); ?><h2 class="text-4xl md:text-5xl font-extrabold">ليه تشتغل معانا؟</h2>
<p class="text-gray-400 text-lg max-w-2xl mx-auto">بيقودها <?php echo esc_html( $site['founder'] ); ?>، مهندس برمجيات بخبرة <?php echo esc_html( cc_ar_digits( (string) $site['years'] ) ); ?>+ سنة في البرمجة والتسويق — وبنخدم عملاء في مصر والسعودية والإمارات والمملكة المتحدة.</p></div>
<div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
  <?php foreach ( $why as [ $i, $t, $d ] ) : ?><div class="bg-white/5 border border-white/10 rounded-3xl p-8 reveal-on-scroll"><?php echo cc_icon( $i, 'text-accent text-4xl' ); ?><h3 class="text-xl font-bold mt-4 mb-2"><?php echo esc_html( $t ); ?></h3><p class="text-gray-400"><?php echo esc_html( $d ); ?></p></div><?php endforeach; ?>
</div></div></section>
	<?php
	$steps = [ [ 'تواصل معنا', 'املأ النموذج أو ابعت على واتساب.' ], [ 'مكالمة سريعة', 'نفهم نشاطك وهدفك ونسألك الأسئلة المهمة.' ], [ 'عرض واضح', 'حل مقترح وسعر ومراحل وجدول زمني مكتوب.' ], [ 'نبدأ التنفيذ', 'بعد دفع ٥٠٪، ومراجعتك في كل مرحلة.' ] ];
	$nums  = [ '١', '٢', '٣', '٤' ];
	?>
<section id="steps" class="py-24 px-6"><div class="max-w-7xl mx-auto">
<div class="text-center mb-14 reveal-on-scroll space-y-4"><?php echo cc_eyebrow( 'الخطوات' ); ?><h2 class="text-4xl md:text-5xl font-extrabold text-dark">إيه اللي بيحصل بعد ما تتواصل؟</h2></div>
<div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
  <?php foreach ( $steps as $i => [ $t, $d ] ) : ?><div class="relative bg-white rounded-3xl p-8 border border-gray-100 reveal-on-scroll"><div class="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-black text-xl mb-5"><?php echo esc_html( $nums[ $i ] ); ?></div><h3 class="font-bold text-xl mb-2"><?php echo esc_html( $t ); ?></h3><p class="text-gray-500"><?php echo esc_html( $d ); ?></p></div><?php endforeach; ?>
</div></div></section>
	<?php
	if ( $sp['pricing'] === 'web' ) {
		cc_pricing_block( 'web', 'الباقات والأسعار', 'اختر نقطة البداية، ونخصصها معك حسب هدفك.', 'pricing', '#quote', true );
		cc_payment_terms();
	} elseif ( $sp['pricing'] === 'social' ) {
		cc_pricing_block( 'social', 'باقات الإدارة الشهرية', 'ميزانية الإعلانات منفصلة وتُحدد معك.', 'pricing', '#quote', true );
	} else {
		?>
<section id="pricing" class="py-20 px-6"><div class="max-w-5xl mx-auto bg-accent text-white rounded-[3rem] p-10 md:p-14 grid md:grid-cols-3 gap-8 items-center reveal-on-scroll">
<div class="md:col-span-2 space-y-3"><h2 class="text-3xl md:text-4xl font-extrabold">السعر حسب احتياجك</h2><p class="text-white/80 text-lg">كل نشاط مختلف، فبنسعّر حسب النطاق الفعلي — وبتاخد عرض مكتوب وواضح قبل أي التزام. والدفع ٥٠٪ مقدماً و٥٠٪ عند التسليم.</p></div>
<a href="#quote" class="block text-center bg-white text-dark px-8 py-5 rounded-2xl font-bold text-lg hover:shadow-2xl transition-all">اطلب عرض السعر</a></div></section>
		<?php
	}

	$case = $sp['case'] ? cc_get_case_by_slug( $sp['case'] ) : null;
	if ( $case ) : ?>
<section id="case" class="py-24 px-6 bg-gray-50"><div class="max-w-5xl mx-auto"><div class="text-center mb-12 space-y-4"><?php echo cc_eyebrow( 'من أعمالنا' ); ?><h2 class="text-4xl font-extrabold text-dark">شغل حقيقي مع عميل حقيقي</h2></div><?php cc_case_card( $case ); ?></div></section>
	<?php endif;

	cc_testimonials( false, 'عملاؤنا بيقولوا إيه' );
	if ( $sp['faq'] ) : ?>
<section id="faq" class="py-24 px-6"><div class="max-w-3xl mx-auto space-y-4"><h2 class="text-4xl font-extrabold text-dark text-center mb-10">أسئلة قبل ما تبدأ</h2><?php cc_faq_list( $sp['faq'] ); ?></div></section>
	<?php endif;

	cc_contact_section( $sp['id'], 'خلّينا نبدأ <span class="text-accent">' . esc_html( $sp['nav'] ) . '</span>', 'اكتب لنا تفاصيل أكثر عن مشروعك، أو كلمنا مباشرة على واتساب — الاستشارة الأولى مجانية.' );
	cc_lp_sticky_bar( $sp );
}
