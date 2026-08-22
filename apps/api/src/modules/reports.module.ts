import { Controller, Get, Module, Param, Query } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.js";
import { Roles } from "../security/access-control.js";

interface ContentQualityRow {
  id: string;
  title: string | null;
  topic: string;
  target_keyword: string | null;
  selected_idea: { target_keyword?: string } | null;
  draft_html: string | null;
  content_score: number;
  status: string;
  created_at: Date;
  published_at: Date | null;
}

@Controller("reports")
@Roles("ADMIN")
class ReportsController {
  constructor(private readonly db: DatabaseService) {}

  @Get("sites/:siteId")
  async site(@Param("siteId") siteId: string, @Query("from") from?: string, @Query("to") to?: string): Promise<Record<string, unknown>> {
    const range = normalizeDateRange(from, to);
    const counts = await this.db.query<{
      total_content: string;
      published: string;
      pipeline: string;
      duplicates: string;
      failed: string;
      average_content_score: string | null;
      ai_cost: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_content,
         COUNT(*) FILTER (WHERE status = 'PUBLISHED')::text AS published,
         COUNT(*) FILTER (WHERE status NOT IN ('PUBLISHED', 'FAILED', 'DUPLICATE'))::text AS pipeline,
         COUNT(*) FILTER (WHERE status = 'DUPLICATE')::text AS duplicates,
         COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed,
         ROUND(AVG(NULLIF(content_score, 0)))::text AS average_content_score,
         COALESCE((SELECT SUM(estimated_cost_usd)::text FROM api_usage_logs a WHERE a.content_item_id IN (SELECT id FROM content_items WHERE site_id = $1)), '0') AS ai_cost
       FROM content_items
       WHERE site_id = $1
         AND created_at >= $2
         AND created_at < $3`,
      [siteId, range.from, range.toExclusive]
    );
    const row = counts.rows[0]!;
    const opportunities = await this.db.query(
      `SELECT query, clicks, impressions, ctr, position, synced_at AS "syncedAt"
       FROM gsc_query_snapshots
       WHERE site_id = $1
       ORDER BY impressions DESC, clicks ASC, position ASC
       LIMIT 25`,
      [siteId]
    );
    const qualityRows = await this.db.query<ContentQualityRow>(
      `SELECT id, title, topic, target_keyword, selected_idea, draft_html, content_score, status, created_at, published_at
       FROM content_items
       WHERE site_id = $1
         AND created_at >= $2
         AND created_at < $3
       ORDER BY created_at DESC
       LIMIT 500`,
      [siteId, range.from, range.toExclusive]
    );
    const quality = buildSiteQualityReport(qualityRows.rows);

    return {
      siteId,
      from: range.from.toISOString().slice(0, 10),
      to: range.toInclusive.toISOString().slice(0, 10),
      totalContent: Number(row.total_content),
      published: Number(row.published),
      pipeline: Number(row.pipeline),
      duplicates: Number(row.duplicates),
      failed: Number(row.failed),
      averageContentScore: Number(row.average_content_score ?? 0),
      aiCost: Number(row.ai_cost),
      quality,
      opportunities: opportunities.rows
    };
  }
}

export function buildSiteQualityReport(rows: ContentQualityRow[]): Record<string, unknown> {
  const withDraft = rows.filter((row) => Boolean(row.draft_html?.trim()));
  const withInternalLinks = withDraft.filter((row) => countInternalLinks(row.draft_html ?? "") > 0).length;
  const withFaq = withDraft.filter((row) => hasFaqCoverage(row.draft_html ?? "")).length;
  const lowScore = rows
    .filter((row) => row.content_score > 0 && row.content_score < 60)
    .slice(0, 10)
    .map((row) => ({
      id: row.id,
      title: row.title || row.topic,
      score: row.content_score,
      status: row.status,
      createdAt: row.created_at
    }));

  return {
    draftedCount: withDraft.length,
    withInternalLinks,
    withoutInternalLinks: Math.max(0, withDraft.length - withInternalLinks),
    internalLinkCoverage: ratio(withInternalLinks, withDraft.length),
    withFaq,
    faqCoverage: ratio(withFaq, withDraft.length),
    topKeywords: topKeywords(rows),
    recentContent: rows.slice(0, 12).map((row) => ({
      id: row.id,
      title: row.title || row.topic,
      keyword: keywordForRow(row),
      score: row.content_score,
      status: row.status,
      createdAt: row.created_at,
      publishedAt: row.published_at
    })),
    lowScore
  };
}

function normalizeDateRange(from?: string, to?: string): { from: Date; toInclusive: Date; toExclusive: Date } {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 90);
  const fromDate = parseDateOnly(from) ?? startOfUtcDay(defaultFrom);
  const toInclusive = parseDateOnly(to) ?? startOfUtcDay(now);
  const toExclusive = new Date(toInclusive);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from: fromDate, toInclusive, toExclusive };
}

function parseDateOnly(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function countInternalLinks(html: string): number {
  return (html.match(/<a\s+[^>]*href=/gi) ?? []).length;
}

function hasFaqCoverage(html: string): boolean {
  return /اسئلة|أسئلة|FAQ|faq|سؤال|س وج/i.test(stripHtml(html));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function ratio(part: number, total: number): number {
  return total > 0 ? Number((part / total).toFixed(2)) : 0;
}

function topKeywords(rows: ContentQualityRow[]): Array<{ keyword: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const keyword = keywordForRow(row);
    if (!keyword) continue;
    counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"))
    .slice(0, 20)
    .map(([keyword, count]) => ({ keyword, count }));
}

function keywordForRow(row: ContentQualityRow): string {
  return row.target_keyword?.trim() || row.selected_idea?.target_keyword?.trim() || "";
}

@Module({ controllers: [ReportsController] })
export class ReportsModule {}
