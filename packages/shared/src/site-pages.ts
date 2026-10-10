// Site page index: classification and ranking of a site's own pages as internal-link candidates.
// Browser-safe: used by the worker (sync + article writing) and the web app (labels).

export const pageKinds = ["SERVICE", "PRODUCT", "ARTICLE", "ABOUT", "CONTACT", "OTHER"] as const;
export type PageKind = (typeof pageKinds)[number];

export function isPageKind(value: unknown): value is PageKind {
  return typeof value === "string" && (pageKinds as readonly string[]).includes(value);
}

export interface PageClassificationInput {
  wpType: string;
  title: string;
  slug: string;
}

export interface PageClassification {
  kind: PageKind;
  /** Legal/utility pages that should never be linked from an article. */
  hidden: boolean;
  /** Service and product pages are the ones worth linking to even when the topic only touches them. */
  priority: boolean;
}

const hiddenPattern = /privacy|terms|cookie|policy|refund|disclaimer|sitemap|thank|cart|checkout|my-account|login|register|سياسة|الخصوصية|الشروط|الأحكام|ملفات تعريف|الاستبدال|الاسترجاع|شكرا|شكراً|سلة|الدفع|تسجيل الدخول/i;
const contactPattern = /contact|اتصل|تواصل|راسلنا/i;
const aboutPattern = /about|who-we-are|our-story|team|من نحن|عن الشركة|عنا|فريق|قصتنا|رؤيتنا/i;
const servicePattern = /service|solution|خدمة|خدمات|حلول/i;
const productPattern = /product|shop|store|package|منتج|منتجات|متجر|باقة|باقات/i;

/**
 * Guesses what a page is from its WordPress type, slug and title. The result is only a starting point:
 * admins can change the kind, hide a page or mark it as priority on the site's pages screen.
 */
export function classifyPage(input: PageClassificationInput): PageClassification {
  const type = input.wpType.toLowerCase();
  const text = `${input.slug} ${input.title}`;
  if (type === "post") return { kind: "ARTICLE", hidden: false, priority: false };
  if (hiddenPattern.test(text)) return { kind: "OTHER", hidden: true, priority: false };
  if (/service|خدم/.test(type)) return { kind: "SERVICE", hidden: false, priority: true };
  if (/product|package|portfolio|case/.test(type)) return { kind: "PRODUCT", hidden: false, priority: true };
  if (contactPattern.test(text)) return { kind: "CONTACT", hidden: false, priority: false };
  if (aboutPattern.test(text)) return { kind: "ABOUT", hidden: false, priority: false };
  if (servicePattern.test(text)) return { kind: "SERVICE", hidden: false, priority: true };
  if (productPattern.test(text)) return { kind: "PRODUCT", hidden: false, priority: true };
  return { kind: "OTHER", hidden: false, priority: false };
}

export interface RankablePage {
  title: string;
  url: string;
  slug?: string;
  summary?: string;
  kind: PageKind;
  priority: boolean;
}

const stopWords = new Set(["في", "من", "على", "إلى", "الى", "عن", "مع", "هو", "هي", "ما", "هل", "كيف", "ماذا", "لماذا", "أفضل", "دليل", "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "with", "how", "what", "best", "guide"]);

/** Lower-cased words of a text without Arabic diacritics, tatweel, the leading "ال" and short stop words. */
export function pageTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[ً-ٟـ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.replace(/^ال(?=.{3,})/, ""))
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

/** Share of the article's words that a page mentions in its title, slug or summary (title words count double). */
export function pageRelevance(articleText: string, page: Pick<RankablePage, "title" | "slug" | "summary">): number {
  const wanted = new Set(pageTokens(articleText));
  if (wanted.size === 0) return 0;
  const titleWords = new Set(pageTokens(`${page.title} ${page.slug ?? ""}`));
  const summaryWords = new Set(pageTokens(page.summary ?? ""));
  let score = 0;
  for (const word of wanted) {
    if (titleWords.has(word)) score += 2;
    else if (summaryWords.has(word)) score += 1;
  }
  return score / (wanted.size * 2);
}

export interface PageRankingOptions {
  limit?: number;
  /** Priority pages (services/products) included even when the topic does not mention them. */
  priorityLimit?: number;
}

/**
 * Picks the pages offered to the writer: the best matches for the article, plus a few priority pages so a service
 * can still be linked naturally. Pages with no word in common are only offered when they are priority pages.
 */
export function rankPageCandidates<T extends RankablePage>(articleText: string, pages: T[], options: PageRankingOptions = {}): T[] {
  const limit = options.limit ?? 12;
  const priorityLimit = options.priorityLimit ?? 3;
  const scored = pages.map((page) => ({ page, score: pageRelevance(articleText, page) }));
  const matches = scored
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score + (b.page.priority ? 0.1 : 0) - (a.score + (a.page.priority ? 0.1 : 0)))
    .slice(0, limit)
    .map((row) => row.page);
  const chosen = new Set(matches);
  const extras = scored
    .filter((row) => row.page.priority && !chosen.has(row.page))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, Math.min(priorityLimit, limit - matches.length + priorityLimit)))
    .map((row) => row.page);
  return [...matches, ...extras].slice(0, limit + priorityLimit);
}

/** Canonical form of a URL for comparing links: no hash, no trailing slash, no "www.". */
export function normalizeLinkKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * Keeps each internal link at most once, and at most `maxPerKind` links to service/product pages, so an article
 * reads as an article and not as a sales page. Surplus links keep their anchor text.
 */
export function limitRepeatedLinks(html: string, kindByUrl: Map<string, PageKind>, maxPerKind = 2): string {
  const seen = new Set<string>();
  const perKind = new Map<PageKind, number>();
  return html.replace(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (full, href: string, label: string) => {
    const key = normalizeLinkKey(href);
    const kind = kindByUrl.get(key);
    if (!kind) return full;
    if (seen.has(key)) return label;
    if (kind === "SERVICE" || kind === "PRODUCT") {
      const count = perKind.get(kind) ?? 0;
      if (count >= maxPerKind) return label;
      perKind.set(kind, count + 1);
    }
    seen.add(key);
    return full;
  });
}
