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
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 192 && second === 0 && (octets[2] ?? 0) === 0) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isBlockedIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) return false;
  if (hostname === "::1" || hostname === "::") return true;
  const normalized = hostname.toLowerCase();
  const mapped = ipv4FromMappedIpv6(normalized);
  if (mapped) return isBlockedIpv4(mapped);
  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff")
  );
}

// IPv4-mapped IPv6 (::ffff:a.b.c.d). WHATWG URL normalizes dotted form to hex pairs (::ffff:7f00:1).
function ipv4FromMappedIpv6(address: string): string | null {
  const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (dotted) return dotted[1] ?? null;
  const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
  if (!hex) return null;
  const high = parseInt(hex[1]!, 16);
  const low = parseInt(hex[2]!, 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

