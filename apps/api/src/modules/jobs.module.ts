import { BadRequestException, Controller, Get, Module, NotFoundException, Param, Post, Req } from "@nestjs/common";
import { AuditService } from "../audit/audit.module.js";
import { DatabaseService } from "../database/database.module.js";
import { JobQueueService } from "../queue/job-queue.module.js";
import { type AuthenticatedRequest, Roles } from "../security/access-control.js";
import { buildJobId } from "./content.module.js";

const jobGroupLimits = {
  active: 50,
  waiting: 50,
  delayed: 50,
  failed: 100,
  completed: 100,
  cancelled: 50
} as const;

type JobGroupName = keyof typeof jobGroupLimits;
type JobsList = Record<JobGroupName, unknown[]>;

@Controller("jobs")
@Roles("ADMIN")
class JobsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly queue: JobQueueService,
    private readonly audit: AuditService
  ) {}

  @Get()
  async list(): Promise<JobsList> {
    const entries = await Promise.all(
      (Object.keys(jobGroupLimits) as JobGroupName[]).map(async (group) => [group, await this.listGroup(group)] as const)
    );
    return Object.fromEntries(entries) as JobsList;
  }

  private async listGroup(group: JobGroupName): Promise<unknown[]> {
    const statuses = statusesForJobGroup(group);
    const result = await this.db.query(
      `SELECT j.id, j.content_item_id AS "contentItemId", c.title, c.topic, j.operation, j.provider, j.queue_name AS "queueName", j.bull_job_id AS "bullJobId",
              j.attempt, j.status, j.error, j.started_at AS "startedAt", j.finished_at AS "finishedAt", j.duration_ms AS "durationMs", j.created_at AS "createdAt"
       FROM job_runs j
       LEFT JOIN content_items c ON c.id = j.content_item_id
       WHERE j.status = ANY($1::text[])
       ORDER BY j.created_at DESC
       LIMIT ${jobGroupLimit(group)}`,
      [statuses]
    );
    return result.rows;
  }

  @Post(":id/retry")
  async retry(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ statusCode: 202; jobId: string }> {
    const result = await this.db.query<{
      id: string;
      contentItemId: string | null;
      operation: string;
      queueName: string;
      status: string;
    }>(
      `SELECT id, content_item_id AS "contentItemId", operation, queue_name AS "queueName", status
       FROM job_runs
       WHERE id = $1 OR bull_job_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );
    const job = result.rows[0];
    if (!job) throw new NotFoundException("المهمة غير موجودة.");
    if (job.status !== "FAILED") throw new BadRequestException("يمكن إعادة محاولة المهام الفاشلة فقط.");
    if (!job.contentItemId) throw new BadRequestException("هذه المهمة لا تحتوي على عنصر محتوى لإعادة المحاولة.");
    const retryJobId = buildJobId(job.operation, job.contentItemId, "retry");
    await this.queue.enqueue(job.queueName, job.operation, { contentItemId: job.contentItemId, operation: job.operation }, retryJobId);
    await this.db.query(
      `INSERT INTO job_runs (content_item_id, operation, queue_name, bull_job_id, status)
       VALUES ($1, $2, $3, $4, 'WAITING')`,
      [job.contentItemId, job.operation, job.queueName, retryJobId]
    );
    await this.db.query(
      `UPDATE content_items
       SET status = COALESCE(last_successful_state, 'QUEUED'),
           failed_action = NULL,
           error_message = NULL,
           last_attempted_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [job.contentItemId]
    );
    await this.audit.record({
      actorUserId: request.user?.id,
      contentItemId: job.contentItemId,
      eventType: "JOB_RETRIED",
      message: "تمت إعادة محاولة مهمة فاشلة",
      metadata: { previousJobId: id, retryJobId, operation: job.operation, queueName: job.queueName }
    });
    return { statusCode: 202, jobId: retryJobId };
  }

  @Post(":id/cancel")
  async cancel(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ ok: true; id: string }> {
    const result = await this.db.query<{
      id: string;
      contentItemId: string | null;
      operation: string;
      queueName: string;
      bullJobId: string;
      status: string;
    }>(
      `SELECT id, content_item_id AS "contentItemId", operation, queue_name AS "queueName", bull_job_id AS "bullJobId", status
       FROM job_runs
       WHERE id = $1 OR bull_job_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );
    const job = result.rows[0];
    if (!job) throw new NotFoundException("المهمة غير موجودة.");
    if (!canCancelJobStatus(job.status)) throw new BadRequestException("يمكن إلغاء المهام المنتظرة أو المؤجلة فقط.");
    try {
      await this.queue.cancelQueuedJob(job.queueName, job.bullJobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر إلغاء المهمة.";
      throw new BadRequestException(message);
    }
    await this.db.query(
      `UPDATE job_runs
       SET status = 'CANCELLED',
           error = NULL,
           finished_at = now()
       WHERE id = $1`,
      [job.id]
    );
    await this.audit.record({
      actorUserId: request.user?.id,
      contentItemId: job.contentItemId ?? undefined,
      eventType: "JOB_CANCELLED",
      message: "تم إلغاء مهمة قبل بدء تنفيذها",
      metadata: { jobId: job.id, bullJobId: job.bullJobId, operation: job.operation, queueName: job.queueName }
    });
    return { ok: true, id: job.id };
  }
}

@Module({ controllers: [JobsController] })
export class JobsModule {}

export function canCancelJobStatus(status: string): boolean {
  return ["WAITING", "DELAYED"].includes(status.toUpperCase());
}

export function jobGroupLimit(group: JobGroupName): number {
  return jobGroupLimits[group];
}

export function statusesForJobGroup(group: JobGroupName): string[] {
  const statuses: Record<JobGroupName, string[]> = {
    active: ["ACTIVE"],
    waiting: ["WAITING"],
    delayed: ["DELAYED"],
    failed: ["FAILED"],
    completed: ["COMPLETED"],
    cancelled: ["CANCELLED"]
  };
  return statuses[group];
}
