import { describe, expect, it } from "vitest";
import { buildSiteQualityReport } from "../reports.module";

describe("site reports", () => {
  it("summarizes editorial quality, keywords, and low score content", () => {
    const report = buildSiteQualityReport([
      {
        id: "1",
        title: "مقال أول",
        topic: "موضوع أول",
        target_keyword: "تحسين محركات البحث",
        selected_idea: null,
        draft_html: '<h2>سؤال مهم</h2><p>نص <a href="/internal">رابط</a></p>',
        content_score: 82,
        status: "PUBLISHED",
        created_at: new Date("2026-08-01T00:00:00Z"),
        published_at: new Date("2026-08-02T00:00:00Z")
      },
      {
        id: "2",
        title: null,
        topic: "موضوع ثان",
        target_keyword: null,
        selected_idea: { target_keyword: "تحسين محركات البحث" },
        draft_html: "<p>نص بلا روابط</p>",
        content_score: 45,
        status: "DRAFTED",
        created_at: new Date("2026-08-03T00:00:00Z"),
        published_at: null
      }
    ]);

    expect(report).toMatchObject({
      draftedCount: 2,
      withInternalLinks: 1,
      withoutInternalLinks: 1,
      internalLinkCoverage: 0.5,
      withFaq: 1,
      faqCoverage: 0.5,
      topKeywords: [{ keyword: "تحسين محركات البحث", count: 2 }],
      lowScore: [{ id: "2", title: "موضوع ثان", score: 45, status: "DRAFTED" }]
    });
  });
});
