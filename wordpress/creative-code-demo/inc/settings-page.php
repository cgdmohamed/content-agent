<?php
/**
 * Theme Settings Page — Creative Code 2026
 * Appearance → إعدادات القالب
 * @package CreativeCode2026
 */
if ( ! defined( 'ABSPATH' ) ) exit;

/* ── Register menu ────────────────────────────────────────────────────────── */
add_action( 'admin_menu', function () {
    add_theme_page(
        'إعدادات القالب — كود إبداعي',
        'إعدادات القالب',
        'manage_options',
        'cc-theme-settings',
        'cc_render_settings_page'
    );
} );

add_action( 'admin_init', function () {
    register_setting( 'cc_theme_settings', 'cc_theme_options', [
        'sanitize_callback' => 'cc_sanitize_options',
    ] );
} );

/* ── Sanitize ────────────────────────────────────────────────────────────── */
function cc_sanitize_options( array $input ): array {
    $existing = get_option( 'cc_theme_options', [] );
    $clean    = is_array( $existing ) ? $existing : [];

    $texts = [
        'hero_title', 'hero_subtitle', 'hero_cta_primary', 'hero_cta_secondary',
        'stat_1_num', 'stat_1_suffix', 'stat_1_label',
        'stat_2_num', 'stat_2_suffix', 'stat_2_label',
        'stat_3_num', 'stat_3_suffix', 'stat_3_label',
        'stat_4_num', 'stat_4_suffix', 'stat_4_label',
        'phone', 'whatsapp', 'email', 'address', 'working_hours',
        'agency_name', 'agency_tagline', 'logo_width', 'logo_height',
        'founder', 'founder_title', 'markets', 'years',
        'footer_about', 'cta_title', 'cta_subtitle', 'cta_btn',
        'colour_cyan', 'colour_violet', 'colour_lime', 'colour_pink', 'colour_amber',
        'services_section_title', 'projects_section_title', 'blog_section_title',
        'about_mission_title', 'about_mission_text',
        'fluent_contact_form_id', 'fluent_service_form_id', 'fluent_package_form_id',
        'fluent_newsletter_form_id', 'fluent_job_form_id',
    ];

    $urls = [
        'maps_url',
        'social_facebook', 'social_linkedin', 'social_instagram', 'social_tiktok',
        'social_twitter', 'social_youtube',
    ];

    foreach ( $texts as $k ) {
        if ( array_key_exists( $k, $input ) ) {
            $clean[ $k ] = sanitize_textarea_field( $input[ $k ] );
        }
    }
    foreach ( $urls as $k ) {
        if ( array_key_exists( $k, $input ) ) {
            $clean[ $k ] = esc_url_raw( $input[ $k ] );
        }
    }

    // Validate colours
    foreach ( ['colour_cyan','colour_violet','colour_lime','colour_pink','colour_amber'] as $k ) {
        if ( array_key_exists( $k, $input ) ) {
            $v = sanitize_hex_color( $input[ $k ] );
            $clean[ $k ] = $v ?: '';
        }
    }

    foreach ( [ 'logo_width', 'logo_height' ] as $k ) {
        if ( array_key_exists( $k, $input ) ) {
            $clean[ $k ] = (string) max( 0, (int) $input[ $k ] );
        }
    }

    return $clean;
}

/* ── Helper: read option ──────────────────────────────────────────────────── */
if ( ! function_exists( 'cc_opt' ) ) {
    function cc_opt( string $key, string $fallback = '' ): string {
        $opts = get_option( 'cc_theme_options', [] );
        return ( isset( $opts[ $key ] ) && $opts[ $key ] !== '' ) ? $opts[ $key ] : $fallback;
    }
}

/* ── cc_theme_get: settings → Customizer → default ──────────────────────── */
if ( ! function_exists( 'cc_theme_get' ) ) {
    function cc_theme_get( string $key, string $fallback = '' ): string {
        $opts = get_option( 'cc_theme_options', [] );
        if ( isset( $opts[ $key ] ) && $opts[ $key ] !== '' ) return $opts[ $key ];

        $cmap = [
            'phone'            => 'cc_phone',
            'whatsapp'         => 'cc_whatsapp',
            'email'            => 'cc_email',
            'address'          => 'cc_address',
            'maps_url'         => 'cc_maps_url',
            'footer_about'     => 'cc_footer_about',
            'social_facebook'  => 'cc_social_facebook',
            'social_linkedin'  => 'cc_social_linkedin',
            'social_instagram' => 'cc_social_instagram',
            'social_twitter'   => 'cc_social_twitter',
            'social_youtube'   => 'cc_social_youtube',
        ];

        if ( isset( $cmap[ $key ] ) ) {
            $mod = get_theme_mod( $cmap[ $key ] );
            if ( $mod !== '' && $mod !== false ) return (string) $mod;
        }
        return $fallback;
    }
}

/* ── Output colours into <head> ──────────────────────────────────────────── */
add_action( 'wp_head', function () {
    $map = [
        'colour_cyan'   => '--cc-cyan',
        'colour_violet' => '--cc-violet',
        'colour_lime'   => '--cc-lime',
        'colour_pink'   => '--cc-pink',
        'colour_amber'  => '--cc-amber',
    ];
    $css = ':root{';
    foreach ( $map as $key => $var ) {
        $val = cc_opt( $key );
        if ( $val ) {
            $s = sanitize_hex_color( $val );
            if ( $s ) $css .= $var . ':' . $s . ';';
        }
    }
    $css .= '}';
    if ( $css !== ':root{}' ) echo '<style id="cc-settings-colours">' . $css . '</style>' . "\n";
}, 98 );

/* ── Admin page assets ────────────────────────────────────────────────────── */
add_action( 'admin_enqueue_scripts', function ( $hook ) {
    if ( $hook !== 'appearance_page_cc-theme-settings' ) return;
    wp_enqueue_style( 'dashicons' );
    wp_enqueue_style( 'wp-color-picker' );
    wp_enqueue_script( 'wp-color-picker' );
    wp_add_inline_script( 'wp-color-picker', 'jQuery(function($){ $(".cc-color-field").wpColorPicker(); });' );
} );

/* ── Render ───────────────────────────────────────────────────────────────── */
function cc_render_settings_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) return;

    $active = $_GET['tab'] ?? 'hero';
    $url    = admin_url( 'themes.php?page=cc-theme-settings' );

    $tabs = [
        'hero'     => [ 'dashicons-admin-home', 'الصفحة الرئيسية' ],
        'contact'  => [ 'dashicons-phone', 'التواصل' ],
        'social'   => [ 'dashicons-share', 'السوشيال' ],
        'sections' => [ 'dashicons-edit-page', 'العناوين' ],
        'forms'    => [ 'dashicons-feedback', 'Fluent Forms' ],
        'footer'   => [ 'dashicons-media-document', 'التذييل' ],
        'demo'     => [ 'dashicons-database-add', 'المحتوى التجريبي' ],
    ];
    ?>
    <div class="wrap cc-settings-wrap" dir="rtl">
        <div class="cc-settings-header">
            <h1 class="cc-settings-title">
                <span class="cc-settings-logo">CC</span>
                إعدادات القالب — كود إبداعي 2026
            </h1>
            <p class="cc-settings-desc">تحكم في نصوص الموقع، بيانات التواصل، الألوان، وإعدادات Fluent Forms.</p>
        </div>

        <?php settings_errors( 'cc_theme_options' ); ?>

        <nav class="cc-settings-tabs">
            <?php foreach ( $tabs as $slug => [ $icon, $label ] ) : ?>
            <a href="<?php echo esc_url( $url . '&tab=' . $slug ); ?>"
               class="cc-settings-tab <?php echo $active === $slug ? 'cc-settings-tab--active' : ''; ?>">
                <span class="dashicons <?php echo esc_attr( $icon ); ?>"></span>
                <?php echo esc_html( $label ); ?>
            </a>
            <?php endforeach; ?>
        </nav>

        <form method="post" action="options.php" class="cc-settings-form">
            <?php settings_fields( 'cc_theme_settings' ); ?>

            <?php if ( $active === 'hero' ) : ?>
            <div class="cc-settings-panel">
                <h2 class="cc-settings-panel__title">محتوى الصفحة الرئيسية</h2>
                <div class="cc-settings-grid">
                    <div class="cc-settings-card">
                        <h3 class="cc-settings-card__title"><span class="dashicons dashicons-star-filled"></span> نص الهيرو</h3>
                        <?php cc_settings_field( 'hero_title',         'عنوان الهيرو',      'نبني<br>مستقبلاً<br><span class="cc-grad-text">رقمياً.</span>', 'text' ); ?>
                        <?php cc_settings_field( 'hero_subtitle',      'النص التوضيحي',     'وكالة رقمية متكاملة تبني متاجر إلكترونية ومنصات تعلم وأنظمة ERP...', 'textarea' ); ?>
                        <?php cc_settings_field( 'hero_cta_primary',   'زر CTA الرئيسي',   'استكشف خدماتنا', 'text' ); ?>
                        <?php cc_settings_field( 'hero_cta_secondary', 'زر CTA الثانوي',   'تواصل معنا', 'text' ); ?>
                    </div>
                    <div class="cc-settings-card">
                        <h3 class="cc-settings-card__title"><span class="dashicons dashicons-chart-bar"></span> أرقام الإنجازات</h3>
                        <?php
                        $stats = [
                            [ '1', '120', '',  'مشروع منجز'         ],
                            [ '2', '98',  '%', 'رضا العملاء'         ],
                            [ '3', '12',  '+', 'دولة نخدمها'         ],
                            [ '4', '4',   'x', 'متوسط نمو الإيرادات' ],
                        ];
                        foreach ( $stats as [ $i, $dn, $ds, $dl ] ) : ?>
                        <div class="cc-stat-row">
                            <span class="cc-stat-row__label">رقم <?php echo $i; ?></span>
                            <input type="text" name="cc_theme_options[stat_<?php echo $i; ?>_num]"
                                   value="<?php echo esc_attr( cc_opt( "stat_{$i}_num", $dn ) ); ?>"
                                   placeholder="العدد" style="width:65px">
                            <input type="text" name="cc_theme_options[stat_<?php echo $i; ?>_suffix]"
                                   value="<?php echo esc_attr( cc_opt( "stat_{$i}_suffix", $ds ) ); ?>"
                                   placeholder="لاحقة" style="width:48px">
                            <input type="text" name="cc_theme_options[stat_<?php echo $i; ?>_label]"
                                   value="<?php echo esc_attr( cc_opt( "stat_{$i}_label", $dl ) ); ?>"
                                   placeholder="التسمية" style="width:200px">
                        </div>
                        <?php endforeach; ?>
                    </div>
                    <div class="cc-settings-card">
                        <h3 class="cc-settings-card__title"><span class="dashicons dashicons-megaphone"></span> قسم CTA الرئيسي</h3>
                        <?php cc_settings_field( 'cta_title',    'عنوان القسم',   'ابدأ<br><span class="cc-grad-text">مشروعك التالي</span>', 'text' ); ?>
                        <?php cc_settings_field( 'cta_subtitle', 'النص التوضيحي', 'أخبرنا عن مشروعك. سنرد خلال 24 ساعة.', 'textarea' ); ?>
                        <?php cc_settings_field( 'cta_btn',      'نص الزر',       'ابدأ مشروعك ←', 'text' ); ?>
                    </div>
                </div>
            </div>

            <?php elseif ( $active === 'contact' ) : ?>
            <div class="cc-settings-panel">
                <h2 class="cc-settings-panel__title">معلومات التواصل</h2>
                <div class="cc-settings-grid">
                    <div class="cc-settings-card">
                        <h3 class="cc-settings-card__title"><span class="dashicons dashicons-phone"></span> بيانات الاتصال</h3>
                        <?php cc_settings_field( 'phone',         'رقم الهاتف',          '+20 110 571 0038', 'tel' ); ?>
                        <?php cc_settings_field( 'whatsapp',      'رقم واتساب (أرقام)',   '201105710038', 'text' ); ?>
                        <?php cc_settings_field( 'email',         'البريد الإلكتروني',    'info@creativecode.com.eg', 'email' ); ?>
                        <?php cc_settings_field( 'address',       'العنوان',              'الزقازيق — محافظة الشرقية', 'text' ); ?>
                        <?php cc_settings_field( 'maps_url',      'رابط خرائط جوجل',     '', 'url' ); ?>
                        <?php cc_settings_field( 'working_hours', 'ساعات العمل',          'الأحد – الخميس: 9 ص – 6 م', 'text' ); ?>
                    </div>
                    <div class="cc-settings-card">
                        <h3 class="cc-settings-card__title"><span class="dashicons dashicons-building"></span> بيانات الوكالة</h3>
                        <?php cc_settings_field( 'agency_name',    'اسم الوكالة',   'كود إبداعي', 'text' ); ?>
                        <?php cc_settings_field( 'agency_tagline', 'الشعار النصي', 'Creative Code', 'text' ); ?>
                    </div>
                    <div class="cc-settings-card">
                        <h3 class="cc-settings-card__title"><span class="dashicons dashicons-id"></span> المؤسس والأسواق (قالب Demo)</h3>
                        <?php cc_settings_field( 'founder',       'اسم المؤسس',            'م. محمد مصطفى', 'text' ); ?>
                        <?php cc_settings_field( 'founder_title', 'المسمى الوظيفي',        'مهندس برمجيات — المؤسس والمدير التنفيذي', 'text' ); ?>
                        <?php cc_settings_field( 'years',         'سنوات الخبرة (رقم)',    '12', 'number' ); ?>
                        <?php cc_settings_field( 'markets',       'الأسواق (تذييل النموذج)', 'مصر • السعودية • الإمارات • المملكة المتحدة', 'text' ); ?>
                    </div>
                    <div class="cc-settings-card">
                        <h3 class="cc-settings-card__title"><span class="dashicons dashicons-format-image"></span> أبعاد اللوجو</h3>
                        <?php cc_settings_field( 'logo_width',  'عرض اللوجو بالبكسل',  '180', 'number' ); ?>
                        <?php cc_settings_field( 'logo_height', 'ارتفاع اللوجو بالبكسل', '40', 'number' ); ?>
                    </div>
                </div>
            </div>

            <?php elseif ( $active === 'social' ) : ?>
            <div class="cc-settings-panel">
                <h2 class="cc-settings-panel__title">روابط التواصل الاجتماعي</h2>
                <div class="cc-settings-grid cc-settings-grid--single">
                    <div class="cc-settings-card">
                        <?php
                        $socials = [
                            [ 'social_facebook',  'Facebook',    'https://www.facebook.com/creativecode.eg' ],
                            [ 'social_linkedin',  'LinkedIn',    'https://www.linkedin.com/company/creative-code-eg/' ],
                            [ 'social_instagram', 'Instagram',   'https://instagram.com/creativecodeeg' ],
                            [ 'social_tiktok',    'TikTok',      '' ],
                            [ 'social_twitter',   'X / Twitter', '' ],
                            [ 'social_youtube',   'YouTube',     '' ],
                        ];
                        foreach ( $socials as [ $k, $l, $d ] ) :
                            cc_settings_field( $k, $l, $d, 'url' );
                        endforeach; ?>
                    </div>
                </div>
            </div>

            <?php elseif ( $active === 'sections' ) : ?>
            <div class="cc-settings-panel">
                <h2 class="cc-settings-panel__title">عناوين الأقسام</h2>
                <div class="cc-settings-grid cc-settings-grid--single">
                    <div class="cc-settings-card">
                        <?php cc_settings_field( 'services_section_title', 'عنوان قسم الخدمات', 'خدمات مصممة لنتائج حقيقية', 'text' ); ?>
                        <?php cc_settings_field( 'projects_section_title', 'عنوان قسم الأعمال', 'مشاريع تتحدث عنا', 'text' ); ?>
                        <?php cc_settings_field( 'blog_section_title',     'عنوان قسم المدونة', 'رؤى في التجارة الإلكترونية والتعلم الرقمي', 'text' ); ?>
                        <?php cc_settings_field( 'about_mission_title',    'عنوان الرسالة (About)', 'بناء بنية رقمية تدوم وتنمو معك', 'text' ); ?>
                        <?php cc_settings_field( 'about_mission_text',     'نص الرسالة',
                            'أسسنا كود إبداعي بقناعة واحدة: كل شركة تستحق بنية رقمية على مستوى عالمي.', 'textarea' ); ?>
                    </div>
                </div>
            </div>

            <?php elseif ( $active === 'colours' ) : ?>
            <div class="cc-settings-panel">
                <h2 class="cc-settings-panel__title">ألوان العلامة التجارية</h2>
                <div class="cc-settings-grid cc-settings-grid--single">
                    <div class="cc-settings-card">
                        <?php
                        $colours = [
                            [ 'colour_cyan',   '#00f5ff', 'السيان — اللون الأساسي'    ],
                            [ 'colour_violet', '#bf00ff', 'البنفسجي — اللون الثانوي'  ],
                            [ 'colour_lime',   '#b8ff00', 'الليموني — لون التمييز'    ],
                            [ 'colour_pink',   '#ff0099', 'الوردي — لون التنبيهات'    ],
                            [ 'colour_amber',  '#ffb700', 'العنبر — التقييمات والتحذيرات' ],
                        ];
                        foreach ( $colours as [ $k, $d, $l ] ) : ?>
                        <div class="cc-field cc-field--colour">
                            <label><?php echo esc_html( $l ); ?></label>
                            <input type="text" name="cc_theme_options[<?php echo esc_attr( $k ); ?>]"
                                   value="<?php echo esc_attr( cc_opt( $k, $d ) ); ?>"
                                   class="cc-color-field"
                                   data-default-color="<?php echo esc_attr( $d ); ?>">
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>

            <?php elseif ( $active === 'forms' ) : ?>
            <div class="cc-settings-panel">
                <h2 class="cc-settings-panel__title">إعدادات Fluent Forms</h2>
                <div class="cc-settings-grid cc-settings-grid--single">
                    <div class="cc-settings-card">
                        <div class="cc-field cc-field--info" style="margin-bottom:24px">
                            <p><span class="dashicons dashicons-yes-alt"></span> <strong>Fluent Forms مكتشف:</strong>
                            <?php echo function_exists( 'wpFluentForm' ) || defined( 'FLUENTFORM' )
                                ? 'الإضافة مفعّلة'
                                : 'الإضافة <strong>غير مفعّلة</strong> — يرجى تثبيتها من Plugins → Add New → Fluent Forms.'; ?>
                            </p>
                        </div>

                        <div class="cc-field">
                            <label>رقم ID نموذج التواصل الرئيسي</label>
                            <input type="text" name="cc_theme_options[fluent_contact_form_id]"
                                   value="<?php echo esc_attr( cc_opt( 'fluent_contact_form_id', '' ) ); ?>"
                                   class="regular-text" placeholder="مثال: 1">
                            <p class="description">
                                يُستخدم في صفحة التواصل الرئيسية. أنشئ نموذجاً في Fluent Forms ثم ضع رقم ID هنا.
                            </p>
                        </div>

                        <div class="cc-field">
                            <label>رقم ID نموذج طلب الخدمة</label>
                            <input type="text" name="cc_theme_options[fluent_service_form_id]"
                                   value="<?php echo esc_attr( cc_opt( 'fluent_service_form_id', '' ) ); ?>"
                                   class="regular-text" placeholder="مثال: 4">
                            <p class="description">
                                يظهر في صفحة كل خدمة داخل قسم طلب الخدمة.
                                أنشئ نموذجاً مخصصاً للخدمات في Fluent Forms وضع ID هنا.
                            </p>
                        </div>

                        <div class="cc-field">
                            <label>رقم ID نموذج طلب الباقة</label>
                            <input type="text" name="cc_theme_options[fluent_package_form_id]"
                                   value="<?php echo esc_attr( cc_opt( 'fluent_package_form_id', '' ) ); ?>"
                                   class="regular-text" placeholder="مثال: 5">
                            <p class="description">
                                يظهر في صفحة كل باقة داخل قسم طلب الباقة. مناسب لنموذج مخصص يجمع بيانات المشروع والميزانية والموعد المتوقع.
                            </p>
                        </div>

                        <div class="cc-field">
                            <label>رقم ID نموذج الاشتراك في النشرة البريدية</label>
                            <input type="text" name="cc_theme_options[fluent_newsletter_form_id]"
                                   value="<?php echo esc_attr( cc_opt( 'fluent_newsletter_form_id', '' ) ); ?>"
                                   class="regular-text" placeholder="مثال: 2">
                            <p class="description">
                                يظهر في شريط المدونة الجانبي ومقالات المدونة.
                                أنشئ نموذج بريد في Fluent Forms وضع ID هنا.
                            </p>
                        </div>

                        <div class="cc-field">
                            <label>رقم ID نموذج طلب الوظيفة</label>
                            <input type="text" name="cc_theme_options[fluent_job_form_id]"
                                   value="<?php echo esc_attr( cc_opt( 'fluent_job_form_id', '' ) ); ?>"
                                   class="regular-text" placeholder="مثال: 3">
                            <p class="description">
                                يظهر في صفحات الوظائف بدلاً من أي نموذج افتراضي داخل القالب.
                                إذا تُرك فارغاً ستظهر رسالة تطلب ضبط رقم النموذج.
                            </p>
                        </div>

                        <?php if ( function_exists( 'wpFluentForm' ) || defined( 'FLUENTFORM' ) ) : ?>
                        <div class="cc-field cc-field--info">
                            <p><span class="dashicons dashicons-lightbulb"></span> <strong>طريقة الاستخدام:</strong> بعد تحديد ID النموذج في الحقول أعلاه وحفظ الإعدادات،
                            سيتم استبدال نماذج القالب الافتراضية بنماذج Fluent Forms تلقائياً.</p>
                        </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <?php elseif ( $active === 'demo' ) : ?>
            <div class="cc-settings-panel">
                <h2 class="cc-settings-panel__title">المحتوى التجريبي</h2>
                <div class="cc-settings-card">
                    <p>ينشئ الصفحات (من نحن، الأسعار، الأسئلة الشائعة، التواصل، شكراً، الخصوصية، المدونة)، وخدمات الـ Demo الست، ودراسات الحالة، والباقات، ومقالات تجريبية — فقط ما لا يوجد بنفس الرابط المختصر. لا يعدّل ولا يحذف أي محتوى موجود.</p>
                    <p><a class="button button-primary" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=cc_seed_demo' ), 'cc_seed_demo' ) ); ?>">إنشاء المحتوى التجريبي</a></p>
                    <?php if ( isset( $_GET['seeded'] ) ) : ?><p><strong>تم إنشاء <?php echo (int) $_GET['seeded']; ?> عنصر.</strong></p><?php endif; ?>
                </div>
            </div>

            <?php elseif ( $active === 'footer' ) : ?>
            <div class="cc-settings-panel">
                <h2 class="cc-settings-panel__title">محتوى التذييل</h2>
                <div class="cc-settings-grid cc-settings-grid--single">
                    <div class="cc-settings-card">
                        <?php cc_settings_field( 'footer_about', 'النص التعريفي',
                            'نحن في كود إبداعي نساعد الشركات على النمو من خلال الحلول الرقمية المبتكرة.', 'textarea' ); ?>
                    </div>
                </div>
            </div>
            <?php endif; ?>

            <div class="cc-settings-footer">
                <?php submit_button( 'حفظ الإعدادات', 'primary large', 'submit', false ); ?>
                <span class="cc-settings-footer__hint">سيتم تطبيق التغييرات فور الحفظ</span>
            </div>
        </form>
    </div>

    <style>
    .cc-settings-wrap  { max-width:1100px; }
    .cc-settings-header{ background:#020408; color:#e8eaf0; padding:24px 28px; border-radius:10px; margin-bottom:20px; }
    .cc-settings-title { color:#fff; font-size:1.3rem; margin:0 0 6px; display:flex; align-items:center; gap:10px; }
    .cc-settings-logo  { background:linear-gradient(135deg,#00f5ff,#bf00ff); color:#020408; font-weight:800; font-size:.85rem; padding:3px 9px; border-radius:5px; }
    .cc-settings-desc  { color:rgba(232,234,240,.6); margin:0; font-size:.88rem; }
    .cc-settings-tabs  { display:flex; gap:3px; flex-wrap:wrap; border-bottom:2px solid #e0e0e0; margin-bottom:0; }
    .cc-settings-tab   { display:inline-block; padding:9px 16px; text-decoration:none; color:#50575e; font-size:.84rem; border-radius:5px 5px 0 0; border:1px solid transparent; border-bottom:none; background:#f6f7f7; margin-bottom:-2px; }
    .cc-settings-tab .dashicons { width:16px; height:16px; font-size:16px; line-height:1; vertical-align:-3px; margin-inline-end:4px; }
    .cc-settings-tab:hover { background:#fff; color:#1d2327; border-color:#e0e0e0; }
    .cc-settings-tab--active { background:#fff; color:#1d2327; border-color:#e0e0e0; border-bottom-color:#fff; font-weight:600; }
    .cc-settings-panel { background:#fff; border:1px solid #e0e0e0; border-top:none; border-radius:0 0 8px 8px; padding:24px 28px; }
    .cc-settings-panel__title { font-size:1.1rem; font-weight:700; color:#1d2327; margin:0 0 18px; padding-bottom:12px; border-bottom:1px solid #f0f0f1; }
    .cc-settings-grid  { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
    .cc-settings-grid--single { grid-template-columns:1fr; max-width:680px; }
    .cc-settings-card  { background:#f9f9f9; border:1px solid #e0e0e0; border-radius:7px; padding:20px; }
    .cc-settings-card__title { font-size:.95rem; font-weight:700; color:#1d2327; margin:0 0 16px; }
    .cc-settings-card__title .dashicons { width:18px; height:18px; font-size:18px; line-height:1; color:#00a3b5; vertical-align:-4px; margin-inline-end:5px; }
    .cc-field          { margin-bottom:14px; }
    .cc-field label    { display:block; font-weight:600; color:#1d2327; font-size:.83rem; margin-bottom:5px; }
    .cc-field input[type="text"],.cc-field input[type="url"],.cc-field input[type="email"],
    .cc-field input[type="tel"],.cc-field input[type="number"],.cc-field textarea { border-radius:5px; border:1.5px solid #c3c4c7; padding:7px 11px; font-size:.88rem; width:100%; }
    .cc-field input:focus,.cc-field textarea:focus { border-color:#00f5ff; box-shadow:0 0 0 2px rgba(0,245,255,.12); outline:none; }
    .cc-field .description { color:#787c82; font-size:.77rem; margin-top:4px; }
    .cc-field--info    { background:rgba(0,245,255,.06); border:1px solid rgba(0,245,255,.2); border-radius:5px; padding:10px 14px; }
    .cc-field--info p  { margin:0; color:#1d2327; font-size:.82rem; }
    .cc-field--info .dashicons { width:16px; height:16px; font-size:16px; line-height:1; color:#00a3b5; vertical-align:-3px; margin-inline-end:4px; }
    .cc-field--colour  { display:flex; align-items:center; gap:14px; border-bottom:1px solid #f0f0f1; padding-bottom:12px; }
    .cc-field--colour label { margin:0; width:260px; flex-shrink:0; }
    .cc-stat-row       { display:flex; align-items:center; gap:7px; margin-bottom:10px; padding:8px; background:#fff; border:1px solid #e0e0e0; border-radius:5px; }
    .cc-stat-row__label{ font-size:.78rem; font-weight:600; color:#50575e; width:55px; flex-shrink:0; }
    .cc-stat-row input { border:1px solid #c3c4c7; border-radius:4px; padding:5px 7px; font-size:.83rem; }
    .cc-settings-footer{ display:flex; align-items:center; gap:14px; margin-top:20px; padding-top:18px; border-top:1px solid #e0e0e0; }
    .cc-settings-footer__hint { font-size:.8rem; color:#787c82; }
    </style>
    <?php
}

/* ── Field helper ─────────────────────────────────────────────────────────── */
function cc_settings_field( string $key, string $label, string $default, string $type = 'text' ): void {
    $val = cc_opt( $key, $default );
    $name = "cc_theme_options[{$key}]";
    echo '<div class="cc-field">';
    echo '<label>' . esc_html( $label ) . '</label>';
    if ( $type === 'textarea' ) {
        echo '<textarea name="' . esc_attr( $name ) . '" rows="3" class="large-text">' . esc_textarea( $val ) . '</textarea>';
    } else {
        echo '<input type="' . esc_attr( $type ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $val ) . '" class="large-text">';
    }
    echo '</div>';
}

/* ── Fluent Forms helper ─────────────────────────────────────────────────── */
function cc_fluent_form( string $form_key ): string {
    $form_id = (int) cc_opt( $form_key, '' );
    if ( $form_id && ( function_exists( 'wpFluentForm' ) || defined( 'FLUENTFORM' ) ) ) {
        return do_shortcode( '[fluentform id="' . $form_id . '"]' );
    }
    return '';
}
