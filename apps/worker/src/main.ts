import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "@content-agent/config";
import { createLogger, workerHeartbeatIntervalMs, workerHeartbeatKey } from "@content-agent/shared";
import { captureException, flushMonitoring, initMonitoring } from "@content-agent/shared/monitoring";
import { closeDb, markJobCompleted, markJobFailed, markJobProvider, markJobRetrying, markJobStarted, query, setContentFailure } from "./db.js";
import { processContentOperation, providerForOperationResult, syncGscForSite } from "./processors.js";
import { sitesNeedingPageSync, syncPagesForSite } from "./pages-sync.js";
import { hasRetriesLeft } from "./retry.js";
import { nextAutomatedOperation, shouldAutoContinue, type AutomationState } from "./automation.js";

type ContentState =
  | "NEW"
  | "QUEUED"
  | "IDEAS_READY"
  | "IDEA_SELECTED"
  | "GAPS_READY"
  | "DRAFTED"
  | "REVIEWED"
  | "IMAGE_READY"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "DUPLICATE"
  | "FAILED";

type ContentOperation =
  | "GENERATE_IDEAS"
  | "SELECT_IDEA"
  | "RESEARCH_GAPS"
  | "WRITE_DRAFT"
  | "REVIEW_DRAFT"
  | "OPTIMIZE_LINKS"
  | "TRANSLATE_CONTENT"
  | "GENERATE_IMAGE"
  | "SKIP_IMAGE"
  | "APPROVE"
  | "SCHEDULE"
  | "PUBLISH"
  | "RETRY";

const queueNames = [
  "content-ideas",
  "content-research",
  "content-writing",
  "content-review",
  "content-image",
  "wordpress-publish",
  "gsc-sync",
  "maintenance"
] as const;

export interface ContentJobPayload {
  contentItemId: string;
  operation: ContentOperation;
  idempotencyKey: string;
}

export function buildNextJob(contentItemId: string, state: Parameters<typeof nextPrimaryOperation>[0]): ContentJobPayload | null {
  const operation = nextPrimaryOperation(state);
  if (!operation) return null;
  return {
    contentItemId,
    operation,
    idempotencyKey: `${operation}:${contentItemId}`
  };
}

function nextPrimaryOperation(state: ContentState): ContentOperation | null {
  switch (state) {
    case "NEW":
    case "QUEUED":
      return "GENERATE_IDEAS";
    case "IDEAS_READY":
      return "SELECT_IDEA";
    case "IDEA_SELECTED":
      return "RESEARCH_GAPS";
    case "GAPS_READY":
      return "WRITE_DRAFT";
    case "DRAFTED":
      return "REVIEW_DRAFT";
    case "REVIEWED":
      return "GENERATE_IMAGE";
    case "IMAGE_READY":
      return "APPROVE";
    case "APPROVED":
    case "SCHEDULED":
      return "PUBLISH";
    case "FAILED":
      return "RETRY";
    default:
      return null;
  }
}

console.info("بدء تشغيل عامل وكيل المحتوى...");
const env = loadEnv();
const logger = createLogger({
  service: "worker",
  format: env.LOG_FORMAT ?? (env.NODE_ENV === "production" ? "json" : "pretty"),
  level: env.LOG_LEVEL
});
if (await initMonitoring({ dsn: env.SENTRY_DSN, service: "worker", environment: env.SENTRY_ENVIRONMENT })) logger.info("error tracking enabled");
logger.info("worker configuration loaded", { concurrency: env.WORKER_CONCURRENCY });

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});
connection.on("error", (error) => {
  logger.error("redis connection error", { error });
});

// The API reports worker liveness (health, metrics) and Docker's healthcheck reads this key.
async function beat(): Promise<void> {
  try {
    await connection.set(workerHeartbeatKey, String(Date.now()), "PX", workerHeartbeatIntervalMs * 4);
  } catch (error) {
    logger.warn("heartbeat failed", { error });
  }
}
void beat();
const heartbeatTimer = setInterval(() => void beat(), workerHeartbeatIntervalMs);
heartbeatTimer.unref();

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled rejection", { error: reason });
  captureException(reason, { source: "unhandledRejection" });
});
process.on("uncaughtException", (error) => {
  logger.error("uncaught exception", { error });
  captureException(error, { source: "uncaughtException" });
  void flushMonitoring().finally(() => process.exit(1));
});

const workers: Worker[] = [];
const queueClients = new Map<string, Queue>();
let shuttingDown = false;

for (const queueName of queueNames) {
  const worker = new Worker(
    queueName,
    async (job) => {
      const startedAt = Date.now();
      const operation = String(job.name);
      const contentItemId = String(job.data?.contentItemId ?? "");
      const siteId = String(job.data?.siteId ?? "");
      const bullJobId = String(job.id ?? `${operation}:${contentItemId}`);
      const jobLog = logger.child({ jobId: bullJobId, queue: queueName, operation, contentItemId: contentItemId || undefined, siteId: siteId || undefined, attempt: job.attemptsMade + 1 });
      await markJobStarted(bullJobId);
      jobLog.info("job started");
      try {
        if (operation === "SYNC_GSC") {
          if (!siteId) throw new Error("لا يوجد siteId في مهمة GSC.");
          await syncGscForSite(siteId);
          await markJobProvider(bullJobId, "google-search-console");
        } else if (operation === "SYNC_PAGES") {
          if (!siteId) throw new Error("لا يوجد siteId في مهمة مزامنة الصفحات.");
          const synced = await syncPagesForSite(siteId);
          await markJobProvider(bullJobId, "wordpress");
          jobLog.info("site pages synced", { ...synced });
        } else {
          if (!contentItemId) throw new Error("لا يوجد contentItemId في المهمة.");
          const result = await processContentOperation(contentItemId, operation);
          await markJobProvider(bullJobId, providerForOperationResult(result));
          await enqueueNextAutomatedStep(contentItemId, operation);
        }
        await markJobCompleted(bullJobId, Date.now() - startedAt);
        jobLog.info("job completed", { durationMs: Date.now() - startedAt });
      } catch (error) {
        const message = error instanceof Error ? error.message : "خطأ غير معروف";
        if (hasRetriesLeft(job.attemptsMade, job.opts.attempts)) {
          // BullMQ will retry this job: keep the content item in its current state instead of showing FAILED.
          await markJobRetrying(bullJobId, message, Date.now() - startedAt);
          jobLog.warn("job failed, will retry", { durationMs: Date.now() - startedAt, error });
        } else {
          await markJobFailed(bullJobId, message, Date.now() - startedAt);
          jobLog.error("job failed permanently", { durationMs: Date.now() - startedAt, error });
          captureException(error, { jobId: bullJobId, queue: queueName, operation, contentItemId });
          if (contentItemId) await setContentFailure(contentItemId, operation, message);
        }
        throw error;
      }
    },
    { connection, concurrency: env.WORKER_CONCURRENCY }
  );
  worker.on("error", (error) => {
    logger.error("worker error", { queue: queueName, error });
  });
  worker.on("stalled", (jobId) => {
    logger.warn("job stalled and will be re-queued", { queue: queueName, jobId });
  });
  workers.push(worker);
}

logger.info("worker ready", { queues: [...queueNames] });

/** Keeps every site's page index fresh: once a day per site, checked hourly (and shortly after start). */
async function schedulePageSyncs(): Promise<void> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    for (const siteId of await sitesNeedingPageSync()) {
      const jobId = normalizeBullJobId(`SYNC_PAGES-${day}-${siteId}`);
      try {
        await queueFor("maintenance").add("SYNC_PAGES", { siteId, operation: "SYNC_PAGES" }, { jobId, attempts: 2, backoff: { type: "exponential", delay: 60_000 }, removeOnComplete: true, removeOnFail: 50 });
        await query("INSERT INTO job_runs (operation, queue_name, bull_job_id, status) VALUES ('SYNC_PAGES', 'maintenance', $1, 'WAITING') ON CONFLICT DO NOTHING", [jobId]);
      } catch (error) {
        logger.warn("could not queue page sync", { siteId, error });
      }
    }
  } catch (error) {
    logger.warn("page sync scheduling failed", { error });
  }
}
const pageSyncTimer = setInterval(() => void schedulePageSyncs(), 60 * 60 * 1000);
pageSyncTimer.unref();
setTimeout(() => void schedulePageSyncs(), 30_000).unref();

async function enqueueNextAutomatedStep(contentItemId: string, finishedOperation: string): Promise<void> {
  const result = await query<AutomationState>("SELECT status, mode, auto_publish FROM content_items WHERE id = $1", [contentItemId]);
  const state = result.rows[0];
  if (!state || !shouldAutoContinue(state)) return;
  const nextOperation = nextAutomatedOperation(state.status);
  if (!nextOperation) return;
  const queueName = queueForOperation(nextOperation);
  const existing = await query<{ bull_job_id: string }>(
    `SELECT bull_job_id
     FROM job_runs
     WHERE content_item_id = $1
       AND operation = $2
       AND status IN ('WAITING', 'ACTIVE', 'DELAYED')
       AND bull_job_id IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [contentItemId, nextOperation]
  );
  if (existing.rowCount) return;

  const jobId = buildSafeJobId(nextOperation, contentItemId);
  await queueFor(queueName).add(nextOperation, { contentItemId, operation: nextOperation }, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: false,
    removeOnFail: false
  });
  await query(
    `INSERT INTO job_runs (content_item_id, operation, queue_name, bull_job_id, status)
     VALUES ($1, $2, $3, $4, 'WAITING')
     ON CONFLICT DO NOTHING`,
    [contentItemId, nextOperation, queueName, jobId]
  );
  await query(
    `INSERT INTO audit_logs (content_item_id, event_type, message, metadata)
     VALUES ($1, 'CONTENT_AUTO_JOB_ENQUEUED', 'تمت إضافة الخطوة التالية تلقائيًا إلى الطابور', $2::jsonb)`,
    [contentItemId, JSON.stringify({ finishedOperation, nextOperation, queueName, jobId })]
  );
}

function queueFor(name: string): Queue {
  const existing = queueClients.get(name);
  if (existing) return existing;
  const created = new Queue(name, { connection });
  queueClients.set(name, created);
  return created;
}

function buildSafeJobId(operation: string, entityId: string): string {
  return normalizeBullJobId([operation, entityId, Date.now()].join("-"));
}

function normalizeBullJobId(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 256) || `job-${Date.now()}`;
}

function queueForOperation(operation: string): string {
  const map: Record<string, string> = {
    GENERATE_IDEAS: "content-ideas",
    RESEARCH_GAPS: "content-research",
    WRITE_DRAFT: "content-writing",
    REVIEW_DRAFT: "content-review",
    OPTIMIZE_LINKS: "content-review",
    TRANSLATE_CONTENT: "content-writing",
    GENERATE_IMAGE: "content-image",
    PUBLISH: "wordpress-publish"
  };
  return map[operation] ?? "maintenance";
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("worker shutting down", { signal });
  clearInterval(heartbeatTimer);
  clearInterval(pageSyncTimer);
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all([...queueClients.values()].map((queue) => queue.close()));
  await connection.quit();
  await closeDb();
  await flushMonitoring();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
