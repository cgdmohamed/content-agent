import { describe, expect, it } from "vitest";
import { assertActiveContentSite, buildContentListFilter, buildJobId, canDeleteContentStatus, canRunOperation, clampNumber, contentVersionSummary, delayUntil, duplicateInitialState, duplicateTitle, isActiveSiteStatus, isPublishTime, mergeContentActivity, normalizedDelayMs, parseBulkTopics, parseFutureScheduleDate, retryOperationForFailedContent, retryStateForOperation, scheduledPublishDate } from "../content.module.js";

describe("content operation rules", () => {
  it("allows only the next pipeline operation", () => {
    expect(canRunOperation("NEW", "GENERATE_IDEAS")).toBe(true);
    expect(canRunOperation("NEW", "WRITE_DRAFT")).toBe(false);
    expect(canRunOperation("IDEA_SELECTED", "RESEARCH_GAPS")).toBe(true);
  });

  it("guards image skipping and approval by state", () => {
    expect(canRunOperation("REVIEWED", "SKIP_IMAGE")).toBe(true);
    expect(canRunOperation("DRAFTED", "SKIP_IMAGE")).toBe(false);
    expect(canRunOperation("IMAGE_READY", "APPROVE")).toBe(true);
    expect(canRunOperation("REVIEWED", "APPROVE")).toBe(false);
    expect(canRunOperation("APPROVED", "SCHEDULE")).toBe(true);
    expect(canRunOperation("IMAGE_READY", "SCHEDULE")).toBe(false);
  });

  it("blocks content jobs for disabled sites", () => {
    expect(isActiveSiteStatus("ACTIVE")).toBe(true);
    expect(isActiveSiteStatus("DISABLED")).toBe(false);
    expect(() => assertActiveContentSite("DISABLED")).toThrow("لا يمكن تنفيذ هذا الإجراء على موقع معطل.");
  });

  it("allows deleting content that is not queued, scheduled, or published", () => {
    expect(canDeleteContentStatus("NEW")).toBe(true);
    expect(canDeleteContentStatus("DRAFTED")).toBe(true);
    expect(canDeleteContentStatus("FAILED")).toBe(true);
    expect(canDeleteContentStatus("APPROVED")).toBe(true);
    expect(canDeleteContentStatus("QUEUED")).toBe(false);
    expect(canDeleteContentStatus("SCHEDULED")).toBe(false);
    expect(canDeleteContentStatus("PUBLISHED")).toBe(false);
  });

  it("builds job ids that keep the operation and entity traceable", () => {
    const jobId = buildJobId("GENERATE_IMAGE:extra", "content 1/مرحبا", "retry:1");
    expect(jobId.startsWith("GENERATE_IMAGE-extra-content-1-")).toBe(true);
    expect(jobId).not.toMatch(/[:\s/]/);
  });

  it("keeps manual idea requests within the production settings limit", () => {
    expect(clampNumber(20, 1, 20)).toBe(20);
    expect(clampNumber(25, 1, 20)).toBe(20);
    expect(clampNumber(Number.NaN, 1, 20)).toBe(1);
  });

  it("normalizes bulk topics and schedules them predictably", () => {
    expect(parseBulkTopics("موضوع أ\n\nموضوع ب\nموضوع أ")).toEqual(["موضوع أ", "موضوع ب"]);
    expect(isPublishTime("09:30")).toBe(true);
    expect(isPublishTime("25:00")).toBe(false);
    expect(scheduledPublishDate("2026-08-25", "09:00", 2, 2).toISOString()).toBe("2026-08-29T09:00:00.000Z");
  });

  it("requires article schedule dates to be in the future", () => {
    expect(parseFutureScheduleDate("2026-08-22T10:00:00.000Z", new Date("2026-08-21T10:00:00.000Z")).toISOString()).toBe("2026-08-22T10:00:00.000Z");
    expect(() => parseFutureScheduleDate("2026-08-20T10:00:00.000Z", new Date("2026-08-21T10:00:00.000Z"))).toThrow();
  });

  it("computes delayed publish timing for scheduled jobs", () => {
    expect(delayUntil(new Date("2026-08-22T11:00:00.000Z"), new Date("2026-08-22T10:00:00.000Z"))).toBe(3_600_000);
    expect(delayUntil(new Date("2026-08-22T09:00:00.000Z"), new Date("2026-08-22T10:00:00.000Z"))).toBe(0);
    expect(normalizedDelayMs(12.8)).toBe(12);
    expect(normalizedDelayMs(Number.NaN)).toBe(0);
  });

  it("chooses a safe initial state for duplicated content", () => {
    expect(duplicateInitialState({ draftHtml: "<p>مسودة</p>" })).toBe("DRAFTED");
    expect(duplicateInitialState({ selectedIdea: { title: "فكرة" }, competitorGaps: "فجوات" })).toBe("GAPS_READY");
    expect(duplicateInitialState({ selectedIdea: { title: "فكرة" } })).toBe("IDEA_SELECTED");
    expect(duplicateInitialState({ ideas: [{ title: "فكرة" }] })).toBe("IDEAS_READY");
    expect(duplicateInitialState({})).toBe("NEW");
  });

  it("builds readable duplicate titles without stacking copy prefixes", () => {
    expect(duplicateTitle("مقال تجريبي")).toBe("نسخة من مقال تجريبي");
    expect(duplicateTitle("نسخة من مقال تجريبي")).toBe("نسخة من مقال تجريبي");
    expect(duplicateTitle("  ")).toBe("نسخة من محتوى بدون عنوان");
  });

  it("retries the failed content operation from a safe workflow state", () => {
    expect(retryOperationForFailedContent("WRITE_DRAFT", "GAPS_READY")).toBe("WRITE_DRAFT");
    expect(retryOperationForFailedContent(null, "REVIEWED")).toBe("GENERATE_IMAGE");
    expect(retryStateForOperation("WRITE_DRAFT", "GAPS_READY")).toBe("GAPS_READY");
    expect(retryStateForOperation("PUBLISH", "SCHEDULED")).toBe("SCHEDULED");
    expect(retryStateForOperation("PUBLISH", null)).toBe("APPROVED");
    expect(() => retryOperationForFailedContent("UNKNOWN", null)).toThrow();
  });

  it("summarizes manual content versions with Arabic field labels", () => {
    expect(contentVersionSummary(["title", "draftHtml", "tags"])).toBe("تحديث العنوان، المحتوى، الوسوم");
    expect(contentVersionSummary(["restore"])).toBe("تحديث استرجاع إصدار");
    expect(contentVersionSummary(["unknown"])).toBe("حفظ يدوي");
  });

  it("merges content activity from audit, jobs, and provider usage in newest-first order", () => {
    const activity = mergeContentActivity(
      [{ id: "audit-1", eventType: "CONTENT_UPDATED", message: "تم التحديث", actorName: "محمد", metadata: {}, createdAt: new Date("2026-08-21T10:00:00Z") }],
      [{ id: "job-1", operation: "WRITE_DRAFT", provider: null, queueName: "content-writing", attempt: 0, status: "WAITING", error: null, startedAt: null, finishedAt: null, durationMs: null, createdAt: new Date("2026-08-21T11:00:00Z") }],
      [{ id: "usage-1", provider: "openai", model: "gpt", operation: "WRITE_DRAFT", inputTokens: 10, outputTokens: 20, estimatedCostUsd: "0.001", success: true, error: null, createdAt: new Date("2026-08-21T12:00:00Z") }]
    );

    expect(activity.map((event) => event.type)).toEqual(["USAGE", "JOB", "AUDIT"]);
    expect(activity[0]?.estimatedCostUsd).toBe(0.001);
  });

  it("builds bounded server-side content library filters", () => {
    const filter = buildContentListFilter({
      search: "سيو",
      siteId: "site-1",
      state: "FAILED",
      mode: "BULK",
      minScore: "150",
      updatedFrom: "2026-08-01",
      updatedTo: "2026-08-21",
      needsAttention: "true"
    });

    expect(filter.page).toBe(1);
    expect(filter.pageSize).toBe(25);
    expect(filter.offset).toBe(0);
    expect(filter.sql).toContain("WHERE");
    expect(filter.sql).toContain("c.site_id = $2");
    expect(filter.sql).toContain("c.content_score >= $5");
    expect(filter.values[0]).toBe("%سيو%");
    expect(filter.values[4]).toBe(100);
    expect(filter.values[5]).toEqual(new Date("2026-08-01T00:00:00.000Z"));
    expect(filter.values[6]).toEqual(new Date("2026-08-22T00:00:00.000Z"));
  });
});
