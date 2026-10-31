<?php
/**
 * UI partials — PHP port of the demo's _source/parts.py. Each function prints one block.
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

/** Allow the few inline tags the demo uses inside headings (<br>, accent <span>). */
function cc_kses( string $html ): string {
	return wp_kses( $html, [ 'br' => [], 'span' => [ 'class' => true ], 'strong' => [], 'em' => [], 'a' => [ 'href' => true, 'class' => true ] ] );
}

/* ------------------------------------------------------------------ chrome */

/** Menu tree: assigned "primary" menu, else the demo's nav with the services dropdown. */
function cc_menu_tree(): array {
	$locations = get_nav_menu_locations();
	if ( ! empty( $locations['primary'] ) ) {
		$items = wp_get_nav_menu_items( $locations['primary'] );
		if ( $items ) {
			$cur  = untrailingslashit( home_url( add_query_arg( [] ) ) );
			$tree = [];
			$by   = [];
			foreach ( $items as $it ) {
				$u    = untrailingslashit( $it->url );
				$node = [ 'label' => $it->title, 'url' => $it->url, 'icon' => '', 'children' => [], 'active' => $u !== untrailingslashit( home_url() ) ? str_starts_with( $cur, $u ) : is_front_page() ];
				$by[ $it->ID ] = $node;
			}
			foreach ( $items as $it ) {
				if ( (int) $it->menu_item_parent && isset( $by[ (int) $it->menu_item_parent ] ) ) {
					$by[ (int) $it->menu_item_parent ]['children'][] = &$by[ $it->ID ];
				}
			}
			foreach ( $items as $it ) {
				if ( ! (int) $it->menu_item_parent ) {
					$tree[] = $by[ $it->ID ];
				}
			}
			return $tree;
		}
	}
	$active = cc_active_nav();
	$tree   = [];
	foreach ( cc_nav_items() as [ $key, $label, $url ] ) {
		$node = [ 'label' => $label, 'url' => $url, 'icon' => '', 'children' => [], 'active' => $key === $active ];
		if ( $key === 'services' ) {
			foreach ( cc_get_services() as $s ) {
				$node['children'][] = [ 'label' => $s['title'], 'url' => $s['url'], 'icon' => $s['icon'], 'children' => [], 'active' => false ];
			}
		}
		$tree[] = $node;
	}
	return $tree;
}

function cc_logo( string $class = 'h-8 md:h-10 w-auto brightness-0' ): void {
	$brand = cc_site( 'brand' );
	if ( has_custom_logo() ) {
		$id = (int) get_theme_mod( 'custom_logo' );
		echo wp_get_attachment_image( $id, 'full', false, [ 'class' => $class, 'alt' => $brand, 'loading' => 'eager', 'decoding' => 'async' ] );
		return;
	}
	echo '<img src="' . esc_url( CC_URI . '/assets/img/logo-white.svg' ) . '" alt="' . esc_attr( $brand ) . '" width="160" height="40" class="' . esc_attr( $class ) . '">';
}

function cc_nav(): void {
	$tree = cc_menu_tree();
	$cta  = cc_url( 'contact' );
	?>
<nav class="fixed top-0 right-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-gray-100" aria-label="<?php esc_attr_e( 'القائمة الرئيسية', 'creativecode' ); ?>">
  <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
    <a id="nav-logo" href="<?php echo esc_url( home_url( '/' ) ); ?>" class="flex items-center" aria-label="<?php echo esc_attr( cc_site( 'brand' ) ); ?>"><?php cc_logo(); ?></a>
    <div class="lp-hide hidden lg:flex items-center gap-8 font-medium text-gray-600">
      <?php foreach ( $tree as $n ) :
		$cls = $n['active'] ? 'active-nav' : 'hover:text-accent';
		if ( ! $n['children'] ) : ?>
        <a href="<?php echo esc_url( $n['url'] ); ?>" class="<?php echo esc_attr( $cls ); ?> transition-colors"><?php echo esc_html( $n['label'] ); ?></a>
      <?php else : ?>
        <div class="relative group"><a href="<?php echo esc_url( $n['url'] ); ?>" class="<?php echo esc_attr( $cls ); ?> transition-colors inline-flex items-center gap-1"><?php echo esc_html( $n['label'] ); ?><?php echo cc_icon( 'lucide:chevron-down', 'text-sm' ); ?></a>
          <div class="absolute top-full right-0 pt-4 invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-all">
            <div class="w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 text-gray-700">
              <?php foreach ( $n['children'] as $c ) : ?>
                <a href="<?php echo esc_url( $c['url'] ); ?>" class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-accent/5 hover:text-accent"><?php echo $c['icon'] ? cc_icon( $c['icon'], 'text-xl text-accent' ) : ''; ?><span><?php echo esc_html( $c['label'] ); ?></span></a>
              <?php endforeach; ?>
            </div>
          </div>
        </div>
      <?php endif; endforeach; ?>
    </div>
    <div class="flex items-center gap-3">
      <a href="tel:<?php echo esc_attr( cc_site( 'phone_tel' ) ); ?>" class="lp-show hidden items-center gap-2 font-bold" dir="ltr"><?php echo cc_icon( 'lucide:phone', 'text-accent' ); ?><?php echo esc_html( cc_site( 'phone_display' ) ); ?></a>
      <a href="<?php echo esc_url( $cta ); ?>" data-fallback="<?php echo esc_url( $cta ); ?>" class="nav-cta hidden sm:inline-block bg-accent text-white px-6 py-2.5 rounded-full font-semibold hover:shadow-lg hover:shadow-accent/30 transition-all ripple">احجز استشارة</a>
      <button id="menu-btn" class="lp-hide lg:hidden w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center" aria-label="القائمة" aria-expanded="false" aria-controls="mobile-menu"><?php echo cc_icon( 'lucide:menu', 'text-2xl' ); ?></button>
    </div>
  </div>
  <div id="mobile-menu" class="lg:hidden hidden bg-white border-t border-gray-100 px-6 pb-6 font-medium max-h-[80vh] overflow-y-auto">
    <?php foreach ( $tree as $n ) : ?>
      <a href="<?php echo esc_url( $n['url'] ); ?>" class="block py-3 border-b border-gray-100 <?php echo $n['active'] ? 'text-accent font-bold' : ''; ?>"><?php echo esc_html( $n['label'] ); ?></a>
      <?php if ( $n['children'] ) : ?><div class="border-b border-gray-100 pb-2"><?php foreach ( $n['children'] as $c ) : ?><a href="<?php echo esc_url( $c['url'] ); ?>" class="block py-2 pr-4 text-gray-500"><?php echo esc_html( $c['label'] ); ?></a><?php endforeach; ?></div><?php endif; ?>
    <?php endforeach; ?>
    <a href="<?php echo esc_url( $cta ); ?>" class="mt-4 block text-center bg-accent text-white py-3 rounded-2xl font-bold">احجز استشارة</a>
  </div>
</nav>
	<?php
}

function cc_social_icons( string $class ): void {
	foreach ( cc_site( 'social' ) as [ $net, $url ] ) {
		$brands = cc_brands();
		if ( $url === '#' || ! isset( $brands[ $net ] ) ) {
			continue;
		}
		echo '<a href="' . esc_url( $url ) . '" target="_blank" rel="noopener" aria-label="' . esc_attr( $brands[ $net ]['title'] ) . '" class="' . esc_attr( $class ) . '">' . cc_brand_svg( $net ) . '</a>';
	}
}

function cc_footer(): void {
	$site  = cc_site();
	$quick = array_slice( cc_nav_items(), 0, 5 );
	?>
<footer class="py-16 px-6 border-t border-gray-100 bg-white">
  <div class="max-w-7xl mx-auto">
    <div class="lp-hide grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
      <div class="space-y-6">
        <?php cc_logo( 'h-10 w-auto brightness-0' ); ?>
        <p class="text-gray-500"><?php echo esc_html( $site['tagline'] ); ?></p>
        <div class="flex gap-3"><?php cc_social_icons( 'w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-accent hover:text-white transition-all' ); ?></div>
      </div>
      <div class="space-y-6"><h2 class="font-bold text-dark">روابط سريعة</h2>
        <?php if ( has_nav_menu( 'footer' ) ) :
			wp_nav_menu( [ 'theme_location' => 'footer', 'container' => false, 'menu_class' => 'space-y-3 text-gray-500', 'depth' => 1, 'fallback_cb' => false ] );
		else : ?>
        <ul class="space-y-3 text-gray-500"><?php foreach ( $quick as [ $k, $l, $u ] ) : ?><li><a href="<?php echo esc_url( $u ); ?>" class="hover:text-accent"><?php echo esc_html( $l ); ?></a></li><?php endforeach; ?></ul>
        <?php endif; ?>
      </div>
      <div class="space-y-6"><h2 class="font-bold text-dark">خدماتنا</h2>
        <ul class="space-y-3 text-gray-500"><?php foreach ( cc_get_services() as $s ) : ?><li><a href="<?php echo esc_url( $s['url'] ); ?>" class="hover:text-accent"><?php echo esc_html( $s['title'] ); ?></a></li><?php endforeach; ?></ul>
      </div>
      <div class="space-y-6"><h2 class="font-bold text-dark">تواصل معنا</h2>
        <ul class="space-y-4 text-gray-500">
          <li class="flex items-center gap-3"><?php echo cc_icon( 'lucide:mail', 'text-accent' ); ?><a href="mailto:<?php echo esc_attr( $site['email'] ); ?>"><?php echo esc_html( $site['email'] ); ?></a></li>
          <li class="flex items-center gap-3"><?php echo cc_icon( 'lucide:phone', 'text-accent' ); ?><a href="tel:<?php echo esc_attr( $site['phone_tel'] ); ?>" dir="ltr"><?php echo esc_html( $site['phone_display'] ); ?></a></li>
          <li class="flex items-center gap-3"><?php echo cc_icon( 'mdi:whatsapp', 'text-accent' ); ?><a href="<?php echo esc_url( $site['whatsapp'] ); ?>" target="_blank" rel="noopener">واتساب</a></li>
          <li class="flex items-center gap-3"><?php echo cc_icon( 'lucide:map-pin', 'text-accent' ); ?><span><?php echo esc_html( $site['city'] ); ?></span></li>
        </ul>
      </div>
    </div>
    <div class="pt-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6 text-gray-400 text-sm">
      <p>© <span data-year><?php echo esc_html( date( 'Y' ) ); ?></span> <?php echo esc_html( $site['brand'] ); ?>. جميع الحقوق محفوظة.</p>
      <div class="flex gap-8"><a href="<?php echo esc_url( cc_url( 'privacy-policy' ) ); ?>" class="hover:text-dark">سياسة الخصوصية</a></div>
    </div>
  </div>
</footer>
<a href="<?php echo esc_url( $site['whatsapp'] ); ?>" target="_blank" rel="noopener" aria-label="واتساب" class="wa-float fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full bg-[#25D366] text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform"><?php echo cc_icon( 'mdi:whatsapp', 'text-3xl' ); ?></a>
	<?php
}

/* --------------------------------------------------------------- small bits */

function cc_eyebrow( string $t, string $extra = '' ): string {
	return '<p class="text-accent font-bold tracking-widest uppercase text-sm ' . esc_attr( $extra ) . '">' . esc_html( $t ) . '</p>';
}

/** Visible breadcrumbs. $items = [[label, url|''], …]; the home link is prepended. */
function cc_breadcrumbs( array $items ): void {
	array_unshift( $items, [ 'الرئيسية', home_url( '/' ) ] );
	echo '<nav aria-label="مسار التنقل" class="text-sm text-gray-400"><ol class="flex flex-wrap items-center gap-2">';
	$last = count( $items ) - 1;
	foreach ( $items as $i => [ $label, $url ] ) {
		if ( $i === $last ) {
			echo '<li aria-current="page" class="text-dark font-bold truncate max-w-[16rem]">' . esc_html( $label ) . '</li>';
		} else {
			echo '<li><a href="' . esc_url( $url ) . '" class="hover:text-accent">' . esc_html( $label ) . '</a></li><li aria-hidden="true">/</li>';
		}
	}
	echo '</ol></nav>';
}

function cc_page_header( string $eyebrow, string $title_html, string $text, string $after = '' ): void {
	?>
<header class="relative pt-40 pb-20 px-6 overflow-hidden"><div class="hero-shape"></div>
  <div class="max-w-4xl mx-auto text-center space-y-6">
    <div class="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-1.5 rounded-full text-sm font-bold"><span class="flex h-2 w-2 rounded-full bg-accent animate-pulse"></span><span><?php echo esc_html( $eyebrow ); ?></span></div>
    <h1 class="text-5xl md:text-7xl font-extrabold tracking-tighter text-dark leading-tight"><?php echo cc_kses( $title_html ); ?></h1>
    <?php if ( $text !== '' ) : ?><p class="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed"><?php echo esc_html( $text ); ?></p><?php endif; ?>
    <?php echo $after; // phpcs:ignore WordPress.Security.EscapeOutput -- built by cc_* helpers ?>
  </div>
</header>
	<?php
}

function cc_stat( $n, string $label, string $suffix = '+', bool $dark = true ): string {
	return '<div class="space-y-2"><div class="text-4xl md:text-5xl font-black text-accent counter" data-target="' . (int) $n . '" data-suffix="' . esc_attr( $suffix ) . '">' . (int) $n . esc_html( $suffix ) . '</div><div class="text-sm ' . ( $dark ? 'text-gray-400' : 'text-gray-500' ) . '">' . esc_html( $label ) . '</div></div>';
}

function cc_cta_band( string $title = 'عندك مشروع في دماغك؟', string $text = 'ابعتلنا على واتساب ونرد عليك بخطة واضحة وسعر مناسب.', ?array $primary = null, ?array $secondary = null ): void {
	$primary   = $primary ?: [ 'تواصل عبر واتساب', cc_site( 'whatsapp' ) ];
	$secondary = $secondary ?: [ 'املأ نموذج التواصل', cc_url( 'contact' ) ];
	$ext       = str_starts_with( $primary[1], 'http' ) && ! str_starts_with( $primary[1], home_url() );
	?>
<section class="py-24 px-6"><div class="max-w-5xl mx-auto bg-dark text-white rounded-[3rem] p-10 md:p-16 text-center relative overflow-hidden reveal-on-scroll">
  <div class="blob bg-accent/40 w-72 h-72 -top-24 -right-24"></div>
  <div class="relative z-10 space-y-6"><h2 class="text-3xl md:text-5xl font-extrabold"><?php echo esc_html( $title ); ?></h2><p class="text-gray-400 text-lg max-w-2xl mx-auto"><?php echo esc_html( $text ); ?></p>
  <div class="flex flex-wrap justify-center gap-4 pt-4">
    <a href="<?php echo esc_url( $primary[1] ); ?>" <?php echo $ext ? 'target="_blank" rel="noopener"' : ''; ?> class="bg-accent text-white px-8 py-4 rounded-2xl font-bold inline-flex items-center gap-2 shadow-xl shadow-accent/30 ripple"><?php echo cc_icon( 'mdi:whatsapp', 'text-xl' ); ?><?php echo esc_html( $primary[0] ); ?></a>
    <a href="<?php echo esc_url( $secondary[1] ); ?>" class="border-2 border-white/20 hover:border-white px-8 py-4 rounded-2xl font-bold transition-all"><?php echo esc_html( $secondary[0] ); ?></a>
  </div></div>
</div></section>
	<?php
}

function cc_faq_list( array $items ): void {
	foreach ( $items as [ $q, $a ] ) : ?>
<details class="faq-item group bg-white border border-gray-100 rounded-3xl p-6 md:p-8">
  <summary class="flex items-center justify-between gap-4 cursor-pointer list-none"><h3 class="text-lg md:text-xl font-bold"><?php echo esc_html( $q ); ?></h3><?php echo cc_icon( 'lucide:chevron-down', 'chevron text-2xl text-gray-400 shrink-0 transition-transform' ); ?></summary>
  <p class="text-gray-500 leading-relaxed pt-4"><?php echo esc_html( $a ); ?></p></details>
	<?php endforeach;
}

/* ---------------------------------------------------------------- sections */

function cc_brands_strip( ?array $slugs = null, string $title = 'منصات وأدوات نعمل عليها يومياً', string $bg = 'bg-white' ): void {
	$brands = cc_brands();
	$slugs  = array_values( array_filter( $slugs ?: cc_demo( 'STACK' ), fn( $s ) => isset( $brands[ $s ] ) ) );
	if ( ! $slugs ) {
		return;
	}
	$row = '';
	foreach ( $slugs as $s ) {
		$row .= '<div class="brand-logo flex items-center gap-3 px-8 py-2" style="--brand:' . esc_attr( $brands[ $s ]['hex'] ) . '">' . cc_brand_svg( $s, 'w-9 h-9' ) . '<span class="font-bold text-lg whitespace-nowrap">' . esc_html( $brands[ $s ]['title'] ) . '</span></div>';
	}
	?>
<section id="stack" class="py-16 <?php echo esc_attr( $bg ); ?> border-y border-gray-100 overflow-hidden">
  <p class="text-center text-sm font-bold tracking-widest text-gray-400 mb-10 px-6"><?php echo esc_html( $title ); ?></p>
  <div class="marquee" aria-label="<?php echo esc_attr( $title ); ?>"><div class="marquee-track"><?php echo $row; // phpcs:ignore ?><div class="contents" aria-hidden="true"><?php echo $row; // phpcs:ignore ?></div></div></div>
</section>
	<?php
}

function cc_services_grid( string $bg = 'bg-gray-50', string $id = 'services' ): void {
	?>
<section id="<?php echo esc_attr( $id ); ?>" class="py-24 md:py-32 px-6 <?php echo esc_attr( $bg ); ?> relative"><div class="max-w-7xl mx-auto">
  <div class="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
    <div class="space-y-4 reveal-on-scroll"><?php echo cc_eyebrow( 'ما نقدمه' ); ?><h2 class="text-4xl md:text-5xl font-extrabold tracking-tight text-dark">حلول رقمية<br>تخدم هدف عملك</h2></div>
    <p class="text-gray-500 max-w-sm text-lg reveal-on-scroll">من الموقع إلى النظام إلى الإعلان — كل ما يحتاجه نشاطك ليكبر رقمياً، تحت سقف واحد.</p>
  </div>
  <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
    <?php foreach ( cc_get_services() as $n => $s ) : ?>
    <a href="<?php echo esc_url( $s['url'] ); ?>" class="group bg-white p-10 rounded-[2.5rem] shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 border border-gray-100 reveal-on-scroll block" style="transition-delay:<?php echo esc_attr( ( $n % 3 ) * 0.1 ); ?>s">
      <div class="w-16 h-16 bg-accent/10 text-accent rounded-2xl flex items-center justify-center mb-8 group-hover:bg-accent group-hover:text-white transition-colors duration-500 group-hover:rotate-12"><?php echo cc_icon( $s['icon'], 'text-3xl' ); ?></div>
      <h3 class="text-2xl font-bold mb-4"><?php echo esc_html( $s['title'] ); ?></h3><p class="text-gray-500 leading-relaxed"><?php echo esc_html( $s['text'] ); ?></p>
      <span class="inline-flex items-center text-accent font-bold mt-6">التفاصيل <?php echo cc_icon( 'lucide:arrow-left', 'mr-2 group-hover:-translate-x-2 transition-transform' ); ?></span></a>
    <?php endforeach; ?>
  </div>
</div></section>
	<?php
}

function cc_sectors_strip( string $bg = 'bg-gray-50 border-t border-gray-100' ): void {
	?>
<section id="sectors" class="py-20 px-6 <?php echo esc_attr( $bg ); ?>"><div class="max-w-7xl mx-auto">
  <div class="text-center mb-12 reveal-on-scroll"><?php echo cc_eyebrow( 'القطاعات', 'mb-4' ); ?><h2 class="text-3xl md:text-4xl font-extrabold text-dark">خبرة عملية في قطاعات مختلفة</h2></div>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
    <?php foreach ( cc_demo( 'SECTORS' ) as [ $icon, $t ] ) : ?>
    <div class="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-5 py-4 reveal-on-scroll"><?php echo cc_icon( $icon, 'text-2xl text-accent' ); ?><span class="font-bold"><?php echo esc_html( $t ); ?></span></div>
    <?php endforeach; ?>
  </div>
</div></section>
	<?php
}

function cc_process(): void {
	$steps = [ [ 'نفهم هدفك', 'نبدأ بسؤال: ما النتيجة التي تريدها؟ مبيعات، عملاء محتملون، أم تنظيم داخلي.' ], [ 'نخطط الحل', 'نحدد النطاق والمراحل والسعر والجدول الزمني بوضوح قبل البدء.' ],
		[ 'ننفذ ونختبر', 'تصميم وتطوير بقوالب مجرّبة لقطاعك، مع مراجعتك في كل مرحلة.' ], [ 'نُطلق وندرّب', 'نسلّم المشروع، وندرّبك على لوحة التحكم، ونتابع معك بعد الإطلاق.' ] ];
	$nums = [ '١', '٢', '٣', '٤' ];
	?>
<section id="process" class="py-24 md:py-32 px-6 overflow-hidden relative"><div class="max-w-7xl mx-auto">
  <div class="text-center mb-20 reveal-on-scroll"><?php echo cc_eyebrow( 'طريقة العمل', 'mb-4' ); ?><h2 class="text-4xl md:text-5xl font-extrabold tracking-tight text-dark">من الفكرة إلى النتيجة في ٤ خطوات</h2></div>
  <div class="relative px-4"><div class="step-line hidden md:block" id="process-line"></div>
  <div class="grid grid-cols-1 md:grid-cols-4 gap-12 relative z-10">
    <?php foreach ( $steps as $i => [ $t, $d ] ) : ?>
    <div class="text-center space-y-6 group reveal-on-scroll" style="transition-delay:<?php echo esc_attr( ( $i + 1 ) * 0.1 ); ?>s">
      <div class="relative inline-flex items-center justify-center w-20 h-20 bg-white rounded-full border-4 border-accent shadow-xl group-hover:bg-accent transition-colors duration-500"><span class="text-2xl font-black text-accent group-hover:text-white"><?php echo esc_html( $nums[ $i ] ); ?></span></div>
      <h3 class="text-xl font-bold"><?php echo esc_html( $t ); ?></h3><p class="text-gray-500 text-sm leading-relaxed"><?php echo esc_html( $d ); ?></p></div>
    <?php endforeach; ?>
  </div></div>
</div></section>
	<?php
}

function cc_products_section( string $bg = 'bg-white' ): void {
	?>
<section id="products" class="py-24 md:py-32 px-6 <?php echo esc_attr( $bg ); ?>"><div class="max-w-7xl mx-auto">
  <div class="text-center mb-16 reveal-on-scroll space-y-4"><?php echo cc_eyebrow( 'منتجاتنا' ); ?><h2 class="text-4xl md:text-5xl font-extrabold tracking-tight text-dark">أنظمة جاهزة لقطاعات محددة</h2>
  <p class="text-gray-500 text-lg max-w-2xl mx-auto">بنيناها من خبرة مشاريع حقيقية، وتُخصص حسب احتياج كل عميل.</p></div>
  <div class="grid md:grid-cols-2 gap-8">
    <?php foreach ( cc_demo( 'PRODUCTS' ) as $p ) : ?>
    <div class="bg-navy text-white rounded-[2.5rem] p-10 md:p-12 relative overflow-hidden reveal-on-scroll">
      <div class="blob bg-accent/30 w-64 h-64 -top-20 -left-20"></div>
      <div class="relative z-10 space-y-6">
        <div class="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center"><?php echo cc_icon( $p['icon'], 'text-3xl' ); ?></div>
        <div><h3 class="text-3xl font-extrabold" dir="ltr" style="text-align:right"><?php echo esc_html( $p['name'] ); ?></h3><span class="text-accent font-bold"><?php echo esc_html( $p['name_ar'] ); ?></span></div>
        <p class="text-gray-400 text-lg leading-relaxed"><?php echo esc_html( $p['text'] ); ?></p>
        <ul class="space-y-3 text-gray-200"><?php foreach ( $p['points'] as $x ) : ?><li class="flex items-center gap-3"><?php echo cc_icon( 'lucide:check-circle-2', 'text-accent text-xl shrink-0' ); ?><?php echo esc_html( $x ); ?></li><?php endforeach; ?></ul>
        <a href="<?php echo esc_url( cc_site( 'whatsapp' ) ); ?>" target="_blank" rel="noopener" class="inline-flex items-center gap-2 bg-white text-dark px-6 py-3 rounded-2xl font-bold hover:bg-accent hover:text-white transition-all">اطلب عرضاً تجريبياً <?php echo cc_icon( 'lucide:arrow-left' ); ?></a>
      </div></div>
    <?php endforeach; ?>
  </div>
</div></section>
	<?php
}

function cc_case_card( array $c, bool $tall = false ): void {
	?>
<article class="group relative reveal-on-scroll case-card" data-filter="<?php echo esc_attr( $c['filter'] ?? 'all' ); ?>">
  <a href="<?php echo esc_url( $c['url'] ); ?>" class="block aspect-[4/3] <?php echo $tall ? 'md:aspect-[4/5]' : ''; ?> rounded-[2.5rem] overflow-hidden bg-dark">
    <img src="<?php echo esc_url( $c['img'] ); ?>" alt="<?php echo esc_attr( $c['client'] ); ?>" loading="lazy" class="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-110 transition-all duration-700 opacity-60 group-hover:opacity-100"></a>
  <div class="mt-6 space-y-3">
    <div class="flex flex-wrap items-center gap-3"><span class="text-accent font-bold text-sm"><?php echo esc_html( $c['sector'] ); ?></span>
      <?php if ( $c['country'] ) : ?><span class="text-gray-400 text-sm flex items-center gap-1"><?php echo cc_icon( 'lucide:map-pin' ); ?><?php echo esc_html( $c['country'] ); ?></span><?php endif; ?></div>
    <h3 class="text-3xl font-bold tracking-tight text-dark"><?php echo esc_html( $c['client'] ); ?></h3>
    <p class="text-gray-500 text-lg"><?php echo esc_html( $c['summary'] ); ?></p>
    <div class="flex flex-wrap gap-2"><?php foreach ( array_slice( $c['services'], 0, 3 ) as $s ) : ?><span class="text-xs font-bold px-3 py-1 rounded-full border border-dark/20 text-dark"><?php echo esc_html( $s ); ?></span><?php endforeach; ?></div>
    <a href="<?php echo esc_url( $c['url'] ); ?>" class="inline-flex items-center text-accent font-bold group/link">عرض دراسة الحالة <?php echo cc_icon( 'lucide:arrow-left', 'mr-2 group-hover/link:-translate-x-2 transition-transform' ); ?></a>
  </div>
</article>
	<?php
}

function cc_featured_work(): void {
	$cases = cc_get_cases( 2 );
	if ( ! $cases ) {
		return;
	}
	?>
<section id="work" class="py-24 md:py-32 px-6 overflow-hidden bg-white"><div class="max-w-7xl mx-auto">
  <div class="mb-20 space-y-4 text-center reveal-on-scroll"><?php echo cc_eyebrow( 'من أعمالنا' ); ?><h2 class="text-4xl md:text-6xl font-extrabold tracking-tight text-dark">مشاريع بنتائج على أرض الواقع</h2></div>
  <div class="grid md:grid-cols-2 gap-12 md:gap-24">
    <?php cc_case_card( $cases[0], true ); ?>
    <?php if ( isset( $cases[1] ) ) : ?><div class="md:mt-32"><?php cc_case_card( $cases[1], true ); ?></div><?php endif; ?>
  </div>
  <div class="text-center mt-16"><a href="<?php echo esc_url( cc_url( 'work' ) ); ?>" class="inline-block border-2 border-dark/10 hover:border-dark px-8 py-4 rounded-2xl font-bold transition-all">كل دراسات الحالة</a></div>
</div></section>
	<?php
}

/** Testimonials carousel — hidden until real cc_testimonial posts exist. */
function cc_testimonials( bool $dark = true, string $title = 'آراء عملائنا' ): void {
	$items = cc_get_testimonials();
	if ( ! $items ) {
		return;
	}
	$btn = $dark ? 'bg-white/10 hover:bg-accent' : 'bg-white border border-gray-200 hover:bg-accent hover:text-white';
	?>
<section id="testimonials" class="py-24 md:py-32 px-6 <?php echo $dark ? 'bg-navy text-white' : 'bg-gray-50'; ?> relative overflow-hidden">
  <div class="max-w-7xl mx-auto">
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 reveal-on-scroll">
      <div class="space-y-4"><?php echo cc_eyebrow( 'قصص النجاح' ); ?><h2 class="text-4xl md:text-5xl font-extrabold tracking-tight <?php echo $dark ? '' : 'text-dark'; ?>"><?php echo esc_html( $title ); ?></h2></div>
      <div class="flex gap-3">
        <button class="cc-prev w-12 h-12 rounded-xl <?php echo esc_attr( $btn ); ?> flex items-center justify-center transition-all" aria-label="السابق"><?php echo cc_icon( 'lucide:arrow-right', 'text-xl' ); ?></button>
        <button class="cc-next w-12 h-12 rounded-xl <?php echo esc_attr( $btn ); ?> flex items-center justify-center transition-all" aria-label="التالي"><?php echo cc_icon( 'lucide:arrow-left', 'text-xl' ); ?></button>
      </div>
    </div>
    <div class="cc-carousel" data-autoplay="6000">
      <div class="cc-track flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4">
        <?php foreach ( $items as $t ) : ?>
        <div class="cc-slide snap-center shrink-0 w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]">
          <div class="h-full <?php echo $dark ? 'bg-white/5 border-white/15' : 'bg-white border-gray-200'; ?> border-2 rounded-[2.5rem] p-10 flex flex-col justify-between gap-8">
            <div class="space-y-4"><div class="flex gap-1 text-yellow-400"><?php echo str_repeat( cc_icon( 'mdi:star' ), (int) $t['rating'] ); // phpcs:ignore ?></div>
            <p class="text-lg leading-relaxed <?php echo $dark ? 'text-gray-300' : 'text-gray-600'; ?>"><?php echo esc_html( $t['text'] ); ?></p></div>
            <div class="flex items-center gap-4"><div class="w-14 h-14 rounded-full bg-accent/20 text-accent flex items-center justify-center font-black text-xl"><?php echo esc_html( mb_substr( $t['name'], 0, 1 ) ); ?></div>
            <div><p class="font-bold"><?php echo esc_html( $t['name'] ); ?></p><span class="text-accent text-sm"><?php echo esc_html( $t['role'] ); ?></span></div></div>
          </div></div>
        <?php endforeach; ?>
      </div>
      <div class="cc-dots flex justify-center gap-2 mt-8"></div>
    </div>
  </div>
</section>
	<?php
}

function cc_contact_section( string $selected = '', string $title_html = '', string $text = '' ): void {
	$site  = cc_site();
	$title = $title_html ?: 'جاهز تبدأ <span class="text-accent">مشروعك؟</span>';
	$text  = $text ?: 'احكِ لنا عن نشاطك وهدفك، وسنتواصل معك لنقترح الحل والباقة المناسبة.';
	$inp   = 'w-full px-6 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-accent focus:bg-white transition-all outline-none';
	$lab   = 'text-xs font-bold uppercase tracking-widest text-gray-400';
	$fluent = cc_fluent_embed( 'fluent_contact_form_id', 'contact' );
	?>
<section id="contact" class="py-24 md:py-32 px-6 bg-accent relative overflow-hidden"><div class="absolute top-0 left-0 w-1/2 h-full bg-white/5 -skew-x-12 -translate-x-32"></div>
<div class="max-w-7xl mx-auto relative z-10"><div class="bg-white rounded-[3rem] shadow-2xl overflow-hidden grid lg:grid-cols-2 reveal-on-scroll">
  <div class="p-8 md:p-16 space-y-8">
    <h2 class="text-4xl md:text-5xl font-extrabold tracking-tight text-dark"><?php echo cc_kses( $title ); ?></h2>
    <p class="text-gray-500 text-lg"><?php echo esc_html( $text ); ?></p>
    <?php if ( $fluent ) : echo $fluent; // phpcs:ignore
	else : ?>
    <form action="<?php echo esc_url( cc_lead_action_url() ); ?>" method="post" class="space-y-6 cc-lead-form" data-form="contact"><?php echo cc_lead_hidden_fields( $selected, 'contact' ); // phpcs:ignore ?>
      <div class="grid sm:grid-cols-2 gap-6">
        <div class="space-y-2"><label class="<?php echo esc_attr( $lab ); ?>" for="f-name">الاسم</label><input id="f-name" name="name" required type="text" autocomplete="name" class="<?php echo esc_attr( $inp ); ?>"></div>
        <div class="space-y-2"><label class="<?php echo esc_attr( $lab ); ?>" for="f-phone">رقم الجوال / واتساب</label><input id="f-phone" name="phone" required type="tel" dir="ltr" autocomplete="tel" class="<?php echo esc_attr( $inp ); ?> text-right"></div>
      </div>
      <div class="grid sm:grid-cols-2 gap-6">
        <div class="space-y-2"><label class="<?php echo esc_attr( $lab ); ?>" for="f-service">الخدمة المطلوبة</label><select id="f-service" name="service" class="<?php echo esc_attr( $inp ); ?>">
          <?php foreach ( cc_get_services() as $s ) : ?><option<?php selected( $s['id'], $selected ); ?>><?php echo esc_html( $s['title'] ); ?></option><?php endforeach; ?>
          <option>Creative Travel</option><option>Goldshop System</option><option>أخرى</option></select></div>
        <div class="space-y-2"><label class="<?php echo esc_attr( $lab ); ?>" for="f-country">الدولة</label><select id="f-country" name="country" class="<?php echo esc_attr( $inp ); ?>"><option>مصر</option><option>السعودية</option><option>الإمارات</option><option>المملكة المتحدة</option><option>أخرى</option></select></div>
      </div>
      <div class="space-y-2"><label class="<?php echo esc_attr( $lab ); ?>" for="f-msg">تفاصيل المشروع</label><textarea id="f-msg" name="message" rows="4" placeholder="ما نشاطك؟ وما الهدف الذي تريد تحقيقه؟" class="<?php echo esc_attr( $inp ); ?> resize-none"></textarea></div>
      <button type="submit" class="w-full bg-accent text-white py-5 rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-accent/40 transition-all active:scale-95 ripple">إرسال الطلب</button>
      <?php cc_consent_note(); ?>
    </form>
    <?php endif; ?>
  </div>
  <div class="bg-dark p-8 md:p-16 text-white flex flex-col justify-between gap-12">
    <div class="space-y-12">
      <div><h3 class="text-xl font-bold mb-6">تواصل مباشر</h3><div class="space-y-5">
        <a href="<?php echo esc_url( $site['whatsapp'] ); ?>" target="_blank" rel="noopener" class="flex items-center gap-4"><div class="w-12 h-12 rounded-xl bg-[#25D366]/20 text-[#25D366] flex items-center justify-center"><?php echo cc_icon( 'mdi:whatsapp', 'text-2xl' ); ?></div><div><div class="text-sm text-gray-500">واتساب (الأسرع)</div><div class="font-bold" dir="ltr"><?php echo esc_html( $site['phone_display'] ); ?></div></div></a>
        <a href="mailto:<?php echo esc_attr( $site['email'] ); ?>" class="flex items-center gap-4"><div class="w-12 h-12 rounded-xl bg-accent/20 text-accent flex items-center justify-center"><?php echo cc_icon( 'lucide:mail', 'text-2xl' ); ?></div><div><div class="text-sm text-gray-500">البريد الإلكتروني</div><div class="font-bold"><?php echo esc_html( $site['email'] ); ?></div></div></a>
        <a href="tel:<?php echo esc_attr( $site['phone_tel'] ); ?>" class="flex items-center gap-4"><div class="w-12 h-12 rounded-xl bg-accent/20 text-accent flex items-center justify-center"><?php echo cc_icon( 'lucide:phone', 'text-2xl' ); ?></div><div><div class="text-sm text-gray-500">اتصل بنا</div><div class="font-bold" dir="ltr"><?php echo esc_html( $site['phone_display'] ); ?></div></div></a>
      </div></div>
      <div><h3 class="text-xl font-bold mb-6">تابعنا</h3><div class="flex gap-3"><?php cc_social_icons( 'w-12 h-12 rounded-xl bg-white/5 hover:bg-accent flex items-center justify-center transition-all text-xl' ); ?></div></div>
    </div>
    <div class="pt-10 border-t border-white/10"><?php cc_logo( 'h-12 w-auto mb-4' ); ?><p class="text-sm text-gray-500"><?php echo esc_html( $site['city'] ); ?> — نخدم <?php echo esc_html( $site['markets'] ); ?></p></div>
  </div>
</div></div></section>
	<?php
}

function cc_consent_note(): void {
	echo '<p class="text-xs text-gray-400 text-center">بإرسال النموذج توافق على <a href="' . esc_url( cc_url( 'privacy-policy' ) ) . '" class="underline hover:text-accent">سياسة الخصوصية</a>. لا نرسل رسائل مزعجة.</p>';
}

/* ----------------------------------------------------------------- pricing */

function cc_country_switch(): string {
	return '<div class="flex flex-col items-center gap-3 mt-10">'
		. '<div class="inline-flex bg-gray-100 p-1.5 rounded-2xl" role="tablist" aria-label="اختر الدولة">'
		. '<button class="country-btn px-6 py-2.5 rounded-xl font-bold transition-all" data-country="EG">🇪🇬 مصر</button>'
		. '<button class="country-btn px-6 py-2.5 rounded-xl font-bold transition-all" data-country="SA">🇸🇦 السعودية</button></div>'
		. '<p class="text-sm text-gray-400">تظهر الأسعار تلقائياً حسب دولتك، ويمكنك التبديل يدوياً.</p></div>';
}

function cc_price_card( array $p, string $group, string $cta_href ): void {
	$hi = ! empty( $p['featured'] );
	?>
<div class="relative <?php echo $hi ? 'bg-dark text-white lg:-translate-y-4 shadow-2xl shadow-accent/20' : 'bg-white border border-gray-100'; ?> rounded-[2.5rem] p-10 flex flex-col reveal-on-scroll">
  <?php if ( $hi ) : ?><div class="absolute -top-4 right-1/2 translate-x-1/2 bg-accent text-white text-xs font-bold px-4 py-1.5 rounded-full"><?php echo esc_html( $p['badge'] ?? 'الأكثر طلباً' ); ?></div><?php endif; ?>
  <div class="space-y-2 mb-6"><h3 class="text-2xl font-black tracking-wide" dir="ltr" style="text-align:right"><?php echo esc_html( $p['name'] ); ?></h3><?php if ( ! empty( $p['name_ar'] ) ) : ?><span class="text-accent font-bold"><?php echo esc_html( $p['name_ar'] ); ?></span><?php endif; ?></div>
  <p class="<?php echo $hi ? 'text-gray-400' : 'text-gray-500'; ?> mb-8"><?php echo esc_html( $p['desc'] ); ?></p>
  <div class="mb-8"><span class="price-from text-xs text-gray-400 block mb-1">يبدأ من</span>
    <div class="flex items-baseline gap-2"><span class="text-4xl md:text-5xl font-black" data-price="<?php echo esc_attr( $group . '.' . $p['key'] ); ?>">—</span><span class="font-bold <?php echo $hi ? 'text-gray-400' : 'text-gray-500'; ?>" data-currency>ج.م</span><?php if ( $group === 'social' ) : ?><span class="price-per text-gray-400 text-sm">/ شهرياً</span><?php endif; ?></div></div>
  <ul class="space-y-4 mb-10 flex-1 <?php echo $hi ? 'text-gray-200' : 'text-gray-600'; ?>">
    <?php foreach ( $p['features'] as $f ) : ?><li class="flex items-start gap-3"><?php echo cc_icon( 'lucide:check', 'text-accent text-xl shrink-0 mt-0.5' ); ?><span><?php echo esc_html( $f ); ?></span></li><?php endforeach; ?>
  </ul>
  <a href="<?php echo esc_url( ! empty( $p['cta_url'] ) ? $p['cta_url'] : $cta_href ); ?>" class="block text-center py-4 rounded-2xl font-bold transition-all ripple <?php echo $hi ? 'bg-accent text-white hover:shadow-xl hover:shadow-accent/40' : 'bg-gray-50 hover:bg-accent hover:text-white'; ?>"><?php echo esc_html( $p['cta_text'] ?? 'اطلب الباقة' ); ?></a>
</div>
	<?php
}

function cc_pricing_block( string $group, string $title, string $text, string $sid, string $cta_href = '', bool $switch_inside = false ): void {
	$packages = cc_get_packages( $group );
	if ( ! $packages ) {
		return;
	}
	$cta_href = $cta_href ?: cc_url( 'contact' );
	?>
<section id="<?php echo esc_attr( $sid ); ?>" class="py-20 px-6"><div class="max-w-7xl mx-auto">
  <div class="text-center mb-16 space-y-4 reveal-on-scroll"><h2 class="text-3xl md:text-5xl font-extrabold tracking-tight text-dark"><?php echo esc_html( $title ); ?></h2><p class="text-gray-500 text-lg max-w-2xl mx-auto"><?php echo esc_html( $text ); ?></p></div>
  <?php if ( $switch_inside ) { echo cc_country_switch(); } // phpcs:ignore ?>
  <div class="<?php echo $switch_inside ? 'mt-12 ' : ''; ?>grid lg:grid-cols-3 gap-8 items-stretch">
    <?php foreach ( $packages as $p ) { cc_price_card( $p, $group, $cta_href ); } ?>
  </div>
</div></section>
	<?php
}

function cc_payment_terms(): void {
	$items = [ [ 'lucide:wallet', '٥٠٪ مقدماً', 'عند بدء المشروع' ], [ 'lucide:package-check', '٥٠٪ عند التسليم', 'بعد مراجعتك واعتمادك' ], [ 'lucide:graduation-cap', 'تدريب', 'على لوحة التحكم قبل التسليم' ], [ 'lucide:life-buoy', 'دعم فني', 'بعد التسليم في كل الباقات' ] ];
	?>
<section class="px-6 py-12"><div class="max-w-7xl mx-auto bg-gray-50 border border-gray-100 rounded-[2.5rem] p-8 md:p-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
  <?php foreach ( $items as [ $i, $t, $d ] ) : ?>
  <div class="flex items-center gap-4 reveal-on-scroll"><div class="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center shrink-0"><?php echo cc_icon( $i, 'text-2xl' ); ?></div><div><div class="font-bold text-lg"><?php echo esc_html( $t ); ?></div><div class="text-gray-500 text-sm"><?php echo esc_html( $d ); ?></div></div></div>
  <?php endforeach; ?>
</div></section>
	<?php
}

/* -------------------------------------------------------------------- blog */

function cc_post_card( int $post_id, bool $big = false ): void {
	$img = get_the_post_thumbnail_url( $post_id, 'large' );
	$cat = get_the_category( $post_id );
	$url = get_permalink( $post_id );
	$ttl = get_the_title( $post_id );
	$exc = has_excerpt( $post_id ) ? get_the_excerpt( $post_id ) : wp_trim_words( wp_strip_all_tags( strip_shortcodes( get_post_field( 'post_content', $post_id ) ) ), 24, '…' );
	?>
<article class="group bg-white rounded-[2rem] overflow-hidden border border-gray-100 hover:shadow-2xl transition-all duration-500 reveal-on-scroll <?php echo $big ? 'md:col-span-2 grid md:grid-cols-2' : ''; ?>">
  <a href="<?php echo esc_url( $url ); ?>" class="block <?php echo $big ? 'aspect-[4/3] md:aspect-auto md:h-full' : 'aspect-[16/10]'; ?> overflow-hidden bg-navy">
    <?php if ( $img ) : ?><img src="<?php echo esc_url( $img ); ?>" alt="<?php echo esc_attr( $ttl ); ?>" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"><?php endif; ?></a>
  <div class="p-8 space-y-4 <?php echo $big ? 'md:p-12 flex flex-col justify-center' : ''; ?>"><?php if ( $cat ) : ?><span class="text-accent font-bold text-sm"><?php echo esc_html( $cat[0]->name ); ?></span><?php endif; ?>
  <h3 class="<?php echo $big ? 'text-3xl' : 'text-xl'; ?> font-bold leading-snug"><a href="<?php echo esc_url( $url ); ?>" class="hover:text-accent"><?php echo esc_html( $ttl ); ?></a></h3>
  <p class="text-gray-500"><?php echo esc_html( $exc ); ?></p>
  <div class="flex items-center gap-3 text-sm text-gray-400 pt-2"><span class="font-bold text-dark"><?php echo esc_html( get_the_author_meta( 'display_name', (int) get_post_field( 'post_author', $post_id ) ) ); ?></span><span>•</span><span><?php echo esc_html( cc_ar_date( get_post_field( 'post_date', $post_id ) ) ); ?></span><span>•</span><span><?php echo esc_html( cc_minutes_label( cc_reading_time( $post_id ) ) ); ?></span></div></div>
</article>
	<?php
}

function cc_latest_posts( int $n = 3 ): void {
	$q = new WP_Query( [ 'post_type' => 'post', 'posts_per_page' => $n, 'ignore_sticky_posts' => true, 'no_found_rows' => true ] );
	if ( ! $q->have_posts() ) {
		return;
	}
	?>
<section id="latest-posts" class="py-24 md:py-32 px-6 bg-white"><div class="max-w-7xl mx-auto">
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 reveal-on-scroll">
    <div class="space-y-4"><?php echo cc_eyebrow( 'من المدونة' ); ?><h2 class="text-4xl md:text-5xl font-extrabold tracking-tight text-dark">أحدث المقالات</h2></div>
    <a href="<?php echo esc_url( cc_url( 'blog' ) ); ?>" class="inline-flex items-center gap-2 font-bold text-accent">كل المقالات <?php echo cc_icon( 'lucide:arrow-left' ); ?></a>
  </div>
  <div class="grid md:grid-cols-3 gap-8"><?php while ( $q->have_posts() ) { $q->the_post(); cc_post_card( get_the_ID() ); } wp_reset_postdata(); ?></div>
</div></section>
	<?php
}
