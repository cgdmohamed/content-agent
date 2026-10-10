import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { encryptSecret } from "../../security/secret-vault.js";
import { fetchPolylangLanguages } from "../../integrations/wordpress.js";

const original = globalThis.fetch;
let site: { id: string; wordpress_url: string; wordpress_username: string; wordpress_application_password_encrypted: string };

function respond(routes: Record<string, { status?: number; body?: unknown }>): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const route = routes[`${(init?.method ?? "GET").toUpperCase()} ${url.pathname}`];
    if (!route) throw new Error(`Unexpected fetch ${init?.method ?? "GET"} ${url.pathname}`);
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

beforeAll(() => {
  process.env.ENCRYPTION_KEY_BASE64 ??= Buffer.alloc(32, 9).toString("base64");
  site = { id: "1", wordpress_url: "https://203.0.113.10", wordpress_username: "editor", wordpress_application_password_encrypted: encryptSecret("pw") };
});
afterEach(() => {
  globalThis.fetch = original;
});

const languageRows = [
  { slug: "ar", name: "العربية", locale: "ar", is_rtl: true },
  { slug: "en", name: "English", locale: "en_US", is_rtl: false }
];

describe("Polylang detection", () => {
  it("reads the languages from the bridge plugin", async () => {
    respond({ "GET /wp-json/content-agent/v1/polylang": { body: { polylangActive: true, languages: [{ code: "ar", name: "العربية", isDefault: true }, { code: "en", name: "English" }] } } });
    const check = await fetchPolylangLanguages(site);
    expect(check.status).toBe("CONNECTED");
    expect(check.languages).toHaveLength(2);
  });

  it("reports a bridge without Polylang as not configured", async () => {
    respond({ "GET /wp-json/content-agent/v1/polylang": { body: { polylangActive: false, languages: [] } } });
    expect((await fetchPolylangLanguages(site)).status).toBe("NOT_CONFIGURED");
  });

  it("tells a plain single-language site from a Polylang site without the bridge", async () => {
    respond({ "GET /wp-json/content-agent/v1/polylang": { status: 404 }, "GET /wp-json/pll/v1/languages": { status: 404 } });
    expect((await fetchPolylangLanguages(site)).status).toBe("NOT_CONFIGURED");

    respond({ "GET /wp-json/content-agent/v1/polylang": { status: 404 }, "GET /wp-json/pll/v1/languages": { body: languageRows }, "OPTIONS /wp-json/wp/v2/posts": { body: { schema: { properties: { title: {} } } } } });
    const missing = await fetchPolylangLanguages(site);
    expect(missing.status).toBe("BRIDGE_MISSING");
    expect(missing.languages).toEqual([]);
  });

  it("accepts Polylang Pro, which exposes lang and translations on posts itself", async () => {
    respond({
      "GET /wp-json/content-agent/v1/polylang": { status: 404 },
      "GET /wp-json/pll/v1/languages": { body: languageRows },
      "OPTIONS /wp-json/wp/v2/posts": { body: { schema: { properties: { lang: {}, translations: {} } } } },
      "GET /wp-json/pll/v1/settings": { body: { default_lang: "ar" } }
    });
    const check = await fetchPolylangLanguages(site);
    expect(check.status).toBe("CONNECTED");
    expect(check.languages).toMatchObject([{ code: "ar", isRtl: true, isDefault: true }, { code: "en", isDefault: false }]);
  });

  it("maps rejected credentials to a permission error", async () => {
    respond({ "GET /wp-json/content-agent/v1/polylang": { status: 401 } });
    expect((await fetchPolylangLanguages(site)).status).toBe("PERMISSION_ERROR");
  });
});
