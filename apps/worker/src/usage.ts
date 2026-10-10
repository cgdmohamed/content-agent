import { effectiveHardLimit, isBudgetExceeded } from "./budget.js";
import { query, withTransaction } from "./db.js";

// Advisory lock key (distinct from the API's migration lock) that serializes budget check + reservation.
const budgetLockKey = [20260822, 2201] as const;

export interface SpendReservation {
  provider: string;
  model: string;
  operation: string;
  /** The article, or null/absent for site-level work (then `siteId` and `label` attribute the spend). */
  contentItemId?: string | null;
  siteId?: string;
  label?: string;
  estimatedCostUsd: number;
}

/** Calendar month in UTC, matching the dashboard, reports and metrics (never the database session time zone). */
export const monthStartSql = "date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";

// A reservation that was never settled or released (the worker died mid-call) keeps its estimated cost, because the
// provider may have billed it, but is relabelled so reports can show it as "unconfirmed" instead of an in-flight call.
const reservationTtlMinutes = 30;

export const budgetExceededMessage = "تم تجاوز حد ميزانية الذكاء الاصطناعي الصارم لهذا الشهر.";

/**
 * Atomically checks the monthly hard limit and records the expected cost of a provider call as a
 * pending usage row, so concurrent jobs cannot all pass the check against the same stale total.
 */
export async function reserveSpend(reservation: SpendReservation): Promise<string> {
  return withTransaction(async (run) => {
    await run("SELECT pg_advisory_xact_lock($1, $2)", [...budgetLockKey]);
    await run(
      `UPDATE api_usage_logs SET error = 'RESERVATION_EXPIRED'
       WHERE success = false AND error = 'RESERVED' AND created_at < now() - make_interval(mins => $1)`,
      [reservationTtlMinutes]
    );
    const spend = await run<{ total: string }>(`SELECT COALESCE(SUM(estimated_cost_usd), 0)::text AS total FROM api_usage_logs WHERE created_at >= ${monthStartSql}`);
    const settings = await run<{ value: { monthlyAiBudgetUsd?: number; monthlyAiHardLimitUsd?: number } }>(
      "SELECT value FROM system_settings WHERE key = 'production_settings'"
    );
    const value = settings.rows[0]?.value ?? {};
    const hardLimit = effectiveHardLimit(
      value.monthlyAiBudgetUsd ?? Number(process.env.MONTHLY_AI_BUDGET_USD ?? 30),
      value.monthlyAiHardLimitUsd ?? Number(process.env.MONTHLY_AI_HARD_LIMIT_USD ?? 40)
    );
    if (isBudgetExceeded(Number(spend.rows[0]?.total ?? 0), hardLimit)) throw new Error(budgetExceededMessage);
    // Attribute the spend to the site now, so it survives later deletion of the article.
    const owner = reservation.contentItemId
      ? await run<{ site_id: string; label: string }>("SELECT site_id, COALESCE(title, topic) AS label FROM content_items WHERE id = $1", [reservation.contentItemId])
      : { rows: [{ site_id: reservation.siteId ?? null, label: reservation.label ?? null }] as Array<{ site_id: string | null; label: string | null }> };
    const inserted = await run<{ id: string }>(
      `INSERT INTO api_usage_logs (provider, model, operation, content_item_id, site_id, content_label, estimated_cost_usd, success, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'RESERVED')
       RETURNING id`,
      [reservation.provider, reservation.model, reservation.operation, reservation.contentItemId ?? null, owner.rows[0]?.site_id ?? null, owner.rows[0]?.label ?? null, reservation.estimatedCostUsd]
    );
    return inserted.rows[0]!.id;
  });
}

export async function settleSpend(
  id: string,
  result: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    costUsd: number;
    /** "reported" when the provider returned its own cost, "estimated" when computed from tokens and configured prices. */
    costSource?: "reported" | "estimated";
    durationMs: number;
  }
): Promise<void> {
  await query(
    `UPDATE api_usage_logs
     SET input_tokens = $2, output_tokens = $3, estimated_cost_usd = $4, duration_ms = $5, success = true, error = NULL,
         cache_read_tokens = $6, cache_write_tokens = $7, cost_source = $8,
         content_label = COALESCE((SELECT COALESCE(c.title, c.topic) FROM content_items c WHERE c.id = api_usage_logs.content_item_id), content_label)
     WHERE id = $1`,
    [id, result.inputTokens, result.outputTokens, result.costUsd, result.durationMs, result.cacheReadTokens ?? 0, result.cacheWriteTokens ?? 0, result.costSource ?? "estimated"]
  );
}

/**
 * The provider answered (HTTP 200) but the result was unusable, e.g. a blocked image or text instead of an image.
 * It still consumed tokens, so the call keeps its real cost and is recorded as failed.
 */
export async function billFailedCall(id: string, failure: { inputTokens: number; outputTokens: number; costUsd: number; durationMs: number; error: string }): Promise<void> {
  await query(
    `UPDATE api_usage_logs
     SET input_tokens = $2, output_tokens = $3, estimated_cost_usd = $4, duration_ms = $5, success = false, error = $6
     WHERE id = $1`,
    [id, failure.inputTokens, failure.outputTokens, failure.costUsd, failure.durationMs, failure.error]
  );
}

/** A failed provider call is not billed: zero the reservation and keep the error for the activity timeline. */
export async function releaseSpend(id: string, failure: { durationMs: number; error: string }): Promise<void> {
  await query(
    `UPDATE api_usage_logs
     SET estimated_cost_usd = 0, duration_ms = $2, success = false, error = $3
     WHERE id = $1`,
    [id, failure.durationMs, failure.error]
  );
}
