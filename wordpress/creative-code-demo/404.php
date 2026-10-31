<?php
/**
 * 404.
 *
 * @package CreativeCode
 */
get_header();
?>
<section class="relative pt-40 pb-24 px-6 overflow-hidden"><div class="hero-shape"></div><div class="max-w-3xl mx-auto text-center space-y-8">
  <p class="text-8xl md:text-9xl font-black text-accent">٤٠٤</p>
  <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight">الصفحة غير موجودة</h1>
  <p class="text-xl text-gray-500">ربما تغيّر الرابط أو حُذفت الصفحة. جرّب الرجوع للرئيسية أو تصفّح خدماتنا.</p>
  <div class="flex flex-wrap justify-center gap-4"><a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="bg-accent text-white px-8 py-4 rounded-2xl font-bold">العودة للرئيسية</a><a href="<?php echo esc_url( cc_url( 'services' ) ); ?>" class="border-2 border-dark/10 hover:border-dark px-8 py-4 rounded-2xl font-bold transition-all">خدماتنا</a></div>
</div></section>
<?php
get_footer();
