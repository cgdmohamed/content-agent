<?php
/**
 * Services overview (demo: services.html).
 *
 * @package CreativeCode
 */
get_header();

cc_page_header( 'خدماتنا', 'كل ما يحتاجه نشاطك<br><span class="text-accent">ليكبر رقمياً</span>', 'لا نكتب كوداً فقط — نصمم الحل الذي يخدم هدف عملك، ثم نسوّقه ليجلب نتائج.' );
cc_services_grid( 'bg-white', 'all-services' );

$blocks = [
	[ 'web', 'تطوير المواقع والمتاجر', 'مواقع تبيع<br>وتجمع العملاء', 'نبني مواقع الشركات وصفحات الهبوط والمتاجر الإلكترونية ومنصات التعليم والحجز على ووردبريس وWooCommerce، بلوحة تحكم تعدّل منها المحتوى بنفسك.',
		[ [ 'lucide:layout-template', 'مواقع وصفحات هبوط', 'سريعة ومهيأة لـ SEO والإعلانات' ], [ 'lucide:shopping-bag', 'متاجر WooCommerce', 'دفع وشحن ومخزون' ], [ 'lucide:graduation-cap', 'منصات تعليم', 'Tutor LMS وMoodle' ], [ 'lucide:calendar-check', 'أنظمة حجز', 'مواعيد وخدمات وجولات' ] ],
		cc_img( 'code2' ), [ 'wordpress', 'woocommerce', 'elementor', 'php', 'laravel', 'moodle', 'tailwindcss', [ 'ACF Pro', null ], [ 'Tutor LMS', null ] ], 'ابدأ مشروع موقعك', 'web-design', [ 'websites', 'stores', 'platforms' ] ],
	[ 'systems', 'أنظمة الأعمال والأتمتة', 'نظّم شغلك<br>وفّر وقت فريقك', 'ننفذ Odoo ERP وأنظمة مخصصة على Laravel لإدارة المبيعات والمخزون والفروع، ونربط واتساب بزنس API وبوابات Chatwoot لخدمة العملاء.',
		[ [ 'lucide:boxes', 'Odoo ERP', 'مبيعات ومخزون ومحاسبة' ], [ 'lucide:server', 'أنظمة مخصصة', 'Laravel حسب احتياجك' ], [ 'lucide:message-circle', 'Chatwoot', 'صندوق دعم موحد لفريقك' ], [ 'mdi:whatsapp', 'WhatsApp API', 'حملات وإشعارات وفواتير' ] ],
		cc_img( 'dashboard' ), [ 'odoo', 'laravel', 'chatwoot', [ 'whatsapp', 'WhatsApp Cloud API' ], 'react', 'mysql', 'n8n' ], 'ناقش نظامك معنا', 'odoo-erp', [ 'erp', 'support' ] ],
	[ 'marketing', 'التسويق الرقمي', 'إعلانات تجيب<br>عملاء، مش لايكات', 'ندير حملات Meta وGoogle وTikTok، والسوشيال ميديا، والمحتوى وتحسين الظهور في محركات البحث وإجابات الذكاء الاصطناعي — مع تتبع دقيق لكل نتيجة.',
		[ [ 'lucide:megaphone', 'إعلانات ممولة', 'Meta وGoogle وTikTok' ], [ 'lucide:share-2', 'إدارة السوشيال', 'خطة ومحتوى وتصميم وريلز' ], [ 'lucide:search', 'SEO وGEO', 'الظهور في جوجل وChatGPT' ], [ 'lucide:bar-chart-3', 'تتبع وتقارير', 'GTM وPixel وتقارير شهرية' ] ],
		cc_img( 'social' ), [ [ 'meta', 'Meta Ads' ], 'googleads', [ 'tiktok', 'TikTok Ads' ], 'googletagmanager', 'googleanalytics', 'googlesearchconsole', 'salla', [ 'openai', 'ChatGPT (GEO)' ] ], 'اطلب خطة تسويق', 'digital-marketing', [] ],
];
foreach ( $blocks as $i => [ $sid, $eb, $title, $text, $feats, $img, $chips, $cta, $slug, $anchors ] ) :
	$txt_first = $i % 2 === 0;
	ob_start(); ?>
<div class="space-y-8 reveal-on-scroll"><?php echo cc_eyebrow( $eb ); ?><h2 class="text-4xl md:text-5xl font-extrabold tracking-tight text-dark"><?php echo cc_kses( $title ); ?></h2>
<p class="text-gray-500 text-lg leading-relaxed"><?php echo esc_html( $text ); ?></p>
<div class="grid sm:grid-cols-2 gap-6"><?php foreach ( $feats as [ $ic, $t, $d ] ) : ?><div class="flex items-start gap-4"><div class="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0"><?php echo cc_icon( $ic, 'text-2xl' ); ?></div><div><h3 class="font-bold"><?php echo esc_html( $t ); ?></h3><p class="text-gray-500 text-sm"><?php echo esc_html( $d ); ?></p></div></div><?php endforeach; ?></div>
<a href="<?php echo esc_url( cc_svc_url( $slug ) ); ?>" class="inline-flex items-center gap-2 bg-accent text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-accent/20 ripple"><?php echo esc_html( $cta ); ?><?php echo cc_icon( 'lucide:arrow-left' ); ?></a></div>
	<?php $txt = ob_get_clean();
	$pic = '<div class="reveal-on-scroll"><div class="aspect-[4/3] rounded-[3rem] overflow-hidden shadow-2xl ' . ( $i % 2 ? 'rotate-2' : '-rotate-2' ) . ' hover:rotate-0 transition-transform duration-700"><img src="' . esc_url( $img ) . '" alt="' . esc_attr( $eb ) . '" loading="lazy" class="w-full h-full object-cover"></div></div>';
	?>
<section id="<?php echo esc_attr( $sid ); ?>" class="py-24 px-6 scroll-mt-20 <?php echo $i % 2 ? 'bg-gray-50' : 'bg-white'; ?>"><?php foreach ( $anchors as $a ) : ?><span id="<?php echo esc_attr( $a ); ?>" class="block relative -top-24"></span><?php endforeach; ?><div class="max-w-7xl mx-auto">
<div class="grid lg:grid-cols-2 gap-16 items-center"><?php echo $txt_first ? $txt . $pic : $pic . $txt; // phpcs:ignore ?></div>
<div class="mt-16 reveal-on-scroll"><p class="text-sm font-bold text-gray-400 mb-4">الأدوات والتقنيات</p><div class="flex flex-wrap gap-3"><?php foreach ( $chips as $c ) { echo cc_brand_chip( $c ); } // phpcs:ignore ?></div></div>
</div></section>
<?php endforeach;

cc_brands_strip( null, 'منصات وأدوات نعمل عليها يومياً', 'bg-white' );
cc_products_section( 'bg-white' );

$rows = [ [ 'الهدف', 'نتائج قابلة للقياس: عملاء ومبيعات', 'تسليم تصميم فقط' ], [ 'التطوير والتسويق', 'تحت سقف واحد وبخطة واحدة', 'جهتان منفصلتان' ], [ 'تعديل المحتوى', 'لوحة تحكم + تدريب لتعدّل بنفسك', 'الرجوع للمبرمج في كل تعديل' ],
	[ 'الدفع', '٥٠٪ مقدماً و٥٠٪ عند التسليم', 'المبلغ كاملاً مقدماً' ], [ 'بعد التسليم', 'دعم فني ومتابعة', 'ينتهي التواصل بالتسليم' ] ];
?>
<section class="py-24 px-6 bg-gray-50"><div class="max-w-5xl mx-auto">
<div class="text-center mb-12 reveal-on-scroll space-y-4"><?php echo cc_eyebrow( 'لماذا Creative Code؟' ); ?><h2 class="text-4xl font-extrabold text-dark">الفرق في طريقة العمل</h2></div>
<div class="bg-white rounded-[2.5rem] border border-gray-100 overflow-x-auto reveal-on-scroll"><table class="w-full text-right min-w-[600px]"><thead><tr class="bg-dark text-white"><th class="py-5 px-6">البند</th><th class="py-5 px-6">مع Creative Code</th><th class="py-5 px-6">الشائع في السوق</th></tr></thead><tbody>
<?php foreach ( $rows as [ $a, $b, $c ] ) : ?><tr class="border-b border-gray-100"><td class="py-5 px-6 font-bold"><?php echo esc_html( $a ); ?></td><td class="py-5 px-6 text-accent font-bold"><?php echo cc_icon( 'lucide:check-circle-2', 'align-middle ml-2' ); ?><?php echo esc_html( $b ); ?></td><td class="py-5 px-6 text-gray-400"><?php echo esc_html( $c ); ?></td></tr><?php endforeach; ?>
</tbody></table></div>
</div></section>
<?php
cc_cta_band();
get_footer();
