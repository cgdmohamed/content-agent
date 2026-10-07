import { timingSafeEqual } from "node:crypto";
import { Controller, Get, Header, Injectable, Module, NotFoundException, Req, UnauthorizedException } from "@nestjs/common";
import { heartbeatAgeMs, renderMetrics, workerHeartbeatKey, workerIsAlive, type Metric } from "@content-agent/shared";
import type { Request } from "express";
import { DatabaseService } from "../database/database.module.js";
import { observability } from "../observability/observability.js";
import { JobQueueService } from "../queue/job-queue.module.js";
import { Public } from "../security/access-control.js";

export interface MetricsSnapshot {
  contentByStatus: Array<{ status: string; count: number }>;
  jobsByStatus: Array<{ queue: string; status: string; count: number }>;
  failedJobsLastHour: number;
  oldestWaitingJobSeconds: number;
  aiSpendMonthUsd: number;
  workerHeartbeat: string | null;
  uptimeSeconds: number;
  now: number;
}

/** Pure mapping from a database/Redis snapshot to Prometheus metrics, so it can be unit tested. */
export function buildAppMetrics(snapshot: MetricsSnapshot): Metric[] {
  const age = heartbeatAgeMs(snapshot.workerHeartbeat, snapshot.now);
  return [
    { name: "content_agent_content_items", help: "Content items by workflow status", type: "gauge", samples: snapshot.contentByStatus.map((row) => ({ labels: { status: row.status }, value: row.count })) },
    { name: "content_agent_jobs", help: "Job runs by queue and status", type: "gauge", samples: snapshot.jobsByStatus.map((row) => ({ labels: { queue: row.queue, status: row.status }, value: row.count })) },
    { name: "content_agent_jobs_failed_last_hour", help: "Job runs that failed in the last hour", type: "gauge", samples: [{ value: snapshot.failedJobsLastHour }] },
    { name: "content_agent_oldest_waiting_job_seconds", help: "Age of the oldest job still waiting for a worker", type: "gauge", samples: [{ value: snapshot.oldestWaitingJobSeconds }] },
    { name: "content_agent_ai_spend_month_usd", help: "Estimated AI spend this calendar month (USD)", type: "gauge", samples: [{ value: snapshot.aiSpendMonthUsd }] },
    { name: "content_agent_worker_up", help: "1 when the worker heartbeat is fresh", type: "gauge", samples: [{ value: workerIsAlive(snapshot.workerHeartbeat, snapshot.now) ? 1 : 0 }] },
    { name: "content_agent_worker_heartbeat_age_seconds", help: "Seconds since the worker last reported (-1 = never)", type: "gauge", samples: [{ value: age === null ? -1 : Math.round(age / 1000) }] },
    { name: "content_agent_api_uptime_seconds", help: "API process uptime", type: "gauge", samples: [{ value: snapshot.uptimeSeconds }] }
  ];
}

export function bearerMatches(header: string | undefined, token: string): boolean {
  const presented = /^Bearer (.+)$/.exec(header ?? "")?.[1] ?? "";
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
class MetricsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly queue: JobQueueService
  ) {}

  async render(): Promise<string> {
    const [content, jobs, failed, waiting, spend, heartbeat] = await Promise.all([
      this.db.query<{ status: string; count: string }>("SELECT status, COUNT(*)::text AS count FROM content_items GROUP BY status"),
      this.db.query<{ queue_name: string; status: string; count: string }>("SELECT queue_name, status, COUNT(*)::text AS count FROM job_runs GROUP BY queue_name, status"),
      this.db.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM job_runs WHERE status = 'FAILED' AND finished_at >= now() - interval '1 hour'"),
      this.db.query<{ seconds: string | null }>("SELECT EXTRACT(EPOCH FROM now() - MIN(created_at))::text AS seconds FROM job_runs WHERE status IN ('WAITING', 'DELAYED')"),
      this.db.query<{ total: string }>("SELECT COALESCE(SUM(estimated_cost_usd), 0)::text AS total FROM api_usage_logs WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'"),
      this.queue.redis.get(workerHeartbeatKey).catch(() => null)
    ]);
    const { http, startedAt } = observability();
    const app = buildAppMetrics({
      contentByStatus: content.rows.map((row) => ({ status: row.status, count: Number(row.count) })),
      jobsByStatus: jobs.rows.map((row) => ({ queue: row.queue_name, status: row.status, count: Number(row.count) })),
      failedJobsLastHour: Number(failed.rows[0]?.count ?? 0),
      oldestWaitingJobSeconds: Math.round(Number(waiting.rows[0]?.seconds ?? 0)),
      aiSpendMonthUsd: Number(spend.rows[0]?.total ?? 0),
      workerHeartbeat: heartbeat,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      now: Date.now()
    });
    return renderMetrics([...app, ...http.toMetrics()]);
  }
}

@Public()
@Controller("metrics")
class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Prometheus scrape endpoint. Disabled (404) unless METRICS_TOKEN is set; requires `Authorization: Bearer <token>`. */
  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async scrape(@Req() request: Request): Promise<string> {
    const token = process.env.METRICS_TOKEN?.trim();
    if (!token) throw new NotFoundException();
    if (!bearerMatches(request.get("authorization"), token)) throw new UnauthorizedException();
    return this.metrics.render();
  }
}

@Module({ controllers: [MetricsController], providers: [MetricsService] })
export class MetricsModule {}
