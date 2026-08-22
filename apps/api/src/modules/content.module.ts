import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { findDuplicateMatches, nextPrimaryOperation, sanitizeArticleHtml, scoreContent, type ContentState } from "@content-agent/shared";
import { AuditService, sanitizeAuditMetadata } from "../audit/audit.module.js";
import { DatabaseService } from "../database/database.module.js";
import { JobQueueService, normalizeBullJobId } from "../queue/job-queue.module.js";
import { type AuthenticatedRequest, Roles } from "../security/access-control.js";
import { fieldLimits } from "../security/payload-limits.js";
import { updateWordPressPostStatus } from "../integrations/wordpress.js";

const defaultContentPageSize = 25;
const maxContentPageSize = 100;

class CreateManualContentDto {
  @IsString()
  siteId!: string;

  @IsString()
  @MaxLength(fieldLimits.topic)
  topic!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  ideasCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.contentGoal)
  contentGoal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.audience)
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.searchIntent)
  searchIntent?: string;
}

class CreateBulkContentDto {
  @IsString()
  siteId!: string;

  @IsString()
  @MaxLength(fieldLimits.bulkTopics)
  topics!: string;

  @IsDateString()
  startDate!: string;

  @IsString()
  @MaxLength(fieldLimits.publishTime)
  publishTime!: string;

  @IsInt()
  @Min(1)
  @Max(30)
  intervalDays!: number;

  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  ideasCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.contentGoal)
  contentGoal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.audience)
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.searchIntent)
  searchIntent?: string;
}

class SelectIdeaDto {
  @IsInt()
  @Min(0)
  ideaIndex!: number;
}

class UpdateContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.title)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.draftHtml)
  draftHtml?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.metaDescription)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.category)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.imageAlt)
  imageAlt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(fieldLimits.tags)
  @IsString({ each: true })
  @MaxLength(fieldLimits.tag, { each: true })
  tags?: string[];
}

class ScheduleContentDto {
  @IsDateString()
  scheduledPublishAt!: string;
}

class ScoreContentDto {
  @IsString()
  @MaxLength(fieldLimits.draftHtml)
  html!: string;

  @IsString()
  @MaxLength(fieldLimits.title)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(fieldLimits.metaDescription)
  metaDescription?: string;
}

class BulkContentIdsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}

export interface ContentListQuery {
  search?: string;
  siteId?: string;
  state?: string;
  mode?: string;
  minScore?: string;
  updatedFrom?: string;
  updatedTo?: string;
  needsAttention?: string;
  page?: string;
  pageSize?: string;
}

export interface ContentListFilter {
  sql: string;
  values: unknown[];
  page: number;
  pageSize: number;
  offset: number;
}

export interface ContentListResponse {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
}

interface ContentRow {
  id: string;
  site_id: string;
  site_name: string;
  topic: string;
  title: string | null;
  target_keyword: string | null;
  status: ContentState;
  mode: "MANUAL" | "BULK" | "AUTO_PILOT";
  scheduled_publish_at: Date | null;
  content_score: number;
  updated_at: Date;
  created_at: Date;
}

interface DuplicateCandidateRow {
  id: string;
  topic: string;
  title: string | null;
  target_keyword: string | null;
  status: string;
}

interface CreatedBulkItemRow {
  id: string;
  topic: string;
  scheduled_publish_at: Date | null;
}

interface ContentAuditRow {
  id: string;
  eventType: string;
  message: string;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

interface ContentJobRow {
  id: string;
  operation: string;
  provider: string | null;
  queueName: string;
  attempt: number;
  status: string;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  createdAt: Date;
}

interface ContentUsageRow {
  id: string;
  provider: string;
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: string | number;
  success: boolean;
  error: string | null;
  createdAt: Date;
}

interface ContentVersionRow {
  id: string;
  actorName: string | null;
  title: string | null;
  contentScore: number;
  changeSummary: string;
  createdAt: Date;
}

interface ContentVersionSnapshotRow {
  id: string;
  content_item_id: string;
  title: string | null;
  draft_html: string | null;
  meta_description: string | null;
  category: string | null;
  tags: unknown[];
  image_alt: string | null;
  content_score: number;
  content_score_details: unknown[];
}

interface DuplicateSourceRow {
  id: string;
  site_id: string;
  site_status: "ACTIVE" | "DISABLED";
  topic: string;
  title: string | null;
  target_keyword: string | null;
  search_intent: string | null;
  editorial_brief: Record<string, unknown>;
  ideas: unknown[];
  selected_idea: Record<string, unknown> | null;
  competitor_gaps: string | null;
  sources: unknown[];
  draft_html: string | null;
  meta_description: string | null;
  category: string | null;
  tags: unknown[];
  image_prompt: string | null;
  image_alt: string | null;
  content_score: number;
  content_score_details: unknown[];
}

@Injectable()
class ContentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly queue: JobQueueService,
    private readonly audit: AuditService
  ) {}

  async list(query: ContentListQuery = {}): Promise<ContentListResponse> {
    const filter = buildContentListFilter(query);
    const [result, total] = await Promise.all([
      this.db.query<ContentRow>(
      `SELECT c.id, c.site_id, s.name AS site_name, c.topic, c.title, c.target_keyword, c.status, c.mode,
              c.scheduled_publish_at, c.content_score, c.updated_at, c.created_at
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       ${filter.sql}
       ORDER BY c.updated_at DESC, c.created_at DESC
       LIMIT ${filter.pageSize}
       OFFSET ${filter.offset}`,
        filter.values
      ),
      this.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM content_items c
         JOIN sites s ON s.id = c.site_id
         ${filter.sql}`,
        filter.values
      )
    ]);
    return {
      items: result.rows.map(toPublicContentRow),
      total: Number(total.rows[0]?.count ?? 0),
      page: filter.page,
      pageSize: filter.pageSize
    };
  }

  async create(body: CreateManualContentDto, actorUserId?: string): Promise<Record<string, unknown>> {
    const site = await this.db.query<{ id: string }>("SELECT id FROM sites WHERE id = $1 AND status = 'ACTIVE'", [body.siteId]);
    if (!site.rowCount) throw new NotFoundException("الموقع غير موجود أو غير نشط.");
    const ideasCount = await this.resolveIdeasCount(body.ideasCount);

    const candidates = await this.db.query<DuplicateCandidateRow>(
      `SELECT id, topic, title, target_keyword, status
       FROM content_items
       WHERE site_id = $1
       ORDER BY created_at DESC
       LIMIT 250`,
      [body.siteId]
    );
    const matches = findDuplicateMatches(
      body.topic,
      candidates.rows.map((row) => ({
        id: row.id,
        topic: row.topic,
        title: row.title,
        keyword: row.target_keyword,
        status: row.status
      }))
    );
    if (matches.length > 0) {
      const duplicate = await this.db.query<ContentRow>(
        `INSERT INTO content_items (site_id, topic, status, mode, error_message, editorial_brief, created_by)
         VALUES ($1, $2, 'DUPLICATE', 'MANUAL', $3, $4, $5)
         RETURNING id, site_id, (SELECT name FROM sites WHERE id = $1) AS site_name, topic, title, target_keyword, status, mode,
                   scheduled_publish_at, content_score, updated_at, created_at`,
        [
          body.siteId,
          body.topic,
          `يوجد محتوى مشابه: ${matches.map((match) => `${match.title ?? match.topic} (${match.similarity}%)`).join(" | ")}`,
          JSON.stringify(buildEditorialBrief(body, ideasCount)),
          actorUserId ?? null
        ]
      );
      await this.audit.record({
        actorUserId,
        contentItemId: duplicate.rows[0]!.id,
        siteId: body.siteId,
        eventType: "CONTENT_DUPLICATE_CREATED",
        message: "تم إنشاء عنصر محتوى مكرر بعد كشف التشابه",
        metadata: { matches: matches.map((match) => ({ id: match.id, similarity: match.similarity })) }
      });
      return { ...toPublicContentRow(duplicate.rows[0]!), duplicates: matches };
    }

    const result = await this.db.query<ContentRow>(
      `INSERT INTO content_items (site_id, topic, status, mode, search_intent, editorial_brief, created_by)
       VALUES ($1, $2, 'NEW', 'MANUAL', $3, $4, $5)
       RETURNING id, site_id, (SELECT name FROM sites WHERE id = $1) AS site_name, topic, title, target_keyword, status, mode,
                 scheduled_publish_at, content_score, updated_at, created_at`,
      [body.siteId, body.topic, body.searchIntent ?? "تلقائية", JSON.stringify(buildEditorialBrief(body, ideasCount)), actorUserId ?? null]
    );
    await this.audit.record({
      actorUserId,
      contentItemId: result.rows[0]!.id,
      siteId: body.siteId,
      eventType: "CONTENT_CREATED",
      message: "تم إنشاء عنصر محتوى جديد",
      metadata: { topic: body.topic, ideasCount }
    });
    return { ...toPublicContentRow(result.rows[0]!), nextOperation: nextPrimaryOperation("NEW") };
  }

  async createBulk(body: CreateBulkContentDto, actorUserId?: string): Promise<Record<string, unknown>> {
    const site = await this.db.query<{ id: string; name: string }>("SELECT id, name FROM sites WHERE id = $1 AND status = 'ACTIVE'", [body.siteId]);
    if (!site.rowCount) throw new NotFoundException("الموقع غير موجود أو غير نشط.");
    const topics = parseBulkTopics(body.topics);
    if (topics.length === 0) throw new BadRequestException("أدخل موضوعًا واحدًا على الأقل.");
    if (topics.length > 100) throw new BadRequestException("الحد الأقصى للدفعة الواحدة هو 100 موضوع.");
    if (!isPublishTime(body.publishTime)) throw new BadRequestException("وقت النشر يجب أن يكون بصيغة HH:mm.");
    const ideasCount = await this.resolveIdeasCount(body.ideasCount);
    const editorialBrief = buildEditorialBrief(body, ideasCount);

    const candidates = await this.db.query<DuplicateCandidateRow>(
      `SELECT id, topic, title, target_keyword, status
       FROM content_items
       WHERE site_id = $1
       ORDER BY created_at DESC
       LIMIT 500`,
      [body.siteId]
    );
    const memory = candidates.rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      title: row.title,
      keyword: row.target_keyword,
      status: row.status
    }));
    const accepted: Array<{ topic: string; scheduledPublishAt: Date }> = [];
    const rejected: Array<Record<string, unknown>> = [];

    for (const topic of topics) {
      const matches = findDuplicateMatches(topic, memory);
      if (matches.length > 0) {
        rejected.push({ topic, matches: matches.slice(0, 3) });
        continue;
      }
      accepted.push({
        topic,
        scheduledPublishAt: scheduledPublishDate(body.startDate, body.publishTime, accepted.length, body.intervalDays)
      });
      memory.push({ id: `batch-${accepted.length}`, topic, title: null, keyword: null, status: "BATCH_PENDING" });
    }

    if (accepted.length === 0) {
      throw new BadRequestException({
        message: "كل موضوعات الدفعة تبدو مكررة.",
        rejected
      });
    }

    const created = await this.db.transaction(async (query) => {
      const batch = await query<{ id: string }>(
        `INSERT INTO content_batches (site_id, name, topics_count, accepted_count, rejected_count, start_date, publish_time, interval_days, auto_publish, shared_editorial_brief, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10::jsonb, $11)
         RETURNING id`,
        [
          body.siteId,
          `دفعة ${site.rows[0]!.name} - ${new Date().toISOString().slice(0, 10)}`,
          topics.length,
          accepted.length,
          rejected.length,
          body.startDate,
          body.publishTime,
          body.intervalDays,
          body.autoPublish === true,
          JSON.stringify(editorialBrief),
          actorUserId ?? null
        ]
      );
      const batchId = batch.rows[0]!.id;
      const rows: CreatedBulkItemRow[] = [];
      for (const item of accepted) {
        const result = await query<CreatedBulkItemRow>(
          `INSERT INTO content_items (site_id, batch_id, topic, status, mode, search_intent, editorial_brief, scheduled_publish_at, auto_publish, created_by)
           VALUES ($1, $2, $3, 'NEW', 'BULK', $4, $5::jsonb, $6, $7, $8)
           RETURNING id, topic, scheduled_publish_at`,
          [
            body.siteId,
            batchId,
            item.topic,
            body.searchIntent ?? "تلقائية",
            JSON.stringify(editorialBrief),
            item.scheduledPublishAt,
            body.autoPublish === true,
            actorUserId ?? null
          ]
        );
        rows.push(result.rows[0]!);
      }
      return { batchId, rows };
    });

    await this.audit.record({
      actorUserId,
      siteId: body.siteId,
      eventType: "CONTENT_BATCH_CREATED",
      message: "تم إنشاء دفعة محتوى",
      metadata: { batchId: created.batchId, accepted: accepted.length, rejected: rejected.length, autoPublish: body.autoPublish === true }
    });

    if (body.autoPublish === true) {
      for (const row of created.rows) {
        await this.enqueueOperation(row.id, "GENERATE_IDEAS", actorUserId);
      }
    }

    return {
      id: created.batchId,
      siteId: body.siteId,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      items: created.rows.map((row) => ({
        id: row.id,
        topic: row.topic,
        scheduledPublishAt: row.scheduled_publish_at
      })),
      rejected
    };
  }

  async get(id: string): Promise<Record<string, unknown>> {
    const result = await this.db.query(
      `SELECT c.*, s.name AS site_name, s.wordpress_url
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.id = $1`,
      [id]
    );
    if (!result.rowCount) throw new NotFoundException("عنصر المحتوى غير موجود");
    const row = result.rows[0] as Record<string, unknown>;
    const [audit, jobs, usage, versions] = await Promise.all([this.contentAudit(id), this.contentJobs(id), this.contentUsage(id), this.contentVersions(id)]);
    return {
      id: row.id,
      siteId: row.site_id,
      site: row.site_name,
      wordpressUrl: row.wordpress_url ?? "",
      topic: row.topic,
      title: row.title ?? row.topic,
      targetKeyword: row.target_keyword ?? "",
      state: row.status,
      mode: row.mode,
      ideas: row.ideas ?? [],
      selectedIdea: row.selected_idea ?? null,
      draftHtml: row.draft_html ?? "",
      metaDescription: row.meta_description ?? "",
      category: row.category ?? "",
      tags: row.tags ?? [],
      imagePrompt: row.image_prompt ?? "",
      imageAlt: row.image_alt ?? "",
      imageUrl: row.image_url ?? "",
      competitorGaps: row.competitor_gaps ?? "",
      sources: row.sources ?? [],
      scheduledDate: row.scheduled_publish_at,
      score: row.content_score,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      activity: mergeContentActivity(audit, jobs, usage),
      versions
    };
  }

  async enqueueOperation(id: string, operation: string, actorUserId?: string, options: { delayMs?: number } = {}): Promise<{ statusCode: 202; jobId: string; contentItemId: string }> {
    const current = await this.db.query<{ status: ContentState; site_status: "ACTIVE" | "DISABLED" }>(
      `SELECT c.status, s.status AS site_status
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.id = $1`,
      [id]
    );
    if (!current.rowCount) throw new NotFoundException("عنصر المحتوى غير موجود");
    if (!isActiveSiteStatus(current.rows[0]!.site_status)) {
      throw new BadRequestException("لا يمكن تشغيل مهمة على موقع معطل.");
    }
    const state = current.rows[0]!.status;
    if (!canRunOperation(state, operation)) {
      throw new BadRequestException(`لا يمكن تنفيذ هذه العملية في الحالة الحالية: ${state}`);
    }
    const queueName = queueForOperation(operation);
    const inFlight = await this.db.query<{ bull_job_id: string }>(
      `SELECT bull_job_id
       FROM job_runs
       WHERE content_item_id = $1
         AND operation = $2
         AND status IN ('WAITING', 'ACTIVE', 'DELAYED')
         AND bull_job_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [id, operation]
    );
    if (inFlight.rowCount) return { statusCode: 202, jobId: inFlight.rows[0]!.bull_job_id, contentItemId: id };

    const jobId = buildJobId(operation, id);
    const delayMs = normalizedDelayMs(options.delayMs);
    await this.queue.enqueue(queueName, operation, { contentItemId: id, operation }, jobId, delayMs);
    await this.db.query(
      `INSERT INTO job_runs (content_item_id, operation, queue_name, bull_job_id, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [id, operation, queueName, jobId, delayMs > 0 ? "DELAYED" : "WAITING"]
    );
    await this.db.query("UPDATE content_items SET last_attempted_at = now(), updated_at = now() WHERE id = $1", [id]);
    await this.audit.record({
      actorUserId,
      contentItemId: id,
      eventType: "CONTENT_JOB_ENQUEUED",
      message: "تمت إضافة مهمة محتوى إلى الطابور",
      metadata: { operation, queueName, jobId, delayMs }
    });
    return { statusCode: 202, jobId, contentItemId: id };
  }

  async retry(id: string, actorUserId?: string): Promise<{ statusCode: 202; jobId: string; contentItemId: string }> {
    const current = await this.db.query<{
      status: ContentState;
      last_successful_state: ContentState | null;
      failed_action: string | null;
      site_status: "ACTIVE" | "DISABLED";
    }>(
      `SELECT c.status, c.last_successful_state, c.failed_action, s.status AS site_status
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.id = $1`,
      [id]
    );
    const item = current.rows[0];
    if (!item) throw new NotFoundException("عنصر المحتوى غير موجود");
    if (item.status !== "FAILED") throw new BadRequestException("يمكن إعادة محاولة المحتوى الفاشل فقط.");
    if (!isActiveSiteStatus(item.site_status)) throw new BadRequestException("لا يمكن تشغيل مهمة على موقع معطل.");

    const operation = retryOperationForFailedContent(item.failed_action, item.last_successful_state);
    const retryState = retryStateForOperation(operation, item.last_successful_state);
    const queueName = queueForOperation(operation);
    const inFlight = await this.db.query<{ bull_job_id: string }>(
      `SELECT bull_job_id
       FROM job_runs
       WHERE content_item_id = $1
         AND operation = $2
         AND status IN ('WAITING', 'ACTIVE', 'DELAYED')
         AND bull_job_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [id, operation]
    );
    if (inFlight.rowCount) return { statusCode: 202, jobId: inFlight.rows[0]!.bull_job_id, contentItemId: id };

    const jobId = buildJobId(operation, id, "retry");
    await this.queue.enqueue(queueName, operation, { contentItemId: id, operation }, jobId);
    await this.db.query(
      `INSERT INTO job_runs (content_item_id, operation, queue_name, bull_job_id, status)
       VALUES ($1, $2, $3, $4, 'WAITING')`,
      [id, operation, queueName, jobId]
    );
    await this.db.query(
      `UPDATE content_items
       SET status = $2,
           failed_action = NULL,
           error_message = NULL,
           last_attempted_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [id, retryState]
    );
    await this.audit.record({
      actorUserId,
      contentItemId: id,
      eventType: "CONTENT_RETRY_ENQUEUED",
      message: "تمت إعادة محاولة خطوة المحتوى الفاشلة",
      metadata: { operation, queueName, jobId, retryState }
    });
    return { statusCode: 202, jobId, contentItemId: id };
  }

  async selectIdea(id: string, ideaIndex: number, actorUserId?: string): Promise<Record<string, unknown>> {
    const result = await this.db.query<{ ideas: unknown[]; site_status: "ACTIVE" | "DISABLED" }>(
      `SELECT c.ideas, s.status AS site_status
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.id = $1`,
      [id]
    );
    if (!result.rowCount) throw new NotFoundException("عنصر المحتوى غير موجود");
    assertActiveContentSite(result.rows[0]!.site_status);
    const ideas = Array.isArray(result.rows[0]!.ideas) ? result.rows[0]!.ideas : [];
    const selected = ideas[ideaIndex];
    if (!selected) throw new BadRequestException("الفكرة المختارة غير موجودة");
    await this.db.query(
      `UPDATE content_items
       SET selected_idea = $2::jsonb,
           title = COALESCE(($2::jsonb ->> 'title'), title),
           target_keyword = COALESCE(($2::jsonb ->> 'targetKeyword'), ($2::jsonb ->> 'target_keyword'), target_keyword),
           status = 'IDEA_SELECTED',
           last_successful_state = 'IDEA_SELECTED',
           updated_at = now()
       WHERE id = $1`,
      [id, JSON.stringify(selected)]
    );
    await this.audit.record({
      actorUserId,
      contentItemId: id,
      eventType: "CONTENT_IDEA_SELECTED",
      message: "تم اختيار فكرة المحتوى",
      metadata: { ideaIndex }
    });
    return this.get(id);
  }

  async approve(id: string, actorUserId?: string): Promise<Record<string, unknown>> {
    const current = await this.db.query<{ status: ContentState; site_status: "ACTIVE" | "DISABLED" }>(
      `SELECT c.status, s.status AS site_status
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.id = $1`,
      [id]
    );
    if (!current.rowCount) throw new NotFoundException("عنصر المحتوى غير موجود");
    assertActiveContentSite(current.rows[0]!.site_status);
    if (!canRunOperation(current.rows[0]!.status, "APPROVE")) {
      throw new BadRequestException("لا يمكن اعتماد المقال قبل تجهيز الصورة أو تخطيها.");
    }
    const settings = await this.db.query<{ value: { autoPublishAfterApproval?: boolean } }>(
      "SELECT value FROM system_settings WHERE key = 'production_settings'"
    );
    const autoPublish = settings.rows[0]?.value.autoPublishAfterApproval === true;
    await this.db.query(
      `UPDATE content_items
       SET status = 'APPROVED',
           approved_at = now(),
           approved_by = $3,
           auto_publish = $2,
           last_successful_state = 'APPROVED',
           updated_at = now()
       WHERE id = $1`,
      [id, autoPublish, actorUserId ?? null]
    );
    await this.audit.record({
      actorUserId,
      contentItemId: id,
      eventType: "CONTENT_APPROVED",
      message: "تم اعتماد المقال",
      metadata: { autoPublish }
    });
    if (autoPublish) await this.enqueueOperation(id, "PUBLISH", actorUserId);
    return this.get(id);
  }

  async schedule(id: string, body: ScheduleContentDto, actorUserId?: string): Promise<Record<string, unknown>> {
    const scheduledAt = parseFutureScheduleDate(body.scheduledPublishAt);
    const current = await this.db.query<{ status: ContentState; approved_at: Date | null; site_status: "ACTIVE" | "DISABLED" }>(
      `SELECT c.status, c.approved_at, s.status AS site_status
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.id = $1`,
      [id]
    );
    if (!current.rowCount) throw new NotFoundException("عنصر المحتوى غير موجود");
    assertActiveContentSite(current.rows[0]!.site_status);
    if (!canRunOperation(current.rows[0]!.status, "SCHEDULE") || !current.rows[0]!.approved_at) {
      throw new BadRequestException("لا يمكن جدولة المقال قبل اعتماد المدير.");
    }
    await this.db.query(
      `UPDATE content_items
       SET status = 'SCHEDULED',
           scheduled_publish_at = $2,
           auto_publish = false,
           last_successful_state = 'SCHEDULED',
           failed_action = NULL,
           error_message = NULL,
           updated_at = now()
       WHERE id = $1`,
      [id, scheduledAt]
    );
    await this.audit.record({
      actorUserId,
      contentItemId: id,
      eventType: "CONTENT_SCHEDULED",
      message: "تمت جدولة نشر المقال",
      metadata: { scheduledPublishAt: scheduledAt.toISOString() }
    });
    await this.enqueueOperation(id, "PUBLISH", actorUserId, { delayMs: delayUntil(scheduledAt) });
    return this.get(id);
  }

  async skipImage(id: string, actorUserId?: string): Promise<Record<string, unknown>> {
    const current = await this.db.query<{ status: ContentState; site_status: "ACTIVE" | "DISABLED" }>(
      `SELECT c.status, s.status AS site_status
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.id = $1`,
      [id]
    );
    if (!current.rowCount) throw new NotFoundException("عنصر المحتوى غير موجود");
    assertActiveContentSite(current.rows[0]!.site_status);
    if (!canRunOperation(current.rows[0]!.status, "SKIP_IMAGE")) {
      throw new BadRequestException("لا يمكن تخطي الصورة في الحالة الحالية.");
    }
    await this.db.query(
      `UPDATE content_items
       SET status = 'IMAGE_READY',
           last_successful_state = 'IMAGE_READY',
           image_prompt = COALESCE(image_prompt, ''),
           image_alt = COALESCE(image_alt, ''),
           updated_at = now()
       WHERE id = $1`,
      [id]
    );
    await this.audit.record({
      actorUserId,
      contentItemId: id,
      eventType: "CONTENT_IMAGE_SKIPPED",
      message: "تم تخطي صورة المقال"
    });
    return this.get(id);
  }

  async duplicate(id: string, actorUserId?: string): Promise<Record<string, unknown>> {
    const source = await this.db.query<DuplicateSourceRow>(
      `SELECT c.id, c.site_id, s.status AS site_status, c.topic, c.title, c.target_keyword, c.search_intent,
              c.editorial_brief, c.ideas, c.selected_idea, c.competitor_gaps, c.sources, c.draft_html,
              c.meta_description, c.category, c.tags, c.image_prompt, c.image_alt, c.content_score,
              c.content_score_details
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.id = $1`,
      [id]
    );
    const item = source.rows[0];
    if (!item) throw new NotFoundException("عنصر المحتوى غير موجود");
    if (!isActiveSiteStatus(item.site_status)) throw new BadRequestException("لا يمكن نسخ محتوى لموقع معطل.");

    const state = duplicateInitialState({
      ideas: item.ideas,
      selectedIdea: item.selected_idea,
      competitorGaps: item.competitor_gaps,
      draftHtml: item.draft_html
    });
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO content_items (
         site_id, topic, title, target_keyword, status, mode, search_intent, editorial_brief,
         ideas, selected_idea, competitor_gaps, sources, draft_html, meta_description, category,
         tags, image_prompt, image_alt, content_score, content_score_details, last_successful_state, created_by
       )
       VALUES ($1, $2, $3, $4, $5, 'MANUAL', $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::jsonb,
               $12, $13, $14, $15::jsonb, $16, $17, $18, $19::jsonb, $5, $20)
       RETURNING id`,
      [
        item.site_id,
        item.topic,
        duplicateTitle(item.title ?? item.topic),
        item.target_keyword,
        state,
        item.search_intent,
        JSON.stringify(item.editorial_brief ?? {}),
        JSON.stringify(item.ideas ?? []),
        item.selected_idea ? JSON.stringify(item.selected_idea) : null,
        item.competitor_gaps,
        JSON.stringify(item.sources ?? []),
        item.draft_html,
        item.meta_description,
        item.category,
        JSON.stringify(item.tags ?? []),
        item.image_prompt,
        item.image_alt,
        item.content_score,
        JSON.stringify(item.content_score_details ?? []),
        actorUserId ?? null
      ]
    );
    const duplicatedId = result.rows[0]!.id;
    await this.audit.record({
      actorUserId,
      contentItemId: duplicatedId,
      eventType: "CONTENT_DUPLICATED",
      message: "تم إنشاء نسخة تحريرية من عنصر محتوى",
      metadata: { sourceContentItemId: id, initialState: state }
    });
    return this.get(duplicatedId);
  }

  async update(id: string, body: UpdateContentDto, actorUserId?: string): Promise<Record<string, unknown>> {
    const current = await this.get(id);
    const title = body.title ?? String(current.title ?? "");
    const draftHtml = body.draftHtml !== undefined ? sanitizeArticleHtml(body.draftHtml) : String(current.draftHtml ?? "");
    const metaDescription = body.metaDescription ?? String(current.metaDescription ?? "");
    const score = scoreContent({
      title,
      html: draftHtml,
      metaDescription,
      imageAlt: body.imageAlt ?? String(current.imageAlt ?? ""),
      targetKeyword: String(current.targetKeyword ?? "")
    });
    await this.db.query(
      `UPDATE content_items
       SET title = COALESCE($2, title),
           draft_html = COALESCE($3, draft_html),
           meta_description = COALESCE($4, meta_description),
           category = COALESCE($5, category),
           image_alt = COALESCE($6, image_alt),
           tags = COALESCE($7::jsonb, tags),
           content_score = $8,
           content_score_details = $9::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [
        id,
        body.title ?? null,
        body.draftHtml !== undefined ? draftHtml : null,
        body.metaDescription ?? null,
        body.category ?? null,
        body.imageAlt ?? null,
        body.tags ? JSON.stringify(body.tags) : null,
        score.score,
        JSON.stringify(score.checks)
      ]
    );
    await this.recordContentVersion(id, actorUserId, {
      title,
      draftHtml,
      metaDescription,
      category: body.category ?? String(current.category ?? ""),
      tags: body.tags ?? (Array.isArray(current.tags) ? current.tags.map(String) : []),
      imageAlt: body.imageAlt ?? String(current.imageAlt ?? ""),
      contentScore: score.score,
      contentScoreDetails: score.checks,
      fields: Object.keys(body)
    });
    await this.audit.record({
      actorUserId,
      contentItemId: id,
      eventType: "CONTENT_UPDATED",
      message: "تم تحديث بيانات المقال",
      metadata: { fields: Object.keys(body) }
    });
    return this.get(id);
  }

  async restoreVersion(id: string, versionId: string, actorUserId?: string): Promise<Record<string, unknown>> {
    const current = await this.db.query<{ status: ContentState; wordpress_post_id: string | null }>(
      "SELECT status, wordpress_post_id FROM content_items WHERE id = $1",
      [id]
    );
    if (!current.rowCount) throw new NotFoundException("عنصر المحتوى غير موجود");
    if (current.rows[0]!.status === "PUBLISHED" || current.rows[0]!.wordpress_post_id) {
      throw new BadRequestException("لا يمكن استرجاع إصدار فوق محتوى منشور. أنشئ نسخة تحريرية بدلًا من ذلك.");
    }
    const version = await this.db.query<ContentVersionSnapshotRow>(
      `SELECT id, content_item_id, title, draft_html, meta_description, category, tags, image_alt,
              content_score, content_score_details
       FROM content_versions
       WHERE id = $1 AND content_item_id = $2`,
      [versionId, id]
    );
    const snapshot = version.rows[0];
    if (!snapshot) throw new NotFoundException("الإصدار المطلوب غير موجود لهذا المقال.");
    await this.db.query(
      `UPDATE content_items
       SET title = $2,
           draft_html = $3,
           meta_description = $4,
           category = $5,
           tags = $6::jsonb,
           image_alt = $7,
           content_score = $8,
           content_score_details = $9::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [
        id,
        snapshot.title,
        snapshot.draft_html,
        snapshot.meta_description,
        snapshot.category,
        JSON.stringify(snapshot.tags ?? []),
        snapshot.image_alt,
        snapshot.content_score,
        JSON.stringify(snapshot.content_score_details ?? [])
      ]
    );
    await this.recordContentVersion(id, actorUserId, {
      title: snapshot.title ?? "",
      draftHtml: snapshot.draft_html ?? "",
      metaDescription: snapshot.meta_description ?? "",
      category: snapshot.category ?? "",
      tags: Array.isArray(snapshot.tags) ? snapshot.tags.map(String) : [],
      imageAlt: snapshot.image_alt ?? "",
      contentScore: snapshot.content_score,
      contentScoreDetails: snapshot.content_score_details ?? [],
      fields: ["restore"],
      summary: "استرجاع إصدار سابق"
    });
    await this.audit.record({
      actorUserId,
      contentItemId: id,
      eventType: "CONTENT_VERSION_RESTORED",
      message: "تم استرجاع إصدار سابق من المقال",
      metadata: { versionId }
    });
    return this.get(id);
  }

  async remove(id: string, actorUserId?: string): Promise<{ ok: true; id: string }> {
    return this.db.transaction(async (query) => {
      const current = await query<{
        id: string;
        siteId: string;
        status: ContentState;
        title: string | null;
        topic: string;
        wordpressPostId: string | null;
      }>(
        `SELECT id, site_id AS "siteId", status, title, topic, wordpress_post_id AS "wordpressPostId"
         FROM content_items
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      const item = current.rows[0];
      if (!item) throw new NotFoundException("عنصر المحتوى غير موجود");
      if (!canDeleteContentStatus(item.status) || item.wordpressPostId) {
        throw new BadRequestException("لا يمكن حذف محتوى منشور أو معتمد أو مجدول. عطّل النشر أو اتركه في السجل التشغيلي.");
      }
      const inFlight = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM job_runs
         WHERE content_item_id = $1
           AND status IN ('WAITING', 'ACTIVE', 'DELAYED')`,
        [id]
      );
      if (Number(inFlight.rows[0]?.count ?? 0) > 0) {
        throw new BadRequestException("لا يمكن حذف محتوى لديه مهمة قيد الانتظار أو التنفيذ. ألغِ المهمة أولًا من صفحة العمليات.");
      }
      await query(
        `INSERT INTO audit_logs (actor_user_id, content_item_id, site_id, event_type, message, metadata)
         VALUES ($1, $2, $3, 'CONTENT_DELETED', 'تم حذف عنصر محتوى غير منشور', $4::jsonb)`,
        [actorUserId ?? null, id, item.siteId, JSON.stringify({ title: item.title, topic: item.topic, status: item.status })]
      );
      await query("DELETE FROM content_items WHERE id = $1", [id]);
      return { ok: true, id };
    });
  }

  async cleanup(ids: string[], actorUserId?: string): Promise<{ ok: true; deleted: string[]; cancelledJobs: number; skipped: Array<{ id: string; reason: string }> }> {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) throw new BadRequestException("اختر عنصر محتوى واحدًا على الأقل.");
    const rows = await this.db.query<{
      id: string;
      siteId: string;
      status: ContentState;
      title: string | null;
      topic: string;
      wordpressPostId: string | null;
    }>(
      `SELECT id, site_id AS "siteId", status, title, topic, wordpress_post_id AS "wordpressPostId"
       FROM content_items
       WHERE id = ANY($1::uuid[])`,
      [uniqueIds]
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row]));
    const deleted: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    let cancelledJobs = 0;

    for (const id of uniqueIds) {
      const item = byId.get(id);
      if (!item) {
        skipped.push({ id, reason: "غير موجود" });
        continue;
      }
      if (!canDeleteContentStatus(item.status) || item.wordpressPostId) {
        skipped.push({ id, reason: "منشور أو معتمد أو مجدول" });
        continue;
      }
      const jobs = await this.db.query<{ id: string; queueName: string; bullJobId: string }>(
        `SELECT id, queue_name AS "queueName", bull_job_id AS "bullJobId"
         FROM job_runs
         WHERE content_item_id = $1
           AND status IN ('WAITING', 'DELAYED')
           AND bull_job_id IS NOT NULL`,
        [id]
      );
      for (const job of jobs.rows) {
        try {
          await this.queue.cancelQueuedJob(job.queueName, job.bullJobId);
        } catch {
          // The job may already be gone from Redis; keep DB cleanup deterministic.
        }
      }
      if (jobs.rowCount) {
        cancelledJobs += jobs.rowCount;
        await this.db.query(
          `UPDATE job_runs
           SET status = 'CANCELLED',
               error = NULL,
               finished_at = now()
           WHERE content_item_id = $1
             AND status IN ('WAITING', 'DELAYED')`,
          [id]
        );
      }
      const active = await this.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM job_runs
         WHERE content_item_id = $1
           AND status = 'ACTIVE'`,
        [id]
      );
      if (Number(active.rows[0]?.count ?? 0) > 0) {
        skipped.push({ id, reason: "لديه مهمة قيد التنفيذ الآن" });
        continue;
      }
      await this.db.query(
        `INSERT INTO audit_logs (actor_user_id, content_item_id, site_id, event_type, message, metadata)
         VALUES ($1, $2, $3, 'CONTENT_DELETED', 'تم حذف عنصر محتوى ضمن تنظيف جماعي', $4::jsonb)`,
        [actorUserId ?? null, id, item.siteId, JSON.stringify({ title: item.title, topic: item.topic, status: item.status })]
      );
      await this.db.query("DELETE FROM content_items WHERE id = $1", [id]);
      deleted.push(id);
    }

    return { ok: true, deleted, cancelledJobs, skipped };
  }

  async rollbackPublishing(ids: string[], actorUserId?: string): Promise<{ ok: true; rolledBack: string[]; cancelledJobs: number; skipped: Array<{ id: string; reason: string }> }> {
    const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) throw new BadRequestException("اختر عنصر محتوى واحدًا على الأقل.");
    const rows = await this.db.query<{
      id: string;
      siteId: string;
      status: ContentState;
      wordpressPostId: string | null;
      wordpressUrl: string;
      wordpressUsername: string;
      wordpressApplicationPasswordEncrypted: string;
    }>(
      `SELECT c.id,
              c.site_id AS "siteId",
              c.status,
              c.wordpress_post_id AS "wordpressPostId",
              s.wordpress_url AS "wordpressUrl",
              s.wordpress_username AS "wordpressUsername",
              s.wordpress_application_password_encrypted AS "wordpressApplicationPasswordEncrypted"
       FROM content_items c
       JOIN sites s ON s.id = c.site_id
       WHERE c.id = ANY($1::uuid[])`,
      [uniqueIds]
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row]));
    const rolledBack: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    let cancelledJobs = 0;

    for (const id of uniqueIds) {
      const item = byId.get(id);
      if (!item) {
        skipped.push({ id, reason: "غير موجود" });
        continue;
      }
      if (!["SCHEDULED", "PUBLISHED"].includes(item.status)) {
        skipped.push({ id, reason: "ليس منشورًا أو مجدولًا" });
        continue;
      }
      const jobs = await this.db.query<{ id: string; queueName: string; bullJobId: string }>(
        `SELECT id, queue_name AS "queueName", bull_job_id AS "bullJobId"
         FROM job_runs
         WHERE content_item_id = $1
           AND operation = 'PUBLISH'
           AND status IN ('WAITING', 'DELAYED')
           AND bull_job_id IS NOT NULL`,
        [id]
      );
      for (const job of jobs.rows) {
        try {
          await this.queue.cancelQueuedJob(job.queueName, job.bullJobId);
        } catch {
          // The job may already be absent from Redis.
        }
      }
      if (jobs.rowCount) {
        cancelledJobs += jobs.rowCount;
        await this.db.query(
          `UPDATE job_runs
           SET status = 'CANCELLED',
               error = NULL,
               finished_at = now()
           WHERE content_item_id = $1
             AND operation = 'PUBLISH'
             AND status IN ('WAITING', 'DELAYED')`,
          [id]
        );
      }
      if (item.wordpressPostId) {
        await updateWordPressPostStatus(
          {
            id: item.siteId,
            wordpress_url: item.wordpressUrl,
            wordpress_username: item.wordpressUsername,
            wordpress_application_password_encrypted: item.wordpressApplicationPasswordEncrypted
          },
          item.wordpressPostId,
          "draft"
        );
      }
      await this.db.query(
        `UPDATE content_items
         SET status = 'APPROVED',
             wordpress_post_status = CASE WHEN wordpress_post_id IS NULL THEN wordpress_post_status ELSE 'draft' END,
             scheduled_publish_at = NULL,
             auto_publish = false,
             published_at = NULL,
             last_successful_state = 'APPROVED',
             failed_action = NULL,
             error_message = NULL,
             updated_at = now()
         WHERE id = $1`,
        [id]
      );
      await this.audit.record({
        actorUserId,
        contentItemId: id,
        siteId: item.siteId,
        eventType: "CONTENT_PUBLISHING_ROLLED_BACK",
        message: item.wordpressPostId ? "تم سحب المقال من ووردبريس وإرجاعه للاعتماد" : "تم إلغاء جدولة المقال وإرجاعه للاعتماد",
        metadata: { previousStatus: item.status, wordpressPostId: item.wordpressPostId, cancelledJobs: jobs.rowCount }
      });
      rolledBack.push(id);
    }

    return { ok: true, rolledBack, cancelledJobs, skipped };
  }

  private async resolveIdeasCount(input: number | undefined): Promise<number> {
    if (typeof input === "number") return clampNumber(input, 1, 20);
    const result = await this.db.query<{ value: { defaultIdeasCount?: number } }>(
      "SELECT value FROM system_settings WHERE key = 'production_settings'"
    );
    return clampNumber(result.rows[0]?.value.defaultIdeasCount ?? 5, 1, 20);
  }

  private async contentAudit(contentItemId: string): Promise<ContentAuditRow[]> {
    const result = await this.db.query<ContentAuditRow>(
      `SELECT a.id,
              a.event_type AS "eventType",
              a.message,
              u.name AS "actorName",
              a.metadata,
              a.created_at AS "createdAt"
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.content_item_id = $1
       ORDER BY a.created_at DESC
       LIMIT 100`,
      [contentItemId]
    );
    return result.rows.map((row) => ({
      ...row,
      metadata: sanitizeAuditMetadata(row.metadata) as Record<string, unknown>
    }));
  }

  private async contentJobs(contentItemId: string): Promise<ContentJobRow[]> {
    const result = await this.db.query<ContentJobRow>(
      `SELECT id,
              operation,
              provider,
              queue_name AS "queueName",
              attempt,
              status,
              error,
              started_at AS "startedAt",
              finished_at AS "finishedAt",
              duration_ms AS "durationMs",
              created_at AS "createdAt"
       FROM job_runs
       WHERE content_item_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [contentItemId]
    );
    return result.rows;
  }

  private async contentUsage(contentItemId: string): Promise<ContentUsageRow[]> {
    const result = await this.db.query<ContentUsageRow>(
      `SELECT id,
              provider,
              model,
              operation,
              input_tokens AS "inputTokens",
              output_tokens AS "outputTokens",
              estimated_cost_usd AS "estimatedCostUsd",
              success,
              error,
              created_at AS "createdAt"
       FROM api_usage_logs
       WHERE content_item_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [contentItemId]
    );
    return result.rows;
  }

  private async contentVersions(contentItemId: string): Promise<ContentVersionRow[]> {
    const result = await this.db.query<ContentVersionRow>(
      `SELECT v.id,
              u.name AS "actorName",
              v.title,
              v.content_score AS "contentScore",
              v.change_summary AS "changeSummary",
              v.created_at AS "createdAt"
       FROM content_versions v
       LEFT JOIN users u ON u.id = v.actor_user_id
       WHERE v.content_item_id = $1
       ORDER BY v.created_at DESC
       LIMIT 20`,
      [contentItemId]
    );
    return result.rows;
  }

  private async recordContentVersion(
    contentItemId: string,
    actorUserId: string | undefined,
    snapshot: {
      title: string;
      draftHtml: string;
      metaDescription: string;
      category: string;
      tags: string[];
      imageAlt: string;
      contentScore: number;
      contentScoreDetails: unknown[];
      fields: string[];
      summary?: string;
    }
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO content_versions (
         content_item_id, actor_user_id, title, draft_html, meta_description, category, tags,
         image_alt, content_score, content_score_details, change_summary
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11)`,
      [
        contentItemId,
        actorUserId ?? null,
        snapshot.title,
        snapshot.draftHtml,
        snapshot.metaDescription,
        snapshot.category,
        JSON.stringify(snapshot.tags),
        snapshot.imageAlt,
        snapshot.contentScore,
        JSON.stringify(snapshot.contentScoreDetails),
        snapshot.summary ?? contentVersionSummary(snapshot.fields)
      ]
    );
  }
}

export function mergeContentActivity(
  audit: ContentAuditRow[],
  jobs: ContentJobRow[],
  usage: ContentUsageRow[]
): Array<Record<string, unknown>> {
  const events = [
    ...audit.map((row) => ({
      id: row.id,
      type: "AUDIT",
      label: row.message,
      detail: row.actorName ? `بواسطة ${row.actorName}` : row.eventType,
      status: "INFO",
      metadata: row.metadata,
      createdAt: row.createdAt
    })),
    ...jobs.map((row) => ({
      id: row.id,
      type: "JOB",
      label: row.operation,
      detail: row.provider ? `${row.queueName} · ${row.provider}` : row.queueName,
      status: row.status,
      error: row.error,
      durationMs: row.durationMs,
      createdAt: row.createdAt
    })),
    ...usage.map((row) => ({
      id: row.id,
      type: "USAGE",
      label: `${row.provider} / ${row.model}`,
      detail: `${row.operation} · ${row.inputTokens + row.outputTokens} tokens`,
      status: row.success ? "SUCCESS" : "FAILED",
      error: row.error,
      estimatedCostUsd: Number(row.estimatedCostUsd),
      createdAt: row.createdAt
    }))
  ];
  return events.sort((left, right) => new Date(String(right.createdAt)).getTime() - new Date(String(left.createdAt)).getTime()).slice(0, 120);
}

export function buildContentListFilter(query: ContentListQuery): ContentListFilter {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const addValue = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  const search = query.search?.trim();
  if (search) {
    const placeholder = addValue(`%${search}%`);
    clauses.push(`(c.topic ILIKE ${placeholder} OR c.title ILIKE ${placeholder} OR c.target_keyword ILIKE ${placeholder} OR s.name ILIKE ${placeholder})`);
  }
  if (query.siteId && query.siteId !== "all") {
    clauses.push(`c.site_id = ${addValue(query.siteId)}`);
  }
  if (query.state && query.state !== "all") {
    clauses.push(`c.status = ${addValue(query.state)}`);
  }
  if (query.mode && query.mode !== "all") {
    clauses.push(`c.mode = ${addValue(query.mode)}`);
  }
  const minScore = parseBoundedInteger(query.minScore, 0, 100);
  if (minScore !== null) {
    clauses.push(`c.content_score >= ${addValue(minScore)}`);
  }
  const updatedFrom = parseDateOnly(query.updatedFrom);
  if (updatedFrom) {
    clauses.push(`c.updated_at >= ${addValue(updatedFrom)}`);
  }
  const updatedTo = parseDateOnly(query.updatedTo);
  if (updatedTo) {
    const updatedToExclusive = new Date(updatedTo);
    updatedToExclusive.setUTCDate(updatedToExclusive.getUTCDate() + 1);
    clauses.push(`c.updated_at < ${addValue(updatedToExclusive)}`);
  }
  if (query.needsAttention === "true") {
    clauses.push("(c.status IN ('FAILED', 'DUPLICATE') OR (c.content_score > 0 AND c.content_score < 60))");
  }
  const page = parseBoundedInteger(query.page, 1, 10_000) ?? 1;
  const pageSize = parseBoundedInteger(query.pageSize, 1, maxContentPageSize) ?? defaultContentPageSize;

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
    page,
    pageSize,
    offset: (page - 1) * pageSize
  };
}

function buildEditorialBrief(body: CreateManualContentDto | CreateBulkContentDto, ideasCount: number): Record<string, string | number> {
  return {
    ideasCount,
    contentGoal: body.contentGoal ?? "",
    audience: body.audience ?? "",
    searchIntent: body.searchIntent ?? "تلقائية"
  };
}

export function parseBulkTopics(value: string): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const raw of value.split(/\r?\n/)) {
    const topic = raw.trim();
    if (!topic) continue;
    const key = topic.toLocaleLowerCase("ar");
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(topic);
  }
  return topics;
}

export function isPublishTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function scheduledPublishDate(startDate: string, publishTime: string, index: number, intervalDays: number): Date {
  if (!isPublishTime(publishTime)) throw new Error("وقت النشر غير صالح.");
  const [hours = "00", minutes = "00"] = publishTime.split(":");
  const date = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("تاريخ بداية الدفعة غير صالح.");
  date.setUTCDate(date.getUTCDate() + index * intervalDays);
  date.setUTCHours(Number(hours), Number(minutes), 0, 0);
  return date;
}

export function parseFutureScheduleDate(value: string, now = new Date()): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException("تاريخ الجدولة غير صالح.");
  if (date.getTime() <= now.getTime()) throw new BadRequestException("تاريخ الجدولة يجب أن يكون في المستقبل.");
  return date;
}

export function delayUntil(date: Date, now = new Date()): number {
  return normalizedDelayMs(date.getTime() - now.getTime());
}

export function normalizedDelayMs(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value ?? 0));
}

export function duplicateInitialState(input: {
  ideas?: unknown[] | null;
  selectedIdea?: unknown;
  competitorGaps?: string | null;
  draftHtml?: string | null;
}): ContentState {
  if (input.draftHtml?.trim()) return "DRAFTED";
  if (input.competitorGaps?.trim() && input.selectedIdea) return "GAPS_READY";
  if (input.selectedIdea) return "IDEA_SELECTED";
  if (Array.isArray(input.ideas) && input.ideas.length > 0) return "IDEAS_READY";
  return "NEW";
}

export function duplicateTitle(title: string): string {
  const clean = title.trim();
  return clean.startsWith("نسخة من ") ? clean : `نسخة من ${clean || "محتوى بدون عنوان"}`;
}

export function retryOperationForFailedContent(failedAction: string | null, lastSuccessfulState: ContentState | null): string {
  if (failedAction && queueForOperation(failedAction) !== "maintenance") return failedAction;
  const next = lastSuccessfulState ? nextPrimaryOperation(lastSuccessfulState) : null;
  if (next && queueForOperation(next) !== "maintenance") return next;
  throw new BadRequestException("لا توجد عملية محتوى قابلة لإعادة المحاولة.");
}

export function retryStateForOperation(operation: string, lastSuccessfulState: ContentState | null): ContentState {
  if (lastSuccessfulState && canRunOperation(lastSuccessfulState, operation)) return lastSuccessfulState;
  const fallback: Record<string, ContentState> = {
    GENERATE_IDEAS: "NEW",
    RESEARCH_GAPS: "IDEA_SELECTED",
    WRITE_DRAFT: "GAPS_READY",
    REVIEW_DRAFT: "DRAFTED",
    GENERATE_IMAGE: "REVIEWED",
    PUBLISH: "APPROVED"
  };
  const state = fallback[operation];
  if (!state) throw new BadRequestException("لا يمكن تحديد حالة آمنة لإعادة المحاولة.");
  return state;
}

export function contentVersionSummary(fields: string[]): string {
  const labels: Record<string, string> = {
    title: "العنوان",
    draftHtml: "المحتوى",
    metaDescription: "الوصف التعريفي",
    category: "التصنيف",
    imageAlt: "النص البديل للصورة",
    tags: "الوسوم",
    restore: "استرجاع إصدار"
  };
  const visible = fields.map((field) => labels[field]).filter(Boolean);
  if (visible.length === 0) return "حفظ يدوي";
  return `تحديث ${visible.join("، ")}`;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseBoundedInteger(value: string | undefined, min: number, max: number): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function parseDateOnly(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildJobId(operation: string, entityId: string, suffix?: string): string {
  return normalizeBullJobId([operation, entityId, suffix, Date.now()].filter(Boolean).join("-"));
}

function queueForOperation(operation: string): string {
  const map: Record<string, string> = {
    GENERATE_IDEAS: "content-ideas",
    RESEARCH_GAPS: "content-research",
    WRITE_DRAFT: "content-writing",
    REVIEW_DRAFT: "content-review",
    GENERATE_IMAGE: "content-image",
    PUBLISH: "wordpress-publish"
  };
  return map[operation] ?? "maintenance";
}

export function canRunOperation(state: ContentState, operation: string): boolean {
  if (operation === "SKIP_IMAGE") return state === "REVIEWED";
  if (operation === "APPROVE") return state === "IMAGE_READY";
  if (operation === "SCHEDULE") return state === "APPROVED";
  return nextPrimaryOperation(state) === operation;
}

export function isActiveSiteStatus(status: string): boolean {
  return status === "ACTIVE";
}

export function assertActiveContentSite(status: string): void {
  if (!isActiveSiteStatus(status)) throw new BadRequestException("لا يمكن تنفيذ هذا الإجراء على موقع معطل.");
}

export function canDeleteContentStatus(status: ContentState): boolean {
  return !["QUEUED", "APPROVED", "SCHEDULED", "PUBLISHED"].includes(status);
}

function toPublicContentRow(row: ContentRow): Record<string, unknown> {
  return {
    id: row.id,
    siteId: row.site_id,
    site: row.site_name,
    topic: row.topic,
    title: row.title ?? row.topic,
    targetKeyword: row.target_keyword ?? "",
    state: row.status,
    mode: row.mode,
    scheduledDate: row.scheduled_publish_at,
    score: row.content_score,
    updatedAt: row.updated_at,
    createdAt: row.created_at
  };
}

@Controller("content")
class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  list(@Query() query: ContentListQuery): Promise<ContentListResponse> {
    return this.content.list(query);
  }

  @Post()
  create(@Body() body: CreateManualContentDto, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.content.create(body, request.user?.id);
  }

  @Post("bulk")
  createBulk(@Body() body: CreateBulkContentDto, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.content.createBulk(body, request.user?.id);
  }

  @Post("cleanup")
  @Roles("ADMIN")
  cleanup(@Body() body: BulkContentIdsDto, @Req() request: AuthenticatedRequest): Promise<{ ok: true; deleted: string[]; cancelledJobs: number; skipped: Array<{ id: string; reason: string }> }> {
    return this.content.cleanup(body.ids, request.user?.id);
  }

  @Post("rollback-publishing")
  @Roles("ADMIN")
  rollbackPublishing(@Body() body: BulkContentIdsDto, @Req() request: AuthenticatedRequest): Promise<{ ok: true; rolledBack: string[]; cancelledJobs: number; skipped: Array<{ id: string; reason: string }> }> {
    return this.content.rollbackPublishing(body.ids, request.user?.id);
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<Record<string, unknown>> {
    return this.content.get(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateContentDto, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.content.update(id, body, request.user?.id);
  }

  @Post(":id/versions/:versionId/restore")
  restoreVersion(@Param("id") id: string, @Param("versionId") versionId: string, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.content.restoreVersion(id, versionId, request.user?.id);
  }

  @Delete(":id")
  @Roles("ADMIN")
  remove(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ ok: true; id: string }> {
    return this.content.remove(id, request.user?.id);
  }

  @Post(":id/duplicate")
  duplicate(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.content.duplicate(id, request.user?.id);
  }

  @Post(":id/retry")
  retry(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ statusCode: 202; jobId: string; contentItemId: string }> {
    return this.content.retry(id, request.user?.id);
  }

  @Post(":id/generate-ideas")
  generateIdeas(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ statusCode: 202; jobId: string; contentItemId: string }> {
    return this.content.enqueueOperation(id, "GENERATE_IDEAS", request.user?.id);
  }

  @Post(":id/select-idea")
  selectIdea(@Param("id") id: string, @Body() body: SelectIdeaDto, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.content.selectIdea(id, body.ideaIndex, request.user?.id);
  }

  @Post(":id/research")
  research(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ statusCode: 202; jobId: string; contentItemId: string }> {
    return this.content.enqueueOperation(id, "RESEARCH_GAPS", request.user?.id);
  }

  @Post(":id/write")
  write(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ statusCode: 202; jobId: string; contentItemId: string }> {
    return this.content.enqueueOperation(id, "WRITE_DRAFT", request.user?.id);
  }

  @Post(":id/review")
  review(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ statusCode: 202; jobId: string; contentItemId: string }> {
    return this.content.enqueueOperation(id, "REVIEW_DRAFT", request.user?.id);
  }

  @Post(":id/generate-image")
  generateImage(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ statusCode: 202; jobId: string; contentItemId: string }> {
    return this.content.enqueueOperation(id, "GENERATE_IMAGE", request.user?.id);
  }

  @Post(":id/skip-image")
  skipImage(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.content.skipImage(id, request.user?.id);
  }

  @Post(":id/publish")
  @Roles("ADMIN")
  publish(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<{ statusCode: 202; jobId: string; contentItemId: string }> {
    return this.content.enqueueOperation(id, "PUBLISH", request.user?.id);
  }

  @Patch(":id/schedule")
  @Roles("ADMIN")
  schedule(@Param("id") id: string, @Body() body: ScheduleContentDto, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.content.schedule(id, body, request.user?.id);
  }

  @Patch(":id/approve")
  @Roles("ADMIN")
  approve(@Param("id") id: string, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
    return this.content.approve(id, request.user?.id);
  }

  @Post(":id/score")
  score(@Param("id") id: string, @Body() body: ScoreContentDto): Record<string, unknown> {
    return { contentItemId: id, ...scoreContent({ ...body }) };
  }
}

@Module({ controllers: [ContentController], providers: [ContentService] })
export class ContentModule {}
