<?php
/**
 * Custom Post Types & Taxonomies — Creative Code 2026
 *
 * IMPORTANT: All existing slugs are preserved exactly:
 *   cc_service    → /services/
 *   cc_package    → /packages/
 *   cc_project    → /projects/
 *   cc_team       → /team/
 *   cc_testimonial (private, no archive)
 *   cc_job        → /jobs/
 *
 * NEW in 2026:
 *   cc_blog_post  → /insights/  (used for future marketing articles distinct from WP posts)
 *
 * @package CreativeCode2026
 */

if ( ! defined( 'ABSPATH' ) ) exit;

/* ============================================================
   REGISTER POST TYPES
   ============================================================ */

add_action( 'init', 'cc_register_post_types', 5 );

function cc_register_post_types() {

    /* ── SERVICES ─────────────────────────────────────────────────────────── */
    register_post_type( 'cc_service', [
        'labels' => [
            'name'               => 'الخدمات',
            'singular_name'      => 'خدمة',
            'add_new'            => 'إضافة خدمة جديدة',
            'add_new_item'       => 'إضافة خدمة جديدة',
            'edit_item'          => 'تحرير الخدمة',
            'new_item'           => 'خدمة جديدة',
            'view_item'          => 'عرض الخدمة',
            'search_items'       => 'البحث في الخدمات',
            'not_found'          => 'لم يتم العثور على خدمات',
            'not_found_in_trash' => 'لم يتم العثور على خدمات في المهملات',
        ],
        'public'        => true,
        'has_archive'   => true,
        'rewrite'       => [ 'slug' => 'services', 'with_front' => false ],
        'supports'      => [ 'title', 'editor', 'excerpt', 'thumbnail', 'custom-fields', 'page-attributes' ],
        'menu_icon'     => 'dashicons-admin-tools',
        'show_in_rest'  => true,
        'menu_position' => 20,
    ] );

    /* ── PACKAGES ─────────────────────────────────────────────────────────── */
    register_post_type( 'cc_package', [
        'labels' => [
            'name'               => 'الباقات',
            'singular_name'      => 'باقة',
            'add_new'            => 'إضافة باقة جديدة',
            'add_new_item'       => 'إضافة باقة جديدة',
            'edit_item'          => 'تحرير الباقة',
            'new_item'           => 'باقة جديدة',
            'view_item'          => 'عرض الباقة',
            'search_items'       => 'البحث في الباقات',
            'not_found'          => 'لم يتم العثور على باقات',
            'not_found_in_trash' => 'لم يتم العثور على باقات في المهملات',
        ],
        'public'        => true,
        'has_archive'   => true,
        'rewrite'       => [ 'slug' => 'packages', 'with_front' => false ],
        'supports'      => [ 'title', 'editor', 'excerpt', 'thumbnail', 'custom-fields', 'page-attributes' ],
        'menu_icon'     => 'dashicons-cart',
        'show_in_rest'  => true,
        'menu_position' => 21,
    ] );

    /* ── PROJECTS / PORTFOLIO ─────────────────────────────────────────────── */
    register_post_type( 'cc_project', [
        'labels' => [
            'name'               => 'المشاريع',
            'singular_name'      => 'مشروع',
            'add_new'            => 'إضافة مشروع جديد',
            'add_new_item'       => 'إضافة مشروع جديد',
            'edit_item'          => 'تحرير المشروع',
            'new_item'           => 'مشروع جديد',
            'view_item'          => 'عرض المشروع',
            'search_items'       => 'البحث في المشاريع',
            'not_found'          => 'لم يتم العثور على مشاريع',
            'not_found_in_trash' => 'لم يتم العثور على مشاريع في المهملات',
        ],
        'public'        => true,
        'has_archive'   => true,
        'rewrite'       => [ 'slug' => 'projects', 'with_front' => false ],
        'supports'      => [ 'title', 'editor', 'excerpt', 'thumbnail', 'custom-fields', 'page-attributes' ],
        'menu_icon'     => 'dashicons-portfolio',
        'show_in_rest'  => true,
        'menu_position' => 21,
    ] );

    /* ── TEAM MEMBERS ─────────────────────────────────────────────────────── */
    register_post_type( 'cc_team', [
        'labels' => [
            'name'               => 'فريق العمل',
            'singular_name'      => 'عضو فريق',
            'add_new'            => 'إضافة عضو جديد',
            'add_new_item'       => 'إضافة عضو فريق جديد',
            'edit_item'          => 'تحرير عضو الفريق',
            'new_item'           => 'عضو فريق جديد',
            'view_item'          => 'عرض عضو الفريق',
            'search_items'       => 'البحث في أعضاء الفريق',
            'not_found'          => 'لم يتم العثور على أعضاء فريق',
            'not_found_in_trash' => 'لم يتم العثور على أعضاء فريق في المهملات',
        ],
        'public'        => true,
        'has_archive'   => true,
        'rewrite'       => [ 'slug' => 'team', 'with_front' => false ],
        'supports'      => [ 'title', 'editor', 'excerpt', 'thumbnail', 'custom-fields' ],
        'menu_icon'     => 'dashicons-groups',
        'show_in_rest'  => true,
        'menu_position' => 22,
    ] );

    /* ── TESTIMONIALS (no public archive — private CPT) ──────────────────── */
    register_post_type( 'cc_testimonial', [
        'labels' => [
            'name'               => 'آراء العملاء',
            'singular_name'      => 'رأي عميل',
            'add_new'            => 'إضافة رأي جديد',
            'add_new_item'       => 'إضافة رأي عميل جديد',
            'edit_item'          => 'تحرير رأي العميل',
            'new_item'           => 'رأي عميل جديد',
            'view_item'          => 'عرض رأي العميل',
            'search_items'       => 'البحث في آراء العملاء',
            'not_found'          => 'لم يتم العثور على آراء عملاء',
            'not_found_in_trash' => 'لم يتم العثور على آراء عملاء في المهملات',
        ],
        'public'        => false,
        'show_ui'       => true,
        'has_archive'   => false,
        'supports'      => [ 'title', 'editor', 'thumbnail' ],
        'menu_icon'     => 'dashicons-format-quote',
        'show_in_rest'  => true,
        'menu_position' => 23,
    ] );

    /* ── JOBS ─────────────────────────────────────────────────────────────── */
    register_post_type( 'cc_job', [
        'labels' => [
            'name'               => 'الوظائف',
            'singular_name'      => 'وظيفة',
            'add_new'            => 'إضافة وظيفة جديدة',
            'add_new_item'       => 'إضافة وظيفة جديدة',
            'edit_item'          => 'تحرير الوظيفة',
            'new_item'           => 'وظيفة جديدة',
            'view_item'          => 'عرض الوظيفة',
            'search_items'       => 'البحث في الوظائف',
            'not_found'          => 'لم يتم العثور على وظائف',
            'not_found_in_trash' => 'لم يتم العثور على وظائف في المهملات',
        ],
        'public'        => true,
        'has_archive'   => true,
        'rewrite'       => [ 'slug' => 'jobs', 'with_front' => false ],
        'supports'      => [ 'title', 'editor', 'excerpt', 'thumbnail', 'custom-fields' ],
        'menu_icon'     => 'dashicons-businessman',
        'show_in_rest'  => true,
        'menu_position' => 24,
    ] );

    /* ── BLOG / INSIGHTS (NEW — separate from native WP posts) ───────────── */
    }

/* ============================================================
   REGISTER TAXONOMIES
   ============================================================ */

add_action( 'init', 'cc_register_taxonomies', 6 );

function cc_register_taxonomies() {

    /* ── SERVICE CATEGORIES ───────────────────────────────────────────────── */
    register_taxonomy( 'service_category', 'cc_service', [
        'labels' => [
            'name'          => 'تصنيفات الخدمات',
            'singular_name' => 'تصنيف خدمة',
            'add_new_item'  => 'إضافة تصنيف جديد',
            'edit_item'     => 'تحرير التصنيف',
            'new_item_name' => 'اسم التصنيف الجديد',
        ],
        'hierarchical'       => true,
        'show_admin_column'  => true,
        'show_in_rest'       => true,
        'rewrite'            => [ 'slug' => 'service-category', 'with_front' => false ],
    ] );

    /* ── PACKAGE CATEGORIES ───────────────────────────────────────────────── */
    register_taxonomy( 'package_category', 'cc_package', [
        'labels' => [
            'name'          => 'تصنيفات الباقات',
            'singular_name' => 'تصنيف باقة',
            'add_new_item'  => 'إضافة تصنيف جديد',
            'edit_item'     => 'تحرير التصنيف',
            'new_item_name' => 'اسم التصنيف الجديد',
        ],
        'hierarchical'       => true,
        'show_admin_column'  => true,
        'show_in_rest'       => true,
        'rewrite'            => [ 'slug' => 'package-category', 'with_front' => false ],
    ] );

    /* ── PROJECT CATEGORIES ───────────────────────────────────────────────── */
    register_taxonomy( 'project_category', 'cc_project', [
        'labels' => [
            'name'          => 'تصنيفات المشاريع',
            'singular_name' => 'تصنيف مشروع',
            'add_new_item'  => 'إضافة تصنيف جديد',
            'edit_item'     => 'تحرير التصنيف',
            'new_item_name' => 'اسم التصنيف الجديد',
        ],
        'hierarchical'       => true,
        'show_admin_column'  => true,
        'show_in_rest'       => true,
        'rewrite'            => [ 'slug' => 'project-category', 'with_front' => false ],
    ] );

    /* ── PROJECT TAGS ─────────────────────────────────────────────────────── */
    register_taxonomy( 'project_tag', 'cc_project', [
        'labels' => [
            'name'          => 'كلمات مفتاحية للمشاريع',
            'singular_name' => 'كلمة مفتاحية',
            'add_new_item'  => 'إضافة كلمة مفتاحية جديدة',
            'edit_item'     => 'تحرير الكلمة المفتاحية',
            'new_item_name' => 'اسم الكلمة المفتاحية الجديدة',
        ],
        'hierarchical'       => false,
        'show_admin_column'  => true,
        'show_in_rest'       => true,
        'rewrite'            => [ 'slug' => 'project-tag', 'with_front' => false ],
    ] );

    /* ── JOB CATEGORIES ───────────────────────────────────────────────────── */
    register_taxonomy( 'job_category', 'cc_job', [
        'labels' => [
            'name'          => 'تصنيفات الوظائف',
            'singular_name' => 'تصنيف وظيفة',
            'add_new_item'  => 'إضافة تصنيف جديد',
            'edit_item'     => 'تحرير التصنيف',
            'new_item_name' => 'اسم التصنيف الجديد',
        ],
        'hierarchical'       => true,
        'show_admin_column'  => true,
        'show_in_rest'       => true,
        'rewrite'            => [ 'slug' => 'job-category', 'with_front' => false ],
    ] );

    /* ── JOB TYPES ────────────────────────────────────────────────────────── */
    register_taxonomy( 'job_type', 'cc_job', [
        'labels' => [
            'name'          => 'أنواع الوظائف',
            'singular_name' => 'نوع وظيفة',
            'add_new_item'  => 'إضافة نوع جديد',
            'edit_item'     => 'تحرير النوع',
            'new_item_name' => 'اسم النوع الجديد',
        ],
        'hierarchical'       => false,
        'show_admin_column'  => true,
        'show_in_rest'       => true,
        'rewrite'            => [ 'slug' => 'job-type', 'with_front' => false ],
    ] );

    /* ── INSIGHT (BLOG) CATEGORIES — NEW ─────────────────────────────────── */
    
    /* ── INSIGHT (BLOG) TAGS — NEW ────────────────────────────────────────── */
    }

/* The old WP_Query helper functions (cc_get_services, cc_get_packages, …) were replaced by inc/data.php. */
