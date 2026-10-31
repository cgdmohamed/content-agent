<?php
/**
 * Contact page (slug: contact) — the same contact block used on the home page.
 *
 * @package CreativeCode
 */
get_header();
cc_page_header( 'تواصل معنا', 'خلّينا نبدأ<br><span class="text-accent">مشروعك</span>', 'اترك بياناتك أو كلمنا مباشرة على واتساب — نرد عليك بخطة واضحة وسعر مناسب.' );
cc_contact_section();
get_footer();
