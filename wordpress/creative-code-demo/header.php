<?php
/**
 * Header — opens the page wrapper and prints the navigation.
 *
 * @package CreativeCode
 */
$cc_bare = is_singular() && get_post_meta( get_the_ID(), '_use_custom_layout', true ); // legacy "landing layout" page toggle
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[60] bg-white px-4 py-2 rounded-xl">تخطَّ إلى المحتوى</a>
<div class="relative w-full min-h-screen">
<?php if ( ! $cc_bare ) { cc_nav(); } ?>
<main id="main">
