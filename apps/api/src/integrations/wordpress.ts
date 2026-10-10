import { decryptSecret } from "../security/secret-vault.js";
import { safeExternalUrl } from "../security/url-safety.js";
import { safeFetch } from "@content-agent/shared/safe-fetch";

export interface InternalSiteCredentials {
  id: string;
  wordpress_url: string;
  wordpress_username: string;
  wordpress_application_password_encrypted: string;
}

export interface ConnectionCheck {
  status: "CONNECTED" | "ERROR" | "NOT_CONFIGURED" | "BRIDGE_MISSING" | "PERMISSION_ERROR";
  message: string;
}

export interface WordPressMediaResult {
  id: string;
  sourceUrl: string;
}

export interface WordPressAuditPage {
  id: string;
  type: "post" | "page";
  title: string;
  url: string;
  slug: string;
  status: string;
  html: string;
  excerpt: string;
  date: string | null;
  modified: string | null;
}

export function safeWordPressUrl(value: string): URL {
  return safeExternalUrl(value, { allowHttp: process.env.NODE_ENV !== "production" });
}

export async function testWordPressConnection(site: InternalSiteCredentials): Promise<ConnectionCheck> {
  if (!site.wordpress_url || !site.wordpress_username || !site.wordpress_application_password_encrypted) {
    return { status: "NOT_CONFIGURED", message: "بيانات ووردبريس غير مكتملة." };
  }
  const base = safeWordPressUrl(site.wordpress_url);
  const password = decryptSecret(site.wordpress_application_password_encrypted);
  const endpoint = new URL("/wp-json/wp/v2/users/me", base);
  const response = await safeFetch(endpoint, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${site.wordpress_username}:${password}`).toString("base64")}`,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (response.status === 401 || response.status === 403) {
    return { status: "PERMISSION_ERROR", message: "بيانات الدخول صحيحة الصيغة لكن ووردبريس رفض الصلاحيات." };
  }
  if (!response.ok) {
    return { status: "ERROR", message: `فشل اختبار ووردبريس برمز ${response.status}.` };
  }
  return { status: "CONNECTED", message: "تم الاتصال بووردبريس بنجاح." };
}

export async function testRankMathBridge(site: InternalSiteCredentials): Promise<ConnectionCheck> {
  const base = safeWordPressUrl(site.wordpress_url);
  const password = decryptSecret(site.wordpress_application_password_encrypted);
  const endpoint = new URL("/wp-json/content-agent/v1/rankmath", base);
  const response = await safeFetch(endpoint, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${site.wordpress_username}:${password}`).toString("base64")}`,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(15_000)
  });
  if (response.status === 404) {
    return { status: "BRIDGE_MISSING", message: "جسر Rank Math غير مثبت أو غير مفعّل." };
  }
  if (response.status === 401 || response.status === 403) {
    return { status: "PERMISSION_ERROR", message: "ووردبريس رفض صلاحيات اختبار Rank Math." };
  }
  if (!response.ok) {
    return { status: "ERROR", message: `فشل اختبار Rank Math برمز ${response.status}.` };
  }
  return { status: "CONNECTED", message: "جسر Rank Math متاح." };
}

export interface PolylangCheck extends ConnectionCheck {
  languages: unknown[];
}

/**
 * Finds out whether the site is multilingual and how Content Agent can write languages to it:
 * the Content Agent bridge plugin (works with free Polylang) or Polylang Pro (its own REST fields).
 */
export async function fetchPolylangLanguages(site: InternalSiteCredentials): Promise<PolylangCheck> {
  const base = safeWordPressUrl(site.wordpress_url);
  const auth = `Basic ${Buffer.from(`${site.wordpress_username}:${decryptSecret(site.wordpress_application_password_encrypted)}`).toString("base64")}`;
  const get = (path: string, method = "GET") =>
    safeFetch(new URL(path, base), { method, headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });

  const bridge = await get("/wp-json/content-agent/v1/polylang");
  if (bridge.status === 401 || bridge.status === 403) {
    return { status: "PERMISSION_ERROR", message: "ووردبريس رفض صلاحيات قراءة لغات Polylang.", languages: [] };
  }
  if (bridge.ok) {
    const data = (await bridge.json().catch(() => null)) as { polylangActive?: boolean; languages?: unknown[] } | null;
    if (!data?.polylangActive) return { status: "NOT_CONFIGURED", message: "جسر Polylang مثبت لكن Polylang نفسه غير مفعّل على الموقع.", languages: [] };
    if (!data.languages?.length) return { status: "NOT_CONFIGURED", message: "لا توجد لغات مضافة في Polylang.", languages: [] };
    return { status: "CONNECTED", message: `تم العثور على ${data.languages.length} لغات.`, languages: data.languages };
  }
  if (bridge.status !== 404) return { status: "ERROR", message: `فشل فحص Polylang برمز ${bridge.status}.`, languages: [] };

  // No bridge: Polylang may still be there (3.7+ exposes pll/v1) and Pro writes languages on its own.
  const languages = await get("/wp-json/pll/v1/languages");
  if (languages.status === 404) return { status: "NOT_CONFIGURED", message: "Polylang غير مثبت على الموقع (موقع بلغة واحدة).", languages: [] };
  if (languages.status === 401 || languages.status === 403) return { status: "PERMISSION_ERROR", message: "ووردبريس رفض صلاحيات قراءة لغات Polylang.", languages: [] };
  if (!languages.ok) return { status: "ERROR", message: `فشل فحص Polylang برمز ${languages.status}.`, languages: [] };
  const rows = (await languages.json().catch(() => [])) as Array<Record<string, unknown>>;
  const schema = (await (await get("/wp-json/wp/v2/posts", "OPTIONS")).json().catch(() => null)) as { schema?: { properties?: Record<string, unknown> } } | null;
  const properties = schema?.schema?.properties ?? {};
  if (!("lang" in properties) || !("translations" in properties)) {
    return { status: "BRIDGE_MISSING", message: "Polylang موجود لكن جسر Polylang غير مثبت (مطلوب مع النسخة المجانية).", languages: [] };
  }
  const settings = (await (await get("/wp-json/pll/v1/settings")).json().catch(() => null)) as { default_lang?: string } | null;
  const mapped = (Array.isArray(rows) ? rows : []).map((row) => ({
    code: row.slug,
    name: row.name,
    locale: row.locale,
    isRtl: row.is_rtl,
    isDefault: settings?.default_lang ? row.slug === settings.default_lang : false
  }));
  return { status: "CONNECTED", message: `تم العثور على ${mapped.length} لغات.`, languages: mapped };
}

export async function updateWordPressPostStatus(site: InternalSiteCredentials, postId: string, status: "draft" | "trash"): Promise<{ id: string; status: string }> {
  const base = safeWordPressUrl(site.wordpress_url);
  const password = decryptSecret(site.wordpress_application_password_encrypted);
  const endpoint = new URL(`/wp-json/wp/v2/posts/${postId}`, base);
  const response = await safeFetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${site.wordpress_username}:${password}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ status }),
    signal: AbortSignal.timeout(30_000)
  });
  const data = (await response.json()) as { id?: number; status?: string; message?: string };
  if (!response.ok || !data.id) {
    throw new Error(data.message ?? `فشل تحديث حالة المقال في ووردبريس برمز ${response.status}.`);
  }
  return { id: String(data.id), status: data.status ?? status };
}

export async function trashWordPressPost(site: InternalSiteCredentials, postId: string): Promise<{ id: string; status: string }> {
  const base = safeWordPressUrl(site.wordpress_url);
  const password = decryptSecret(site.wordpress_application_password_encrypted);
  const endpoint = new URL(`/wp-json/wp/v2/posts/${postId}`, base);
  endpoint.searchParams.set("force", "false");
  const response = await safeFetch(endpoint, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${Buffer.from(`${site.wordpress_username}:${password}`).toString("base64")}`,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(30_000)
  });
  const data = (await response.json()) as { deleted?: boolean; previous?: { id?: number; status?: string }; id?: number; status?: string; message?: string };
  const id = data.previous?.id ?? data.id;
  const status = data.previous?.status ?? data.status ?? "trash";
  if (!response.ok || !id) {
    throw new Error(data.message ?? `فشل نقل المقال إلى سلة ووردبريس برمز ${response.status}.`);
  }
  return { id: String(id), status };
}

export async function uploadWordPressMedia(
  site: InternalSiteCredentials,
  input: { bytes: Buffer; mimeType: string; filename: string; altText?: string | null }
): Promise<WordPressMediaResult> {
  const base = safeWordPressUrl(site.wordpress_url);
  const password = decryptSecret(site.wordpress_application_password_encrypted);
  const endpoint = new URL("/wp-json/wp/v2/media", base);
  const response = await safeFetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${site.wordpress_username}:${password}`).toString("base64")}`,
      "Content-Type": input.mimeType,
      "Content-Disposition": `attachment; filename="${sanitizeFilename(input.filename)}"`,
      Accept: "application/json"
    },
    body: new Uint8Array(input.bytes),
    signal: AbortSignal.timeout(120_000)
  });
  const data = (await response.json()) as { id?: number; source_url?: string; message?: string };
  if (!response.ok || !data.id) {
    throw new Error(data.message ?? `فشل رفع الصورة إلى ووردبريس برمز ${response.status}.`);
  }
  if (input.altText?.trim()) {
    await safeFetch(new URL(`/wp-json/wp/v2/media/${data.id}`, base), {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${site.wordpress_username}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ alt_text: input.altText.trim() }),
      signal: AbortSignal.timeout(30_000)
    });
  }
  return { id: String(data.id), sourceUrl: data.source_url ?? "" };
}

export async function fetchWordPressAuditPages(site: InternalSiteCredentials, limit = 80): Promise<WordPressAuditPage[]> {
  const base = safeWordPressUrl(site.wordpress_url);
  const password = decryptSecret(site.wordpress_application_password_encrypted);
  const auth = `Basic ${Buffer.from(`${site.wordpress_username}:${password}`).toString("base64")}`;
  const perTypeLimit = Math.max(10, Math.ceil(limit / 2));
  const [posts, pages] = await Promise.all([
    fetchWordPressCollection(base, auth, "posts", "post", perTypeLimit),
    fetchWordPressCollection(base, auth, "pages", "page", perTypeLimit)
  ]);
  return [...posts, ...pages].slice(0, limit);
}

async function fetchWordPressCollection(base: URL, auth: string, endpointName: "posts" | "pages", type: "post" | "page", limit: number): Promise<WordPressAuditPage[]> {
  const endpoint = new URL(`/wp-json/wp/v2/${endpointName}`, base);
  endpoint.searchParams.set("per_page", String(Math.min(100, limit)));
  endpoint.searchParams.set("status", "publish,draft,future");
  endpoint.searchParams.set("orderby", "modified");
  endpoint.searchParams.set("order", "desc");
  const response = await safeFetch(endpoint, {
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  const data = (await response.json()) as Array<{
    id?: number;
    link?: string;
    slug?: string;
    status?: string;
    date?: string;
    modified?: string;
    title?: { rendered?: string };
    content?: { rendered?: string };
    excerpt?: { rendered?: string };
  }> | { message?: string };
  if (!response.ok || !Array.isArray(data)) {
    throw new Error(`فشل سحب ${type === "post" ? "المقالات" : "الصفحات"} من ووردبريس برمز ${response.status}.`);
  }
  return data.map((row) => ({
    id: String(row.id ?? ""),
    type,
    title: stripWpHtml(row.title?.rendered ?? "بدون عنوان"),
    url: String(row.link ?? ""),
    slug: String(row.slug ?? ""),
    status: String(row.status ?? ""),
    html: String(row.content?.rendered ?? ""),
    excerpt: stripWpHtml(row.excerpt?.rendered ?? ""),
    date: row.date ?? null,
    modified: row.modified ?? null
  })).filter((row) => row.id && row.url);
}

function stripWpHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "featured-image.png";
}
