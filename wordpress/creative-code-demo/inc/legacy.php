<?php
/**
 * Behaviour inherited from the previous Creative Code 2026 theme: excerpt tweaks,
 * admin bar, 410 for ghost URLs, page-cache purge, landing-layout toggle,
 * Rank Math schema extras and image sizes. Design-independent.
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

/* ============================================================
   EXCERPT
   ============================================================ */

add_filter( 'excerpt_length', fn() => 28, 999 );
add_filter( 'excerpt_more',   fn() => '…' );

add_filter( 'the_content', function ( string $content ): string {
    if ( is_singular( 'post' ) && in_the_loop() && is_main_query() ) {
        $content = preg_replace( '/<h1(\s[^>]*)?>/i', '<h2$1>', $content );
        $content = preg_replace( '/<\/h1>/i', '</h2>', $content );
    }
    return $content;
}, 12 );

/* ============================================================
   ADMIN BAR — show only for editors+
   ============================================================ */

if ( ! current_user_can( 'edit_posts' ) ) {
    add_filter( 'show_admin_bar', '__return_false' );
}

/* ============================================================
   BLOCK 410 for Elementor ghost URLs (inherited)
   ============================================================ */

add_action( 'template_redirect', function () {
    if ( is_admin() || wp_doing_ajax() || is_customize_preview() ) {
        return;
    }

    $uri = $_SERVER['REQUEST_URI'] ?? '';
    if (
        str_contains( $uri, '/elementor-hf/' ) ||
        ( str_contains( $uri, '?page_id=' ) && ! is_user_logged_in() )
    ) {
        status_header( 410 );
        exit;
    }
} );

/* ============================================================
   PAGE CACHE — safe purge helper
   ============================================================ */

function cc_cache_dir(): string {
    return trailingslashit( WP_CONTENT_DIR ) . 'cache/';
}

function cc_purge_page_cache(): int {
    $cache_dir = cc_cache_dir();
    $real_dir  = realpath( $cache_dir );
    $content   = realpath( WP_CONTENT_DIR );

    if ( ! $real_dir || ! $content || ! is_dir( $real_dir ) ) {
        return 0;
    }

    $real_dir_norm = trailingslashit( wp_normalize_path( $real_dir ) );
    $content_norm  = trailingslashit( wp_normalize_path( $content ) );
    if ( str_starts_with( $real_dir_norm, $content_norm ) === false ) {
        return 0;
    }

    $deleted = 0;
    $files   = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator( $real_dir, FilesystemIterator::SKIP_DOTS ),
        RecursiveIteratorIterator::CHILD_FIRST
    );

    foreach ( $files as $file ) {
        if ( ! $file->isFile() || strtolower( $file->getExtension() ) !== 'html' ) {
            continue;
        }
        if ( @unlink( $file->getPathname() ) ) {
            $deleted++;
        }
    }

    return $deleted;
}

function cc_purge_page_cache_on_save( int $post_id ): void {
    if (
        ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) ||
        wp_is_post_revision( $post_id ) ||
        wp_is_post_autosave( $post_id ) ||
        ! current_user_can( 'edit_post', $post_id )
    ) {
        return;
    }

    cc_purge_page_cache();
}
add_action( 'save_post', 'cc_purge_page_cache_on_save' );
add_action( 'deleted_post', fn() => cc_purge_page_cache() );
add_action( 'switch_theme', fn() => cc_purge_page_cache() );
add_action( 'customize_save_after', fn() => cc_purge_page_cache() );

add_action( 'admin_bar_menu', function ( $bar ) {
    global $pagenow;
    if ( is_admin() && $pagenow === 'customize.php' ) {
        return;
    }

    if ( current_user_can( 'manage_options' ) ) {
        $bar->add_menu( [
            'id'    => 'cc-clear-cache',
            'title' => 'تفريغ كاش الصفحات',
            'href'  => wp_nonce_url( admin_url( '?cc_clear_cache=1' ), 'cc_clear_cache' ),
        ] );
    }
}, 100 );

add_action( 'admin_init', function () {
    if (
        isset( $_GET['cc_clear_cache'] ) &&
        current_user_can( 'manage_options' ) &&
        check_admin_referer( 'cc_clear_cache' )
    ) {
        $deleted = cc_purge_page_cache();
        set_transient( 'cc_cache_purge_notice', $deleted, 30 );
        wp_redirect( remove_query_arg( 'cc_clear_cache' ) );
        exit;
    }
} );

add_action( 'admin_notices', function () {
    $deleted = get_transient( 'cc_cache_purge_notice' );
    if ( $deleted === false ) {
        return;
    }
    delete_transient( 'cc_cache_purge_notice' );
    echo '<div class="notice notice-success is-dismissible"><p>' .
         esc_html( sprintf( 'تم تفريغ كاش الصفحات. الملفات المحذوفة: %d', (int) $deleted ) ) .
         '</p></div>';
} );

/* ============================================================
   CUSTOM LAYOUT META BOX (landing pages — inherited)
   ============================================================ */

add_action( 'add_meta_boxes', function () {
    add_meta_box(
        'cc_custom_layout',
        'إعدادات صفحة الهبوط',
        function ( $post ) {
            wp_nonce_field( 'cc_custom_layout_nonce', 'cc_custom_layout_nonce' );
            $val = get_post_meta( $post->ID, '_use_custom_layout', true );
            echo '<p><label><input type="checkbox" name="use_custom_layout" value="1" ' .
                 checked( $val, 1, false ) . ' /> <strong>استخدام تخطيط مخصص لصفحة الهبوط</strong></label></p>';
            echo '<p class="description">يُخفي هيدر وفوتر الموقع لصفحات الهبوط والحملات.</p>';
        },
        'page', 'side', 'high'
    );
} );

add_action( 'save_post', function ( $post_id ) {
    if (
        ! isset( $_POST['cc_custom_layout_nonce'] ) ||
        ! wp_verify_nonce( $_POST['cc_custom_layout_nonce'], 'cc_custom_layout_nonce' ) ||
        ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) ||
        ! current_user_can( 'edit_post', $post_id )
    ) return;

    update_post_meta( $post_id, '_use_custom_layout', isset( $_POST['use_custom_layout'] ) ? 1 : 0 );
} );

/* ============================================================
   RANK MATH SEO COMPATIBILITY
   ============================================================ */

add_filter( 'wp_get_attachment_image_attributes', function ( array $attr, WP_Post $attachment ): array {
    if ( empty( $attr['alt'] ) ) {
        $attr['alt'] = trim( wp_strip_all_tags( $attachment->post_title ) );
    }
    return $attr;
}, 10, 2 );

function cc_schema_excerpt( int $post_id ): string {
    $excerpt = has_excerpt( $post_id )
        ? get_the_excerpt( $post_id )
        : wp_trim_words( wp_strip_all_tags( strip_shortcodes( get_post_field( 'post_content', $post_id ) ) ), 32, '' );

    return trim( $excerpt );
}

function cc_schema_numeric_price( string $price ): string {
    $western = strtr( $price, [
        '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4',
        '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
        '٫' => '.', '٬' => ',',
    ] );
    $numeric = preg_replace( '/[^\d.]/', '', str_replace( ',', '', $western ) );
    return is_numeric( $numeric ) ? $numeric : '';
}

function cc_rank_math_provider_schema(): array {
    $same_as = array_values( array_filter( [
        cc_theme_get( 'social_facebook' ),
        cc_theme_get( 'social_linkedin' ),
        cc_theme_get( 'social_instagram' ),
        cc_theme_get( 'social_twitter' ),
        cc_theme_get( 'social_youtube' ),
    ] ) );

    $schema = [
        '@type' => 'Organization',
        'name'  => cc_theme_get( 'agency_name', get_bloginfo( 'name' ) ),
        'url'   => home_url( '/' ),
    ];

    if ( $same_as ) {
        $schema['sameAs'] = $same_as;
    }

    return $schema;
}

function cc_schema_has_type( array $data, string $type ): bool {
    foreach ( $data as $item ) {
        if ( ! is_array( $item ) ) {
            continue;
        }

        $item_type = $item['@type'] ?? '';
        if ( is_array( $item_type ) && in_array( $type, $item_type, true ) ) {
            return true;
        }
        if ( is_string( $item_type ) && strcasecmp( $item_type, $type ) === 0 ) {
            return true;
        }
    }

    return false;
}

add_filter( 'rank_math/json_ld', function ( array $data ): array {
    if ( ( is_front_page() || is_page( [ 'contact', 'about-us' ] ) ) && ! cc_schema_has_type( $data, 'LocalBusiness' ) ) {
        $phone   = cc_theme_get( 'phone', '+20 111 20 26 9 22' );
        $email   = cc_theme_get( 'email', 'info@creativecode.com.eg' );
        $address = cc_theme_get( 'address', 'الزقازيق — محافظة الشرقية' );

        $data['cc_local_business'] = array_filter( [
            '@type'       => 'LocalBusiness',
            '@id'         => home_url( '/#localbusiness' ),
            'name'        => cc_theme_get( 'agency_name', get_bloginfo( 'name' ) ),
            'url'         => home_url( '/' ),
            'telephone'   => $phone,
            'email'       => $email,
            'address'     => [
                '@type'           => 'PostalAddress',
                'streetAddress'   => $address,
                'addressCountry'  => 'EG',
            ],
            'areaServed'  => [ 'مصر', 'السعودية', 'الإمارات', 'الشرق الأوسط' ],
            'sameAs'      => cc_rank_math_provider_schema()['sameAs'] ?? [],
        ] );
    }

    if ( is_page( 'contact' ) && ! cc_schema_has_type( $data, 'FAQPage' ) ) {
        $faqs = cc_get_faq_items( get_queried_object_id(), [
            [ 'question' => 'كم يستغرق المشروع النموذجي؟', 'answer' => 'معظم المواقع ومتاجر التجارة الإلكترونية 3–6 أسابيع. منصات التعلم الإلكتروني 4–8 أسابيع. تطبيقات ERP 6–12 أسبوعاً.' ],
            [ 'question' => 'هل تعملون مع عملاء خارج مصر؟', 'answer' => 'بالتأكيد. معظم عملائنا في السعودية والإمارات والمملكة المتحدة. نعمل بالكامل عن بُعد.' ],
            [ 'question' => 'ماذا يتضمن الدعم بعد الإطلاق؟', 'answer' => 'جميع المشاريع تتضمن 3 أشهر من الدعم — إصلاح الأخطاء والتحديثات البسيطة وصيانة الإضافات.' ],
            [ 'question' => 'هل تبنون بالعربية RTL؟', 'answer' => 'نعم — العربية RTL كفاءة جوهرية لدينا. ننفذ تخطيطات RTL كاملة ونراعي تجربة المستخدم العربية.' ],
        ] );

        $data['cc_contact_faq'] = [
            '@type'      => 'FAQPage',
            '@id'        => get_permalink() . '#faq',
            'mainEntity' => array_map( fn( $faq ) => [
                '@type'          => 'Question',
                'name'           => $faq['question'],
                'acceptedAnswer' => [
                    '@type' => 'Answer',
                    'text'  => $faq['answer'],
                ],
            ], $faqs ),
        ];
    }

    if ( is_singular( 'cc_package' ) && ! cc_schema_has_type( $data, 'FAQPage' ) ) {
        $package_faqs = cc_get_faq_items( get_queried_object_id(), [
            [ 'question' => 'هل السعر نهائي؟', 'answer' => 'السعر المعروض نقطة بداية. نراجع التفاصيل أولاً ثم نثبت النطاق والتكلفة قبل التنفيذ.' ],
            [ 'question' => 'هل يمكن تعديل مكونات الباقة؟', 'answer' => 'نعم، الباقة مرنة حسب حجم المشروع والأولويات، لكننا نحافظ على نطاق واضح لتجنب التشتت.' ],
            [ 'question' => 'متى يبدأ التنفيذ؟', 'answer' => 'بعد استلام الطلب ومراجعة التفاصيل، نرسل خطة تنفيذ وجدولاً واضحاً للموافقة.' ],
            [ 'question' => 'هل تشمل الباقة المحتوى؟', 'answer' => 'يمكن تضمين المحتوى أو مراجعته حسب الاتفاق وطبيعة المشروع.' ],
            [ 'question' => 'هل تناسب إعلانات Google؟', 'answer' => 'نعم، صفحة الباقة نفسها مصممة لتكون مناسبة كصفحة هبوط بدون تعقيد زائد.' ],
            [ 'question' => 'ماذا يحدث بعد إرسال النموذج؟', 'answer' => 'نراجع الطلب ونعود إليك خلال 24 ساعة بتوصية واضحة وخطوة تالية.' ],
        ] );

        $data['cc_package_faq'] = [
            '@type'      => 'FAQPage',
            '@id'        => get_permalink() . '#package-faq',
            'mainEntity' => array_map( fn( $faq ) => [
                '@type'          => 'Question',
                'name'           => $faq['question'],
                'acceptedAnswer' => [
                    '@type' => 'Answer',
                    'text'  => $faq['answer'],
                ],
            ], $package_faqs ),
        ];
    }

    if ( ! is_singular( [ 'cc_service', 'cc_package' ] ) ) {
        return $data;
    }

    $post_id   = get_queried_object_id();
    $permalink = get_permalink( $post_id );
    $image     = get_the_post_thumbnail_url( $post_id, 'full' );
    $desc      = cc_schema_excerpt( $post_id );

    if ( is_singular( 'cc_service' ) ) {
        $price = get_post_meta( $post_id, 'service_starting_price', true ) ?: get_post_meta( $post_id, 'service_price', true );

        $schema = [
            '@type'       => 'Service',
            '@id'         => trailingslashit( $permalink ) . '#service',
            'name'        => get_the_title( $post_id ),
            'url'         => $permalink,
            'description' => $desc,
            'provider'    => cc_rank_math_provider_schema(),
            'areaServed'  => 'مصر والشرق الأوسط',
        ];

        if ( $image ) {
            $schema['image'] = $image;
        }

        $numeric_price = cc_schema_numeric_price( (string) $price );
        if ( $numeric_price !== '' ) {
            $schema['offers'] = [
                '@type'         => 'Offer',
                'url'           => $permalink,
                'price'         => $numeric_price,
                'priceCurrency' => 'EGP',
                'availability'  => 'https://schema.org/InStock',
            ];
        }

        $data['cc_service_entity'] = array_filter( $schema );
    }

    if ( is_singular( 'cc_package' ) ) {
        $price = get_post_meta( $post_id, 'package_price', true );

        $schema = [
            '@type'       => 'Product',
            '@id'         => trailingslashit( $permalink ) . '#package',
            'name'        => get_the_title( $post_id ),
            'url'         => $permalink,
            'description' => $desc,
            'category'    => 'باقة خدمات رقمية',
            'brand'       => cc_rank_math_provider_schema(),
        ];

        if ( $image ) {
            $schema['image'] = $image;
        }

        $numeric_price = cc_schema_numeric_price( (string) $price );
        if ( $numeric_price !== '' ) {
            $schema['offers'] = [
                '@type'         => 'Offer',
                'url'           => $permalink,
                'price'         => $numeric_price,
                'priceCurrency' => 'EGP',
                'availability'  => 'https://schema.org/InStock',
            ];
        }

        $data['cc_package_entity'] = array_filter( $schema );
    }

    return $data;
}, 99 );

/* ============================================================
   COMMENT REPLY LINK CLASS (inherited)
   ============================================================ */

add_filter( 'comment_reply_link', function ( $link ) {
    return str_replace( "class='comment-reply-link", "class='comment-reply-link cc-comment-reply-link", $link );
} );

/* ============================================================
   IMAGE SIZES
   ============================================================ */

add_image_size( 'cc-card',    640, 400, true );
add_image_size( 'cc-hero',   1440, 700, true );
add_image_size( 'cc-thumb',   400, 300, true );
add_image_size( 'cc-avatar',  150, 150, true );
