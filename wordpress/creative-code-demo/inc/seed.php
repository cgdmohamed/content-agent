<?php
/**
 * Demo content seeder (Appearance → إعدادات القالب → المحتوى التجريبي, or `wp eval 'cc_seed_demo();'`).
 * Creates only what does not already exist (matched by slug); never edits or deletes anything.
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'admin_post_cc_seed_demo', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'غير مسموح', '', [ 'response' => 403 ] );
	}
	check_admin_referer( 'cc_seed_demo' );
	$n = cc_seed_demo();
	wp_safe_redirect( admin_url( 'themes.php?page=cc-theme-settings&tab=demo&seeded=' . $n ) );
	exit;
} );

function cc_seed_insert( string $type, string $slug, array $args ): int {
	$existing = get_posts( [ 'post_type' => $type, 'name' => $slug, 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids' ] );
	if ( $existing ) {
		return 0;
	}
	$id = wp_insert_post( wp_slash( $args + [ 'post_type' => $type, 'post_name' => $slug, 'post_status' => 'publish' ] ), true );
	return is_wp_error( $id ) ? 0 : (int) $id;
}

function cc_seed_demo(): int {
	$n    = 0;
	$data = cc_demo();

	/* ---- pages */
	$privacy = [
		[ 'البيانات التي نجمعها', 'الاسم ورقم الجوال والبريد الإلكتروني والدولة وتفاصيل المشروع التي ترسلها عبر النماذج أو واتساب، إضافة إلى بيانات استخدام الموقع ومصدر الزيارة (مثل الحملة الإعلانية التي وصلت منها).' ],
		[ 'كيف نستخدمها', 'للتواصل معك بخصوص طلبك، وإرسال عروض الأسعار، وتحسين خدماتنا وقياس أداء حملاتنا الإعلانية.' ],
		[ 'ملفات تعريف الارتباط وأدوات القياس', 'نستخدم أدوات مثل Google Analytics وGoogle Ads وMeta Pixel لقياس الزيارات والتحويلات. يمكنك التحكم في ملفات تعريف الارتباط من إعدادات متصفحك.' ],
		[ 'مشاركة البيانات', 'لا نبيع بياناتك. قد نستخدم مزودي خدمات (استضافة، بريد، أدوات قياس) لتشغيل الموقع، وفقط بالقدر اللازم.' ],
		[ 'الاحتفاظ بالبيانات', 'نحتفظ ببياناتك طوال فترة التعامل وبالقدر الذي يتطلبه القانون، ثم نحذفها.' ],
		[ 'حقوقك', 'يمكنك طلب الاطلاع على بياناتك أو تعديلها أو حذفها في أي وقت بالتواصل على ' . cc_site( 'email' ) . '.' ],
		[ 'التواصل', cc_site( 'brand' ) . ' — ' . cc_site( 'city' ) . ' — ' . cc_site( 'email' ) . ' — ' . cc_site( 'phone_display' ) ],
	];
	$privacy_html = '';
	foreach ( $privacy as [ $t, $d ] ) {
		$privacy_html .= '<h2>' . esc_html( $t ) . '</h2><p>' . esc_html( $d ) . '</p>';
	}
	$privacy_html .= '<p>آخر تحديث: ' . esc_html( cc_ar_date() ) . '. (نص مبدئي — يُراجع قانونياً قبل النشر.)</p>';

	$pages = [
		'home' => [ 'الرئيسية', '' ], 'about' => [ 'من نحن', '' ], 'pricing' => [ 'الأسعار', '' ], 'faq' => [ 'الأسئلة الشائعة', '' ], 'contact' => [ 'تواصل معنا', '' ],
		'thank-you' => [ 'شكراً لتواصلك', '' ], 'privacy-policy' => [ 'سياسة الخصوصية', $privacy_html ], 'blog' => [ 'المدونة', '' ],
	];
	$page_ids = [];
	foreach ( $pages as $slug => [ $title, $content ] ) {
		$id = cc_seed_insert( 'page', $slug, [ 'post_title' => $title, 'post_content' => $content ] );
		// WordPress ships an unpublished boilerplate privacy page on this slug; replace only that untouched draft.
		if ( ! $id && $slug === 'privacy-policy' ) {
			$wp_default = get_post( (int) get_option( 'wp_page_for_privacy_policy' ) );
			if ( $wp_default && $wp_default->post_status === 'draft' && $wp_default->post_name === 'privacy-policy' ) {
				$id = (int) wp_update_post( wp_slash( [ 'ID' => $wp_default->ID, 'post_title' => $title, 'post_content' => $content, 'post_status' => 'publish' ] ) );
			}
		}
		$n += $id ? 1 : 0;
		$page_ids[ $slug ] = $id ?: ( get_page_by_path( $slug )->ID ?? 0 );
	}
	if ( get_option( 'show_on_front' ) !== 'page' && $page_ids['home'] && $page_ids['blog'] ) {
		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', $page_ids['home'] );
		update_option( 'page_for_posts', $page_ids['blog'] );
	}

	/* ---- services */
	foreach ( $data['SERVICE_PAGES'] as $i => $sp ) {
		$card = cc_demo_service_card( $sp['id'] );
		$id   = cc_seed_insert( 'cc_service', $sp['slug'], [ 'post_title' => $card['title'] ?? $sp['nav'], 'post_excerpt' => $card['text'] ?? '', 'menu_order' => $i ] );
		$n   += $id ? 1 : 0;
	}

	/* ---- case studies */
	$cats = [ 'industry' => 'الصناعة', 'marketing' => 'التسويق', 'seo' => 'SEO' ];
	foreach ( $cats as $slug => $name ) {
		if ( ! term_exists( $slug, 'project_category' ) ) {
			wp_insert_term( $name, 'project_category', [ 'slug' => $slug ] );
		}
	}
	foreach ( $data['CASES'] as $i => $c ) {
		$body = '<h2>التحدي</h2><p>' . esc_html( $c['summary'] ) . '</p><h2>ما قمنا به</h2><ul>';
		foreach ( $c['services'] as $s ) {
			$body .= '<li>' . esc_html( $s ) . '</li>';
		}
		$body .= '</ul>';
		if ( $c['slug'] === 'kaisab' ) {
			$body = '<h2>التحدي</h2><p>شركة هندسة وتصنيع تعمل في معدات الرفع والوصول الإنشائية، وفتحات المباني، ومجاري النفايات، ووحدات صيانة الواجهات (BMU)، والتشكيل المعدني — لمشاريع في السعودية والإمارات.</p><p>الجمهور ليس عاماً: مقاولون واستشاريون ومطورون ومديرو مرافق، يحتاجون محتوى بنبرة هندسية موثوقة بعيداً عن المبالغة.</p>'
				. '<h2>ما قمنا به</h2><ul><li>استراتيجية محتوى إنجليزية موجهة لصناع القرار في قطاع البناء</li><li>تصميمات سوشيال ميديا بهوية العميل ونبرة هندسية موثوقة</li><li>إدارة الحملات الإعلانية على المنصات المناسبة لجمهور B2B</li><li>توجيه كل المحتوى والإعلانات إلى الموقع kaisab.com</li></ul>';
		}
		$id = cc_seed_insert( 'cc_project', $c['slug'], [ 'post_title' => $c['client'], 'post_excerpt' => $c['summary'], 'post_content' => $body, 'menu_order' => $i ] );
		if ( $id ) {
			$n++;
			update_post_meta( $id, 'project_client', $c['client'] );
			update_post_meta( $id, 'project_country', $c['country'] );
			update_post_meta( $id, 'project_sector', $c['sector'] );
			wp_set_object_terms( $id, [ $c['filter'] ], 'project_category' );
			wp_set_object_terms( $id, $c['services'], 'project_tag' );
			cc_seed_thumbnail( $id, basename( $c['img'] ) );
		}
	}

	/* ---- packages */
	foreach ( [ 'web' => $data['WEB_PACKAGES'], 'social' => $data['SOCIAL_PACKAGES'] ] as $group => $pkgs ) {
		foreach ( $pkgs as $i => $p ) {
			$id = cc_seed_insert( 'cc_package', ( $group === 'social' ? 'social-' : '' ) . $p['key'], [ 'post_title' => $p['name'], 'post_excerpt' => $p['desc'], 'menu_order' => $i + ( $group === 'social' ? 10 : 0 ) ] );
			if ( $id ) {
				$n++;
				update_post_meta( $id, 'pkg_group', $group );
				update_post_meta( $id, 'pkg_name_ar', $p['name_ar'] ?? '' );
				update_post_meta( $id, 'package_features', implode( "\n", $p['features'] ) );
				update_post_meta( $id, 'package_highlighted', $p['featured'] ? '1' : '0' );
			}
		}
	}

	/* ---- sample articles */
	foreach ( $data['POSTS'] as $p ) {
		$cat  = get_term_by( 'name', $p['cat'], 'category' );
		$cid  = $cat ? $cat->term_id : (int) ( wp_insert_term( $p['cat'], 'category' )['term_id'] ?? 0 );
		$body = '<p>' . esc_html( $p['desc'] ) . '</p>';
		if ( $p['slug'] === 'factory-digital-presence' ) {
			$body = '<p>كثير من المصانع في مصر والخليج حجمها الفعلي أكبر بكثير من صورتها على الإنترنت: موقع قديم، أو صفحة فيسبوك غير محدثة، أو غياب كامل عن نتائج البحث. والنتيجة أن المشتري أو المقاول يكوّن انطباعه الأول قبل أن يتواصل معك أصلاً.</p>'
				. '<h2>لماذا يخسر المصنع صفقات أونلاين؟</h2><ul><li>موقع لا يعرض خطوط الإنتاج والشهادات والطاقة الإنتاجية بوضوح.</li><li>لا توجد صفحات منتجات أو كتالوج يمكن مشاركته بسهولة.</li><li>تجارب سابقة مع شركات تسويق أو برمجة لم تفهم طبيعة القطاع.</li></ul>'
				. '<h2>ماذا يحتاج المصنع رقمياً؟</h2><p>موقع احترافي بلغة القطاع، وكتالوج منتجات محدث، وبروفايل شركة، وتصوير منتجات حقيقي، ثم حملات تستهدف أصحاب القرار — لا جمهوراً عاماً.</p>'
				. '<h2>من أين تبدأ؟</h2><p>ابدأ بالأساس: صفحة رئيسية واضحة، وصفحات للمنتجات والخدمات، ونموذج تواصل وواتساب. بعدها يأتي المحتوى والإعلانات لتوجيه الزوار المناسبين.</p>'
				. '<h2>الخلاصة</h2><p>الحضور الرقمي ليس رفاهية للمصانع؛ هو أول مقابلة مع عميلك القادم. اجعلها تعكس حجمك الحقيقي.</p>';
		}
		$id = cc_seed_insert( 'post', $p['slug'], [ 'post_title' => $p['title'], 'post_excerpt' => $p['excerpt'], 'post_content' => $body, 'post_date' => $p['iso'] . ' 09:00:00', 'post_category' => $cid ? [ $cid ] : [] ] );
		if ( $id ) {
			$n++;
			cc_seed_thumbnail( $id, basename( $p['img'] ) );
		}
	}

	flush_rewrite_rules();
	return $n;
}

/** Sideload a bundled stock photo as the featured image. */
function cc_seed_thumbnail( int $post_id, string $file ): void {
	$src = CC_DIR . '/assets/img/stock/' . $file;
	if ( ! file_exists( $src ) ) {
		return;
	}
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/media.php';
	require_once ABSPATH . 'wp-admin/includes/image.php';
	$tmp = wp_tempnam( $file );
	copy( $src, $tmp );
	$att = media_handle_sideload( [ 'name' => $file, 'tmp_name' => $tmp ], $post_id );
	if ( ! is_wp_error( $att ) ) {
		set_post_thumbnail( $post_id, $att );
	} else {
		@unlink( $tmp );
	}
}
