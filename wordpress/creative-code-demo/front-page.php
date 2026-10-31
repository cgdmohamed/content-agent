<?php
/**
 * Home — hero, brands, services, sectors, process, about, products, work, testimonials, latest posts, contact.
 *
 * @package CreativeCode
 */
get_header();
$site  = cc_site();
$years = (int) $site['years'];
?>
<section id="hero" class="relative pt-36 pb-24 md:pt-52 md:pb-40 px-6 overflow-hidden"><div class="hero-shape"></div><div class="blob bg-accent w-64 h-64 -top-20 -right-20"></div>
<div class="max-w-7xl mx-auto relative z-10"><div class="grid md:grid-cols-2 gap-16 items-center">
  <div class="space-y-8 text-right">
    <div class="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-1.5 rounded-full text-sm font-bold"><span class="flex h-2 w-2 rounded-full bg-accent animate-pulse"></span><span>مواقع • أنظمة • تسويق</span></div>
    <h1 class="text-5xl md:text-7xl lg:text-8xl font-extrabold leading-[1.05] tracking-tighter text-dark"><span class="stagger-word" style="animation-delay:.1s">حلول</span> <span class="stagger-word" style="animation-delay:.2s">رقمية</span><br><span class="text-accent stagger-word" style="animation-delay:.3s">بنتائج</span> <span class="text-accent stagger-word" style="animation-delay:.4s">حقيقية</span></h1>
    <p class="text-xl text-gray-500 max-w-lg leading-relaxed">نصمم ونطوّر المواقع والمتاجر وأنظمة إدارة الأعمال، ونُدير تسويقك الرقمي في مصر والخليج — وهدفنا نتائج عملك، لا مجرد تصميم جميل.</p>
    <div class="flex flex-wrap gap-4 pt-2">
      <a href="#contact" class="bg-accent text-white px-8 py-4 rounded-2xl font-bold flex items-center group shadow-xl shadow-accent/20 ripple"><span>احجز استشارة مجانية</span><?php echo cc_icon( 'lucide:arrow-up-left', 'mr-2 text-xl group-hover:-translate-x-1 group-hover:-translate-y-1 transition-transform' ); ?></a>
      <a href="<?php echo esc_url( cc_url( 'work' ) ); ?>" class="border-2 border-dark/10 hover:border-dark px-8 py-4 rounded-2xl font-bold transition-all">شاهد أعمالنا</a>
    </div>
  </div>
  <div class="relative">
    <div class="relative z-10 aspect-square bg-navy rounded-[3rem] overflow-hidden shadow-2xl -rotate-3 hover:rotate-0 transition-transform duration-700"><img src="<?php echo esc_url( has_post_thumbnail() ? get_the_post_thumbnail_url( null, 'large' ) : cc_img( 'code' ) ); ?>" alt="تطوير المواقع والأنظمة" width="1000" height="1000" fetchpriority="high" class="w-full h-full object-cover opacity-80"></div>
    <div class="absolute -bottom-8 -right-4 md:-right-8 bg-white p-6 rounded-3xl shadow-xl z-20 border border-gray-100 flex items-center gap-4 animate-bounce-slow counter-wrap"><div class="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center"><?php echo cc_icon( 'lucide:award', 'text-2xl' ); ?></div><div><div class="text-2xl font-bold text-dark counter" data-target="<?php echo esc_attr( $years ); ?>" data-suffix="+"><?php echo esc_html( $years ); ?>+</div><div class="text-sm text-gray-400 font-medium">سنة خبرة</div></div></div>
    <div class="absolute -top-8 -left-4 bg-accent text-white p-4 rounded-2xl shadow-xl z-20 rotate-12"><?php echo cc_icon( 'lucide:code', 'text-3xl' ); ?></div>
  </div>
</div></div></section>

<?php cc_brands_strip(); cc_services_grid(); cc_sectors_strip(); cc_process(); ?>

<section id="about" class="py-24 md:py-32 px-6 bg-navy text-white overflow-hidden relative"><div class="blob bg-accent/20 w-96 h-96 -bottom-20 -left-20"></div>
<div class="max-w-7xl mx-auto relative z-10"><div class="grid lg:grid-cols-2 gap-16 items-center">
  <div class="space-y-8 reveal-on-scroll"><?php echo cc_eyebrow( 'عن Creative Code' ); ?>
    <h2 class="text-4xl md:text-6xl font-extrabold tracking-tight">برمجة وتسويق<br>تحت سقف واحد</h2>
    <p class="text-gray-400 text-lg leading-relaxed">أسسها <?php echo esc_html( $site['founder'] ); ?>، مهندس برمجيات بخبرة تتجاوز <?php echo esc_html( cc_ar_digits( (string) $years ) ); ?> عاماً بدأت من كتب HTML في الطفولة. نجمع بين التطوير والتسويق الأداء لأن الموقع وحده لا يكفي — المهم أن يجلب لك عملاء.</p>
    <div class="grid grid-cols-3 gap-6 pt-6"><?php echo cc_stat( $years, 'سنة خبرة' ) . cc_stat( 4, 'أسواق نخدمها', '' ) . cc_stat( 6, 'قطاعات', '+' ); // phpcs:ignore ?></div>
    <a href="<?php echo esc_url( cc_url( 'about' ) ); ?>" class="inline-flex items-center gap-2 font-bold text-accent">تعرّف علينا أكثر <?php echo cc_icon( 'lucide:arrow-left' ); ?></a>
  </div>
  <div class="grid grid-cols-2 gap-4 reveal-on-scroll" style="transition-delay:.2s">
    <?php foreach ( cc_demo( 'MARKETS' ) as $i => [ $m, $d ] ) : ?><div class="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 <?php echo $i % 2 ? 'mt-10' : ''; ?>"><?php echo cc_icon( 'lucide:map-pin', 'text-accent text-3xl' ); ?><h3 class="text-2xl font-bold mt-4"><?php echo esc_html( $m ); ?></h3><p class="text-gray-400 text-sm mt-2"><?php echo esc_html( $d ); ?></p></div><?php endforeach; ?>
  </div>
</div></div></section>

<?php
cc_products_section();
cc_featured_work();
cc_testimonials( true );
cc_latest_posts();
cc_contact_section();
get_footer();
