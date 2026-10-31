<?php
/**
 * Case studies archive (demo: case-studies.html).
 *
 * @package CreativeCode
 */
get_header();
cc_page_header( 'أعمالنا', 'دراسات حالة<br><span class="text-accent">من مشاريع حقيقية</span>', 'كيف ساعدنا شركات ومصانع وعيادات على بناء حضور رقمي يخدم أهدافها.' );

$cases   = cc_get_cases( 60 );
$filters = [ 'all' => 'الكل' ];
foreach ( $cases as $c ) {
	if ( $c['filter'] !== 'all' && ! empty( $c['filter_label'] ) ) {
		$filters[ $c['filter'] ] = $c['filter_label'];
	}
}
// Demo placeholders carry filter keys but no category terms; show their labels.
if ( count( $filters ) === 1 && $cases && ! $cases[0]['post_id'] ) {
	$filters += [ 'industry' => 'الصناعة', 'marketing' => 'التسويق', 'seo' => 'SEO' ];
}
?>
<section class="pb-24 px-6"><div class="max-w-7xl mx-auto">
<?php if ( count( $filters ) > 1 ) : ?>
<div class="flex flex-wrap justify-center gap-3 mb-16" data-filter-group="#cases">
  <?php foreach ( $filters as $k => $t ) : ?><button class="filter-btn <?php echo $k === 'all' ? 'active' : ''; ?> px-5 py-2.5 rounded-xl border border-gray-200 font-bold transition-all" data-f="<?php echo esc_attr( $k ); ?>"><?php echo esc_html( $t ); ?></button><?php endforeach; ?>
</div>
<?php endif; ?>
<h2 class="sr-only">كل دراسات الحالة</h2>
<div id="cases" class="grid md:grid-cols-2 gap-x-12 gap-y-20"><?php foreach ( $cases as $c ) { cc_case_card( $c ); } ?></div>
</div></section>
<?php
cc_testimonials( true );
cc_cta_band( 'مشروعك ممكن يكون دراسة الحالة الجاية', 'احكيلنا عن هدفك ونبدأ.' );
get_footer();
