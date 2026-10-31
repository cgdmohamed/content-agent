<?php
/**
 * Extra meta boxes for the Demo design: service landing-page content and package extras.
 * Every field is optional — empty fields fall back to the demo copy matching the service slug.
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'add_meta_boxes', function () {
	add_meta_box( 'cc_service_lp', 'صفحة الهبوط (Google Ads)', 'cc_mb_service_lp', 'cc_service', 'normal', 'default' );
	add_meta_box( 'cc_project_demo', 'تفاصيل إضافية', 'cc_mb_project_demo', 'cc_project', 'side', 'default' );
	add_meta_box( 'cc_package_demo', 'إعدادات صفحة الأسعار', 'cc_mb_package_demo', 'cc_package', 'side', 'default' );
} );

function cc_mb_service_lp( WP_Post $post ): void {
	wp_nonce_field( 'cc_service_lp', 'cc_service_lp_nonce' );
	$v = fn( string $k ) => get_post_meta( $post->ID, $k, true );

	echo '<p class="description">اترك أي حقل فارغاً ليُستخدم النص الافتراضي لخدمة بنفس الرابط المختصر (web-design، ecommerce-store، elearning-booking، odoo-erp، whatsapp-business-api، digital-marketing).</p>';
	echo '<table class="form-table">';
	cc_mb_row( 'وضع صفحة الهبوط دائماً', '<label><input type="checkbox" name="lp_mode" value="1"' . checked( $v( 'lp_mode' ), '1', false ) . ' /> إخفاء القائمة والتذييل وإظهار رقم الهاتف (يمكن أيضاً إضافة <code>?lp=1</code> للرابط في إعلانات Google)</label>' );
	cc_mb_row( 'اسم مختصر في القوائم', '<input type="text" name="lp_nav" value="' . esc_attr( $v( 'lp_nav' ) ) . '" size="40" placeholder="تصميم المواقع" />' );
	cc_mb_row( 'أيقونة (lucide)', '<input type="text" name="lp_icon" value="' . esc_attr( $v( 'lp_icon' ) ) . '" size="40" placeholder="lucide:layout-template" />' );
	cc_mb_row( 'العنوان الرئيسي H1', '<input type="text" name="lp_h1" value="' . esc_attr( $v( 'lp_h1' ) ) . '" size="50" placeholder="تصميم مواقع إلكترونية" />' );
	cc_mb_row( 'تكملة العنوان (لون مميز)', '<input type="text" name="lp_h1_accent" value="' . esc_attr( $v( 'lp_h1_accent' ) ) . '" size="50" placeholder="تجيب لك عملاء" />' );
	cc_mb_row( 'الفقرة التعريفية', '<textarea name="lp_lead" rows="3" cols="60">' . esc_textarea( $v( 'lp_lead' ) ) . '</textarea>' );
	cc_mb_row( 'شارات أعلى العنوان (سطر لكل شارة)', '<textarea name="lp_badges" rows="3" cols="60">' . esc_textarea( $v( 'lp_badges' ) ) . '</textarea>' );
	cc_mb_row( 'المشكلات (سطر لكل نقطة)', '<textarea name="lp_problems" rows="4" cols="60">' . esc_textarea( $v( 'lp_problems' ) ) . '</textarea>' );
	cc_mb_row( 'الحلول (سطر لكل نقطة)', '<textarea name="lp_solutions" rows="4" cols="60">' . esc_textarea( $v( 'lp_solutions' ) ) . '</textarea>' );
	cc_mb_row( 'المزايا (سطر: أيقونة|العنوان|الوصف)', '<textarea name="lp_features" rows="6" cols="60" placeholder="lucide:search|تهيئة SEO|عناوين ووصف وهيكل جاهز لجوجل.">' . esc_textarea( $v( 'lp_features' ) ) . '</textarea><p class="description">الأيقونة اسم من lucide أو اسم براند مثل whatsapp.</p>' );
	cc_mb_row( 'الأدوات (سطر: slug أو slug|الاسم)', '<textarea name="lp_tools" rows="4" cols="60" placeholder="wordpress&#10;whatsapp|WhatsApp Cloud API">' . esc_textarea( $v( 'lp_tools' ) ) . '</textarea>' );

	$sel = '<select name="lp_pricing">';
	foreach ( [ '' => 'افتراضي', 'web' => 'باقات المواقع', 'social' => 'باقات السوشيال', 'quote' => 'السعر حسب الطلب' ] as $k => $l ) {
		$sel .= '<option value="' . esc_attr( $k ) . '"' . selected( $v( 'lp_pricing' ), $k, false ) . '>' . esc_html( $l ) . '</option>';
	}
	cc_mb_row( 'قسم الأسعار', $sel . '</select>' );
	cc_mb_row( 'دراسة حالة مرتبطة (الرابط المختصر)', '<input type="text" name="lp_case" value="' . esc_attr( $v( 'lp_case' ) ) . '" size="30" placeholder="nabatica" />' );
	cc_mb_row( 'عنوان SEO', '<input type="text" name="lp_seo_title" value="' . esc_attr( $v( 'lp_seo_title' ) ) . '" size="60" />' );
	cc_mb_row( 'وصف SEO', '<textarea name="lp_seo_desc" rows="2" cols="60">' . esc_textarea( $v( 'lp_seo_desc' ) ) . '</textarea>' );
	echo '</table><p class="description">الأسئلة الشائعة تُدار من صندوق «الأسئلة الشائعة» أسفل الصفحة.</p>';
}

function cc_mb_project_demo( WP_Post $post ): void {
	wp_nonce_field( 'cc_project_demo', 'cc_project_demo_nonce' );
	echo '<p><label>القطاع (يظهر فوق العنوان)<br><input type="text" name="project_sector" value="' . esc_attr( get_post_meta( $post->ID, 'project_sector', true ) ) . '" style="width:100%" placeholder="هندسة وتصنيع" /></label></p>';
	echo '<p class="description">ملخص النتائج: اكتب كل مؤشر في سطر بصيغة «الوصف|الرقم» لتظهر كبطاقات أرقام.</p>';
}

function cc_mb_package_demo( WP_Post $post ): void {
	wp_nonce_field( 'cc_package_demo', 'cc_package_demo_nonce' );
	$v   = fn( string $k ) => get_post_meta( $post->ID, $k, true );
	$grp = $v( 'pkg_group' ) ?: 'web';
	echo '<p><label>المجموعة<br><select name="pkg_group" style="width:100%"><option value="web"' . selected( $grp, 'web', false ) . '>باقات المواقع</option><option value="social"' . selected( $grp, 'social', false ) . '>باقات السوشيال (شهرية)</option></select></label></p>';
	echo '<p><label>الاسم بالعربية<br><input type="text" name="pkg_name_ar" value="' . esc_attr( $v( 'pkg_name_ar' ) ) . '" style="width:100%" /></label></p>';
	echo '<p><label>السعر في السعودية (ر.س، أرقام)<br><input type="text" name="pkg_price_sa" value="' . esc_attr( $v( 'pkg_price_sa' ) ) . '" style="width:100%" /></label></p>';
	echo '<p class="description">سعر مصر هو حقل «السعر» في تفاصيل الباقة (أرقام فقط تُستخدم). فارغ = «السعر عند الطلب».</p>';
}

add_action( 'save_post', function ( int $post_id ): void {
	if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}
	if ( isset( $_POST['cc_service_lp_nonce'] ) && wp_verify_nonce( $_POST['cc_service_lp_nonce'], 'cc_service_lp' ) ) {
		update_post_meta( $post_id, 'lp_mode', isset( $_POST['lp_mode'] ) ? '1' : '0' );
		foreach ( [ 'lp_nav', 'lp_icon', 'lp_h1', 'lp_h1_accent', 'lp_pricing', 'lp_case', 'lp_seo_title' ] as $k ) {
			if ( isset( $_POST[ $k ] ) ) update_post_meta( $post_id, $k, sanitize_text_field( wp_unslash( $_POST[ $k ] ) ) );
		}
		foreach ( [ 'lp_lead', 'lp_badges', 'lp_problems', 'lp_solutions', 'lp_features', 'lp_tools', 'lp_seo_desc' ] as $k ) {
			if ( isset( $_POST[ $k ] ) ) update_post_meta( $post_id, $k, sanitize_textarea_field( wp_unslash( $_POST[ $k ] ) ) );
		}
	}
	if ( isset( $_POST['cc_project_demo_nonce'] ) && wp_verify_nonce( $_POST['cc_project_demo_nonce'], 'cc_project_demo' ) && isset( $_POST['project_sector'] ) ) {
		update_post_meta( $post_id, 'project_sector', sanitize_text_field( wp_unslash( $_POST['project_sector'] ) ) );
	}
	if ( isset( $_POST['cc_package_demo_nonce'] ) && wp_verify_nonce( $_POST['cc_package_demo_nonce'], 'cc_package_demo' ) ) {
		foreach ( [ 'pkg_group', 'pkg_name_ar', 'pkg_price_sa' ] as $k ) {
			if ( isset( $_POST[ $k ] ) ) update_post_meta( $post_id, $k, sanitize_text_field( wp_unslash( $_POST[ $k ] ) ) );
		}
	}
} );
