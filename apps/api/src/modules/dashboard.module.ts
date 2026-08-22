import { Controller, Get, Module } from "@nestjs/common";
import type { ContentState } from "@content-agent/shared";
import { DatabaseService } from "../database/database.module.js";

export const dashboardSitesLimit = 24;

@Controller("dashboard")
class DashboardController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async get(): Promise<Record<string, unknown>> {
    const stats = await this.db.query<{
      total_content: string;
      pipeline: string;
      published: string;
      needs_attention: string;
      scheduled: string;
      monthly_ai_spend: string;
      average_score: string | null;
    }>(
      `SELECT
         COUNT(*)::text AS total_content,
         COUNT(*) FILTER (WHERE status NOT IN ('PUBLISHED', 'FAILED', 'DUPLICATE'))::text AS pipeline,
         COUNT(*) FILTER (WHERE status = 'PUBLISHED')::text AS published,
         COUNT(*) FILTER (WHERE status = 'FAILED' OR content_score < 60)::text AS needs_attention,
         COUNT(*) FILTER (WHERE status = 'SCHEDULED')::text AS scheduled,
         COALESCE((SELECT SUM(estimated_cost_usd)::text FROM api_usage_logs WHERE created_at >= date_trunc('month', now())), '0') AS monthly_ai_spend,
         ROUND(AVG(NULLIF(content_score, 0)))::text AS average_score
       FROM content_items`
    );
    const distribution = await this.db.query<{ name: ContentState; value: string }>(
      "SELECT status AS name, COUNT(*)::text AS value FROM content_items GROUP BY status ORDER BY status"
    );
    const sites = await this.db.query(
      `SELECT s.id, s.name, s.wordpress_url AS "wordpressUrl", s.market, s.language,
              s.wordpress_status AS "wordpressStatus", s.rank_math_status AS "rankMathStatus", s.gsc_status AS "gscStatus",
              COUNT(c.id)::int AS "contentCount",
              COUNT(c.id) FILTER (WHERE c.status = 'PUBLISHED')::int AS "publishedCount"
       FROM sites s
       LEFT JOIN content_items c ON c.site_id = s.id
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT ${dashboardSitesLimit}`
    );
    const attention = await this.db.query(
      `SELECT c.id, c.site_id AS "siteId", s.name AS site, c.topic, COALESCE(c.title, c.topic) AS title,
              COALESCE(c.target_keyword, '') AS "targetKeyword", c.status AS state, c.mode,
              c.scheduled_publish_at AS "scheduledDate", c.content_score AS score,
              c.updated_at AS "updatedAt", c.created_at AS "createdAt"
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.status = 'FAILED' OR c.content_score < 60
       ORDER BY c.updated_at DESC
       LIMIT 10`
    );
    const opportunities = await this.db.query(
      `SELECT g.site_id AS "siteId", s.name AS site, g.query, g.clicks, g.impressions, g.ctr, g.position, g.synced_at AS "syncedAt"
       FROM gsc_query_snapshots g
       JOIN sites s ON s.id = g.site_id
       ORDER BY g.impressions DESC, g.clicks ASC, g.position ASC
       LIMIT 10`
    );
    const row = stats.rows[0]!;
    return {
      totalContent: Number(row.total_content),
      pipeline: Number(row.pipeline),
      published: Number(row.published),
      needsAttention: Number(row.needs_attention),
      scheduled: Number(row.scheduled),
      monthlyAiSpend: Number(row.monthly_ai_spend),
      averageScore: Number(row.average_score ?? 0),
      distribution: distribution.rows.map((item) => ({ name: item.name, value: Number(item.value) })),
      sites: sites.rows,
      attention: attention.rows,
      opportunities: opportunities.rows
    };
  }
}

@Module({ controllers: [DashboardController] })
export class DashboardModule {}
