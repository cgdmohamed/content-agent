import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { encryptSecret } from "@content-agent/shared/secrets";

export const integrationEnabled = Boolean(process.env.TEST_DATABASE_URL);

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../../api/src/database/migrations");

/** Drops everything and re-applies the API's SQL migrations, exactly as the API does on startup. */
export async function resetDatabase(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    for (const file of readdirSync(migrationsDir).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
      await client.query(readFileSync(join(migrationsDir, file), "utf8"));
    }
  } finally {
    await client.end();
  }
}

export const wordpressHost = "https://203.0.113.10";

export async function seedSite(db: { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, overrides: { allowedModels?: string[] | null } = {}): Promise<string> {
  const result = await db.query(
    `INSERT INTO sites (name, wordpress_url, wordpress_username, wordpress_application_password_encrypted, market, language, allowed_models)
     VALUES ('موقع الاختبار', $1, 'editor', $2, 'SA', 'ar', $3::jsonb)
     RETURNING id`,
    [wordpressHost, encryptSecret("app-password"), overrides.allowedModels ? JSON.stringify(overrides.allowedModels) : null]
  );
  return String(result.rows[0]!.id);
}

export async function seedContent(
  db: { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  siteId: string,
  fields: { status?: string; topic?: string } = {}
): Promise<string> {
  const result = await db.query("INSERT INTO content_items (site_id, topic, status) VALUES ($1, $2, $3) RETURNING id", [siteId, fields.topic ?? "التسويق بالمحتوى", fields.status ?? "NEW"]);
  return String(result.rows[0]!.id);
}

export interface RecordedCall {
  method: string;
  url: URL;
  body: unknown;
}

export interface FetchMock {
  calls: RecordedCall[];
  restore: () => void;
}

type Responder = (call: RecordedCall) => Response | Promise<Response> | undefined;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

/** Replaces global fetch; the first responder returning a Response wins, unmatched calls fail the test loudly. */
export function mockFetch(...responders: Responder[]): FetchMock {
  const original = globalThis.fetch;
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    let body: unknown = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // Non-JSON bodies (form posts) stay as text.
      }
    }
    const call: RecordedCall = { method: (init?.method ?? "GET").toUpperCase(), url, body };
    calls.push(call);
    for (const responder of responders) {
      const response = await responder(call);
      if (response) return response;
    }
    throw new Error(`Unexpected fetch ${call.method} ${url.toString()}`);
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = original) };
}

export const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export function anthropicReply(text: string, usage = { input_tokens: 1000, output_tokens: 2000 }): Response {
  return json({ content: [{ type: "text", text }], usage });
}

export function openaiReply(text: string, usage = { prompt_tokens: 1000, completion_tokens: 2000 }): Response {
  return json({ choices: [{ message: { content: text } }], usage });
}

export function geminiReply(): Response {
  return json({
    candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: tinyPngBase64 } }] } }],
    usageMetadata: { promptTokenCount: 30, candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1290 }] }
  });
}

/** A permissive WordPress REST fake. `existingPost` makes the slug lookup return a post. */
export function wordpressResponder(options: { existingPost?: { id: number; title: string }; failMediaUploads?: number } = {}): Responder {
  let mediaFailures = options.failMediaUploads ?? 0;
  return (call) => {
    if (call.url.origin !== wordpressHost) return undefined;
    const path = call.url.pathname;
    if (path === "/wp-json/wp/v2/search") return json([]);
    if (path === "/wp-json/wp/v2/categories" || path === "/wp-json/wp/v2/tags") return call.method === "GET" ? json([]) : json({ id: 5 }, 201);
    if (path === "/wp-json/wp/v2/posts" && call.method === "GET") {
      return json(options.existingPost ? [{ id: options.existingPost.id, title: { raw: options.existingPost.title } }] : []);
    }
    if (path === "/wp-json/wp/v2/posts" && call.method === "POST") return json({ id: 77, link: `${wordpressHost}/post-77`, status: "publish" }, 201);
    const update = /^\/wp-json\/wp\/v2\/posts\/(\d+)$/.exec(path);
    if (update && call.method === "POST") return json({ id: Number(update[1]), link: `${wordpressHost}/post-${update[1]}`, status: "publish" });
    if (path === "/wp-json/wp/v2/media" && call.method === "POST") {
      if (mediaFailures > 0) {
        mediaFailures -= 1;
        return json({ message: "upload failed" }, 500);
      }
      return json({ id: 9, source_url: `${wordpressHost}/uploads/featured.png` }, 201);
    }
    if (/^\/wp-json\/wp\/v2\/media\/\d+$/.test(path)) return json({});
    return undefined;
  };
}
