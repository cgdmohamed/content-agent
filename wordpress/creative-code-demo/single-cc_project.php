<?php
/**
 * Single case study (demo: single-case-study.html). Body = post content (challenge / what we did);
 * results come from the "ملخص النتائج" meta.
 *
 * @package CreativeCode
 */
get_header();
while ( have_posts() ) :
	the_post();
	$c       = cc_case_from_post( get_post() );
	$date    = get_post_meta( get_the_ID(), 'project_date', true );
	$ext     = get_post_meta( get_the_ID(), 'project_url', true );
	$result  = get_post_meta( get_the_ID(), 'project_result_summary', true );
	$facts   = array_filter( [ 'العميل' => $c['client'], 'القطاع' => $c['sector'], 'السوق' => $c['country'], 'الخدمات' => implode( '، ', $c['services'] ) ] );
	$next    = get_adjacent_post( false, '', false ) ?: get_adjacent_post( false, '', true );
	?>
<header class="pt-36 pb-16 px-6"><div class="max-w-7xl mx-auto space-y-8">
<?php cc_breadcrumbs( [ [ 'أعمالنا', cc_url( 'work' ) ], [ $c['client'], '' ] ] ); ?>
<div class="flex flex-wrap gap-2"><?php foreach ( $c['services'] as $s ) : ?><span class="text-xs font-bold px-3 py-1 rounded-full bg-accent/10 text-accent"><?php echo esc_html( $s ); ?></span><?php endforeach; ?></div>
<h1 class="text-5xl md:text-7xl font-extrabold tracking-tighter leading-tight"><?php echo esc_html( $c['client'] ); ?></h1>
<?php if ( $c['summary'] ) : ?><p class="text-xl md:text-2xl text-gray-500 max-w-3xl leading-relaxed"><?php echo esc_html( $c['summary'] ); ?></p><?php endif; ?>
<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 pt-8 border-t border-gray-100"><?php foreach ( $facts as $k => $v ) : ?><div><div class="text-sm text-gray-400 mb-1"><?php echo esc_html( $k ); ?></div><div class="font-bold text-lg"><?php echo esc_html( $v ); ?></div></div><?php endforeach; ?></div>
</div></header>
<?php if ( has_post_thumbnail() ) : ?><div class="px-6"><div class="max-w-7xl mx-auto aspect-[21/9] rounded-[3rem] overflow-hidden bg-dark"><?php the_post_thumbnail( 'full', [ 'class' => 'w-full h-full object-cover opacity-90', 'alt' => esc_attr( $c['client'] ) ] ); ?></div></div><?php endif; ?>
<?php
// Body: each <h2> becomes a demo-style two-column section (title left, text right); lists get check icons.
$parts = preg_split( '#(?=<h2[^>]*>)#i', apply_filters( 'the_content', get_the_content() ), -1, PREG_SPLIT_NO_EMPTY );
$n     = 0;
foreach ( $parts as $part ) :
	$title = '';
	if ( preg_match( '#^<h2[^>]*>(.*?)</h2>#is', $part, $m ) ) {
		$title = wp_strip_all_tags( $m[1] );
		$part  = substr( $part, strlen( $m[0] ) );
	}
	$part = preg_replace_callback( '#<li>(.*?)</li>#is', fn( $li ) => '<li class="flex items-start gap-3">' . cc_icon( 'lucide:check-circle-2', 'text-accent text-2xl shrink-0' ) . '<span>' . $li[1] . '</span></li>', $part );
	$part = preg_replace( '#<ul>#i', '<ul class="space-y-5 text-lg text-dark list-none !p-0">', $part );
	?>
<section class="py-24 px-6 <?php echo $n % 2 ? 'bg-gray-50' : ''; ?>"><div class="max-w-5xl mx-auto grid md:grid-cols-3 gap-12">
  <div><?php echo $title ? cc_eyebrow( $title ) : ''; ?></div>
  <div class="md:col-span-2 space-y-4 text-lg text-gray-600 leading-relaxed"><?php echo $part; // phpcs:ignore -- the_content output ?></div>
</div></section>
	<?php $n++;
endforeach;
if ( $ext ) : ?><section class="pb-12 px-6"><div class="max-w-5xl mx-auto"><a href="<?php echo esc_url( $ext ); ?>" target="_blank" rel="noopener" class="text-accent font-bold">زيارة المشروع ↗</a></div></section><?php endif; ?>
<?php if ( $result ) : ?>
<section class="py-24 px-6 bg-navy text-white"><div class="max-w-5xl mx-auto"><div class="mb-12"><?php echo cc_eyebrow( 'النتائج' ); ?><h2 class="text-4xl font-extrabold mt-4">الأرقام</h2></div>
<div class="grid md:grid-cols-3 gap-6"><?php foreach ( cc_meta_lines( $result ) as $ln ) : $p = array_map( 'trim', explode( '|', $ln, 2 ) ); ?>
  <div class="bg-white/5 border border-white/10 rounded-3xl p-8 text-center"><?php if ( isset( $p[1] ) ) : ?><div class="text-5xl font-black text-accent"><?php echo esc_html( $p[1] ); ?></div><div class="text-gray-400 mt-3"><?php echo esc_html( $p[0] ); ?></div><?php else : ?><div class="text-gray-200"><?php echo esc_html( $p[0] ); ?></div><?php endif; ?></div>
<?php endforeach; ?></div></div></section>
<?php endif; ?>
<?php if ( $next ) : ?>
<section class="py-16 px-6"><div class="max-w-7xl mx-auto"><a href="<?php echo esc_url( get_permalink( $next ) ); ?>" class="group flex flex-col md:flex-row items-center justify-between gap-6 bg-gray-50 rounded-[2.5rem] p-10 hover:bg-accent hover:text-white transition-all">
<div><span class="text-sm font-bold opacity-60">دراسة الحالة التالية</span><h3 class="text-3xl font-extrabold mt-2"><?php echo esc_html( get_the_title( $next ) ); ?></h3></div><?php echo cc_icon( 'lucide:arrow-left', 'text-4xl group-hover:-translate-x-2 transition-transform' ); ?></a></div></section>
<?php endif;
	cc_cta_band( 'عايز نتائج زي دي لنشاطك؟', 'كلمنا ونرسم معاك خطة مناسبة لقطاعك.' );
endwhile;
get_footer();
