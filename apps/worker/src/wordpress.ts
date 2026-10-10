import { sanitizeArticleHtml } from "./html-sanitizer.js";
import { decryptSecret } from "./secrets.js";
import { safeExternalUrl } from "./url-safety.js";
import { safeFetch } from "@content-agent/shared/safe-fetch";

export interface WordPressSite {
  wordpress_url: string;
  wordpress_username: string;
  wordpress_application_password_encrypted: string;
}

export interface WordPressPostInput {
  /** Polylang language slug; sent only for multilingual sites (the bridge plugin or Polylang Pro must be active). */
  language?: string;
  wordpressPostId?: string | null;
  title: string;
  contentHtml: string;
  metaDescription?: string | null;
  focusKeyword?: string | null;
  slug?: string | null;
  category?: string | null;
  tags: string[];
  featuredMediaId?: string | null;
  scheduledPublishAt?: Date | string | null;
  publishNow: boolean;
}

export interface WordPressPostResult {
  id: string;
  link: string;
  status: string;
  date?: string;
}

export interface WordPressMediaResult {
  id: string;
  sourceUrl: string;
}

export interface WordPressSearchResult {
  title: string;
  url: string;
  subtype?: string | null;
}

export async function publishPost(site: WordPressSite, input: WordPressPostInput): Promise<WordPressPostResult> {
  validatePost(input);
  const base = safeBaseUrl(site.wordpress_url);
  const auth = authHeader(site);
  const categoryIds = input.category ? [await getOrCreateTerm(base, auth, "categories", input.category, input.language)] : [];
  const tagIds = await Promise.all(input.tags.map((tag) => getOrCreateTerm(base, auth, "tags", tag, input.language)));
  // A previous attempt may have created the post before the database update was saved; adopt it
  // instead of creating a duplicate when the same slug and title already exist.
  const existingPostId = input.wordpressPostId ?? (await findExistingPostId(base, auth, input.slug, input.title));
  const endpoint = existingPostId
    ? new URL(`/wp-json/wp/v2/posts/${existingPostId}`, base)
    : new URL("/wp-json/wp/v2/posts", base);
  const statusAndDate = postStatus(input);
  const contentHtml = sanitizeArticleHtml(input.contentHtml);
  const body: Record<string, unknown> = {
    title: input.title,
    content: contentHtml,
    status: statusAndDate.status,
    slug: input.slug?.trim() || undefined,
    meta: {
      rank_math_title: input.title,
      rank_math_description: input.metaDescription ?? "",
      rank_math_focus_keyword: input.focusKeyword ?? ""
    }
  };
  if (input.language) body.lang = input.language;
  if (statusAndDate.date) body.date = statusAndDate.date;
  if (categoryIds.length) body.categories = categoryIds;
  if (tagIds.length) body.tags = tagIds;
  if (input.featuredMediaId) body.featured_media = Number(input.featuredMediaId);

  const response = await safeFetch(endpoint, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  });
  const data = (await response.json()) as { id?: number; link?: string; status?: string; date?: string; message?: string };
  if (!response.ok || !data.id) {
    throw new Error(data.message ?? `فشل نشر ووردبريس برمز ${response.status}`);
  }
  return {
    id: String(data.id),
    link: data.link ?? "",
    status: data.status ?? statusAndDate.status,
    date: data.date
  };
}

export interface WordPressPostLookupRow {
  id?: number;
  title?: { raw?: string; rendered?: string };
}

export function matchExistingPost(rows: unknown, title: string): string | null {
  if (!Array.isArray(rows)) return null;
  const wanted = title.trim();
  const match = (rows as WordPressPostLookupRow[]).find((row) => {
    const candidate = (row.title?.raw ?? row.title?.rendered ?? "").trim();
    return typeof row.id === "number" && candidate === wanted;
  });
  return match?.id !== undefined ? String(match.id) : null;
}

async function findExistingPostId(base: URL, auth: string, slug: string | null | undefined, title: string): Promise<string | null> {
  const trimmed = slug?.trim();
  if (!trimmed) return null;
  const endpoint = new URL("/wp-json/wp/v2/posts", base);
  endpoint.searchParams.set("slug", trimmed);
  endpoint.searchParams.set("status", "any");
  endpoint.searchParams.set("context", "edit");
  endpoint.searchParams.set("per_page", "5");
  const response = await safeFetch(endpoint, {
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) return null;
  return matchExistingPost(await response.json().catch(() => null), title);
}

export async function uploadMedia(site: WordPressSite, input: { bytes: Buffer; mimeType: string; filename: string; altText?: string | null }): Promise<WordPressMediaResult> {
  const base = safeBaseUrl(site.wordpress_url);
  const auth = authHeader(site);
  const endpoint = new URL("/wp-json/wp/v2/media", base);
  const response = await safeFetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": input.mimeType,
      "Content-Disposition": `attachment; filename="${sanitizeFilename(input.filename)}"`,
      Accept: "application/json"
    },
    body: new Uint8Array(input.bytes),
    signal: AbortSignal.timeout(120_000)
  });
  const data = (await response.json()) as { id?: number; source_url?: string; message?: string };
  if (!response.ok || !data.id) {
    throw new Error(data.message ?? `فشل رفع الصورة إلى ووردبريس برمز ${response.status}`);
  }
  if (input.altText?.trim()) {
    await safeFetch(new URL(`/wp-json/wp/v2/media/${data.id}`, base), {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ alt_text: input.altText.trim() }),
      signal: AbortSignal.timeout(30_000)
    });
  }
  return { id: String(data.id), sourceUrl: data.source_url ?? "" };
}

export async function searchWordPressInternalContent(site: WordPressSite, search: string, language?: string): Promise<WordPressSearchResult[]> {
  const term = search.trim();
  if (!term) return [];
  const base = safeBaseUrl(site.wordpress_url);
  const auth = authHeader(site);
  const subtypes = ["post", "page"];
  const results = await Promise.all(
    subtypes.map(async (subtype) => {
      const endpoint = new URL("/wp-json/wp/v2/search", base);
      endpoint.searchParams.set("search", term);
      endpoint.searchParams.set("per_page", "10");
      endpoint.searchParams.set("subtype", subtype);
      if (language) endpoint.searchParams.set("lang", language);
      const response = await safeFetch(endpoint, {
        headers: { Authorization: auth, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000)
      });
      const data = (await response.json()) as Array<{ title?: string; url?: string; subtype?: string }> | { message?: string };
      if (!response.ok || !Array.isArray(data)) {
        throw new Error("فشل البحث عن روابط داخلية في ووردبريس.");
      }
      return data
        .map((row) => ({
          title: String(row.title ?? "").trim(),
          url: String(row.url ?? "").trim(),
          subtype: row.subtype ?? subtype
        }))
        .filter((row) => row.title && row.url);
    })
  );
  return results.flat();
}

/** Writes Polylang's translation group (`{ ar: 12, en: 34 }`) on a post that is part of it. */
export async function linkTranslations(site: WordPressSite, postId: string, translations: Record<string, number>): Promise<void> {
  const base = safeBaseUrl(site.wordpress_url);
  const response = await safeFetch(new URL(`/wp-json/wp/v2/posts/${postId}`, base), {
    method: "POST",
    headers: { Authorization: authHeader(site), "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ translations }),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? `فشل ربط الترجمات برمز ${response.status}`);
  }
}

/** Terms are per language in Polylang: a category/tag is reused only when it already exists in the post's language. */
export function termInLanguage(term: { lang?: unknown }, language: string | undefined): boolean {
  if (!language) return true;
  // Sites without the bridge do not report a language on terms; then the name match alone decides.
  return typeof term.lang !== "string" || term.lang.toLowerCase() === language.toLowerCase();
}

async function getOrCreateTerm(base: URL, auth: string, taxonomy: "categories" | "tags", name: string, language?: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("اسم التصنيف/الوسم فارغ.");
  const searchUrl = new URL(`/wp-json/wp/v2/${taxonomy}`, base);
  searchUrl.searchParams.set("search", trimmed);
  searchUrl.searchParams.set("per_page", "20");
  if (language) searchUrl.searchParams.set("lang", language);
  const searchResponse = await safeFetch(searchUrl, {
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  const found = (await searchResponse.json()) as Array<{ id: number; name: string; lang?: unknown }> | { message?: string };
  if (!searchResponse.ok || !Array.isArray(found)) {
    throw new Error("فشل البحث عن التصنيف/الوسم في ووردبريس.");
  }
  const exact = found.find((term) => term.name.trim().toLowerCase() === trimmed.toLowerCase() && termInLanguage(term, language));
  if (exact) return exact.id;

  const created = await createTerm(base, auth, taxonomy, language ? { name: trimmed, lang: language } : { name: trimmed });
  if (created.status === 400 && created.data.data?.term_id) {
    const existingId = created.data.data.term_id;
    if (!language || (await termHasLanguage(base, auth, taxonomy, existingId, language))) return existingId;
    // The same name exists in another language: create this language's own term under a distinct slug.
    const own = await createTerm(base, auth, taxonomy, { name: trimmed, lang: language, slug: `${termSlug(trimmed)}-${language}` });
    if (own.ok && own.data.id) return own.data.id;
    throw new Error(own.data.message ?? "فشل إنشاء التصنيف/الوسم بلغة المقال.");
  }
  if (!created.ok || !created.data.id) {
    throw new Error(created.data.message ?? "فشل إنشاء التصنيف/الوسم في ووردبريس.");
  }
  return created.data.id;
}

interface CreatedTerm {
  id?: number;
  data?: { term_id?: number };
  message?: string;
}

async function createTerm(base: URL, auth: string, taxonomy: "categories" | "tags", body: Record<string, string>): Promise<{ ok: boolean; status: number; data: CreatedTerm }> {
  const response = await safeFetch(new URL(`/wp-json/wp/v2/${taxonomy}`, base), {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  return { ok: response.ok, status: response.status, data: (await response.json().catch(() => ({}))) as CreatedTerm };
}

async function termHasLanguage(base: URL, auth: string, taxonomy: "categories" | "tags", id: number, language: string): Promise<boolean> {
  const response = await safeFetch(new URL(`/wp-json/wp/v2/${taxonomy}/${id}`, base), {
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) return false;
  const term = (await response.json().catch(() => ({}))) as { lang?: unknown };
  return typeof term.lang === "string" && term.lang.toLowerCase() === language.toLowerCase();
}

function termSlug(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "term";
}

function postStatus(input: WordPressPostInput): { status: "draft" | "future" | "publish"; date?: string } {
  if (input.scheduledPublishAt) {
    const date = new Date(input.scheduledPublishAt);
    if (Number.isNaN(date.getTime())) throw new Error("تاريخ الجدولة غير صالح.");
    if (date.getTime() > Date.now()) {
      return { status: "future", date: date.toISOString() };
    }
  }
  return { status: input.publishNow ? "publish" : "draft" };
}

function validatePost(input: WordPressPostInput): void {
  if (!input.title.trim()) throw new Error("عنوان المقال مطلوب قبل النشر.");
  if (!sanitizeArticleHtml(input.contentHtml)) throw new Error("محتوى المقال مطلوب قبل النشر.");
}

function authHeader(site: WordPressSite): string {
  const password = decryptSecret(site.wordpress_application_password_encrypted);
  return `Basic ${Buffer.from(`${site.wordpress_username}:${password}`).toString("base64")}`;
}

function safeBaseUrl(value: string): URL {
  return safeExternalUrl(value, { allowHttp: process.env.NODE_ENV !== "production" });
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "featured-image.png";
}
