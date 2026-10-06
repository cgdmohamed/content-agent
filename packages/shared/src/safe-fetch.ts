import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isBlockedIpAddress, safeExternalUrl } from "./url-safety.js";

// Node-only helper: exposed as "@content-agent/shared/safe-fetch" so the browser bundle never imports it.

export interface SafeFetchOptions {
  maxRedirects?: number;
  allowHttp?: boolean;
  /** Test seams. */
  resolveHost?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

/** Rejects hostnames that resolve to any internal/loopback/link-local address (DNS-based SSRF). */
export async function assertPublicHost(url: URL, resolveHost: SafeFetchOptions["resolveHost"] = defaultResolve): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) throw new Error("لا يمكن استخدام عناوين IP داخلية أو محلية.");
    return;
  }
  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new Error("تعذر تحليل اسم النطاق.");
  }
  if (addresses.length === 0) throw new Error("تعذر تحليل اسم النطاق.");
  if (addresses.some((address) => isBlockedIpAddress(address))) throw new Error("النطاق يشير إلى عنوان داخلي أو محلي.");
}

/**
 * fetch for user-configured external URLs. Validates the URL and its DNS answers, and follows
 * redirects manually so every hop is re-validated; credentials are dropped on cross-origin hops.
 * Note: DNS is resolved again by fetch itself, so a resolver that flips answers between the two
 * lookups (DNS rebinding) is only mitigated, not eliminated.
 */
export async function safeFetch(input: string | URL, init: RequestInit = {}, options: SafeFetchOptions = {}): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3;
  const allowHttp = options.allowHttp ?? process.env.NODE_ENV !== "production";
  const doFetch = options.fetchImpl ?? fetch;
  let current = safeExternalUrl(String(input), { allowHttp });
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  let headers = new Headers(init.headers);

  for (let hop = 0; ; hop += 1) {
    await assertPublicHost(current, options.resolveHost);
    const response = await doFetch(current, { ...init, method, body, headers, redirect: "manual" });
    const location = response.headers.get("location");
    if (!redirectStatuses.has(response.status) || !location) return response;
    if (hop >= maxRedirects) throw new Error("عدد إعادة التوجيه أكبر من المسموح.");

    const next = safeExternalUrl(new URL(location, current).toString(), { allowHttp });
    if (next.origin !== current.origin) {
      headers = new Headers(headers);
      headers.delete("authorization");
    }
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers = new Headers(headers);
      headers.delete("content-type");
      headers.delete("content-length");
    }
    current = next;
  }
}
