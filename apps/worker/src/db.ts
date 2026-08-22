import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { loadEnv } from "@content-agent/config";

let pool: Pool | null = null;

function getPool(): Pool {
  pool ??= new Pool({
    connectionString: loadEnv().DATABASE_URL
  });
  return pool;
}

export function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values);
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}

export async function markJobStarted(bullJobId: string): Promise<void> {
  await query(
    `UPDATE job_runs
     SET status = 'ACTIVE', started_at = now(), attempt = attempt + 1
     WHERE bull_job_id = $1`,
    [bullJobId]
  );
}

export async function markJobCompleted(bullJobId: string, durationMs: number): Promise<void> {
  await query(
    `UPDATE job_runs
     SET status = 'COMPLETED', finished_at = now(), duration_ms = $2, error = NULL
     WHERE bull_job_id = $1`,
    [bullJobId, durationMs]
  );
}

export async function markJobProvider(bullJobId: string, provider: string | null | undefined): Promise<void> {
  if (!provider) return;
  await query(
    `UPDATE job_runs
     SET provider = $2
     WHERE bull_job_id = $1`,
    [bullJobId, provider]
  );
}

export async function markJobFailed(bullJobId: string, error: string, durationMs: number): Promise<void> {
  await query(
    `UPDATE job_runs
     SET status = 'FAILED', finished_at = now(), duration_ms = $2, error = $3
     WHERE bull_job_id = $1`,
    [bullJobId, durationMs, error]
  );
}

export async function setContentFailure(contentItemId: string, operation: string, error: string): Promise<void> {
  await query(
    `UPDATE content_items
     SET status = 'FAILED',
         failed_action = $2,
         error_message = $3,
         retry_count = retry_count + 1,
         last_attempted_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [contentItemId, operation, error]
  );
}

export async function appendAudit(contentItemId: string, eventType: string, message: string, metadata: Record<string, unknown> = {}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (content_item_id, event_type, message, metadata)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [contentItemId, eventType, message, JSON.stringify(metadata)]
  );
}
