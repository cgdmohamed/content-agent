import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "@content-agent/config";
import { closeDb, markJobCompleted, markJobFailed, markJobProvider, markJobStarted, query, setContentFailure } from "./db.js";
import { processContentOperation, providerForOperationResult, syncGscForSite } from "./processors.js";
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
console.info(`تم تحميل إعدادات العامل. عدد العمليات المتوازية: ${env.WORKER_CONCURRENCY}`);

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});
connection.on("error", (error) => {
  console.error(`خطأ اتصال Redis في العامل: ${error.message}`);
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
      await markJobStarted(bullJobId);
      try {
        if (operation === "SYNC_GSC") {
          if (!siteId) throw new Error("لا يوجد siteId في مهمة GSC.");
          await syncGscForSite(siteId);
          await markJobProvider(bullJobId, "google-search-console");
        } else {
          if (!contentItemId) throw new Error("لا يوجد contentItemId في المهمة.");
          const result = await processContentOperation(contentItemId, operation);
          await markJobProvider(bullJobId, providerForOperationResult(result));
          await enqueueNextAutomatedStep(contentItemId, operation);
        }
        await markJobCompleted(bullJobId, Date.now() - startedAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : "خطأ غير معروف";
        await markJobFailed(bullJobId, message, Date.now() - startedAt);
        if (contentItemId) await setContentFailure(contentItemId, operation, message);
        throw error;
      }
    },
    { connection, concurrency: env.WORKER_CONCURRENCY }
  );
  worker.on("failed", (job, error) => {
    console.error(`فشلت المهمة ${job?.id ?? "غير معروفة"} في ${queueName}: ${error.message}`);
  });
  workers.push(worker);
}

console.info(`عامل وكيل المحتوى جاهز للطوابير: ${queueNames.join(", ")}`);

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
    GENERATE_IMAGE: "content-image",
    PUBLISH: "wordpress-publish"
  };
  return map[operation] ?? "maintenance";
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`إيقاف عامل وكيل المحتوى بسبب ${signal}...`);
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all([...queueClients.values()].map((queue) => queue.close()));
  await connection.quit();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
