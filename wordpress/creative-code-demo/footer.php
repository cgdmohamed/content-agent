<?php
/**
 * Footer — closes the page wrapper.
 *
 * @package CreativeCode
 */
$cc_bare = is_singular() && get_post_meta( get_the_ID(), '_use_custom_layout', true );
?>
</main>
<?php if ( ! $cc_bare ) { cc_footer(); } ?>
</div>
<?php wp_footer(); ?>
</body>
</html>
