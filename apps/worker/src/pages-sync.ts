import { classifyPage, isInternalPageUrl } from "./site-pages-rules.js";
import { query } from "./db.js";
import { fetchSitePages, type WordPressSite } from "./wordpress.js";

export interface PagesSyncResult {
  total: number;
  created: number;
  gone: number;
}

/**
 * Reads the site's pages from WordPress into `site_pages`. Admin choices (kind, priority, hidden) are never
 * overwritten; pages that disappeared from WordPress are marked `gone` so articles stop linking to them.
 */
export async function syncPagesForSite(siteId: string): Promise<PagesSyncResult> {
  const site = await query<WordPressSite & { status: string }>(
    "SELECT wordpress_url, wordpress_username, wordpress_application_password_encrypted, status FROM sites WHERE id = $1",
    [siteId]
  );
  if (!site.rowCount || site.rows[0]!.status !== "ACTIVE") throw new Error("الموقع غير موجود أو غير نشط لمزامنة الصفحات.");
  const startedAt = new Date();
  const rows = (await fetchSitePages(site.rows[0]!)).filter((row) => isInternalPageUrl(row.url, site.rows[0]!.wordpress_url));
  let created = 0;
  for (const row of rows) {
    const guess = classifyPage({ wpType: row.wpType, title: row.title, slug: row.slug });
    const result = await query<{ inserted: boolean }>(
      `INSERT INTO site_pages (site_id, wp_type, wp_id, url, title, slug, summary, language, kind, priority, hidden, modified_at, synced_at, gone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), false)
       ON CONFLICT (site_id, wp_type, wp_id) DO UPDATE SET
         url = EXCLUDED.url, title = EXCLUDED.title, slug = EXCLUDED.slug, summary = EXCLUDED.summary,
         language = EXCLUDED.language, modified_at = EXCLUDED.modified_at, synced_at = now(), gone = false,
         kind = CASE WHEN site_pages.kind_source = 'AUTO' THEN EXCLUDED.kind ELSE site_pages.kind END,
         priority = CASE WHEN site_pages.kind_source = 'AUTO' THEN EXCLUDED.priority ELSE site_pages.priority END,
         hidden = CASE WHEN site_pages.kind_source = 'AUTO' THEN EXCLUDED.hidden ELSE site_pages.hidden END
       RETURNING (xmax = 0) AS inserted`,
      [siteId, row.wpType, row.wpId, row.url, row.title, row.slug, row.summary, row.language, guess.kind, guess.priority, guess.hidden, row.modifiedAt]
    );
    if (result.rows[0]?.inserted) created += 1;
  }
  // An empty answer is more likely a broken request than a site with no pages: do not hide everything because of it.
  let gone = 0;
  if (rows.length > 0) {
    const marked = await query("UPDATE site_pages SET gone = true WHERE site_id = $1 AND gone = false AND synced_at < $2", [siteId, startedAt]);
    gone = marked.rowCount ?? 0;
  }
  await query("UPDATE sites SET pages_synced_at = now(), updated_at = now() WHERE id = $1", [siteId]);
  return { total: rows.length, created, gone };
}

/** Active sites whose page index is missing or older than a day. */
export async function sitesNeedingPageSync(): Promise<string[]> {
  const result = await query<{ id: string }>(
    "SELECT id FROM sites WHERE status = 'ACTIVE' AND (pages_synced_at IS NULL OR pages_synced_at < now() - interval '24 hours') ORDER BY pages_synced_at NULLS FIRST LIMIT 50"
  );
  return result.rows.map((row) => row.id);
}
