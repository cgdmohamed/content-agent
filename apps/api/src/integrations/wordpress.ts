import { decryptSecret } from "../security/secret-vault";
import { safeExternalUrl } from "../security/url-safety";

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
