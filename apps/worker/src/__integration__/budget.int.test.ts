import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, query } from "../db.js";
import { releaseSpend, reserveSpend, settleSpend } from "../usage.js";
import { integrationEnabled, resetDatabase } from "./helpers.js";

describe.skipIf(!integrationEnabled)("AI budget reservations against real PostgreSQL", () => {
  beforeEach(async () => {
    await resetDatabase();
    await query("INSERT INTO system_settings (key, value) VALUES ('production_settings', $1::jsonb)", [JSON.stringify({ monthlyAiBudgetUsd: 1, monthlyAiHardLimitUsd: 1 })]);
  });
  afterAll(async () => {
    await closeDb();
  });


  it("lets concurrent jobs overshoot the limit by at most one reservation, never more", async () => {
    // content_item_id has a foreign key: use a real item.
    const site = await query<{ id: string }>("INSERT INTO sites (name, wordpress_url, wordpress_username, wordpress_application_password_encrypted) VALUES ('s','https://203.0.113.10','u','x') RETURNING id");
    const item = await query<{ id: string }>("INSERT INTO content_items (site_id, topic) VALUES ($1, 't') RETURNING id", [site.rows[0]!.id]);
    const attempt = () => reserveSpend({ provider: "openai", model: "gpt-4o", operation: "WRITE_DRAFT", contentItemId: item.rows[0]!.id, estimatedCostUsd: 0.4 });

    const results = await Promise.allSettled(Array.from({ length: 8 }, attempt));

    // 0.4 + 0.4 = 0.8 < 1 admits a third (1.2); then the total is >= the limit so the rest are refused.
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(5);
    const total = await query<{ total: number }>("SELECT SUM(estimated_cost_usd)::float AS total FROM api_usage_logs");
    expect(total.rows[0]!.total).toBeCloseTo(1.2, 6);
  });

  it("settles a reservation with real usage and releases failed ones", async () => {
    const site = await query<{ id: string }>("INSERT INTO sites (name, wordpress_url, wordpress_username, wordpress_application_password_encrypted) VALUES ('s','https://203.0.113.10','u','x') RETURNING id");
    const item = await query<{ id: string }>("INSERT INTO content_items (site_id, topic) VALUES ($1, 't') RETURNING id", [site.rows[0]!.id]);
    const make = () => reserveSpend({ provider: "openai", model: "gpt-4o", operation: "WRITE_DRAFT", contentItemId: item.rows[0]!.id, estimatedCostUsd: 0.4 });
    const settled = await make();
    const released = await make();

    await settleSpend(settled, { inputTokens: 10, outputTokens: 20, costUsd: 0.01, durationMs: 5 });
    await releaseSpend(released, { durationMs: 5, error: "boom" });

    const rows = (await query("SELECT id, success, error, estimated_cost_usd::float AS cost FROM api_usage_logs")).rows;
    expect(rows.find((row) => row.id === settled)).toMatchObject({ success: true, error: null, cost: 0.01 });
    expect(rows.find((row) => row.id === released)).toMatchObject({ success: false, error: "boom", cost: 0 });
  });
});
