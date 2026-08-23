import { Controller, Get, Module, Param, Query } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.js";
import { fetchWordPressAuditPages, type WordPressAuditPage } from "../integrations/wordpress.js";
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

interface SiteAuditContentRow {
  id: string;
  title: string | null;
  wordpress_post_url: string | null;
  status: string;
}

interface AuditIssue {
  id: string;
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  type: WordPressAuditPage["type"];
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: "SEO" | "AEO" | "GEO" | "CONTENT" | "TECHNICAL" | "UX" | "RANKMATH";
  message: string;
  recommendation: string;
  action: "OPTIMIZE_LINKS" | "EDIT_WORDPRESS" | "ADD_IMAGE" | "ADD_SCHEMA" | "REVIEW_MANUALLY";
  contentItemId?: string | null;
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

  @Get("sites/:siteId/audit")
  async audit(@Param("siteId") siteId: string): Promise<Record<string, unknown>> {
    const siteResult = await this.db.query<{
      id: string;
      name: string;
      wordpress_url: string;
      wordpress_username: string;
      wordpress_application_password_encrypted: string;
    }>("SELECT id, name, wordpress_url, wordpress_username, wordpress_application_password_encrypted FROM sites WHERE id = $1", [siteId]);
    if (!siteResult.rowCount) throw new Error("الموقع غير موجود.");
    const site = siteResult.rows[0]!;
    const [pages, contentRows] = await Promise.all([
      fetchWordPressAuditPages(site, 80),
      this.db.query<SiteAuditContentRow>(
        `SELECT id, title, wordpress_post_url, status
         FROM content_items
         WHERE site_id = $1 AND wordpress_post_url IS NOT NULL`,
        [siteId]
      )
    ]);
    const contentByUrl = new Map(contentRows.rows.map((row) => [normalizeUrlKey(row.wordpress_post_url ?? ""), row]));
    const analyzed = pages.map((page) => analyzeAuditPage(page, contentByUrl.get(normalizeUrlKey(page.url))));
    const issues = analyzed.flatMap((page) => page.issues);
    const score = analyzed.length ? Math.round(analyzed.reduce((sum, page) => sum + page.score, 0) / analyzed.length) : 0;
    return {
      siteId,
      siteName: site.name,
      scannedAt: new Date().toISOString(),
      score,
      totals: {
        pages: analyzed.filter((page) => page.type === "page").length,
        posts: analyzed.filter((page) => page.type === "post").length,
        issues: issues.length,
        high: issues.filter((issue) => issue.severity === "HIGH").length,
        medium: issues.filter((issue) => issue.severity === "MEDIUM").length,
        low: issues.filter((issue) => issue.severity === "LOW").length
      },
      checklist: buildAuditChecklist(issues),
      pages: analyzed,
      issues: issues.slice(0, 120)
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

function analyzeAuditPage(page: WordPressAuditPage, contentRow?: SiteAuditContentRow): Record<string, unknown> & { score: number; type: WordPressAuditPage["type"]; issues: AuditIssue[] } {
  const text = stripHtml(page.html);
  const h1Count = countMatches(page.html, /<h1\b/gi);
  const h2Count = countMatches(page.html, /<h2\b/gi);
  const wordCount = countWords(text);
  const internalLinks = countInternalLinksForPage(page.html, page.url);
  const externalLinks = countExternalLinksForPage(page.html, page.url);
  const images = countMatches(page.html, /<img\b/gi);
  const imagesMissingAlt = countMatches(page.html, /<img\b(?![^>]*\balt=["'][^"']+["'])[^>]*>/gi);
  const hasFaq = hasFaqCoverage(page.html);
  const hasCtaValue = hasCtaText(text);
  const titleLength = page.title.length;
  const slugLength = page.slug.length;
  const excerptLength = page.excerpt.length;
  const issues: AuditIssue[] = [];
  const add = (severity: AuditIssue["severity"], category: AuditIssue["category"], message: string, recommendation: string, action: AuditIssue["action"]) => {
    issues.push({
      id: `${page.type}-${page.id}-${issues.length + 1}`,
      pageId: page.id,
      pageTitle: page.title,
      pageUrl: page.url,
      type: page.type,
      severity,
      category,
      message,
      recommendation,
      action,
      contentItemId: contentRow?.id ?? null
    });
  };
  if (titleLength < 35 || titleLength > 65) add("HIGH", "SEO", "طول العنوان غير مناسب لمحركات البحث.", "اضبط العنوان ليكون واضحًا وقريبًا من 55-60 حرفًا.", "EDIT_WORDPRESS");
  if (slugLength > 75) add("MEDIUM", "RANKMATH", "الرابط الدائم طويل وقد يخفض تقييم Rank Math.", "اختصر الـ slug حول الكلمة المستهدفة الأساسية.", "EDIT_WORDPRESS");
  if (excerptLength < 120 || excerptLength > 165) add("HIGH", "SEO", "الوصف/المقتطف غير مضبوط.", "اكتب وصفًا بين 140-160 حرفًا يحتوي الفائدة والكلمة المستهدفة.", "EDIT_WORDPRESS");
  if (h1Count !== 1) add("HIGH", "TECHNICAL", "عدد H1 غير مثالي.", "استخدم H1 واحد فقط يطابق نية الصفحة.", "EDIT_WORDPRESS");
  if (h2Count < 2) add("MEDIUM", "CONTENT", "البنية تحتاج عناوين H2 أكثر.", "أضف أقسام H2 تغطي الأسئلة والقرارات المهمة للقارئ.", "EDIT_WORDPRESS");
  if (wordCount < (page.type === "post" ? 900 : 500)) add("HIGH", "CONTENT", "المحتوى قصير مقارنة بهدف SEO/AEO/GEO.", "وسّع الصفحة بإجابات عملية، تفاصيل، أمثلة، وأسئلة شائعة.", "REVIEW_MANUALLY");
  if (!hasFaq) add("MEDIUM", "AEO", "لا يوجد قسم أسئلة شائعة واضح.", "أضف FAQ بإجابات مباشرة قابلة للظهور في الإجابات الذكية.", "EDIT_WORDPRESS");
  if (!hasCtaValue) add("MEDIUM", "UX", "لا توجد دعوة إجراء واضحة.", "أضف CTA طبيعي للحجز، التواصل، أو الخطوة التالية.", contentRow ? "OPTIMIZE_LINKS" : "EDIT_WORDPRESS");
  if (internalLinks < 2) add("HIGH", "SEO", "الروابط الداخلية قليلة.", "اربط الصفحة بمقالات ورحلات وصفحات خدمة ذات صلة.", contentRow ? "OPTIMIZE_LINKS" : "EDIT_WORDPRESS");
  if (externalLinks === 0) add("LOW", "GEO", "لا توجد روابط لمصادر موثوقة.", "أضف مصدرًا رسميًا أو موثوقًا عند ذكر أسعار، مواعيد، تأشيرات، أو بيانات.", "EDIT_WORDPRESS");
  if (images === 0) add("MEDIUM", "UX", "لا توجد صورة داعمة في المحتوى.", "أضف صورة مناسبة مع ALT يحتوي الكلمة المستهدفة.", "ADD_IMAGE");
  if (imagesMissingAlt > 0) add("MEDIUM", "SEO", "بعض الصور بدون ALT واضح.", "أضف ALT وصفيًا يحتوي الكلمة المستهدفة عند الملاءمة.", "ADD_IMAGE");
  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === "HIGH" ? 12 : issue.severity === "MEDIUM" ? 7 : 3), 0);
  return {
    id: page.id,
    type: page.type,
    title: page.title,
    url: page.url,
    status: page.status,
    modified: page.modified,
    contentItemId: contentRow?.id ?? null,
    score: Math.max(0, 100 - penalty),
    metrics: { wordCount, h1Count, h2Count, internalLinks, externalLinks, images, imagesMissingAlt, hasFaq, hasCta: hasCtaValue, titleLength, slugLength, excerptLength },
    issues
  };
}

function buildAuditChecklist(issues: AuditIssue[]): Array<{ id: string; label: string; count: number; priority: AuditIssue["severity"]; action: AuditIssue["action"] }> {
  const groups = [
    { id: "titles", label: "ضبط عناوين SEO والوصف والروابط الدائمة", category: "SEO", priority: "HIGH", action: "EDIT_WORDPRESS" },
    { id: "rankmath", label: "معالجة تنبيهات Rank Math المؤثرة", category: "RANKMATH", priority: "MEDIUM", action: "EDIT_WORDPRESS" },
    { id: "structure", label: "تحسين بنية H1/H2/H3 وطول المحتوى", category: "CONTENT", priority: "HIGH", action: "REVIEW_MANUALLY" },
    { id: "aeo", label: "إضافة FAQ وإجابات مباشرة AEO", category: "AEO", priority: "MEDIUM", action: "EDIT_WORDPRESS" },
    { id: "geo", label: "دعم GEO بمصادر موثوقة وملخصات واضحة", category: "GEO", priority: "LOW", action: "EDIT_WORDPRESS" },
    { id: "links", label: "ربط الصفحات بالرحلات والمقالات داخليًا", category: "SEO", priority: "HIGH", action: "OPTIMIZE_LINKS" },
    { id: "images", label: "إضافة صور وALT مناسب للكلمة المستهدفة", category: "UX", priority: "MEDIUM", action: "ADD_IMAGE" }
  ] as const;
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    count: issues.filter((issue) => issue.category === group.category || (group.id === "images" && issue.action === "ADD_IMAGE") || (group.id === "links" && issue.message.includes("الروابط الداخلية"))).length,
    priority: group.priority,
    action: group.action
  })).filter((item) => item.count > 0);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function countMatches(value: string, pattern: RegExp): number {
  return (value.match(pattern) ?? []).length;
}

function hasCtaText(text: string): boolean {
  return /تواصل|احجز|اطلب|استشارة|اتصل|whatsapp|contact|book|quote|get in touch|plan your/i.test(text);
}

function countInternalLinksForPage(html: string, pageUrl: string): number {
  const host = safeHost(pageUrl);
  return [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)].filter((match) => safeHost(match[1] ?? "") === host).length;
}

function countExternalLinksForPage(html: string, pageUrl: string): number {
  const host = safeHost(pageUrl);
  return [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)].filter((match) => {
    const linkHost = safeHost(match[1] ?? "");
    return Boolean(linkHost && host && linkHost !== host);
  }).length;
}

function normalizeUrlKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

@Module({ controllers: [ReportsController] })
export class ReportsModule {}
