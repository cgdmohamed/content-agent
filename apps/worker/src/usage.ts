import { effectiveHardLimit, isBudgetExceeded } from "./budget.js";
import { query, withTransaction } from "./db.js";

// Advisory lock key (distinct from the API's migration lock) that serializes budget check + reservation.
const budgetLockKey = [20260822, 2201] as const;

export interface SpendReservation {
  provider: string;
  model: string;
  operation: string;
  contentItemId: string;
  estimatedCostUsd: number;
}

export const budgetExceededMessage = "تم تجاوز حد ميزانية الذكاء الاصطناعي الصارم لهذا الشهر.";

/**
 * Atomically checks the monthly hard limit and records the expected cost of a provider call as a
 * pending usage row, so concurrent jobs cannot all pass the check against the same stale total.
 */
export async function reserveSpend(reservation: SpendReservation): Promise<string> {
  return withTransaction(async (run) => {
    await run("SELECT pg_advisory_xact_lock($1, $2)", [...budgetLockKey]);
    const spend = await run<{ total: string }>(
      "SELECT COALESCE(SUM(estimated_cost_usd), 0)::text AS total FROM api_usage_logs WHERE created_at >= date_trunc('month', now())"
    );
    const settings = await run<{ value: { monthlyAiBudgetUsd?: number; monthlyAiHardLimitUsd?: number } }>(
      "SELECT value FROM system_settings WHERE key = 'production_settings'"
    );
    const value = settings.rows[0]?.value ?? {};
    const hardLimit = effectiveHardLimit(
      value.monthlyAiBudgetUsd ?? Number(process.env.MONTHLY_AI_BUDGET_USD ?? 30),
      value.monthlyAiHardLimitUsd ?? Number(process.env.MONTHLY_AI_HARD_LIMIT_USD ?? 40)
    );
    if (isBudgetExceeded(Number(spend.rows[0]?.total ?? 0), hardLimit)) throw new Error(budgetExceededMessage);
    const inserted = await run<{ id: string }>(
      `INSERT INTO api_usage_logs (provider, model, operation, content_item_id, estimated_cost_usd, success, error)
       VALUES ($1, $2, $3, $4, $5, false, 'RESERVED')
       RETURNING id`,
      [reservation.provider, reservation.model, reservation.operation, reservation.contentItemId, reservation.estimatedCostUsd]
    );
    return inserted.rows[0]!.id;
  });
}

export async function settleSpend(
  id: string,
  result: { inputTokens: number; outputTokens: number; costUsd: number; durationMs: number }
): Promise<void> {
  await query(
    `UPDATE api_usage_logs
     SET input_tokens = $2, output_tokens = $3, estimated_cost_usd = $4, duration_ms = $5, success = true, error = NULL
     WHERE id = $1`,
    [id, result.inputTokens, result.outputTokens, result.costUsd, result.durationMs]
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
