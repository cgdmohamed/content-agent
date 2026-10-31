<?php
/**
 * Safe content importer / exporter (Appearance → استيراد وتصدير المحتوى).
 *
 * Safety model:
 *  - admin only (manage_options) + nonces; JSON only, ≤ 2 MB, ≤ 500 items, whitelisted post types / meta keys / taxonomies
 *  - nothing is written on upload: a dry-run plan (create / update / unchanged, with field diffs) is shown first
 *  - new items are created as drafts unless the file says otherwise; items are matched by type + slug, never deleted
 *  - before applying, every item that will change is snapshotted; one click restores it (created items go to the trash)
 *  - no remote fetching (no image URLs) — files can't make the server request anything
 *
 * @package CreativeCode
 */

if ( ! defined( 'ABSPATH' ) ) exit;

const CC_IMP_VERSION   = 1;
const CC_IMP_MAX_BYTES = 2097152;
const CC_IMP_MAX_ITEMS = 500;
const CC_IMP_TYPES     = [ 'cc_service', 'cc_project', 'cc_package', 'cc_testimonial', 'page', 'post' ];
const CC_IMP_TAX       = [ 'project_category', 'project_tag', 'service_category', 'package_category', 'category', 'post_tag' ];

add_action( 'admin_menu', function () {
	add_theme_page( 'استيراد وتصدير المحتوى', 'استيراد وتصدير المحتوى', 'manage_options', 'cc-content-tools', 'cc_imp_render' );
} );

add_action( 'admin_post_cc_export', function () {
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( 'غير مسموح', '', [ 'response' => 403 ] );
	}
	check_admin_referer( 'cc_export' );
	nocache_headers();
	header( 'Content-Type: application/json; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename="creative-code-content-' . gmdate( 'Ymd-His' ) . '.json"' );
	echo wp_json_encode( cc_imp_export(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT );
	exit;
} );

/* ------------------------------------------------------------ whitelist */

function cc_imp_meta_key_ok( string $k ): bool {
	return (bool) preg_match( '/^(service|package|project|client|lp|pkg|member)_[a-z0-9_]+$/', $k ) || in_array( $k, [ 'rating', 'cc_faq_items' ], true );
}

function cc_imp_clean_meta( string $k, $v ) {
	if ( $k === 'cc_faq_items' ) {
		$out = [];
		foreach ( is_array( $v ) ? $v : [] as $i ) {
			$q = sanitize_text_field( (string) ( $i['question'] ?? '' ) );
			$a = sanitize_textarea_field( (string) ( $i['answer'] ?? '' ) );
			if ( $q !== '' && $a !== '' ) {
				$out[] = [ 'question' => $q, 'answer' => $a ];
			}
		}
		return $out;
	}
	if ( ! is_scalar( $v ) ) {
		return null;
	}
	if ( preg_match( '/_(url)$/', $k ) ) {
		return esc_url_raw( (string) $v );
	}
	return sanitize_textarea_field( (string) $v );
}

/* ------------------------------------------------------------ export */

function cc_imp_export(): array {
	$items = [];
	foreach ( CC_IMP_TYPES as $type ) {
		$posts = get_posts( [ 'post_type' => $type, 'post_status' => [ 'publish', 'draft', 'pending', 'private' ], 'posts_per_page' => -1, 'orderby' => 'menu_order title', 'order' => 'ASC', 'suppress_filters' => true ] );
		foreach ( $posts as $p ) {
			$meta = [];
			foreach ( get_post_meta( $p->ID ) as $k => $vals ) {
				if ( cc_imp_meta_key_ok( $k ) ) {
					$meta[ $k ] = maybe_unserialize( $vals[0] );
				}
			}
			$terms = [];
			foreach ( CC_IMP_TAX as $tax ) {
				if ( is_object_in_taxonomy( $type, $tax ) ) {
					$t = wp_get_object_terms( $p->ID, $tax, [ 'fields' => 'names' ] );
					if ( $t && ! is_wp_error( $t ) ) {
						$terms[ $tax ] = $t;
					}
				}
			}
			$items[] = [ 'type' => $type, 'slug' => $p->post_name, 'status' => $p->post_status, 'title' => $p->post_title, 'excerpt' => $p->post_excerpt, 'content' => $p->post_content, 'menu_order' => (int) $p->menu_order, 'meta' => $meta, 'terms' => $terms ];
		}
	}
	$opts = get_option( 'cc_theme_options', [] );
	return [ 'version' => CC_IMP_VERSION, 'exported' => gmdate( 'c' ), 'site' => home_url(), 'settings' => is_array( $opts ) ? $opts : [], 'items' => $items ];
}

/* ------------------------------------------------------------ parse + plan */

/** @return array{0:array,1:array} [items, errors] */
function cc_imp_parse( string $json ): array {
	$errors = [];
	if ( strlen( $json ) > CC_IMP_MAX_BYTES ) {
		return [ [ 'items' => [], 'settings' => [] ], [ 'الملف أكبر من 2 ميجابايت.' ] ];
	}
	$data = json_decode( $json, true );
	if ( ! is_array( $data ) || ( $data['version'] ?? 0 ) !== CC_IMP_VERSION ) {
		return [ [ 'items' => [], 'settings' => [] ], [ 'ملف غير صالح: يجب أن يكون JSON بصيغة النسخة ' . CC_IMP_VERSION . '.' ] ];
	}
	$raw_items = is_array( $data['items'] ?? null ) ? $data['items'] : [];
	if ( count( $raw_items ) > CC_IMP_MAX_ITEMS ) {
		return [ [ 'items' => [], 'settings' => [] ], [ 'عدد العناصر أكبر من ' . CC_IMP_MAX_ITEMS . '.' ] ];
	}
	$items = [];
	$seen  = [];
	foreach ( $raw_items as $n => $r ) {
		$label = '#' . ( $n + 1 );
		$type  = is_array( $r ) ? (string) ( $r['type'] ?? '' ) : '';
		$slug  = is_array( $r ) ? sanitize_title( (string) ( $r['slug'] ?? '' ) ) : '';
		if ( ! in_array( $type, CC_IMP_TYPES, true ) || $slug === '' ) {
			$errors[] = "العنصر $label: النوع أو الرابط المختصر غير صالح — تم تجاهله.";
			continue;
		}
		if ( isset( $seen[ $type . ':' . $slug ] ) ) {
			$errors[] = "العنصر $label: مكرر ($type/$slug) — تم تجاهله.";
			continue;
		}
		$seen[ $type . ':' . $slug ] = 1;
		$item = [ 'type' => $type, 'slug' => $slug, 'fields' => [], 'meta' => [], 'terms' => [] ];
		if ( isset( $r['title'] ) )      $item['fields']['post_title']   = sanitize_text_field( (string) $r['title'] );
		if ( isset( $r['excerpt'] ) )    $item['fields']['post_excerpt'] = sanitize_textarea_field( (string) $r['excerpt'] );
		if ( isset( $r['content'] ) )    $item['fields']['post_content'] = wp_kses_post( (string) $r['content'] );
		if ( isset( $r['menu_order'] ) ) $item['fields']['menu_order']   = (int) $r['menu_order'];
		if ( isset( $r['status'] ) && in_array( $r['status'], [ 'publish', 'draft', 'pending', 'private' ], true ) ) $item['fields']['post_status'] = $r['status'];
		foreach ( is_array( $r['meta'] ?? null ) ? $r['meta'] : [] as $k => $v ) {
			$k = (string) $k;
			if ( ! cc_imp_meta_key_ok( $k ) ) {
				$errors[] = "العنصر $label ($slug): حقل غير مسموح «{$k}» — تم تجاهله.";
				continue;
			}
			$c = cc_imp_clean_meta( $k, $v );
			if ( $c !== null ) $item['meta'][ $k ] = $c;
		}
		foreach ( is_array( $r['terms'] ?? null ) ? $r['terms'] : [] as $tax => $names ) {
			if ( in_array( $tax, CC_IMP_TAX, true ) && is_object_in_taxonomy( $type, $tax ) && is_array( $names ) ) {
				$item['terms'][ $tax ] = array_values( array_filter( array_map( 'sanitize_text_field', array_map( 'strval', $names ) ) ) );
			}
		}
		$items[] = $item;
	}
	$settings = [];
	if ( is_array( $data['settings'] ?? null ) ) {
		foreach ( $data['settings'] as $k => $v ) {
			if ( is_string( $k ) && is_scalar( $v ) ) $settings[ $k ] = (string) $v;
		}
	}
	return [ [ 'items' => $items, 'settings' => $settings ], $errors ];
}

function cc_imp_find( string $type, string $slug ): ?WP_Post {
	$f = get_posts( [ 'post_type' => $type, 'name' => $slug, 'post_status' => 'any', 'posts_per_page' => 1, 'suppress_filters' => true ] );
	return $f ? $f[0] : null;
}

function cc_imp_short( $v ): string {
	$s = is_scalar( $v ) || $v === null ? (string) $v : wp_json_encode( $v, JSON_UNESCAPED_UNICODE );
	return mb_strlen( $s ) > 90 ? mb_substr( $s, 0, 90 ) . '…' : $s;
}

/** Dry run: no writes. */
function cc_imp_plan( array $parsed ): array {
	$plan = [ 'items' => [], 'settings' => [], 'counts' => [ 'create' => 0, 'update' => 0, 'same' => 0 ] ];
	foreach ( $parsed['items'] as $it ) {
		$post    = cc_imp_find( $it['type'], $it['slug'] );
		$changes = [];
		if ( ! $post ) {
			$action = 'create';
		} else {
			foreach ( $it['fields'] as $k => $v ) {
				if ( (string) $post->$k !== (string) $v ) $changes[ $k ] = [ (string) $post->$k, (string) $v ];
			}
			foreach ( $it['meta'] as $k => $v ) {
				$old = maybe_unserialize( get_post_meta( $post->ID, $k, true ) );
				if ( wp_json_encode( $old ) !== wp_json_encode( $v ) && (string) ( is_scalar( $old ) ? $old : wp_json_encode( $old ) ) !== (string) ( is_scalar( $v ) ? $v : wp_json_encode( $v ) ) ) $changes[ 'meta:' . $k ] = [ $old, $v ];
			}
			foreach ( $it['terms'] as $tax => $names ) {
				$old = wp_get_object_terms( $post->ID, $tax, [ 'fields' => 'names' ] );
				$old = is_wp_error( $old ) ? [] : $old;
				$a = $old; $b = $names; sort( $a ); sort( $b );
				if ( $a !== $b ) $changes[ 'terms:' . $tax ] = [ implode( '، ', $old ), implode( '، ', $names ) ];
			}
			$action = $changes ? 'update' : 'same';
		}
		$plan['counts'][ $action ]++;
		$plan['items'][] = [ 'action' => $action, 'type' => $it['type'], 'slug' => $it['slug'], 'title' => $it['fields']['post_title'] ?? ( $post->post_title ?? $it['slug'] ), 'post_id' => $post->ID ?? 0, 'changes' => $changes, 'data' => $it ];
	}
	if ( $parsed['settings'] ) {
		$cur   = get_option( 'cc_theme_options', [] );
		$clean = cc_sanitize_options( $parsed['settings'] );
		foreach ( $clean as $k => $v ) {
			if ( ( $cur[ $k ] ?? '' ) !== $v ) $plan['settings'][ $k ] = [ $cur[ $k ] ?? '', $v ];
		}
	}
	return $plan;
}

/* ------------------------------------------------------------ apply + backup */

function cc_imp_snapshot( WP_Post $p, array $it ): array {
	$snap = [ 'post_id' => $p->ID, 'fields' => [], 'meta' => [], 'terms' => [] ];
	foreach ( [ 'post_title', 'post_excerpt', 'post_content', 'menu_order', 'post_status' ] as $f ) $snap['fields'][ $f ] = $p->$f;
	foreach ( array_keys( $it['meta'] ) as $k ) {
		$snap['meta'][ $k ] = metadata_exists( 'post', $p->ID, $k ) ? get_post_meta( $p->ID, $k, true ) : null;
	}
	foreach ( array_keys( $it['terms'] ) as $tax ) {
		$t = wp_get_object_terms( $p->ID, $tax, [ 'fields' => 'ids' ] );
		$snap['terms'][ $tax ] = is_wp_error( $t ) ? [] : $t;
	}
	return $snap;
}

function cc_imp_write( int $id, array $it ): void {
	if ( count( $it['fields'] ) ) {
		wp_update_post( wp_slash( [ 'ID' => $id ] + $it['fields'] ) );
	}
	foreach ( $it['meta'] as $k => $v ) update_post_meta( $id, $k, wp_slash( $v ) );
	foreach ( $it['terms'] as $tax => $names ) wp_set_object_terms( $id, $names, $tax );
}

function cc_imp_apply( array $plan ): array {
	$backup = [ 'id' => wp_generate_password( 12, false ), 'time' => time(), 'user' => get_current_user_id(), 'updated' => [], 'created' => [], 'settings' => null, 'rolled_back' => false ];
	foreach ( $plan['items'] as $row ) {
		$it = $row['data'];
		if ( $row['action'] === 'create' ) {
			$id = wp_insert_post( wp_slash( [ 'post_type' => $it['type'], 'post_name' => $it['slug'], 'post_status' => 'draft', 'post_title' => $it['slug'] ] + $it['fields'] ), true );
			if ( ! is_wp_error( $id ) && $id ) {
				$backup['created'][] = (int) $id;
				cc_imp_write( (int) $id, [ 'fields' => [], 'meta' => $it['meta'], 'terms' => $it['terms'] ] );
			}
		} elseif ( $row['action'] === 'update' ) {
			$p = get_post( $row['post_id'] );
			if ( $p ) {
				$backup['updated'][] = cc_imp_snapshot( $p, $it );
				cc_imp_write( $p->ID, $it );
			}
		}
	}
	if ( $plan['settings'] ) {
		$backup['settings'] = get_option( 'cc_theme_options', [] );
		update_option( 'cc_theme_options', cc_sanitize_options( array_map( fn( $c ) => $c[1], $plan['settings'] ) ) );
	}
	$all = get_option( 'cc_import_backups', [] );
	$all = array_slice( array_merge( [ $backup ], is_array( $all ) ? $all : [] ), 0, 5 );
	update_option( 'cc_import_backups', $all, false );
	if ( function_exists( 'cc_purge_page_cache' ) ) cc_purge_page_cache();
	return $backup;
}

function cc_imp_rollback( string $bid ): bool {
	$all = get_option( 'cc_import_backups', [] );
	foreach ( $all as $i => $b ) {
		if ( $b['id'] !== $bid || $b['rolled_back'] ) continue;
		foreach ( $b['updated'] as $s ) {
			if ( ! get_post( $s['post_id'] ) ) continue;
			wp_update_post( wp_slash( [ 'ID' => $s['post_id'] ] + $s['fields'] ) );
			foreach ( $s['meta'] as $k => $v ) {
				if ( $v === null ) delete_post_meta( $s['post_id'], $k ); else update_post_meta( $s['post_id'], $k, wp_slash( $v ) );
			}
			foreach ( $s['terms'] as $tax => $ids ) wp_set_object_terms( $s['post_id'], array_map( 'intval', $ids ), $tax );
		}
		foreach ( $b['created'] as $id ) wp_trash_post( (int) $id );
		if ( is_array( $b['settings'] ) ) update_option( 'cc_theme_options', $b['settings'] );
		$all[ $i ]['rolled_back'] = true;
		update_option( 'cc_import_backups', $all, false );
		if ( function_exists( 'cc_purge_page_cache' ) ) cc_purge_page_cache();
		return true;
	}
	return false;
}

/* ------------------------------------------------------------ admin page */

function cc_imp_render(): void {
	if ( ! current_user_can( 'manage_options' ) ) return;
	$notice = '';
	$plan   = null;
	$errors = [];
	$token  = '';
	$uid    = get_current_user_id();

	if ( $_SERVER['REQUEST_METHOD'] === 'POST' && isset( $_POST['cc_imp'] ) ) {
		check_admin_referer( 'cc_imp' );
		$do = sanitize_key( $_POST['cc_imp'] );
		if ( $do === 'preview' ) {
			$json = '';
			if ( ! empty( $_FILES['cc_file']['tmp_name'] ) && is_uploaded_file( $_FILES['cc_file']['tmp_name'] ) ) {
				$json = (string) file_get_contents( $_FILES['cc_file']['tmp_name'], false, null, 0, CC_IMP_MAX_BYTES + 1 );
			} elseif ( ! empty( $_POST['cc_json'] ) ) {
				$json = wp_unslash( $_POST['cc_json'] );
			}
			[ $parsed, $errors ] = cc_imp_parse( $json );
			$plan = cc_imp_plan( $parsed );
			if ( $plan['items'] || $plan['settings'] ) {
				$token = wp_generate_password( 16, false );
				set_transient( "cc_imp_{$uid}_{$token}", $plan, HOUR_IN_SECONDS );
			}
		} elseif ( $do === 'apply' ) {
			$tk   = sanitize_key( $_POST['token'] ?? '' );
			$plan = get_transient( "cc_imp_{$uid}_{$tk}" );
			if ( ! $plan ) {
				$notice = '<div class="notice notice-error"><p>انتهت صلاحية المعاينة. ارفع الملف مرة أخرى.</p></div>';
			} else {
				delete_transient( "cc_imp_{$uid}_{$tk}" );
				$b      = cc_imp_apply( $plan );
				$notice = '<div class="notice notice-success"><p>تم التطبيق: ' . count( $b['created'] ) . ' عنصر جديد (مسودات)، ' . count( $b['updated'] ) . ' عنصر محدّث. يمكنك التراجع من قائمة النسخ الاحتياطية أدناه.</p></div>';
				$plan   = null;
			}
		} elseif ( $do === 'rollback' ) {
			$notice = cc_imp_rollback( sanitize_key( $_POST['backup'] ?? '' ) )
				? '<div class="notice notice-success"><p>تم التراجع. العناصر الجديدة نُقلت إلى سلة المهملات.</p></div>'
				: '<div class="notice notice-error"><p>تعذّر التراجع.</p></div>';
		}
	}
	$labels = [ 'create' => 'إنشاء (مسودة)', 'update' => 'تحديث', 'same' => 'بدون تغيير' ];
	?>
<div class="wrap" dir="rtl">
	<h1>استيراد وتصدير المحتوى</h1>
	<?php echo $notice; // phpcs:ignore ?>
	<p>يدعم: الخدمات، دراسات الحالة، الباقات، آراء العملاء، الصفحات، المقالات، وإعدادات القالب. يُطابَق المحتوى بالنوع والرابط المختصر، ولا يُحذف شيء أبداً. تظهر معاينة كاملة قبل أي تعديل، وتُحفظ نسخة احتياطية يمكن التراجع عنها.</p>

	<h2>تصدير</h2>
	<p><a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=cc_export' ), 'cc_export' ) ); ?>">تنزيل ملف JSON بكل المحتوى الحالي</a> — يصلح كنسخة احتياطية وكقالب للصيغة.</p>

	<h2>استيراد</h2>
	<form method="post" enctype="multipart/form-data">
		<?php wp_nonce_field( 'cc_imp' ); ?><input type="hidden" name="cc_imp" value="preview">
		<p><input type="file" name="cc_file" accept="application/json,.json"> أو الصق JSON:</p>
		<p><textarea name="cc_json" rows="6" class="large-text code" dir="ltr"></textarea></p>
		<p><button class="button button-primary">معاينة (لن يُكتب شيء)</button></p>
	</form>

	<?php if ( $errors ) : ?><div class="notice notice-warning inline"><ul><?php foreach ( $errors as $e ) echo '<li>' . esc_html( $e ) . '</li>'; ?></ul></div><?php endif; ?>

	<?php if ( $plan ) : ?>
	<h2>المعاينة</h2>
	<p>جديد: <strong><?php echo (int) $plan['counts']['create']; ?></strong> · تحديث: <strong><?php echo (int) $plan['counts']['update']; ?></strong> · بدون تغيير: <strong><?php echo (int) $plan['counts']['same']; ?></strong><?php echo $plan['settings'] ? ' · إعدادات القالب: <strong>' . count( $plan['settings'] ) . ' تغيير</strong>' : ''; ?></p>
	<table class="widefat striped"><thead><tr><th>الإجراء</th><th>النوع</th><th>الرابط المختصر</th><th>العنوان</th><th>التغييرات (قبل ← بعد)</th></tr></thead><tbody>
	<?php foreach ( $plan['items'] as $r ) : ?>
		<tr><td><?php echo esc_html( $labels[ $r['action'] ] ); ?></td><td><?php echo esc_html( $r['type'] ); ?></td><td><code><?php echo esc_html( $r['slug'] ); ?></code></td><td><?php echo esc_html( $r['title'] ); ?></td>
		<td><?php if ( $r['action'] === 'create' ) : echo 'سيُنشأ كمسودة'; else : foreach ( $r['changes'] as $k => [ $o, $n ] ) echo '<div><strong>' . esc_html( $k ) . '</strong>: ' . esc_html( cc_imp_short( $o ) ) . ' ← ' . esc_html( cc_imp_short( $n ) ) . '</div>'; endif; ?></td></tr>
	<?php endforeach; foreach ( $plan['settings'] as $k => [ $o, $n ] ) : ?>
		<tr><td>تحديث</td><td>settings</td><td><code><?php echo esc_html( $k ); ?></code></td><td>—</td><td><?php echo esc_html( cc_imp_short( $o ) ) . ' ← ' . esc_html( cc_imp_short( $n ) ); ?></td></tr>
	<?php endforeach; ?></tbody></table>
	<?php if ( $token && ( $plan['counts']['create'] || $plan['counts']['update'] || $plan['settings'] ) ) : ?>
	<form method="post" style="margin-top:14px"><?php wp_nonce_field( 'cc_imp' ); ?><input type="hidden" name="cc_imp" value="apply"><input type="hidden" name="token" value="<?php echo esc_attr( $token ); ?>">
		<button class="button button-primary" onclick="return confirm('تطبيق التغييرات؟ ستُحفظ نسخة احتياطية للتراجع.')">تطبيق التغييرات</button></form>
	<?php else : ?><p>لا يوجد ما يُطبَّق.</p><?php endif; ?>
	<?php endif; ?>

	<h2>النسخ الاحتياطية (آخر 5)</h2>
	<?php $bk = get_option( 'cc_import_backups', [] ); if ( ! $bk ) : ?><p>لا توجد نسخ بعد.</p><?php else : ?>
	<table class="widefat striped"><thead><tr><th>التاريخ</th><th>جديد</th><th>محدّث</th><th></th></tr></thead><tbody>
	<?php foreach ( $bk as $b ) : ?><tr><td><?php echo esc_html( wp_date( 'Y-m-d H:i', $b['time'] ) ); ?></td><td><?php echo count( $b['created'] ); ?></td><td><?php echo count( $b['updated'] ); ?></td><td>
		<?php if ( $b['rolled_back'] ) : echo 'تم التراجع'; else : ?><form method="post"><?php wp_nonce_field( 'cc_imp' ); ?><input type="hidden" name="cc_imp" value="rollback"><input type="hidden" name="backup" value="<?php echo esc_attr( $b['id'] ); ?>"><button class="button" onclick="return confirm('التراجع عن هذا الاستيراد؟')">تراجع</button></form><?php endif; ?></td></tr>
	<?php endforeach; ?></tbody></table><?php endif; ?>
</div>
	<?php
}
