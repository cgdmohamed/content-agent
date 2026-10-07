import { Controller, Get, Module, NotFoundException, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.js";
import { Roles } from "../security/access-control.js";
import { effectiveHardLimit } from "./settings.module.js";

/** Rows whose call never reported back: they still count toward the budget (the provider may have billed them). */
const UNCONFIRMED = "('RESERVED', 'RESERVATION_EXPIRED')";
const MONTH_START = "date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";

export interface UsageRange {
  from: Date;
  toExclusive: Date;
  /** Inclusive last day, for display. */
  toInclusive: Date;
}

/** Usage reports default to the current month to date (UTC), the same window the AI budget uses. */
export function usageRange(from: string | undefined, to: string | undefined, now = new Date()): UsageRange {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = parseDay(from) ?? monthStart;
  const end = parseDay(to) ?? today;
  const [first, last] = start <= end ? [start, end] : [end, start];
  const toExclusive = new Date(last);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from: first, toExclusive, toInclusive: last };
}

function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const day = (date: Date): string => date.toISOString().slice(0, 10);
const money = (value: string | number | null | undefined): number => Number((Number(value ?? 0)).toFixed(6));

@Controller("reports")
@Roles("ADMIN")
class UsageReportController {
  constructor(private readonly db: DatabaseService) {}

  /** Spend and activity for every site in the period, reconciled with the global total. */
  @Get("usage")
  async overview(@Query("from") from?: string, @Query("to") to?: string): Promise<Record<string, unknown>> {
    const range = usageRange(from, to);
    const params = [range.from, range.toExclusive];
    const sites = await this.db.query<Record<string, string | null>>(
      `SELECT s.id, s.name, s.status,
              COALESCE(u.cost, 0)::text AS cost,
              COALESCE(u.unconfirmed, 0)::text AS unconfirmed,
              COALESCE(u.calls, 0)::text AS calls,
              COALESCE(u.failed, 0)::text AS failed,
              COALESCE(u.images, 0)::text AS images,
              COALESCE(u.input_tokens, 0)::text AS input_tokens,
              COALESCE(u.output_tokens, 0)::text AS output_tokens,
              (SELECT COUNT(*) FROM content_items c WHERE c.site_id = s.id AND c.created_at >= $1 AND c.created_at < $2)::text AS created,
              (SELECT COUNT(*) FROM content_items c WHERE c.site_id = s.id AND c.published_at >= $1 AND c.published_at < $2)::text AS published
       FROM sites s
       LEFT JOIN (
         SELECT site_id,
                SUM(estimated_cost_usd) AS cost,
                SUM(estimated_cost_usd) FILTER (WHERE NOT success AND error IN ${UNCONFIRMED}) AS unconfirmed,
                COUNT(*) AS calls,
                COUNT(*) FILTER (WHERE NOT success AND COALESCE(error, '') NOT IN ${UNCONFIRMED}) AS failed,
                COUNT(*) FILTER (WHERE success AND operation = 'GENERATE_IMAGE') AS images,
                SUM(input_tokens) AS input_tokens,
                SUM(output_tokens) AS output_tokens
         FROM api_usage_logs
         WHERE created_at >= $1 AND created_at < $2
         GROUP BY site_id
       ) u ON u.site_id = s.id
       ORDER BY COALESCE(u.cost, 0) DESC, s.name`,
      params
    );
    // Spend that cannot be tied to a site (legacy rows without content, or content that predates attribution).
    const unattributed = await this.db.query<{ cost: string; calls: string }>(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0)::text AS cost, COUNT(*)::text AS calls
       FROM api_usage_logs WHERE site_id IS NULL AND created_at >= $1 AND created_at < $2`,
      params
    );
    const total = await this.db.query<{ cost: string; calls: string }>(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0)::text AS cost, COUNT(*)::text AS calls
       FROM api_usage_logs WHERE created_at >= $1 AND created_at < $2`,
      params
    );
    return {
      from: day(range.from),
      to: day(range.toInclusive),
      totalCostUsd: money(total.rows[0]?.cost),
      totalCalls: Number(total.rows[0]?.calls ?? 0),
      unattributedCostUsd: money(unattributed.rows[0]?.cost),
      unattributedCalls: Number(unattributed.rows[0]?.calls ?? 0),
      month: await this.monthToDate(),
      sites: sites.rows.map((row) => {
        const published = Number(row.published);
        const cost = money(row.cost);
        return {
          siteId: row.id,
          name: row.name,
          status: row.status,
          costUsd: cost,
          unconfirmedCostUsd: money(row.unconfirmed),
          calls: Number(row.calls),
          failedCalls: Number(row.failed),
          images: Number(row.images),
          inputTokens: Number(row.input_tokens),
          outputTokens: Number(row.output_tokens),
          contentCreated: Number(row.created),
          contentPublished: published,
          costPerPublishedUsd: published > 0 ? money(cost / published) : null,
          shareOfTotal: Number(total.rows[0]?.cost) > 0 ? Number((cost / Number(total.rows[0]!.cost)).toFixed(4)) : 0
        };
      })
    };
  }

  /** What was done on one site and what it consumed. */
  @Get("sites/:siteId/usage")
  async site(@Param("siteId", new ParseUUIDPipe()) siteId: string, @Query("from") from?: string, @Query("to") to?: string): Promise<Record<string, unknown>> {
    const site = await this.db.query<{ id: string; name: string; status: string }>("SELECT id, name, status FROM sites WHERE id = $1", [siteId]);
    if (!site.rowCount) throw new NotFoundException("الموقع غير موجود");
    const range = usageRange(from, to);
    const params = [siteId, range.from, range.toExclusive];
    const scope = "FROM api_usage_logs a WHERE a.site_id = $1 AND a.created_at >= $2 AND a.created_at < $3";

    const [totals, byOperation, byModel, byDay, topContent, content, jobs, events] = await Promise.all([
      this.db.query<Record<string, string>>(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0)::text AS cost,
                COALESCE(SUM(estimated_cost_usd) FILTER (WHERE success), 0)::text AS confirmed,
                COALESCE(SUM(estimated_cost_usd) FILTER (WHERE NOT success AND error IN ${UNCONFIRMED}), 0)::text AS unconfirmed,
                COUNT(*)::text AS calls,
                COUNT(*) FILTER (WHERE success)::text AS ok,
                COUNT(*) FILTER (WHERE NOT success AND COALESCE(error, '') NOT IN ${UNCONFIRMED})::text AS failed,
                COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
                COALESCE(SUM(output_tokens), 0)::text AS output_tokens,
                COUNT(*) FILTER (WHERE success AND operation = 'GENERATE_IMAGE')::text AS images,
                COUNT(DISTINCT content_item_id)::text AS articles
         ${scope}`,
        params
      ),
      this.db.query<Record<string, string>>(
        `SELECT operation, COUNT(*)::text AS calls,
                COUNT(*) FILTER (WHERE success)::text AS ok,
                COUNT(*) FILTER (WHERE NOT success AND COALESCE(error, '') NOT IN ${UNCONFIRMED})::text AS failed,
                SUM(estimated_cost_usd)::text AS cost,
                COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
                COALESCE(SUM(output_tokens), 0)::text AS output_tokens
         ${scope} GROUP BY operation ORDER BY SUM(estimated_cost_usd) DESC, operation`,
        params
      ),
      this.db.query<Record<string, string>>(
        `SELECT provider, model, COUNT(*)::text AS calls, SUM(estimated_cost_usd)::text AS cost,
                COALESCE(SUM(input_tokens), 0)::text AS input_tokens, COALESCE(SUM(output_tokens), 0)::text AS output_tokens
         ${scope} GROUP BY provider, model ORDER BY SUM(estimated_cost_usd) DESC, provider, model`,
        params
      ),
      this.db.query<Record<string, string>>(
        `SELECT (a.created_at AT TIME ZONE 'UTC')::date::text AS day, SUM(estimated_cost_usd)::text AS cost, COUNT(*)::text AS calls
         ${scope} GROUP BY 1 ORDER BY 1`,
        params
      ),
      this.db.query<Record<string, string | null>>(
        `SELECT a.content_item_id AS id,
                COALESCE(c.title, c.topic, MAX(a.content_label)) AS label,
                c.status AS status,
                SUM(a.estimated_cost_usd)::text AS cost,
                COUNT(*)::text AS calls
         FROM api_usage_logs a
         LEFT JOIN content_items c ON c.id = a.content_item_id
         WHERE a.site_id = $1 AND a.created_at >= $2 AND a.created_at < $3
         GROUP BY a.content_item_id, CASE WHEN a.content_item_id IS NULL THEN a.content_label END, c.title, c.topic, c.status
         ORDER BY SUM(a.estimated_cost_usd) DESC
         LIMIT 10`,
        params
      ),
      this.db.query<Record<string, string>>(
        `SELECT COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3)::text AS created,
                COUNT(*) FILTER (WHERE published_at >= $2 AND published_at < $3)::text AS published,
                COUNT(*) FILTER (WHERE status = 'SCHEDULED')::text AS scheduled_now,
                COUNT(*) FILTER (WHERE status NOT IN ('PUBLISHED', 'FAILED', 'DUPLICATE', 'SCHEDULED'))::text AS pipeline_now,
                COUNT(*) FILTER (WHERE status = 'FAILED')::text AS failed_now
         FROM content_items WHERE site_id = $1`,
        params
      ),
      this.db.query<Record<string, string>>(
        `SELECT COUNT(*) FILTER (WHERE j.status = 'COMPLETED')::text AS completed,
                COUNT(*) FILTER (WHERE j.status = 'FAILED')::text AS failed,
                COUNT(*) FILTER (WHERE j.status = 'CANCELLED')::text AS cancelled
         FROM job_runs j JOIN content_items c ON c.id = j.content_item_id
         WHERE c.site_id = $1 AND j.created_at >= $2 AND j.created_at < $3`,
        params
      ),
      this.db.query(
        `SELECT al.id, al.event_type AS "eventType", al.message, al.created_at AS "createdAt",
                al.content_item_id AS "contentItemId", u.name AS actor
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
         WHERE al.created_at >= $2 AND al.created_at < $3
           AND (al.site_id = $1 OR al.content_item_id IN (SELECT id FROM content_items WHERE site_id = $1))
         ORDER BY al.created_at DESC
         LIMIT 40`,
        params
      )
    ]);

    // Spend on articles that never reached readers: deleted, failed or duplicate.
    const abandoned = await this.db.query<{ cost: string }>(
      `SELECT COALESCE(SUM(a.estimated_cost_usd), 0)::text AS cost
       FROM api_usage_logs a LEFT JOIN content_items c ON c.id = a.content_item_id
       WHERE a.site_id = $1 AND a.created_at >= $2 AND a.created_at < $3
         AND (a.content_item_id IS NULL OR c.status IN ('FAILED', 'DUPLICATE'))`,
      params
    );

    const t = totals.rows[0]!;
    const cost = money(t.cost);
    const published = Number(content.rows[0]?.published ?? 0);
    const articles = Number(t.articles);
    return {
      siteId,
      siteName: site.rows[0]!.name,
      siteStatus: site.rows[0]!.status,
      from: day(range.from),
      to: day(range.toInclusive),
      totals: {
        costUsd: cost,
        confirmedCostUsd: money(t.confirmed),
        unconfirmedCostUsd: money(t.unconfirmed),
        abandonedCostUsd: money(abandoned.rows[0]?.cost),
        calls: Number(t.calls),
        successfulCalls: Number(t.ok),
        failedCalls: Number(t.failed),
        inputTokens: Number(t.input_tokens),
        outputTokens: Number(t.output_tokens),
        images: Number(t.images),
        articlesWithUsage: articles,
        costPerArticleUsd: articles > 0 ? money(cost / articles) : null,
        costPerPublishedUsd: published > 0 ? money(cost / published) : null
      },
      activity: {
        contentCreated: Number(content.rows[0]?.created ?? 0),
        contentPublished: published,
        scheduledNow: Number(content.rows[0]?.scheduled_now ?? 0),
        pipelineNow: Number(content.rows[0]?.pipeline_now ?? 0),
        failedNow: Number(content.rows[0]?.failed_now ?? 0),
        jobsCompleted: Number(jobs.rows[0]?.completed ?? 0),
        jobsFailed: Number(jobs.rows[0]?.failed ?? 0),
        jobsCancelled: Number(jobs.rows[0]?.cancelled ?? 0)
      },
      byOperation: byOperation.rows.map((row) => ({
        operation: row.operation,
        calls: Number(row.calls),
        successfulCalls: Number(row.ok),
        failedCalls: Number(row.failed),
        costUsd: money(row.cost),
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens)
      })),
      byModel: byModel.rows.map((row) => ({
        provider: row.provider,
        model: row.model,
        calls: Number(row.calls),
        costUsd: money(row.cost),
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens)
      })),
      byDay: byDay.rows.map((row) => ({ date: row.day, costUsd: money(row.cost), calls: Number(row.calls) })),
      topContent: topContent.rows.map((row) => ({
        contentItemId: row.id,
        label: row.label ?? "بدون عنوان",
        status: row.status,
        deleted: row.id === null,
        costUsd: money(row.cost),
        calls: Number(row.calls)
      })),
      recentActivity: events.rows
    };
  }

  private async monthToDate(): Promise<Record<string, number>> {
    const spend = await this.db.query<{ total: string }>(`SELECT COALESCE(SUM(estimated_cost_usd), 0)::text AS total FROM api_usage_logs WHERE created_at >= ${MONTH_START}`);
    const settings = await this.db.query<{ value: { monthlyAiBudgetUsd?: number; monthlyAiHardLimitUsd?: number } }>("SELECT value FROM system_settings WHERE key = 'production_settings'");
    const budget = settings.rows[0]?.value.monthlyAiBudgetUsd ?? Number(process.env.MONTHLY_AI_BUDGET_USD ?? 30);
    const hardLimit = effectiveHardLimit(budget, settings.rows[0]?.value.monthlyAiHardLimitUsd ?? Number(process.env.MONTHLY_AI_HARD_LIMIT_USD ?? 40));
    return { costUsd: money(spend.rows[0]?.total), budgetUsd: budget, hardLimitUsd: hardLimit };
  }
}

@Module({ controllers: [UsageReportController] })
export class UsageReportModule {}
