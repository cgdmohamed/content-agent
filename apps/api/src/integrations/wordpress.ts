import { decryptSecret } from "../security/secret-vault.js";
import { safeExternalUrl } from "../security/url-safety.js";

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
  const response = await fetch(endpoint, {
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
  const response = await fetch(endpoint, {
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

export async function updateWordPressPostStatus(site: InternalSiteCredentials, postId: string, status: "draft" | "trash"): Promise<{ id: string; status: string }> {
  const base = safeWordPressUrl(site.wordpress_url);
  const password = decryptSecret(site.wordpress_application_password_encrypted);
  const endpoint = new URL(`/wp-json/wp/v2/posts/${postId}`, base);
  const response = await fetch(endpoint, {
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

export async function uploadWordPressMedia(
  site: InternalSiteCredentials,
  input: { bytes: Buffer; mimeType: string; filename: string; altText?: string | null }
): Promise<WordPressMediaResult> {
  const base = safeWordPressUrl(site.wordpress_url);
  const password = decryptSecret(site.wordpress_application_password_encrypted);
  const endpoint = new URL("/wp-json/wp/v2/media", base);
  const response = await fetch(endpoint, {
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
    await fetch(new URL(`/wp-json/wp/v2/media/${data.id}`, base), {
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

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "featured-image.png";
}
