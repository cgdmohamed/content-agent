import { sanitizeArticleHtml } from "./html-sanitizer.js";
import { decryptSecret } from "./secrets.js";
import { safeExternalUrl } from "./url-safety.js";

export interface WordPressSite {
  wordpress_url: string;
  wordpress_username: string;
  wordpress_application_password_encrypted: string;
}

export interface WordPressPostInput {
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

export async function publishPost(site: WordPressSite, input: WordPressPostInput): Promise<WordPressPostResult> {
  validatePost(input);
  const base = safeBaseUrl(site.wordpress_url);
  const auth = authHeader(site);
  const categoryIds = input.category ? [await getOrCreateTerm(base, auth, "categories", input.category)] : [];
  const tagIds = await Promise.all(input.tags.map((tag) => getOrCreateTerm(base, auth, "tags", tag)));
  const endpoint = input.wordpressPostId
    ? new URL(`/wp-json/wp/v2/posts/${input.wordpressPostId}`, base)
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
  if (statusAndDate.date) body.date = statusAndDate.date;
  if (categoryIds.length) body.categories = categoryIds;
  if (tagIds.length) body.tags = tagIds;
  if (input.featuredMediaId) body.featured_media = Number(input.featuredMediaId);

  const response = await fetch(endpoint, {
    method: input.wordpressPostId ? "POST" : "POST",
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

export async function uploadMedia(site: WordPressSite, input: { bytes: Buffer; mimeType: string; filename: string; altText?: string | null }): Promise<WordPressMediaResult> {
  const base = safeBaseUrl(site.wordpress_url);
  const auth = authHeader(site);
  const endpoint = new URL("/wp-json/wp/v2/media", base);
  const response = await fetch(endpoint, {
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
    await fetch(new URL(`/wp-json/wp/v2/media/${data.id}`, base), {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ alt_text: input.altText.trim() }),
      signal: AbortSignal.timeout(30_000)
    });
  }
  return { id: String(data.id), sourceUrl: data.source_url ?? "" };
}

async function getOrCreateTerm(base: URL, auth: string, taxonomy: "categories" | "tags", name: string): Promise<number> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("اسم التصنيف/الوسم فارغ.");
  const searchUrl = new URL(`/wp-json/wp/v2/${taxonomy}`, base);
  searchUrl.searchParams.set("search", trimmed);
  searchUrl.searchParams.set("per_page", "20");
  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  const found = (await searchResponse.json()) as Array<{ id: number; name: string }> | { message?: string };
  if (!searchResponse.ok || !Array.isArray(found)) {
    throw new Error("فشل البحث عن التصنيف/الوسم في ووردبريس.");
  }
  const exact = found.find((term) => term.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact.id;

  const createUrl = new URL(`/wp-json/wp/v2/${taxonomy}`, base);
  const createResponse = await fetch(createUrl, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ name: trimmed }),
    signal: AbortSignal.timeout(30_000)
  });
  const created = (await createResponse.json()) as { id?: number; data?: { term_id?: number }; message?: string };
  if (createResponse.status === 400 && created.data?.term_id) return created.data.term_id;
  if (!createResponse.ok || !created.id) {
    throw new Error(created.message ?? "فشل إنشاء التصنيف/الوسم في ووردبريس.");
  }
  return created.id;
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
