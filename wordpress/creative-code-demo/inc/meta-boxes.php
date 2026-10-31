<?php
/**
 * Meta Boxes — Creative Code 2026
 *
 * Preserves ALL existing meta keys from creativecode-core plugin:
 *   service_icon, service_price, service_features
 *   project_client, project_url, project_date, project_technologies
 *   member_position, member_linkedin, member_twitter, member_facebook, member_instagram
 *   client_name, client_position, client_company, rating
 *   job_location, job_salary, job_requirements, job_benefits, job_skills,
 *   job_application_deadline, job_experience_level, job_remote_allowed, job_contact_email
 *
 * NEW meta keys (2026):
 *   service_starting_price, service_delivery_days, service_cta_url
 *   package_icon, package_price, package_old_price, package_price_note, package_badge,
 *   package_highlighted, package_delivery_days, package_features, package_includes,
 *   package_outcomes, package_ideal_for, package_cta_text, package_cta_url
 *   project_country, project_result_summary, project_bento_span
 *   insight_read_time, insight_featured, insight_series
 *
 * @package CreativeCode2026
 */

if ( ! defined( 'ABSPATH' ) ) exit;

add_action( 'add_meta_boxes', 'cc_register_meta_boxes' );
add_action( 'save_post',      'cc_save_all_meta', 10, 2 );

add_action( 'admin_enqueue_scripts', function ( string $hook ): void {
    if ( in_array( $hook, [ 'post.php', 'post-new.php' ], true ) ) {
        wp_enqueue_media();
    }
} );

/* ============================================================
   REGISTER META BOXES
   ============================================================ */

function cc_register_meta_boxes() {

    foreach ( [ 'page', 'post', 'cc_service', 'cc_package', 'cc_project', 'cc_job' ] as $screen ) {
        add_meta_box( 'cc_faq_repeater', 'الأسئلة الشائعة', 'cc_mb_faq_repeater', $screen, 'normal', 'default' );
    }

    add_meta_box( 'cc_service_details',    'تفاصيل الخدمة',             'cc_mb_service',     'cc_service',     'normal', 'high' );
    add_meta_box( 'cc_package_details',    'تفاصيل الباقة',             'cc_mb_package',     'cc_package',     'normal', 'high' );
    add_meta_box( 'cc_project_details',    'تفاصيل المشروع',            'cc_mb_project',     'cc_project',     'normal', 'high' );
    add_meta_box( 'cc_team_details',       'تفاصيل عضو الفريق',         'cc_mb_team',        'cc_team',        'normal', 'high' );
    add_meta_box( 'cc_testimonial_details','تفاصيل رأي العميل',          'cc_mb_testimonial', 'cc_testimonial', 'normal', 'high' );
    add_meta_box( 'cc_job_details',        'تفاصيل الوظيفة',            'cc_mb_job',         'cc_job',         'normal', 'high' );

    // Admin columns
    add_filter( 'manage_cc_service_posts_columns',    'cc_cols_service' );
    add_filter( 'manage_cc_package_posts_columns',    'cc_cols_package' );
    add_filter( 'manage_cc_project_posts_columns',    'cc_cols_project' );
    add_filter( 'manage_cc_team_posts_columns',       'cc_cols_team' );
    add_filter( 'manage_cc_job_posts_columns',        'cc_cols_job' );

    add_action( 'manage_cc_service_posts_custom_column',  'cc_col_content_service',  10, 2 );
    add_action( 'manage_cc_package_posts_custom_column',  'cc_col_content_package',  10, 2 );
    add_action( 'manage_cc_project_posts_custom_column',  'cc_col_content_project',  10, 2 );
    add_action( 'manage_cc_team_posts_custom_column',     'cc_col_content_team',     10, 2 );
    add_action( 'manage_cc_job_posts_custom_column',      'cc_col_content_job',      10, 2 );
}

/* ============================================================
   HELPER: render a table row
   ============================================================ */

function cc_mb_row( string $label, string $input_html ): void {
    echo '<tr><th style="width:200px"><label>' . esc_html( $label ) . '</label></th><td>' . $input_html . '</td></tr>';
}

/* ============================================================
   FAQ REPEATER META BOX
   ============================================================ */

function cc_mb_faq_repeater( WP_Post $post ): void {
    wp_nonce_field( 'cc_faq_meta', 'cc_faq_nonce' );

    $faqs = get_post_meta( $post->ID, 'cc_faq_items', true );
    $faqs = is_array( $faqs ) ? $faqs : [];

    echo '<div class="cc-faq-admin" dir="rtl">';
    echo '<p class="description">أضف الأسئلة التي تريد ظهورها في الصفحة. نفس الأسئلة تُستخدم أيضاً في FAQ Schema عبر Rank Math.</p>';
    echo '<div class="cc-faq-admin__rows" id="cc-faq-admin-rows">';

    $rows = $faqs ?: [ [ 'question' => '', 'answer' => '' ] ];
    foreach ( $rows as $faq ) {
        $question = $faq['question'] ?? '';
        $answer   = $faq['answer'] ?? '';
        echo '<div class="cc-faq-admin__row">';
        echo '<p><label>السؤال</label><input type="text" name="cc_faq_question[]" value="' . esc_attr( $question ) . '" class="widefat" placeholder="مثال: هل السعر نهائي؟"></p>';
        echo '<p><label>الإجابة</label><textarea name="cc_faq_answer[]" rows="3" class="widefat" placeholder="اكتب إجابة واضحة ومباشرة.">' . esc_textarea( $answer ) . '</textarea></p>';
        echo '<button type="button" class="button cc-faq-admin__remove">حذف السؤال</button>';
        echo '</div>';
    }

    echo '</div>';
    echo '<p><button type="button" class="button button-secondary" id="cc-faq-admin-add">إضافة سؤال</button></p>';
    echo '</div>';
    ?>
    <style>
    .cc-faq-admin__row{background:#f6f7f7;border:1px solid #dcdcde;border-radius:6px;padding:14px;margin-bottom:12px}
    .cc-faq-admin__row label{display:block;font-weight:700;margin-bottom:5px}
    .cc-faq-admin__remove{color:#b32d2e;border-color:#b32d2e}
    </style>
    <script>
    (function(){
        const wrap = document.getElementById('cc-faq-admin-rows');
        const add = document.getElementById('cc-faq-admin-add');
        if (!wrap || !add) return;

        function rowTemplate() {
            const div = document.createElement('div');
            div.className = 'cc-faq-admin__row';
            div.innerHTML = '<p><label>السؤال</label><input type="text" name="cc_faq_question[]" value="" class="widefat" placeholder="مثال: هل السعر نهائي؟"></p><p><label>الإجابة</label><textarea name="cc_faq_answer[]" rows="3" class="widefat" placeholder="اكتب إجابة واضحة ومباشرة."></textarea></p><button type="button" class="button cc-faq-admin__remove">حذف السؤال</button>';
            return div;
        }

        add.addEventListener('click', function(){ wrap.appendChild(rowTemplate()); });
        wrap.addEventListener('click', function(e){
            if (!e.target.classList.contains('cc-faq-admin__remove')) return;
            const rows = wrap.querySelectorAll('.cc-faq-admin__row');
            if (rows.length > 1) e.target.closest('.cc-faq-admin__row').remove();
            else {
                const row = e.target.closest('.cc-faq-admin__row');
                row.querySelector('input').value = '';
                row.querySelector('textarea').value = '';
            }
        });
    })();
    </script>
    <?php
}

/* ============================================================
   SERVICE META BOX
   ============================================================ */

function cc_mb_service( WP_Post $post ): void {
    wp_nonce_field( 'cc_service_meta', 'cc_service_nonce' );

    $icon           = get_post_meta( $post->ID, 'service_icon',           true );
    $price          = get_post_meta( $post->ID, 'service_price',          true );
    $features       = get_post_meta( $post->ID, 'service_features',       true );
    $starting_price = get_post_meta( $post->ID, 'service_starting_price', true );
    $delivery_days  = get_post_meta( $post->ID, 'service_delivery_days',  true );
    $cta_url        = get_post_meta( $post->ID, 'service_cta_url',        true );

    echo '<table class="form-table">';
    cc_mb_row( 'أيقونة الخدمة (Font Awesome)',
        '<input type="text" name="service_icon" value="' . esc_attr( $icon ) . '" size="50" placeholder="fas fa-cogs" />' );
    cc_mb_row( 'سعر الخدمة (قديم)',
        '<input type="text" name="service_price" value="' . esc_attr( $price ) . '" size="50" placeholder="999 ريال" />' );
    cc_mb_row( 'يبدأ من (جديد)',
        '<input type="text" name="service_starting_price" value="' . esc_attr( $starting_price ) . '" size="30" placeholder="$1,200" />' );
    cc_mb_row( 'مدة التسليم (أيام)',
        '<input type="number" name="service_delivery_days" value="' . esc_attr( $delivery_days ) . '" size="10" min="1" />' );
    cc_mb_row( 'رابط CTA المخصص',
        '<input type="url" name="service_cta_url" value="' . esc_attr( $cta_url ) . '" size="50" placeholder="https://..." />' );
    cc_mb_row( 'مميزات الخدمة (واحدة في كل سطر)',
        '<textarea name="service_features" rows="6" cols="50">' . esc_textarea( $features ) . '</textarea>' );
    echo '</table>';
}

/* ============================================================
   PACKAGE META BOX
   ============================================================ */

function cc_mb_package( WP_Post $post ): void {
    wp_nonce_field( 'cc_package_meta', 'cc_package_nonce' );

    $icon          = get_post_meta( $post->ID, 'package_icon',          true );
    $price         = get_post_meta( $post->ID, 'package_price',         true );
    $old_price     = get_post_meta( $post->ID, 'package_old_price',     true );
    $price_note    = get_post_meta( $post->ID, 'package_price_note',    true );
    $badge         = get_post_meta( $post->ID, 'package_badge',         true );
    $highlighted   = get_post_meta( $post->ID, 'package_highlighted',   true );
    $delivery_days = get_post_meta( $post->ID, 'package_delivery_days', true );
    $features      = get_post_meta( $post->ID, 'package_features',      true );
    $includes      = get_post_meta( $post->ID, 'package_includes',      true );
    $outcomes      = get_post_meta( $post->ID, 'package_outcomes',      true );
    $ideal_for     = get_post_meta( $post->ID, 'package_ideal_for',     true );
    $cta_text      = get_post_meta( $post->ID, 'package_cta_text',      true );
    $cta_url       = get_post_meta( $post->ID, 'package_cta_url',       true );
    $gallery_ids   = get_post_meta( $post->ID, 'package_gallery_ids',   true );
    $tool_logos    = get_post_meta( $post->ID, 'package_tool_logos',    true );

    echo '<table class="form-table">';
    cc_mb_row( 'أيقونة الباقة (Font Awesome)',
        '<input type="text" name="package_icon" value="' . esc_attr( $icon ) . '" size="50" placeholder="fas fa-layer-group" />' );
    cc_mb_row( 'السعر',
        '<input type="text" name="package_price" value="' . esc_attr( $price ) . '" size="30" placeholder="25,000 جنيه" />' );
    cc_mb_row( 'السعر قبل الخصم',
        '<input type="text" name="package_old_price" value="' . esc_attr( $old_price ) . '" size="30" placeholder="35,000 جنيه" />' );
    cc_mb_row( 'ملاحظة السعر',
        '<input type="text" name="package_price_note" value="' . esc_attr( $price_note ) . '" size="50" placeholder="دفعة واحدة / يبدأ من / شهرياً" />' );
    cc_mb_row( 'شارة الباقة',
        '<input type="text" name="package_badge" value="' . esc_attr( $badge ) . '" size="40" placeholder="الأكثر طلباً" />' );
    cc_mb_row( 'تمييز الباقة',
        '<label><input type="checkbox" name="package_highlighted" value="1"' . checked( $highlighted, '1', false ) . ' /> إبراز الباقة في الجداول</label>' );
    cc_mb_row( 'مدة التنفيذ بالأيام',
        '<input type="number" name="package_delivery_days" value="' . esc_attr( $delivery_days ) . '" min="1" size="10" />' );
    cc_mb_row( 'المميزات المختصرة (واحدة في كل سطر)',
        '<textarea name="package_features" rows="6" cols="50">' . esc_textarea( $features ) . '</textarea>' );
    cc_mb_row( 'مكونات الباقة (واحدة في كل سطر)',
        '<textarea name="package_includes" rows="6" cols="50">' . esc_textarea( $includes ) . '</textarea>' );
    cc_mb_row( 'النتائج المتوقعة (واحدة في كل سطر)',
        '<textarea name="package_outcomes" rows="5" cols="50">' . esc_textarea( $outcomes ) . '</textarea>' );
    cc_mb_row( 'مناسبة لمن؟ (واحدة في كل سطر)',
        '<textarea name="package_ideal_for" rows="5" cols="50">' . esc_textarea( $ideal_for ) . '</textarea>' );
    cc_mb_row( 'نص زر الطلب',
        '<input type="text" name="package_cta_text" value="' . esc_attr( $cta_text ) . '" size="40" placeholder="اطلب هذه الباقة" />' );
    cc_mb_row( 'رابط زر الطلب المخصص',
        '<input type="url" name="package_cta_url" value="' . esc_attr( $cta_url ) . '" size="50" placeholder="اتركه فارغاً للانتقال إلى نموذج الطلب" />' );
    cc_mb_row( 'صور النتائج / لقطات العمل',
        '<input type="hidden" id="package_gallery_ids" name="package_gallery_ids" value="' . esc_attr( $gallery_ids ) . '" />' .
        '<div id="package_gallery_preview" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"></div>' .
        '<button type="button" class="button" id="package_gallery_select">اختيار الصور</button> ' .
        '<button type="button" class="button" id="package_gallery_clear">مسح الصور</button>' .
        '<p class="description">استخدمها لصور SEO Analytics أو WooCommerce Results أو لقطات قبل/بعد حسب الباقة.</p>' );
    cc_mb_row( 'شعارات الأدوات والتكاملات',
        '<textarea name="package_tool_logos" rows="5" cols="50" placeholder="Google Analytics|https://example.com/ga.svg&#10;Google Ads|fas fa-bullhorn&#10;WooCommerce|fab fa-wordpress">' . esc_textarea( $tool_logos ) . '</textarea>' .
        '<p class="description">كل سطر: اسم الأداة | رابط صورة الشعار أو كلاس Font Awesome.</p>' );
    echo '</table>';
    ?>
    <script>
    (function($){
        const input = $('#package_gallery_ids');
        const preview = $('#package_gallery_preview');
        if (!input.length || typeof wp === 'undefined' || !wp.media) return;

        function render(ids) {
            preview.empty();
            if (!ids.length) return;
            ids.forEach(function(id){
                wp.media.attachment(id).fetch().then(function(att){
                    const url = att.sizes && att.sizes.thumbnail ? att.sizes.thumbnail.url : att.url;
                    preview.append('<span style="width:72px;height:72px;border:1px solid #dcdcde;border-radius:6px;overflow:hidden;background:#fff;display:inline-flex"><img src="'+url+'" style="width:100%;height:100%;object-fit:cover" alt=""></span>');
                });
            });
        }

        render((input.val() || '').split(',').filter(Boolean));

        $('#package_gallery_select').on('click', function(e){
            e.preventDefault();
            const frame = wp.media({
                title: 'اختيار صور النتائج',
                button: { text: 'استخدام الصور' },
                multiple: true
            });
            frame.on('select', function(){
                const ids = frame.state().get('selection').map(function(att){ return att.id; });
                input.val(ids.join(','));
                render(ids);
            });
            frame.open();
        });
        $('#package_gallery_clear').on('click', function(e){
            e.preventDefault();
            input.val('');
            preview.empty();
        });
    })(jQuery);
    </script>
    <?php
}

/* ============================================================
   PROJECT META BOX
   ============================================================ */

function cc_mb_project( WP_Post $post ): void {
    wp_nonce_field( 'cc_project_meta', 'cc_project_nonce' );

    $client       = get_post_meta( $post->ID, 'project_client',         true );
    $url          = get_post_meta( $post->ID, 'project_url',            true );
    $date         = get_post_meta( $post->ID, 'project_date',           true );
    $techs        = get_post_meta( $post->ID, 'project_technologies',   true );
    $country      = get_post_meta( $post->ID, 'project_country',        true );
    $result       = get_post_meta( $post->ID, 'project_result_summary', true );
    $bento_span   = get_post_meta( $post->ID, 'project_bento_span',     true );

    $span_opts = [ '5' => '5 أعمدة (صغير)', '7' => '7 أعمدة (كبير)', '6' => '6 أعمدة (نصف)', '4' => '4 أعمدة', '12' => '12 عمود (كامل)' ];

    echo '<table class="form-table">';
    cc_mb_row( 'اسم العميل',
        '<input type="text" name="project_client" value="' . esc_attr( $client ) . '" size="50" />' );
    cc_mb_row( 'رابط المشروع',
        '<input type="url" name="project_url" value="' . esc_attr( $url ) . '" size="50" />' );
    cc_mb_row( 'تاريخ المشروع',
        '<input type="date" name="project_date" value="' . esc_attr( $date ) . '" />' );
    cc_mb_row( 'الدولة / السوق',
        '<input type="text" name="project_country" value="' . esc_attr( $country ) . '" size="30" placeholder="السعودية، مصر، المملكة المتحدة" />' );
    cc_mb_row( 'التقنيات المستخدمة (مفصولة بفاصلة)',
        '<input type="text" name="project_technologies" value="' . esc_attr( $techs ) . '" size="50" placeholder="WordPress, WooCommerce, PHP" />' );
    cc_mb_row( 'ملخص النتائج',
        '<textarea name="project_result_summary" rows="3" cols="50" placeholder="LCP من 4.2s إلى 1.1s — التحويلات +34%">' . esc_textarea( $result ) . '</textarea>' );

    $sel = '<select name="project_bento_span">';
    foreach ( $span_opts as $val => $lbl ) {
        $sel .= '<option value="' . esc_attr( $val ) . '"' . selected( $bento_span, $val, false ) . '>' . esc_html( $lbl ) . '</option>';
    }
    $sel .= '</select>';
    cc_mb_row( 'عرض الكارد في شبكة Bento', $sel );
    echo '</table>';
}

/* ============================================================
   TEAM META BOX
   ============================================================ */

function cc_mb_team( WP_Post $post ): void {
    wp_nonce_field( 'cc_team_meta', 'cc_team_nonce' );

    $fields = [ 'member_position' => 'المنصب', 'member_linkedin' => 'رابط LinkedIn', 'member_twitter' => 'رابط Twitter', 'member_facebook' => 'رابط Facebook', 'member_instagram' => 'رابط Instagram' ];

    echo '<table class="form-table">';
    foreach ( $fields as $key => $label ) {
        $val  = get_post_meta( $post->ID, $key, true );
        $type = ( $key === 'member_position' ) ? 'text' : 'url';
        cc_mb_row( $label, '<input type="' . $type . '" name="' . esc_attr( $key ) . '" value="' . esc_attr( $val ) . '" size="50" />' );
    }
    echo '</table>';
}

/* ============================================================
   TESTIMONIAL META BOX
   ============================================================ */

function cc_mb_testimonial( WP_Post $post ): void {
    wp_nonce_field( 'cc_testimonial_meta', 'cc_testimonial_nonce' );

    $name     = get_post_meta( $post->ID, 'client_name',     true );
    $position = get_post_meta( $post->ID, 'client_position', true );
    $company  = get_post_meta( $post->ID, 'client_company',  true );
    $rating   = get_post_meta( $post->ID, 'rating',          true );

    echo '<table class="form-table">';
    cc_mb_row( 'اسم العميل',     '<input type="text" name="client_name" value="' . esc_attr( $name ) . '" size="50" />' );
    cc_mb_row( 'منصب العميل',    '<input type="text" name="client_position" value="' . esc_attr( $position ) . '" size="50" />' );
    cc_mb_row( 'شركة العميل',    '<input type="text" name="client_company" value="' . esc_attr( $company ) . '" size="50" />' );

    $sel = '<select name="rating">';
    for ( $i = 1; $i <= 5; $i++ ) {
        $sel .= '<option value="' . $i . '"' . selected( $rating, $i, false ) . '>' . $i . ' نجوم</option>';
    }
    $sel .= '</select>';
    cc_mb_row( 'التقييم (1–5)', $sel );
    echo '</table>';
}

/* ============================================================
   JOB META BOX
   ============================================================ */

function cc_mb_job( WP_Post $post ): void {
    wp_nonce_field( 'cc_job_meta', 'cc_job_nonce' );

    $location    = get_post_meta( $post->ID, 'job_location',             true );
    $salary      = get_post_meta( $post->ID, 'job_salary',               true );
    $exp         = get_post_meta( $post->ID, 'job_experience_level',     true );
    $remote      = get_post_meta( $post->ID, 'job_remote_allowed',       true );
    $deadline    = get_post_meta( $post->ID, 'job_application_deadline', true );
    $email       = get_post_meta( $post->ID, 'job_contact_email',        true );
    $requirements = get_post_meta( $post->ID, 'job_requirements',        true );
    $skills      = get_post_meta( $post->ID, 'job_skills',               true );
    $benefits    = get_post_meta( $post->ID, 'job_benefits',             true );

    $exp_levels = [
        'entry'  => 'مبتدئ (0–2 سنة)',
        'mid'    => 'متوسط (2–5 سنوات)',
        'senior' => 'أول (5–10 سنوات)',
        'expert' => 'خبير (أكثر من 10 سنوات)',
    ];

    echo '<table class="form-table">';
    cc_mb_row( 'موقع العمل',
        '<input type="text" name="job_location" value="' . esc_attr( $location ) . '" size="50" placeholder="الرياض، السعودية" />' );
    cc_mb_row( 'الراتب',
        '<input type="text" name="job_salary" value="' . esc_attr( $salary ) . '" size="50" placeholder="8,000 – 12,000 ريال شهرياً" />' );

    $sel = '<select name="job_experience_level">';
    foreach ( $exp_levels as $val => $lbl ) {
        $sel .= '<option value="' . esc_attr( $val ) . '"' . selected( $exp, $val, false ) . '>' . esc_html( $lbl ) . '</option>';
    }
    $sel .= '</select>';
    cc_mb_row( 'مستوى الخبرة', $sel );

    cc_mb_row( 'العمل عن بُعد',
        '<label><input type="checkbox" name="job_remote_allowed" value="1"' . checked( $remote, '1', false ) . ' /> نعم، العمل عن بُعد متاح</label>' );
    cc_mb_row( 'آخر موعد للتقديم',
        '<input type="date" name="job_application_deadline" value="' . esc_attr( $deadline ) . '" />' );
    cc_mb_row( 'بريد التقديم',
        '<input type="email" name="job_contact_email" value="' . esc_attr( $email ) . '" size="50" placeholder="hr@creativecode.com.eg" />' );
    cc_mb_row( 'متطلبات الوظيفة (واحدة في كل سطر)',
        '<textarea name="job_requirements" rows="5" cols="50">' . esc_textarea( $requirements ) . '</textarea>' );
    cc_mb_row( 'المهارات المطلوبة (واحدة في كل سطر)',
        '<textarea name="job_skills" rows="5" cols="50">' . esc_textarea( $skills ) . '</textarea>' );
    cc_mb_row( 'مزايا الوظيفة (واحدة في كل سطر)',
        '<textarea name="job_benefits" rows="5" cols="50">' . esc_textarea( $benefits ) . '</textarea>' );
    echo '</table>';
}

/* ============================================================
   INSIGHT (BLOG) META BOX — NEW
   ============================================================ */


/* ============================================================
   SAVE ALL META
   ============================================================ */

function cc_save_all_meta( int $post_id ): void {
    if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) return;
    if ( ! current_user_can( 'edit_post', $post_id ) ) return;

    if ( isset( $_POST['cc_faq_nonce'] ) && wp_verify_nonce( $_POST['cc_faq_nonce'], 'cc_faq_meta' ) ) {
        $questions = isset( $_POST['cc_faq_question'] ) && is_array( $_POST['cc_faq_question'] ) ? $_POST['cc_faq_question'] : [];
        $answers   = isset( $_POST['cc_faq_answer'] ) && is_array( $_POST['cc_faq_answer'] ) ? $_POST['cc_faq_answer'] : [];
        $items     = [];

        foreach ( $questions as $idx => $question ) {
            $q = sanitize_text_field( $question );
            $a = isset( $answers[ $idx ] ) ? sanitize_textarea_field( $answers[ $idx ] ) : '';
            if ( $q === '' || $a === '' ) {
                continue;
            }
            $items[] = [
                'question' => $q,
                'answer'   => $a,
            ];
        }

        if ( $items ) {
            update_post_meta( $post_id, 'cc_faq_items', $items );
        } else {
            delete_post_meta( $post_id, 'cc_faq_items' );
        }
    }

    /* ── Service ──────────────────────────────────────────────────────────── */
    if ( isset( $_POST['cc_service_nonce'] ) && wp_verify_nonce( $_POST['cc_service_nonce'], 'cc_service_meta' ) ) {
        $text_fields = [ 'service_icon', 'service_price', 'service_starting_price', 'service_delivery_days' ];
        foreach ( $text_fields as $f ) {
            if ( isset( $_POST[ $f ] ) ) update_post_meta( $post_id, $f, sanitize_text_field( $_POST[ $f ] ) );
        }
        if ( isset( $_POST['service_features'] ) ) update_post_meta( $post_id, 'service_features', sanitize_textarea_field( $_POST['service_features'] ) );
        if ( isset( $_POST['service_cta_url'] )  ) update_post_meta( $post_id, 'service_cta_url', esc_url_raw( $_POST['service_cta_url'] ) );
    }

    /* ── Package ──────────────────────────────────────────────────────────── */
    if ( isset( $_POST['cc_package_nonce'] ) && wp_verify_nonce( $_POST['cc_package_nonce'], 'cc_package_meta' ) ) {
        $text_fields = [
            'package_icon', 'package_price', 'package_old_price', 'package_price_note',
            'package_badge', 'package_delivery_days', 'package_cta_text',
        ];
        foreach ( $text_fields as $f ) {
            if ( isset( $_POST[ $f ] ) ) update_post_meta( $post_id, $f, sanitize_text_field( $_POST[ $f ] ) );
        }
        update_post_meta( $post_id, 'package_highlighted', isset( $_POST['package_highlighted'] ) ? '1' : '0' );
        foreach ( [ 'package_features', 'package_includes', 'package_outcomes', 'package_ideal_for' ] as $f ) {
            if ( isset( $_POST[ $f ] ) ) update_post_meta( $post_id, $f, sanitize_textarea_field( $_POST[ $f ] ) );
        }
        if ( isset( $_POST['package_cta_url'] ) ) update_post_meta( $post_id, 'package_cta_url', esc_url_raw( $_POST['package_cta_url'] ) );
        if ( isset( $_POST['package_gallery_ids'] ) ) {
            $ids = array_filter( array_map( 'absint', explode( ',', (string) $_POST['package_gallery_ids'] ) ) );
            update_post_meta( $post_id, 'package_gallery_ids', implode( ',', $ids ) );
        }
        if ( isset( $_POST['package_tool_logos'] ) ) update_post_meta( $post_id, 'package_tool_logos', sanitize_textarea_field( $_POST['package_tool_logos'] ) );
    }

    /* ── Project ──────────────────────────────────────────────────────────── */
    if ( isset( $_POST['cc_project_nonce'] ) && wp_verify_nonce( $_POST['cc_project_nonce'], 'cc_project_meta' ) ) {
        $text_fields = [ 'project_client', 'project_date', 'project_technologies', 'project_country', 'project_bento_span' ];
        foreach ( $text_fields as $f ) {
            if ( isset( $_POST[ $f ] ) ) update_post_meta( $post_id, $f, sanitize_text_field( $_POST[ $f ] ) );
        }
        if ( isset( $_POST['project_url'] )            ) update_post_meta( $post_id, 'project_url', esc_url_raw( $_POST['project_url'] ) );
        if ( isset( $_POST['project_result_summary'] )  ) update_post_meta( $post_id, 'project_result_summary', sanitize_textarea_field( $_POST['project_result_summary'] ) );
    }

    /* ── Team ─────────────────────────────────────────────────────────────── */
    if ( isset( $_POST['cc_team_nonce'] ) && wp_verify_nonce( $_POST['cc_team_nonce'], 'cc_team_meta' ) ) {
        $url_fields  = [ 'member_linkedin', 'member_twitter', 'member_facebook', 'member_instagram' ];
        $text_fields = [ 'member_position' ];
        foreach ( $text_fields as $f ) {
            if ( isset( $_POST[ $f ] ) ) update_post_meta( $post_id, $f, sanitize_text_field( $_POST[ $f ] ) );
        }
        foreach ( $url_fields as $f ) {
            if ( isset( $_POST[ $f ] ) ) update_post_meta( $post_id, $f, esc_url_raw( $_POST[ $f ] ) );
        }
    }

    /* ── Testimonial ──────────────────────────────────────────────────────── */
    if ( isset( $_POST['cc_testimonial_nonce'] ) && wp_verify_nonce( $_POST['cc_testimonial_nonce'], 'cc_testimonial_meta' ) ) {
        foreach ( [ 'client_name', 'client_position', 'client_company', 'rating' ] as $f ) {
            if ( isset( $_POST[ $f ] ) ) update_post_meta( $post_id, $f, sanitize_text_field( $_POST[ $f ] ) );
        }
    }

    /* ── Job ──────────────────────────────────────────────────────────────── */
    if ( isset( $_POST['cc_job_nonce'] ) && wp_verify_nonce( $_POST['cc_job_nonce'], 'cc_job_meta' ) ) {
        $text_fields = [ 'job_location', 'job_salary', 'job_experience_level', 'job_application_deadline' ];
        foreach ( $text_fields as $f ) {
            if ( isset( $_POST[ $f ] ) ) update_post_meta( $post_id, $f, sanitize_text_field( $_POST[ $f ] ) );
        }
        update_post_meta( $post_id, 'job_remote_allowed', isset( $_POST['job_remote_allowed'] ) ? '1' : '0' );
        if ( isset( $_POST['job_contact_email'] ) ) update_post_meta( $post_id, 'job_contact_email', sanitize_email( $_POST['job_contact_email'] ) );
        foreach ( [ 'job_requirements', 'job_skills', 'job_benefits' ] as $f ) {
            if ( isset( $_POST[ $f ] ) ) update_post_meta( $post_id, $f, sanitize_textarea_field( $_POST[ $f ] ) );
        }
    }
}

/* ============================================================
   ADMIN COLUMN DEFINITIONS
   ============================================================ */

function cc_cols_service( $cols ) {
    $cols['service_icon'] = 'الأيقونة'; $cols['service_starting_price'] = 'يبدأ من'; return $cols;
}
function cc_col_content_service( $col, $id ) {
    if ( $col === 'service_icon' ) {
        $icon = get_post_meta( $id, 'service_icon', true );
        if ( $icon ) echo '<i class="' . esc_attr( $icon ) . '"></i>';
    }
    if ( $col === 'service_starting_price' ) echo esc_html( get_post_meta( $id, 'service_starting_price', true ) );
}

function cc_cols_package( $cols ) {
    $cols['package_price'] = 'السعر'; $cols['package_badge'] = 'الشارة'; $cols['package_highlighted'] = 'مميزة'; return $cols;
}
function cc_col_content_package( $col, $id ) {
    switch ( $col ) {
        case 'package_price':
            echo esc_html( get_post_meta( $id, 'package_price', true ) );
            break;
        case 'package_badge':
            echo esc_html( get_post_meta( $id, 'package_badge', true ) );
            break;
        case 'package_highlighted':
            echo get_post_meta( $id, 'package_highlighted', true ) === '1' ? '<span class="dashicons dashicons-star-filled"></span>' : '';
            break;
    }
}

function cc_cols_project( $cols ) {
    $cols['project_client'] = 'العميل'; $cols['project_country'] = 'الدولة'; $cols['project_date_custom'] = 'تاريخ المشروع'; return $cols;
}
function cc_col_content_project( $col, $id ) {
    match ( $col ) {
        'project_client'      => print( esc_html( get_post_meta( $id, 'project_client',  true ) ) ),
        'project_country'     => print( esc_html( get_post_meta( $id, 'project_country', true ) ) ),
        'project_date_custom' => print( esc_html( get_post_meta( $id, 'project_date',    true ) ) ),
        default               => null,
    };
}

function cc_cols_team( $cols ) { $cols['member_position'] = 'المنصب'; return $cols; }
function cc_col_content_team( $col, $id ) {
    if ( $col === 'member_position' ) echo esc_html( get_post_meta( $id, 'member_position', true ) );
}

function cc_cols_job( $cols ) {
    $cols['job_location'] = 'الموقع'; $cols['job_salary'] = 'الراتب'; $cols['job_deadline'] = 'آخر موعد'; return $cols;
}
function cc_col_content_job( $col, $id ) {
    switch ( $col ) {
        case 'job_location': echo esc_html( get_post_meta( $id, 'job_location', true ) ); break;
        case 'job_salary':   echo esc_html( get_post_meta( $id, 'job_salary',   true ) ); break;
        case 'job_deadline':
            $d = get_post_meta( $id, 'job_application_deadline', true );
            if ( $d ) {
                $expired = $d < current_time( 'Y-m-d' );
                echo $expired
                    ? '<span style="color:#c00">' . esc_html( $d ) . ' (منتهية)</span>'
                    : esc_html( $d );
            }
            break;
    }
}
