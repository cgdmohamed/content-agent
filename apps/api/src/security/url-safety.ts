export interface ExternalUrlOptions {
  allowHttp?: boolean;
}

const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

export function safeExternalUrl(value: string, options: ExternalUrlOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("الرابط غير صالح.");
  }
  if (url.username || url.password) throw new Error("لا تضع بيانات دخول داخل الرابط.");
  if (url.protocol === "http:" && options.allowHttp !== true) throw new Error("الرابط يجب أن يستخدم HTTPS.");
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("الرابط يجب أن يبدأ بـ http أو https.");

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) throw new Error("اسم النطاق غير صالح.");
  if (blockedHostnames.has(hostname) || hostname.endsWith(".localhost")) throw new Error("لا يمكن استخدام روابط محلية.");
  if (isBlockedIpAddress(hostname)) throw new Error("لا يمكن استخدام عناوين IP داخلية أو محلية.");
  return url;
}

export function isBlockedIpAddress(hostname: string): boolean {
  return isBlockedIpv4(hostname) || isBlockedIpv6(hostname);
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first = 0, second = 0] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

function isBlockedIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) return false;
  if (hostname === "::1" || hostname === "::") return true;
  const normalized = hostname.toLowerCase();
  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

