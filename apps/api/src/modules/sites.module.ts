import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Req } from "@nestjs/common";
import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";
import { AuditService } from "../audit/audit.module.js";
import { DatabaseService } from "../database/database.module.js";
import { JobQueueService } from "../queue/job-queue.module.js";
import { encryptSecret } from "../security/secret-vault.js";
import { type AuthenticatedRequest, Roles } from "../security/access-control.js";
import { fieldLimits } from "../security/payload-limits.js";
import { normalizeGscProperty, normalizeGscServiceAccountJson, testGscConnection, type GscSiteCredentials } from "../integrations/google-search-console.js";
import { safeWordPressUrl, testRankMathBridge, testWordPressConnection, type InternalSiteCredentials } from "../integrations/wordpress.js";
import { buildJobId } from "./content.module.js";

export const sitesListLimit = 200;

class CreateSiteDto {
  @IsString()
  @MaxLength(fieldLimits.siteName)
  name!: string;

  @IsUrl({ require_tld: false })
  @MaxLength(fieldLimits.wordpressUrl)
  wordpressUrl!: string;

  @IsString()
  @MaxLength(fieldLimits.wordpressUsername)
  wordpressUsername!: string;

  @IsString()
  @MaxLength(fieldLimits.wordpressApplicationPassword)
  wordpressApplicationPassword!: string;

  @IsString()
  @MaxLength(fieldLimits.market)
  market!: string;

  @IsIn(["ar"])
  @MaxLength(fieldLimits.language)
  language!: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.writingStandard)
  writingStandard?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.gscProperty)
  gscProperty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.gscServiceAccountJson)
  gscServiceAccountJson?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "DISABLED"])
  status?: "ACTIVE" | "DISABLED";
}

class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.siteName)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(fieldLimits.wordpressUrl)
  wordpressUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.wordpressUsername)
  wordpressUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.wordpressApplicationPassword)
  wordpressApplicationPassword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.market)
  market?: string;

  @IsOptional()
  @IsIn(["ar"])
  @MaxLength(fieldLimits.language)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.writingStandard)
  writingStandard?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.gscProperty)
  gscProperty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.gscServiceAccountJson)
  gscServiceAccountJson?: string;

  @IsOptional()
  @IsIn(["ACTIVE", "DISABLED"])
  status?: "ACTIVE" | "DISABLED";
}

interface SiteRow {
  id: string;
  name: string;
  wordpress_url: string;
  wordpress_username: string;
  market: string;
  language: string;
  writing_standard: string | null;
  wordpress_status: string;
  rank_math_status: string;
  gsc_status: string;
  status: string;
  gsc_property: string | null;
  content_count: string;
  published_count: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
class SitesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly queue: JobQueueService,
    private readonly audit: AuditService
  ) {}

  async list(): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.query<SiteRow>(
      `SELECT s.id, s.name, s.wordpress_url, s.wordpress_username, s.market, s.language, s.writing_standard,
              s.wordpress_status, s.rank_math_status, s.gsc_status, s.status, s.gsc_property, s.created_at, s.updated_at,
              COUNT(c.id)::text AS content_count,
              COUNT(c.id) FILTER (WHERE c.status = 'PUBLISHED')::text AS published_count
       FROM sites s
       LEFT JOIN content_items c ON c.site_id = s.id
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT ${sitesListLimit}`
    );
    return result.rows.map(toPublicSite);
  }

  async create(body: CreateSiteDto, actorUserId?: string): Promise<Record<string, unknown>> {
    const wordpressUrl = safeWordPressInputUrl(body.wordpressUrl);
    const result = await this.db.query<SiteRow>(
      `INSERT INTO sites (name, wordpress_url, wordpress_username, wordpress_application_password_encrypted, market, language, writing_standard)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, wordpress_url, wordpress_username, market, language, writing_standard,
                 wordpress_status, rank_math_status, gsc_status, status, gsc_property, '0'::text AS content_count, '0'::text AS published_count, created_at, updated_at`,
      [
        body.name,
        wordpressUrl,
        body.wordpressUsername,
        encryptSecret(body.wordpressApplicationPassword),
        body.market,
        body.language,
        body.writingStandard ?? null
      ]
    );
    await this.audit.record({
      actorUserId,
      siteId: result.rows[0]!.id,
      eventType: "SITE_CREATED",
      message: "تم إنشاء موقع جديد",
      metadata: { name: body.name, wordpressUrl, market: body.market, language: body.language }
    });
    if (body.gscProperty || body.gscServiceAccountJson) {
      await this.update(String(result.rows[0]!.id), { gscProperty: body.gscProperty, gscServiceAccountJson: body.gscServiceAccountJson }, actorUserId);
      const updated = await this.db.query<SiteRow>(
        `SELECT id, name, wordpress_url, wordpress_username, market, language, writing_standard,
                wordpress_status, rank_math_status, gsc_status, status, gsc_property, '0'::text AS content_count, '0'::text AS published_count, created_at, updated_at
         FROM sites WHERE id = $1`,
        [result.rows[0]!.id]
      );
      return toPublicSite(updated.rows[0]!);
    }
    return toPublicSite(result.rows[0]!);
  }

  async update(id: string, body: UpdateSiteDto, actorUserId?: string): Promise<Record<string, unknown>> {
    const existing = await this.db.query<{ id: string }>("SELECT id FROM sites WHERE id = $1", [id]);
    if (!existing.rowCount) throw new NotFoundException("الموقع غير موجود");
    const wordpressUrl = body.wordpressUrl ? safeWordPressInputUrl(body.wordpressUrl) : null;
    const gscProperty = body.gscProperty ? safeGscPropertyInput(body.gscProperty) : null;
    const gscServiceAccountJson = body.gscServiceAccountJson ? safeGscServiceAccountInput(body.gscServiceAccountJson) : null;

    const result = await this.db.query<SiteRow>(
      `UPDATE sites SET
         name = COALESCE($2, name),
         wordpress_url = COALESCE($3, wordpress_url),
         wordpress_username = COALESCE($4, wordpress_username),
         wordpress_application_password_encrypted = COALESCE($5, wordpress_application_password_encrypted),
         market = COALESCE($6, market),
         language = COALESCE($7, language),
         writing_standard = COALESCE($8, writing_standard),
         gsc_property = COALESCE($9, gsc_property),
         gsc_service_account_encrypted = COALESCE($10, gsc_service_account_encrypted),
         status = COALESCE($11, status),
         updated_at = now()
       WHERE id = $1
       RETURNING id, name, wordpress_url, wordpress_username, market, language, writing_standard,
                 wordpress_status, rank_math_status, gsc_status, status, gsc_property, '0'::text AS content_count, '0'::text AS published_count, created_at, updated_at`,
      [
        id,
        body.name ?? null,
        wordpressUrl,
        body.wordpressUsername ?? null,
        body.wordpressApplicationPassword ? encryptSecret(body.wordpressApplicationPassword) : null,
        body.market ?? null,
        body.language ?? null,
        body.writingStandard ?? null,
        gscProperty,
        gscServiceAccountJson ? encryptSecret(gscServiceAccountJson) : null,
        body.status ?? null
      ]
    );
    await this.audit.record({
      actorUserId,
      siteId: id,
      eventType: "SITE_UPDATED",
      message: "تم تحديث إعدادات الموقع",
      metadata: { fields: publicAuditFields(body) }
    });
    return toPublicSite(result.rows[0]!);
  }

  async testWordPress(id: string, actorUserId?: string): Promise<{ id: string; status: string; message: string }> {
    const result = await this.db.query<InternalSiteCredentials & { site_status: string }>(
      "SELECT id, wordpress_url, wordpress_username, wordpress_application_password_encrypted, status AS site_status FROM sites WHERE id = $1",
      [id]
    );
    if (!result.rowCount) throw new NotFoundException("الموقع غير موجود");
    assertSiteActive(result.rows[0]!.site_status);
    const check = await testWordPressConnection(result.rows[0]!);
    await this.db.query("UPDATE sites SET wordpress_status = $2, updated_at = now() WHERE id = $1", [id, check.status]);
    await this.audit.record({ actorUserId, siteId: id, eventType: "SITE_WORDPRESS_TESTED", message: "تم اختبار اتصال ووردبريس", metadata: { status: check.status } });
    return { id, ...check };
  }

  async testRankMath(id: string, actorUserId?: string): Promise<{ id: string; status: string; message: string }> {
    const result = await this.db.query<InternalSiteCredentials & { site_status: string }>(
      "SELECT id, wordpress_url, wordpress_username, wordpress_application_password_encrypted, status AS site_status FROM sites WHERE id = $1",
      [id]
    );
    if (!result.rowCount) throw new NotFoundException("الموقع غير موجود");
    assertSiteActive(result.rows[0]!.site_status);
    const check = await testRankMathBridge(result.rows[0]!);
    await this.db.query("UPDATE sites SET rank_math_status = $2, updated_at = now() WHERE id = $1", [id, check.status]);
    await this.audit.record({ actorUserId, siteId: id, eventType: "SITE_RANKMATH_TESTED", message: "تم اختبار جسر رانك ماث", metadata: { status: check.status } });
    return { id, ...check };
  }

  async testGsc(id: string, actorUserId?: string): Promise<{ id: string; status: string; message: string }> {
    const result = await this.db.query<GscSiteCredentials & { site_status: string }>(
      "SELECT id, gsc_property, gsc_service_account_encrypted, status AS site_status FROM sites WHERE id = $1",
      [id]
    );
    if (!result.rowCount) throw new NotFoundException("الموقع غير موجود");
    assertSiteActive(result.rows[0]!.site_status);
    const check = await testGscConnection(result.rows[0]!);
    await this.db.query("UPDATE sites SET gsc_status = $2, updated_at = now() WHERE id = $1", [id, check.status]);
    await this.audit.record({ actorUserId, siteId: id, eventType: "SITE_GSC_TESTED", message: "تم اختبار اتصال بحث جوجل", metadata: { status: check.status } });
    return { id, ...check };
  }

  async syncGsc(id: string, actorUserId?: string): Promise<{ statusCode: 202; jobId: string; siteId: string }> {
    const site = await this.db.query<{ id: string; gsc_property: string | null; gsc_service_account_encrypted: string | null; site_status: string }>(
      "SELECT id, gsc_property, gsc_service_account_encrypted, status AS site_status FROM sites WHERE id = $1",
      [id]
    );
    if (!site.rowCount) throw new NotFoundException("الموقع غير موجود");
    assertSiteActive(site.rows[0]!.site_status);
    if (!site.rows[0]!.gsc_property || !site.rows[0]!.gsc_service_account_encrypted) {
      throw new BadRequestException("بيانات بحث جوجل غير مكتملة لهذا الموقع.");
    }
    const inFlight = await this.db.query<{ bull_job_id: string }>(
      `SELECT bull_job_id
       FROM job_runs
       WHERE operation = 'SYNC_GSC'
         AND bull_job_id LIKE $1
         AND status IN ('WAITING', 'ACTIVE', 'DELAYED')
         AND bull_job_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [`SYNC_GSC:${id}:%`]
    );
    if (inFlight.rowCount) return { statusCode: 202, jobId: inFlight.rows[0]!.bull_job_id, siteId: id };

    const jobId = buildJobId("SYNC_GSC", id);
    await this.queue.enqueue("gsc-sync", "SYNC_GSC", { siteId: id, operation: "SYNC_GSC" }, jobId);
    await this.db.query(
      `INSERT INTO job_runs (operation, queue_name, bull_job_id, status)
       VALUES ('SYNC_GSC', 'gsc-sync', $1, 'WAITING')
       ON CONFLICT DO NOTHING`,
      [jobId]
    );
    await this.audit.record({ actorUserId, siteId: id, eventType: "SITE_GSC_SYNC_ENQUEUED", message: "تمت إضافة مزامنة بحث جوجل للطابور", metadata: { jobId } });
    return { statusCode: 202, jobId, siteId: id };
  }
}

function toPublicSite(row: SiteRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    wordpressUrl: row.wordpress_url,
    wordpressUsername: row.wordpress_username,
    market: row.market,
    language: row.language,
    writingStandard: row.writing_standard,
    gscProperty: row.gsc_property,
    status: row.status,
    wordpressStatus: row.wordpress_status,
    rankMathStatus: row.rank_math_status,
    gscStatus: row.gsc_status,
    contentCount: Number(row.content_count),
    publishedCount: Number(row.published_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

@Controller("sites")
class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  list(): Promise<Array<Record<string, unknown>>> {
    return this.sites.list();
  }

  @Post()
  @Roles("ADMIN")
  create(@Body() body: CreateSiteDto, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.sites.create(body, request.user?.id);
  }

  @Patch(":id")
  @Roles("ADMIN")
  update(@Param("id") id: string, @Body() body: UpdateSiteDto, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.sites.update(id, body, request.user?.id);
  }

  @Post(":id/test-wordpress")
  @Roles("ADMIN")
  testWordPress(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ id: string; status: string; message: string }> {
    return this.sites.testWordPress(id, request.user?.id);
  }

  @Post(":id/test-rankmath")
  @Roles("ADMIN")
  testRankMath(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ id: string; status: string; message: string }> {
    return this.sites.testRankMath(id, request.user?.id);
  }

  @Post(":id/test-gsc")
  @Roles("ADMIN")
  testGsc(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ id: string; status: string; message: string }> {
    return this.sites.testGsc(id, request.user?.id);
  }

  @Post(":id/sync-gsc")
  @Roles("ADMIN")
  syncGsc(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ statusCode: 202; jobId: string; siteId: string }> {
    return this.sites.syncGsc(id, request.user?.id);
  }
}

@Module({ controllers: [SitesController], providers: [SitesService] })
export class SitesModule {}

export function publicAuditFields(value: object): string[] {
  return Object.keys(value).filter((field) => !field.toLowerCase().includes("password") && !field.toLowerCase().includes("json"));
}

export function isSiteActive(status: string): boolean {
  return status === "ACTIVE";
}

export function assertSiteActive(status: string): void {
  if (!isSiteActive(status)) throw new BadRequestException("لا يمكن تنفيذ هذا الإجراء على موقع معطل.");
}

export function safeWordPressInputUrl(value: string): string {
  try {
    return safeWordPressUrl(value).origin;
  } catch (error) {
    const message = error instanceof Error ? error.message : "رابط ووردبريس غير آمن.";
    throw new BadRequestException(message);
  }
}

export function safeGscPropertyInput(value: string): string {
  try {
    return normalizeGscProperty(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "خاصية بحث جوجل غير صالحة.";
    throw new BadRequestException(message);
  }
}

export function safeGscServiceAccountInput(value: string): string {
  try {
    return normalizeGscServiceAccountJson(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ملف حساب الخدمة غير صالح.";
    throw new BadRequestException(message);
  }
}
