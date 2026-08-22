import { describe, expect, it } from "vitest";
import { findDuplicateMatches, normalizeArabicText, similarityScore } from "../duplicate-detection.js";
import { sanitizeArticleHtml } from "../html-sanitizer.js";
import { estimateCostUsd } from "../providers.js";
import { scoreContent } from "../content-score.js";
import { canTransition, mapLegacyStatus, transitionOrThrow } from "../workflow.js";
import { isBlockedIpAddress, safeExternalUrl } from "../url-safety.js";

describe("workflow", () => {
  it("keeps Admin approval as an Admin-only transition", () => {
    expect(canTransition({ state: "IMAGE_READY", role: "EDITOR", hasImageDecision: true }, "APPROVE")).toBe(false);
    expect(transitionOrThrow({ state: "IMAGE_READY", role: "ADMIN", hasImageDecision: true }, "APPROVE")).toBe("APPROVED");
  });

  it("maps legacy PHP statuses", () => {
    expect(mapLegacyStatus("ideas_ready")).toBe("IDEAS_READY");
    expect(mapLegacyStatus("error")).toBe("FAILED");
  });

  it("returns Arabic errors for invalid transitions", () => {
    expect(() => transitionOrThrow({ state: "NEW", role: "EDITOR" }, "PUBLISH")).toThrow("غير مسموحة");
  });
});

describe("Arabic duplicate detection", () => {
  it("normalizes Arabic variants and stop words", () => {
    expect(normalizeArabicText("أفضل طريقة لإدارة المحتوى في السعودية")).toBe("طريقه لاداره المحتوي السعوديه");
  });

  it("finds close topic duplicates", () => {
    const matches = findDuplicateMatches("إدارة المحتوى في السعودية", [
      { id: "1", topic: "ادارة المحتوى للسوق السعودي", status: "PUBLISHED" },
      { id: "2", topic: "شراء سيارة مستعملة", status: "PUBLISHED" }
    ]);
    expect(matches[0]?.id).toBe("1");
    expect(similarityScore("إدارة المحتوى", "ادارة المحتوى")).toBeGreaterThan(90);
  });
});

describe("content score", () => {
  it("returns deterministic checks", () => {
    const result = scoreContent({
      title: "دليل عملي لتحسين صفحات المحتوى لمحركات البحث",
      metaDescription: "وصف تعريفي واضح يشرح فائدة الصفحة ويحفز القارئ على معرفة الخطوات العملية لتحسين المحتوى.",
      html: "<h2>مقدمة</h2><h2>خطوات</h2><h2>أسئلة شائعة</h2><p>مثال عملي عن تحسين المحتوى.</p><p><a href=\"https://example.com/a\">رابط داخلي</a></p><p><a href=\"https://example.com/b\">رابط داخلي آخر</a></p><p>فقرة</p><p>فقرة</p><p>FAQ سؤال</p>",
      targetKeyword: "تحسين المحتوى",
      siteUrl: "https://example.com",
      imageAlt: "صورة توضيحية",
      editorialBrief: "هدف الصفحة: تعليم القارئ"
    });
    expect(result.score).toBeGreaterThan(60);
    expect(result.checks.some((check) => check.name === "Internal links")).toBe(true);
  });
});

describe("costs", () => {
  it("estimates token cost", () => {
    expect(estimateCostUsd(1000, 2000, 5, 15)).toBe(0.035);
  });
});

describe("article HTML sanitizer", () => {
  it("keeps expected article tags and removes executable markup", () => {
    const html = sanitizeArticleHtml(
      '<h2 onclick="steal()">عنوان</h2><p>نص <strong>مهم</strong></p><a href="javascript:alert(1)">رابط سيئ</a><a href="https://example.com">رابط جيد</a><script>alert(1)</script><iframe src="https://example.com"></iframe>'
    );

    expect(html).toContain("<h2>عنوان</h2>");
    expect(html).toContain("<strong>مهم</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
  });
});

describe("external URL safety", () => {
  it("accepts public HTTPS URLs and blocks local or internal targets", () => {
    expect(safeExternalUrl("https://example.com/wp").origin).toBe("https://example.com");
    expect(() => safeExternalUrl("http://example.com")).toThrow("HTTPS");
    expect(() => safeExternalUrl("https://localhost")).toThrow();
    expect(() => safeExternalUrl("https://127.0.0.1")).toThrow();
    expect(() => safeExternalUrl("https://10.0.0.10")).toThrow();
    expect(() => safeExternalUrl("https://user:pass@example.com")).toThrow();
    expect(safeExternalUrl("http://example.com", { allowHttp: true }).origin).toBe("http://example.com");
  });

  it("detects blocked IP ranges", () => {
    expect(isBlockedIpAddress("192.168.1.5")).toBe(true);
    expect(isBlockedIpAddress("172.20.0.5")).toBe(true);
    expect(isBlockedIpAddress("100.64.0.1")).toBe(true);
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("fd00::1")).toBe(true);
  });
});
