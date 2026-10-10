import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, query } from "../db.js";
import { processContentOperation } from "../processors.js";
import {
  anthropicReply,
  geminiReply,
  integrationEnabled,
  json,
  mockFetch,
  openaiReply,
  resetDatabase,
  seedContent,
  seedSite,
  wordpressResponder,
  type FetchMock
} from "./helpers.js";

const ideasJson = JSON.stringify([
  { title: "دليل التسويق بالمحتوى للشركات", targetKeyword: "التسويق بالمحتوى", angle: "عملي" },
  { title: "أخطاء التسويق بالمحتوى", targetKeyword: "أخطاء المحتوى", angle: "تحذيري" }
]);
const gapsJson = JSON.stringify({ summary: "ملخص", gaps: ["فجوة أولى"], sources: ["https://example.com/source"] });
const paragraph = "التسويق بالمحتوى يساعد الشركات على الوصول إلى جمهورها بطريقة طبيعية ومفيدة، ويعتمد على تقديم قيمة حقيقية للقارئ قبل أي رسالة بيعية. ".repeat(6);
const articleJson = JSON.stringify({
  title: "التسويق بالمحتوى: دليل عملي للشركات",
  metaDescription: "التسويق بالمحتوى دليل عملي يشرح كيف تبني الشركات استراتيجية محتوى تجلب الزوار والعملاء وتزيد الثقة بالعلامة التجارية.",
  contentHtml: `<h2>ما هو التسويق بالمحتوى</h2><p>${paragraph}</p><h2>أسئلة شائعة</h2><p>${paragraph}</p><p>تواصل معنا لاستشارة مجانية.</p>`,
  suggestedTags: ["محتوى", "تسويق"],
  category: "تسويق",
  imagePrompt: "Content marketing illustration",
  imageAlt: "التسويق بالمحتوى"
});

let mock: FetchMock | null = null;

describe.skipIf(!integrationEnabled)("worker pipeline against real PostgreSQL", () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(() => {
    mock?.restore();
    mock = null;
  });
  afterAll(async () => {
    await closeDb();
  });

  it("moves an article from NEW to PUBLISHED, metering every provider call", async () => {
    const siteId = await seedSite({ query });
    const contentId = await seedContent({ query }, siteId);
    const textReplies = [ideasJson, gapsJson, articleJson, articleJson];
    mock = mockFetch(
      (call) => (call.url.hostname === "api.anthropic.com" ? anthropicReply(textReplies.shift() ?? "{}") : undefined),
      (call) => (call.url.hostname === "api.perplexity.ai" ? json({ choices: [{ message: { content: textReplies.shift() ?? "{}" } }], usage: { prompt_tokens: 100, completion_tokens: 200 } }) : undefined),
      (call) => (call.url.hostname === "generativelanguage.googleapis.com" ? geminiReply() : undefined),
      wordpressResponder()
    );

    await processContentOperation(contentId, "GENERATE_IDEAS");
    expect((await query("SELECT status FROM content_items WHERE id = $1", [contentId])).rows[0]!.status).toBe("IDEAS_READY");

    await query("UPDATE content_items SET selected_idea = $2::jsonb, status = 'IDEA_SELECTED', target_keyword = 'التسويق بالمحتوى' WHERE id = $1", [contentId, JSON.stringify(JSON.parse(ideasJson)[0])]);
    for (const operation of ["RESEARCH_GAPS", "WRITE_DRAFT", "REVIEW_DRAFT", "GENERATE_IMAGE"]) await processContentOperation(contentId, operation);

    const afterImage = (await query("SELECT status, wordpress_media_id, draft_html FROM content_items WHERE id = $1", [contentId])).rows[0]!;
    expect(afterImage.status).toBe("IMAGE_READY");
    expect(afterImage.wordpress_media_id).toBe("9");
    expect(String(afterImage.draft_html)).toContain("التسويق بالمحتوى");

    await query("UPDATE content_items SET approved_at = now(), status = 'APPROVED' WHERE id = $1", [contentId]);
    await processContentOperation(contentId, "PUBLISH");
    const published = (await query("SELECT status, wordpress_post_id, wordpress_post_url, published_at FROM content_items WHERE id = $1", [contentId])).rows[0]!;
    expect(published).toMatchObject({ status: "PUBLISHED", wordpress_post_id: "77" });
    expect(published.published_at).not.toBeNull();

    const usage = (await query("SELECT provider, operation, success, error, estimated_cost_usd::float AS cost, input_tokens, output_tokens FROM api_usage_logs ORDER BY created_at")).rows;
    expect(usage.length).toBeGreaterThanOrEqual(5);
    expect(usage.every((row) => row.success === true && row.error === null)).toBe(true); // no reservation left unsettled
    const writing = usage.find((row) => row.operation === "WRITE_DRAFT")!;
    // 1000 input + 2000 output tokens as reported by the provider: (1000*3 + 2000*15) / 1e6
    expect(writing.cost).toBeCloseTo(0.033, 6);
    expect(writing.input_tokens).toBe(1000);
    // Every call is attributed to the site and names its article, so the spend survives deleting the article later.
    const attribution = await query("SELECT count(*)::int AS total, count(site_id)::int AS with_site, count(content_label)::int AS with_label FROM api_usage_logs");
    expect(attribution.rows[0]).toEqual({ total: usage.length, with_site: usage.length, with_label: usage.length });
    await query("DELETE FROM content_items WHERE id = $1", [contentId]);
    const afterDelete = await query("SELECT count(*)::int AS count, SUM(estimated_cost_usd)::float AS cost FROM api_usage_logs WHERE site_id = $1", [siteId]);
    expect(afterDelete.rows[0]!.count).toBe(usage.length);
    expect(afterDelete.rows[0]!.cost).toBeCloseTo(usage.reduce((total, row) => total + (row.cost as number), 0), 6);
    const image = usage.find((row) => row.operation === "GENERATE_IMAGE")!;
    expect(image.provider).toBe("gemini-image");
    expect(image.cost).toBeGreaterThan(0);
  });

  it("keeps the article as written: no generic closing, no homepage or search links, only real candidate links", async () => {
    const siteId = await seedSite({ query });
    const contentId = await seedContent({ query }, siteId, { status: "DRAFTED" });
    await query("UPDATE content_items SET title = 'عنوان', target_keyword = 'التسويق بالمحتوى', draft_html = $2 WHERE id = $1", [contentId, `<h2>عنوان</h2><p>${paragraph}</p>`]);
    // A published article of the same site is a valid internal link target.
    const other = await seedContent({ query }, siteId, { status: "PUBLISHED", topic: "مقال آخر" });
    await query("UPDATE content_items SET wordpress_post_url = 'https://203.0.113.10/real-post/', title = 'مقال حقيقي' WHERE id = $1", [other]);
    const reviewed = JSON.stringify({
      title: "كيف تجذب الشركات الناشئة عملاءها بالمحتوى",
      metaDescription: "شرح مبسط لخطوات بناء خطة محتوى تجذب الزوار وتحوّلهم إلى عملاء للشركات الناشئة.",
      contentHtml: `<h2>التسويق بالمحتوى</h2><p>${paragraph} <a href="https://203.0.113.10/real-post/">مقال حقيقي</a> و<a href="https://203.0.113.10/">الرئيسية</a> و<a href="https://203.0.113.10/invented-page/">صفحة مخترعة</a>.</p><h2>أسئلة شائعة</h2><p>${paragraph}</p>`,
      suggestedTags: ["محتوى"],
      category: "تسويق",
      imagePrompt: "x",
      imageAlt: "التسويق بالمحتوى"
    });
    mock = mockFetch((call) => (call.url.hostname === "api.anthropic.com" ? anthropicReply(reviewed) : undefined), wordpressResponder());

    await processContentOperation(contentId, "REVIEW_DRAFT");

    const html = String((await query("SELECT draft_html FROM content_items WHERE id = $1", [contentId])).rows[0]!.draft_html);
    expect(html).toContain('href="https://203.0.113.10/real-post/"');
    expect(html).not.toContain('href="https://203.0.113.10/"');
    expect(html).not.toContain("invented-page");
    expect(html).toContain("صفحة مخترعة"); // the anchor text stays, only the bad link goes
    expect(html).not.toContain("الخطوة التالية");
    expect(html).not.toContain("مقالات مرتبطة");
    expect(html).not.toContain("?s=");
    // The model's title and description are kept, not replaced by a "keyword: practical guide" template.
    expect((await query("SELECT title, meta_description FROM content_items WHERE id = $1", [contentId])).rows[0]).toEqual({
      title: "كيف تجذب الشركات الناشئة عملاءها بالمحتوى",
      meta_description: "شرح مبسط لخطوات بناء خطة محتوى تجذب الزوار وتحوّلهم إلى عملاء للشركات الناشئة."
    });
    // The model is told not to add a generic closing block.
    const prompt = JSON.stringify(mock.calls.find((call) => call.url.hostname === "api.anthropic.com")!.body);
    expect(prompt).toContain("ممنوع العناوين والعبارات العامة الجاهزة");
  });

  it("adopts an existing WordPress post instead of creating a duplicate on retry", async () => {
    const siteId = await seedSite({ query });
    const contentId = await seedContent({ query }, siteId, { status: "APPROVED" });
    await query(
      `UPDATE content_items
       SET title = 'التسويق بالمحتوى: دليل عملي للشركات', draft_html = $2, approved_at = now(), selected_idea = '{"targetKeyword":"التسويق بالمحتوى"}'::jsonb, target_keyword = 'التسويق بالمحتوى'
       WHERE id = $1`,
      [contentId, `<h2>عنوان</h2><p>${paragraph}</p>`]
    );
    mock = mockFetch(wordpressResponder({ existingPost: { id: 41, title: "التسويق بالمحتوى: دليل عملي للشركات" } }));

    await processContentOperation(contentId, "PUBLISH");

    expect(mock.calls.filter((call) => call.method === "POST" && call.url.pathname === "/wp-json/wp/v2/posts")).toHaveLength(0);
    expect(mock.calls.some((call) => call.method === "POST" && call.url.pathname === "/wp-json/wp/v2/posts/41")).toBe(true);
    expect((await query("SELECT wordpress_post_id FROM content_items WHERE id = $1", [contentId])).rows[0]!.wordpress_post_id).toBe("41");
  });

  it("never calls a model the site does not allow", async () => {
    const siteId = await seedSite({ query }, { allowedModels: ["openai:gpt-4o-mini"] });
    const contentId = await seedContent({ query }, siteId);
    mock = mockFetch((call) => (call.url.hostname === "api.openai.com" ? openaiReply(ideasJson) : undefined));

    await processContentOperation(contentId, "GENERATE_IDEAS");

    expect(mock.calls.map((call) => call.url.hostname)).toEqual(["api.openai.com"]);
    expect((mock.calls[0]!.body as { model: string }).model).toBe("gpt-4o-mini");
  });

  it("fails clearly when the site allow-list leaves no configured model", async () => {
    const siteId = await seedSite({ query }, { allowedModels: ["gemini:gemini-2.5-flash-image"] });
    const contentId = await seedContent({ query }, siteId);
    mock = mockFetch();
    await expect(processContentOperation(contentId, "GENERATE_IDEAS")).rejects.toThrow("لا يوجد موديل متاح");
    expect(mock.calls).toHaveLength(0);
  });

  it("falls back to the next model when a provider fails and bills nothing for the failure", async () => {
    const siteId = await seedSite({ query });
    const contentId = await seedContent({ query }, siteId);
    // ideas default order: perplexity -> openai -> anthropic
    mock = mockFetch(
      (call) => (call.url.hostname === "api.perplexity.ai" ? json({ error: "down" }, 503) : undefined),
      (call) => (call.url.hostname === "api.openai.com" ? openaiReply(ideasJson) : undefined)
    );

    await processContentOperation(contentId, "GENERATE_IDEAS");

    const usage = (await query("SELECT provider, success, estimated_cost_usd::float AS cost FROM api_usage_logs ORDER BY created_at")).rows;
    expect(usage).toEqual([
      { provider: "perplexity", success: false, cost: 0 },
      { provider: "openai", success: true, cost: expect.any(Number) }
    ]);
    expect(usage[1]!.cost).toBeGreaterThan(0);
  });

  it("stops before calling any provider once the monthly hard limit is reached", async () => {
    const siteId = await seedSite({ query });
    const contentId = await seedContent({ query }, siteId);
    await query("INSERT INTO system_settings (key, value) VALUES ('production_settings', $1::jsonb)", [JSON.stringify({ monthlyAiBudgetUsd: 1, monthlyAiHardLimitUsd: 1 })]);
    await query("INSERT INTO api_usage_logs (provider, model, operation, estimated_cost_usd) VALUES ('openai', 'gpt-4o', 'WRITE_DRAFT', 1.5)");
    mock = mockFetch();

    await expect(processContentOperation(contentId, "GENERATE_IDEAS")).rejects.toThrow("تم تجاوز حد ميزانية");
    expect(mock.calls).toHaveLength(0);
  });

  it("does not pay for a second image when the WordPress upload is retried", async () => {
    const siteId = await seedSite({ query });
    const contentId = await seedContent({ query }, siteId, { status: "REVIEWED" });
    await query("UPDATE content_items SET title = 'عنوان المقال', image_prompt = 'prompt for retry test' WHERE id = $1", [contentId]);
    mock = mockFetch((call) => (call.url.hostname === "generativelanguage.googleapis.com" ? geminiReply() : undefined), wordpressResponder({ failMediaUploads: 1 }));

    await expect(processContentOperation(contentId, "GENERATE_IMAGE")).rejects.toThrow();
    await processContentOperation(contentId, "GENERATE_IMAGE");

    expect(mock.calls.filter((call) => call.url.hostname === "generativelanguage.googleapis.com")).toHaveLength(1);
    const images = await query("SELECT count(*)::int AS count FROM api_usage_logs WHERE operation = 'GENERATE_IMAGE'");
    expect(images.rows[0]!.count).toBe(1);
    expect((await query("SELECT status FROM content_items WHERE id = $1", [contentId])).rows[0]!.status).toBe("IMAGE_READY");
  });

  it("uses the cost the provider reports and stores cache token detail", async () => {
    const siteId = await seedSite({ query });
    const contentId = await seedContent({ query }, siteId);
    mock = mockFetch((call) =>
      call.url.hostname === "api.perplexity.ai"
        ? json({
            choices: [{ message: { content: ideasJson } }],
            usage: { prompt_tokens: 150_000, completion_tokens: 14_218, prompt_tokens_details: { cached_tokens: 83_712 }, cost: { total_cost: 0.0349 } }
          })
        : undefined
    );

    await processContentOperation(contentId, "GENERATE_IDEAS");

    const row = (await query("SELECT estimated_cost_usd::float AS cost, cost_source, input_tokens, output_tokens, cache_read_tokens FROM api_usage_logs")).rows[0]!;
    expect(row).toMatchObject({ cost: 0.0349, cost_source: "reported", input_tokens: 66_288, output_tokens: 14_218, cache_read_tokens: 83_712 });
  });

  it("still bills the tokens of an image request that came back without an image", async () => {
    const siteId = await seedSite({ query });
    const contentId = await seedContent({ query }, siteId, { status: "REVIEWED" });
    await query("UPDATE content_items SET title = 'عنوان', image_prompt = 'blocked prompt' WHERE id = $1", [contentId]);
    await query("INSERT INTO system_settings (key, value) VALUES ('production_settings', $1::jsonb)", [JSON.stringify({ operationModels: { image: [{ provider: "gemini", model: "gemini-3-pro-image-preview" }] } })]);
    mock = mockFetch((call) =>
      call.url.hostname === "generativelanguage.googleapis.com"
        ? json({ candidates: [{ content: { parts: [{ text: "I cannot create that image." }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokensDetails: [{ modality: "TEXT", tokenCount: 400 }], thoughtsTokenCount: 100 } })
        : undefined
    );

    await expect(processContentOperation(contentId, "GENERATE_IMAGE")).rejects.toThrow();

    const row = (await query("SELECT success, error, estimated_cost_usd::float AS cost FROM api_usage_logs WHERE operation = 'GENERATE_IMAGE'")).rows[0]!;
    expect(row.success).toBe(false);
    expect(row.error).not.toBe("RESERVED");
    expect(row.cost).toBeCloseTo((100 * 2 + 500 * 12) / 1_000_000, 6); // prompt tokens + text + thinking tokens
  });
});

