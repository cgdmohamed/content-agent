<?php
/**
 * Pricing page body (demo: pricing.html) — shared by page-pricing.php and the cc_package archive.
 *
 * @package CreativeCode
 */
$faq = [];
foreach ( cc_faq_groups() as $g ) {
	if ( $g[0] === 'pricing' ) {
		$faq = $g[2];
	}
}
cc_page_header( 'الأسعار', 'باقات واضحة<br><span class="text-accent">تناسب مرحلة نشاطك</span>', 'اختر نقطة البداية، ونخصصها معك حسب هدفك. كل الباقات تشمل التدريب والدعم الفني بعد التسليم.', cc_country_switch() );
cc_pricing_block( 'web', 'باقات تصميم وتطوير المواقع', 'مواقع تعريفية، متاجر إلكترونية، ومنصات مخصصة.', 'web-packages' );
cc_payment_terms();
cc_pricing_block( 'social', 'باقات إدارة السوشيال ميديا الشهرية', 'محتوى وتصميم وإعلانات على فيسبوك وإنستجرام وتيك توك.', 'social-packages' );
if ( $faq ) : ?>
<section class="py-20 px-6"><div class="max-w-3xl mx-auto space-y-4"><h2 class="text-3xl font-extrabold text-dark text-center mb-10">أسئلة عن الأسعار</h2><?php cc_faq_list( $faq ); ?></div></section>
<?php endif;
cc_testimonials( true );
cc_cta_band( 'محتاج باقة مخصصة؟', 'قولنا هدفك وميزانيتك، ونقترح عليك أنسب حل.' );
