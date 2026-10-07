import "reflect-metadata";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { INestApplication } from "@nestjs/common";

// Loaded from the compiled output (`pnpm build`): Nest's constructor injection needs decorator metadata,
// which vitest's esbuild transform does not emit. Dynamic specifiers keep `tsc --noEmit` working before a build.
const distModule = (name: string): string => `../../dist/${name}.js`;

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL!;
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD!;
const webOrigin = process.env.PUBLIC_WEB_URL!;

let app: INestApplication;
let baseUrl = "";
let redis: Redis;

interface ApiResult<T = Record<string, unknown>> {
  status: number;
  body: T;
  cookie: string | null;
}

async function api<T = Record<string, any>>(path: string, options: { method?: string; body?: unknown; cookie?: string | null; origin?: string } = {}): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      Origin: options.origin ?? webOrigin
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  const setCookie = response.headers.get("set-cookie");
  return { status: response.status, body: (text ? JSON.parse(text) : null) as T, cookie: setCookie ? setCookie.split(";")[0]! : null };
}

async function login(email: string, password: string): Promise<ApiResult> {
  return api("/auth/login", { method: "POST", body: { email, password } });
}

async function resetDatabase(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  } finally {
    await client.end();
  }
}

describe.skipIf(!enabled)("API over HTTP with real PostgreSQL and Redis", () => {
  let adminCookie = "";

  beforeAll(async () => {
    await resetDatabase();
    redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
    await redis.flushdb();
    const { NestFactory } = await import("@nestjs/core");
    const { AppModule } = (await import(/* @vite-ignore */ distModule("modules/app.module"))) as { AppModule: new () => unknown };
    const { configureApp } = (await import(/* @vite-ignore */ distModule("app-setup"))) as { configureApp: (app: INestApplication, env: { PUBLIC_WEB_URL: string; TRUST_PROXY_HOPS: number }) => void };
    app = await NestFactory.create(AppModule as never, { logger: false });
    configureApp(app, { PUBLIC_WEB_URL: webOrigin, TRUST_PROXY_HOPS: 0 });
    await app.listen(0);
    baseUrl = await app.getUrl();
    baseUrl = baseUrl.replace("[::1]", "127.0.0.1");
    adminCookie = (await login(adminEmail, adminPassword)).cookie!;
  });

  afterAll(async () => {
    await app?.close();
    await redis?.quit();
  });

  it("reports ready only when PostgreSQL and Redis are reachable", async () => {
    const ready = await api("/health/ready");
    expect(ready.status).toBe(200);
  });

  it("exposes Prometheus metrics only with the bearer token and reports worker liveness", async () => {
    const scrape = (token?: string) => fetch(`${baseUrl}/api/metrics`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    expect((await scrape()).status).toBe(401);
    expect((await scrape("wrong-token-value-123456")).status).toBe(401);

    await redis.del("content-agent:worker:heartbeat");
    let text = await (await scrape(process.env.METRICS_TOKEN)).text();
    expect(text).toContain("content_agent_worker_up 0");
    expect(text).toContain("content_agent_http_requests_total");

    await redis.set("content-agent:worker:heartbeat", String(Date.now()), "PX", 60_000);
    text = await (await scrape(process.env.METRICS_TOKEN)).text();
    expect(text).toContain("content_agent_worker_up 1");
    expect((await api("/health/ready")).body).toMatchObject({ status: "ok", checks: { worker: "يعمل" } });
  });

  it("rejects anonymous calls and validates the session", async () => {
    expect((await api("/sites")).status).toBe(401);
    expect((await api("/auth/me")).body).toBeNull();
    const me = await api("/auth/me", { cookie: adminCookie });
    expect(me.body).toMatchObject({ email: adminEmail, role: "ADMIN" });
    expect(me.body).not.toHaveProperty("tv");
    expect((await api("/sites", { cookie: adminCookie })).status).toBe(200);
  });

  it("treats malformed identifiers as bad requests instead of server errors", async () => {
    expect((await api("/content/not-a-uuid", { cookie: adminCookie })).status).toBe(400);
    expect((await api("/content", { method: "POST", cookie: adminCookie, body: { siteId: "", topic: "موضوع" } })).status).toBe(400);
  });

  it("blocks cross-site writes and unknown fields", async () => {
    expect((await api("/sites", { method: "POST", cookie: adminCookie, origin: "https://evil.example.com", body: {} })).status).toBe(403);
    const unknown = await api("/users", { method: "POST", cookie: adminCookie, body: { name: "x", email: "x@example.com", password: "Str0ng-Passw0rd!2026", role: "EDITOR", isRoot: true } });
    expect(unknown.status).toBe(400);
  });

  it("revokes sessions immediately when a user is disabled or logs out", async () => {
    const created = await api("/users", { method: "POST", cookie: adminCookie, body: { name: "محرر", email: "editor@example.com", password: "Str0ng-Passw0rd!2026", role: "EDITOR" } });
    expect(created.status).toBe(201);
    const editorId = String(created.body.id);

    const first = (await login("editor@example.com", "Str0ng-Passw0rd!2026")).cookie!;
    expect((await api("/sites", { cookie: first })).status).toBe(200);
    expect((await api("/users", { cookie: first })).status).toBe(403); // editors cannot manage users

    // Admin disables the account: the cookie already in the editor's browser stops working at once.
    expect((await api(`/users/${editorId}`, { method: "PATCH", cookie: adminCookie, body: { status: "DISABLED" } })).status).toBe(200);
    expect((await api("/sites", { cookie: first })).status).toBe(401);
    expect((await api("/auth/me", { cookie: first })).body).toBeNull();
    expect((await login("editor@example.com", "Str0ng-Passw0rd!2026")).status).toBe(401);

    // Re-enable, log in again, then log out: the replayed cookie is dead.
    await api(`/users/${editorId}`, { method: "PATCH", cookie: adminCookie, body: { status: "ACTIVE" } });
    const second = (await login("editor@example.com", "Str0ng-Passw0rd!2026")).cookie!;
    expect((await api("/auth/logout", { method: "POST", cookie: second })).status).toBe(201);
    expect((await api("/sites", { cookie: second })).status).toBe(401);
  });

  it("rate-limits repeated failed logins through Redis", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await login("victim@example.com", "wrong-password")).status).toBe(401);
    expect((await login("victim@example.com", "wrong-password")).status).toBe(429);
    const keys = await redis.keys("login-limit:*");
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys.some((key) => key.includes("victim"))).toBe(false);
    // The admin account is unaffected by someone else's lockout.
    expect((await login(adminEmail, adminPassword)).status).toBe(201);
  });

  it("creates a site and content, then queues the first job in BullMQ and job_runs", async () => {
    const site = await api("/sites", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "موقع الاختبار", wordpressUrl: "https://203.0.113.10", wordpressUsername: "editor", wordpressApplicationPassword: "app-password", market: "SA", language: "ar" }
    });
    expect(site.status).toBe(201);
    expect(site.body).not.toHaveProperty("wordpressApplicationPassword");

    const content = await api("/content", { method: "POST", cookie: adminCookie, body: { siteId: site.body.id, topic: "التسويق بالمحتوى" } });
    expect(content.status).toBe(201);
    const contentId = String(content.body.id);

    const queued = await api(`/content/${contentId}/generate-ideas`, { method: "POST", cookie: adminCookie });
    expect(queued.status).toBe(201);
    const jobId = String(queued.body.jobId);

    const queue = new Queue("content-ideas", { connection: redis });
    const job = await queue.getJob(jobId);
    expect(job?.name).toBe("GENERATE_IDEAS");
    expect(job?.data).toMatchObject({ contentItemId: contentId });
    await queue.close();

    // Repeating the request while the first job is in flight returns the same job instead of queueing a duplicate.
    const again = await api(`/content/${contentId}/generate-ideas`, { method: "POST", cookie: adminCookie });
    expect(again.body.jobId).toBe(jobId);

    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const runs = await client.query("SELECT status, operation FROM job_runs WHERE content_item_id = $1", [contentId]);
    await client.end();
    expect(runs.rows).toEqual([{ status: "WAITING", operation: "GENERATE_IDEAS" }]);
  });

  it("stores per-site model settings and rejects models outside the catalog", async () => {
    const sites = await api<Array<Record<string, any>>>("/sites", { cookie: adminCookie });
    const siteId = String(sites.body[0]!.id);
    const updated = await api(`/sites/${siteId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { allowedModels: ["openai:gpt-4o-mini", "bogus:model"], operationModels: { writing: [{ provider: "openai", model: "gpt-4o-mini" }, { provider: "openai", model: "not-in-catalog" }], image: [{ provider: "openai", model: "gpt-4o-mini" }] } }
    });
    expect(updated.status).toBe(200);
    expect(updated.body.allowedModels).toEqual(["openai:gpt-4o-mini"]);
    expect(updated.body.operationModels).toEqual({ writing: [{ provider: "openai", model: "gpt-4o-mini" }] });

    const cleared = await api(`/sites/${siteId}`, { method: "PATCH", cookie: adminCookie, body: { allowedModels: [], operationModels: {} } });
    expect(cleared.body.allowedModels).toEqual([]);
    expect(cleared.body.operationModels).toEqual({});
  });

  it("accepts custom model prices and exposes them in the catalog", async () => {
    const saved = await api("/settings", { method: "PATCH", cookie: adminCookie, body: { customModels: [{ provider: "openai", model: "gpt-9-test", kind: "text", label: "اختبار", inputPerM: 1, outputPerM: 2 }] } });
    expect(saved.status).toBe(200);
    expect((saved.body.modelCatalog as Array<{ model: string }>).some((spec) => spec.model === "gpt-9-test")).toBe(true);
    const invalid = await api("/settings", { method: "PATCH", cookie: adminCookie, body: { customModels: [{ provider: "openai", model: "bad id!", kind: "text", inputPerM: 1, outputPerM: 1 }] } });
    expect(invalid.status).toBe(400);
  });

  it("logs browser crashes sent by the web app", async () => {
    expect((await api("/client-errors", { method: "POST", cookie: adminCookie, body: { message: "boom", stack: "at x", url: "/content" } })).status).toBe(204);
    expect((await api("/client-errors", { method: "POST", body: { message: "boom" } })).status).toBe(401);
  });

  it("reports per-site activity and spend, keeps spend of deleted articles, and reconciles with the global total", async () => {
    const createSite = async (name: string) =>
      String((await api("/sites", { method: "POST", cookie: adminCookie, body: { name, wordpressUrl: "https://203.0.113.11", wordpressUsername: "u", wordpressApplicationPassword: "p", market: "SA", language: "ar" } })).body.id);
    const siteA = await createSite("موقع أ");
    const siteB = await createSite("موقع ب");
    const createContent = async (siteId: string, topic: string) => String((await api("/content", { method: "POST", cookie: adminCookie, body: { siteId, topic } })).body.id);
    const keep = await createContent(siteA, "مقال يبقى");
    const doomed = await createContent(siteA, "مقال سيُحذف");
    const other = await createContent(siteB, "مقال الموقع ب");

    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      const usage = (site: string | null, content: string | null, label: string | null, operation: string, cost: number, success = true, error: string | null = null, ageDays = 0) =>
        db.query(
          `INSERT INTO api_usage_logs (provider, model, operation, content_item_id, site_id, content_label, input_tokens, output_tokens, estimated_cost_usd, success, error, created_at)
           VALUES ('anthropic', 'claude-3-5-sonnet-latest', $1, $2, $3, $4, 1000, 2000, $5, $6, $7, now() - make_interval(days => $8))`,
          [operation, content, site, label, cost, success, error, ageDays]
        );
      await usage(siteA, keep, "مقال يبقى", "GENERATE_IDEAS", 0.01);
      await usage(siteA, keep, "مقال يبقى", "WRITE_DRAFT", 0.05);
      await usage(siteA, doomed, "مقال سيُحذف", "WRITE_DRAFT", 0.07);
      await usage(siteA, keep, "مقال يبقى", "GENERATE_IMAGE", 0.1);
      await usage(siteA, keep, "مقال يبقى", "WRITE_DRAFT", 0.02, false, "RESERVED"); // in flight: counts toward the budget, shown as unconfirmed
      await usage(siteA, keep, "مقال يبقى", "REVIEW_DRAFT", 0, false, "provider timeout"); // failed call: billed nothing
      await usage(siteB, other, "مقال الموقع ب", "WRITE_DRAFT", 0.4);
      await usage(null, null, null, "LEGACY_IMPORT", 0.25); // cannot be tied to a site
      await usage(siteA, keep, "مقال يبقى", "WRITE_DRAFT", 9, true, null, 400); // outside the default period
    } finally {
      await db.end();
    }

    // Deleting the article used to make its spend disappear from the site total (content_item_id -> NULL).
    expect((await api(`/content/${doomed}`, { method: "DELETE", cookie: adminCookie })).status).toBeLessThan(300);

    const report = await api(`/reports/sites/${siteA}/usage`, { cookie: adminCookie });
    expect(report.status).toBe(200);
    expect(report.body.totals).toMatchObject({
      costUsd: 0.25, // 0.01 + 0.05 + 0.07 (deleted article) + 0.1 + 0.02 in flight; the 400-day-old row is outside the period
      confirmedCostUsd: 0.23,
      unconfirmedCostUsd: 0.02,
      abandonedCostUsd: 0.07,
      calls: 6,
      failedCalls: 1,
      images: 1,
      articlesWithUsage: 1
    });
    const operations = Object.fromEntries((report.body.byOperation as Array<{ operation: string; costUsd: number; calls: number }>).map((row) => [row.operation, row]));
    expect(operations.WRITE_DRAFT).toMatchObject({ calls: 3, costUsd: 0.14 });
    expect(operations.GENERATE_IMAGE?.costUsd).toBe(0.1);
    const top = report.body.topContent as Array<{ label: string; deleted: boolean; costUsd: number }>;
    expect(top.find((row) => row.deleted)).toMatchObject({ label: "مقال سيُحذف", costUsd: 0.07 });
    expect(report.body.activity).toMatchObject({ contentCreated: 1 });
    expect((report.body.recentActivity as unknown[]).length).toBeGreaterThan(0);

    // A wider period includes the old row, and the old report's aiCost now follows the same period and attribution.
    const wide = await api(`/reports/sites/${siteA}/usage?from=2020-01-01`, { cookie: adminCookie });
    expect((wide.body.totals as { costUsd: number }).costUsd).toBe(9.25);
    const legacyReport = await api(`/reports/sites/${siteA}?from=2020-01-01`, { cookie: adminCookie });
    expect(legacyReport.body.aiCost).toBe(9.25);
    expect((await api(`/reports/sites/${siteA}`, { cookie: adminCookie })).body.aiCost).toBe(0.25);

    // Per-site rows + unattributed spend always add up to the global total, which matches the dashboard and the budget window.
    const overview = await api("/reports/usage", { cookie: adminCookie });
    const sites = overview.body.sites as Array<{ siteId: string; costUsd: number; shareOfTotal: number }>;
    const sum = sites.reduce((total, row) => total + row.costUsd, 0) + (overview.body.unattributedCostUsd as number);
    expect(Number(sum.toFixed(6))).toBe(overview.body.totalCostUsd);
    expect(overview.body.totalCostUsd).toBe(0.9); // 0.25 + 0.4 + 0.25 legacy
    expect(overview.body.unattributedCostUsd).toBe(0.25);
    expect(sites.find((row) => row.siteId === siteB)?.costUsd).toBe(0.4);
    expect(sites[0]!.siteId).toBe(siteB); // sorted by spend
    expect((overview.body.month as { costUsd: number }).costUsd).toBe(overview.body.totalCostUsd);
    expect((await api("/dashboard", { cookie: adminCookie })).body.monthlyAiSpend).toBe(overview.body.totalCostUsd);
    // Per-provider totals (for invoice reconciliation) add up to the same global total.
    const providers = overview.body.byProvider as Array<{ provider: string; costUsd: number }>;
    expect(Number(providers.reduce((total, row) => total + row.costUsd, 0).toFixed(6))).toBe(overview.body.totalCostUsd);
    expect(providers.find((row) => row.provider === "anthropic")?.costUsd).toBe(0.9); // every seeded row uses this provider

    expect((await api("/reports/sites/not-a-uuid/usage", { cookie: adminCookie })).status).toBe(400);
    expect((await api("/reports/sites/00000000-0000-4000-8000-000000000000/usage", { cookie: adminCookie })).status).toBe(404);
  });

  it("backfills site attribution for usage rows written before migration 010", async () => {
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      const item = await db.query<{ id: string; site_id: string }>("SELECT id, site_id FROM content_items LIMIT 1");
      await db.query("INSERT INTO api_usage_logs (provider, model, operation, content_item_id, estimated_cost_usd) VALUES ('openai', 'gpt-4o', 'WRITE_DRAFT', $1, 0.01)", [item.rows[0]!.id]);
      const migration = readFileSync(new URL("../database/migrations/010_usage_attribution.sql", import.meta.url), "utf8");
      await db.query(migration); // idempotent: safe to re-run
      const row = await db.query("SELECT site_id, content_label FROM api_usage_logs WHERE provider = 'openai' AND estimated_cost_usd = 0.01");
      expect(row.rows[0]).toMatchObject({ site_id: item.rows[0]!.site_id });
      expect(row.rows[0]!.content_label).toBeTruthy();
    } finally {
      await db.end();
    }
  });
});

