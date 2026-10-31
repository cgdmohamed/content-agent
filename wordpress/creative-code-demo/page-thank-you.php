<?php
/**
 * Thank-you page (slug: thank-you) — noindex, conversion page for Google Ads / GA4 (generate_lead fires on submit).
 *
 * @package CreativeCode
 */
get_header();
$steps = [ [ 'مراجعة الطلب', 'نراجع تفاصيل مشروعك وهدفك.' ], [ 'نتواصل معك', 'عبر واتساب أو الهاتف لفهم التفاصيل.' ], [ 'عرض واضح', 'نرسل لك الحل المقترح والسعر والجدول الزمني.' ] ];
$nums  = [ '١', '٢', '٣' ];
?>
<section class="relative pt-40 pb-24 px-6 overflow-hidden"><div class="hero-shape"></div><div class="max-w-4xl mx-auto text-center space-y-8">
<div class="w-24 h-24 mx-auto rounded-full bg-green-100 text-green-600 flex items-center justify-center"><?php echo cc_icon( 'lucide:check', 'text-5xl' ); ?></div>
<h1 class="text-5xl md:text-7xl font-extrabold tracking-tighter">شكراً لتواصلك!</h1>
<p class="text-xl text-gray-500 max-w-2xl mx-auto">استلمنا طلبك، وسنتواصل معك قريباً. لو حابب ترد أسرع، كلمنا مباشرة على واتساب.</p>
<div class="flex flex-wrap justify-center gap-4"><a href="<?php echo esc_url( cc_site( 'whatsapp' ) ); ?>" target="_blank" rel="noopener" class="bg-[#25D366] text-white px-8 py-4 rounded-2xl font-bold inline-flex items-center gap-2"><?php echo cc_icon( 'mdi:whatsapp', 'text-xl' ); ?>تواصل على واتساب</a><a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="border-2 border-dark/10 hover:border-dark px-8 py-4 rounded-2xl font-bold transition-all">العودة للرئيسية</a></div>
<h2 class="text-2xl font-bold pt-12">ماذا يحدث الآن؟</h2>
<div class="grid md:grid-cols-3 gap-6"><?php foreach ( $steps as $i => [ $t, $d ] ) : ?><div class="bg-white rounded-3xl p-8 border border-gray-100 text-right"><div class="w-12 h-12 rounded-full bg-accent text-white flex items-center justify-center font-black text-xl mb-4"><?php echo esc_html( $nums[ $i ] ); ?></div><h3 class="font-bold text-xl mb-2"><?php echo esc_html( $t ); ?></h3><p class="text-gray-500"><?php echo esc_html( $d ); ?></p></div><?php endforeach; ?></div>
<div class="pt-8 space-y-4"><p class="text-gray-400">تابعنا على السوشيال ميديا</p><div class="flex justify-center gap-3"><?php cc_social_icons( 'w-12 h-12 rounded-xl bg-gray-100 hover:bg-accent hover:text-white flex items-center justify-center transition-all text-xl' ); ?></div></div>
</div></section>
<?php
get_footer();
