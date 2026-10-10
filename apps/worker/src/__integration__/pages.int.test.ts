import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, query } from "../db.js";
import { classifySitePages } from "../page-classifier.js";
import { syncPagesForSite } from "../pages-sync.js";
import { processContentOperation } from "../processors.js";
import { anthropicReply, integrationEnabled, json, mockFetch, resetDatabase, seedContent, seedSite, wordpressHost, wordpressResponder, type FetchMock } from "./helpers.js";

const paragraph = "التسويق بالمحتوى يساعد الشركات على الوصول إلى جمهورها بطريقة طبيعية ومفيدة. ".repeat(8);
let mock: FetchMock | null = null;

function wp(path: string, id: number, title: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, link: `${wordpressHost}/${path}/`, title: { rendered: title }, slug: path, modified_gmt: "2026-01-02T03:04:05", excerpt: { rendered: `<p>وصف ${title}</p>` }, ...extra };
}

/** A WordPress with core types plus a "service" custom type; `state.pages` can be changed between syncs. */
function siteWithPages(state: { pages: Record<string, unknown[]> }) {
  return (call: { url: URL }) => {
    if (call.url.origin !== wordpressHost) return undefined;
    const path = call.url.pathname;
    if (path === "/wp-json/wp/v2/types") {
      return json({ post: { slug: "post", rest_base: "posts" }, page: { slug: "page", rest_base: "pages" }, service: { slug: "service", rest_base: "services" }, attachment: { slug: "attachment", rest_base: "media" } });
    }
    const match = /^\/wp-json\/wp\/v2\/(posts|pages|services)$/.exec(path);
    if (match) return json(state.pages[match[1]!] ?? []);
    return undefined;
  };
}

const initialPages = () => ({
  posts: [wp("blog/content-marketing", 1, "التسويق بالمحتوى للشركات &#8211; دليل", { lang: "ar" }), wp("blog/english", 2, "English article", { lang: "en" })],
  pages: [wp("privacy-policy", 10, "سياسة الخصوصية"), wp("contact", 11, "اتصل بنا"), wp("about", 12, "من نحن")],
  services: [wp("services/seo", 20, "خدمة تحسين محركات البحث"), wp("services/content", 21, "خدمة كتابة المحتوى")]
});

/** A fake model: answers the page-classification prompt from the page titles it was given. */
function classifier(call: { url: URL; body: unknown }): Response | undefined {
  if (call.url.hostname !== "api.anthropic.com") return undefined;
  const prompt = String((call.body as { messages: Array<{ content: string }> }).messages[0]!.content);
  const pages = JSON.parse(prompt.split("الصفحات (JSON):")[1]!.split("\n\n")[1]!) as Array<{ n: number; title: string }>;
  const verdict = (title: string) =>
    /خدمة/.test(title) ? { kind: "SERVICE", priority: true, hidden: false } : /اتصل/.test(title) ? { kind: "CONTACT", priority: false, hidden: false } : /نحن/.test(title) ? { kind: "ABOUT", priority: false, hidden: false } : /الخصوصية/.test(title) ? { kind: "OTHER", priority: false, hidden: true } : { kind: "ARTICLE", priority: false, hidden: false };
  return anthropicReply(JSON.stringify(pages.map((page) => ({ n: page.n, ...verdict(page.title) }))));
}

describe.skipIf(!integrationEnabled)("site page index against real PostgreSQL", () => {
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

  it("indexes pages and custom types, classifies them and keeps admin choices on the next sync", async () => {
    const siteId = await seedSite({ query });
    const state = { pages: initialPages() as Record<string, unknown[]> };
    mock = mockFetch(siteWithPages(state), classifier);

    expect(await syncPagesForSite(siteId)).toEqual({ total: 7, created: 7, gone: 0, classified: 5 });
    const rows = (await query("SELECT title, kind, priority, hidden, language, wp_type FROM site_pages WHERE site_id = $1 ORDER BY wp_type, wp_id", [siteId])).rows;
    expect(rows.find((row) => row.title.startsWith("التسويق بالمحتوى"))).toMatchObject({ kind: "ARTICLE", language: "ar", title: "التسويق بالمحتوى للشركات – دليل" });
    expect(rows.find((row) => row.title === "سياسة الخصوصية")).toMatchObject({ hidden: true });
    expect(rows.find((row) => row.title === "اتصل بنا")).toMatchObject({ kind: "CONTACT" });
    expect(rows.filter((row) => row.wp_type === "service")).toEqual([expect.objectContaining({ kind: "SERVICE", priority: true }), expect.objectContaining({ kind: "SERVICE", priority: true })]);
    // Posts are never sent to the model; the other five pages were classified by it and attributed to the site.
    expect((await query("SELECT kind_source, count(*)::int AS n FROM site_pages WHERE site_id = $1 GROUP BY kind_source ORDER BY kind_source", [siteId])).rows).toEqual([{ kind_source: "AI", n: 5 }, { kind_source: "AUTO", n: 2 }]);
    expect((await query("SELECT operation, site_id, content_item_id, content_label, success FROM api_usage_logs")).rows).toEqual([{ operation: "CLASSIFY_PAGES", site_id: siteId, content_item_id: null, content_label: "تصنيف صفحات الموقع", success: true }]);
    expect((await query("SELECT pages_synced_at FROM sites WHERE id = $1", [siteId])).rows[0]!.pages_synced_at).not.toBeNull();

    // An admin decision survives the next sync; a deleted page is marked gone, a new one is added.
    await query("UPDATE site_pages SET kind = 'PRODUCT', priority = false, kind_source = 'MANUAL' WHERE site_id = $1 AND title = 'خدمة كتابة المحتوى'", [siteId]);
    state.pages.services = [wp("services/content", 21, "خدمة كتابة المحتوى (محدّثة)")];
    state.pages.pages = [...state.pages.pages!, wp("services/new-page", 30, "صفحة جديدة")];
    expect(await syncPagesForSite(siteId)).toMatchObject({ created: 1, gone: 1, classified: 1 }); // only the new page goes to the model
    expect((await query("SELECT title, kind, priority FROM site_pages WHERE wp_id = '21'")).rows[0]).toEqual({ title: "خدمة كتابة المحتوى (محدّثة)", kind: "PRODUCT", priority: false });
    expect((await query("SELECT gone FROM site_pages WHERE wp_id = '20'")).rows[0]!.gone).toBe(true);

    // A broken/empty answer must not hide the whole index.
    state.pages = { posts: [], pages: [], services: [] };
    mock.restore();
    mock = mockFetch(siteWithPages(state));
    expect((await syncPagesForSite(siteId)).gone).toBe(0);
    expect((await query("SELECT count(*)::int AS n FROM site_pages WHERE site_id = $1 AND gone = false", [siteId])).rows[0]!.n).toBeGreaterThan(0);
  });

  it("offers indexed pages to the writer, never the homepage, and limits repeated service links", async () => {
    const siteId = await seedSite({ query });
    const state = { pages: initialPages() as Record<string, unknown[]> };
    mock = mockFetch(siteWithPages(state), classifier);
    await syncPagesForSite(siteId);
    mock.restore();

    const contentId = await seedContent({ query }, siteId, { status: "DRAFTED", topic: "التسويق بالمحتوى للشركات" });
    await query("UPDATE content_items SET title = 'التسويق بالمحتوى للشركات', target_keyword = 'التسويق بالمحتوى', draft_html = $2 WHERE id = $1", [contentId, `<h2>عنوان</h2><p>${paragraph}</p>`]);
    const reply = JSON.stringify({
      title: "التسويق بالمحتوى للشركات: من أين تبدأ",
      metaDescription: "خطوات عملية لبناء خطة تسويق بالمحتوى للشركات وقياس نتائجها بدقة خلال الأشهر الأولى من التنفيذ.",
      contentHtml: `<h2>التسويق بالمحتوى</h2><p>${paragraph} <a href="${wordpressHost}/services/seo/">تحسين محركات البحث</a> و<a href="${wordpressHost}/services/seo/">مرة أخرى</a> و<a href="${wordpressHost}/services/content/">كتابة المحتوى</a> و<a href="${wordpressHost}/contact/">اتصل</a> و<a href="${wordpressHost}/privacy-policy/">الخصوصية</a>.</p><h2>أسئلة شائعة</h2><p>${paragraph}</p>`,
      suggestedTags: ["محتوى"], category: "تسويق", imagePrompt: "x", imageAlt: "التسويق بالمحتوى"
    });
    mock = mockFetch((call) => (call.url.hostname === "api.anthropic.com" ? anthropicReply(reply) : undefined));

    await processContentOperation(contentId, "REVIEW_DRAFT");

    const prompt = JSON.stringify(mock.calls.find((call) => call.url.hostname === "api.anthropic.com")!.body);
    expect(prompt).toContain("/blog/content-marketing/");
    expect(prompt).toContain('\\"type\\":\\"SERVICE\\"');
    expect(prompt).toContain("/services/seo/");
    expect(prompt).not.toContain("privacy-policy/\\\""); // hidden pages are never offered
    expect(prompt).not.toContain("blog/english"); // other language
    // Neither a live WordPress search nor any other fetch was needed: the index is the source.
    expect(mock.calls.every((call) => call.url.hostname === "api.anthropic.com")).toBe(true);

    const html = String((await query("SELECT draft_html FROM content_items WHERE id = $1", [contentId])).rows[0]!.draft_html);
    expect(html.match(/services\/seo\//g)).toHaveLength(1); // repeated link kept once
    expect(html).toContain('href="https://203.0.113.10/services/content/"');
    expect(html).not.toContain("privacy-policy"); // not a candidate: stripped to text
    expect(html).toContain("الخصوصية");
  });

  it("drops links to deleted pages from the published copy only", async () => {
    const siteId = await seedSite({ query });
    await query("INSERT INTO site_pages (site_id, wp_type, wp_id, url, title, kind, gone) VALUES ($1, 'page', '1', $2, 'محذوفة', 'OTHER', true)", [siteId, `${wordpressHost}/removed-page/`]);
    const contentId = await seedContent({ query }, siteId, { status: "APPROVED" });
    const draft = `<h2>عنوان</h2><p>${paragraph} <a href="${wordpressHost}/removed-page">رابط ميت</a> و<a href="${wordpressHost}/unknown-page/">رابط غير معروف</a></p>`;
    await query("UPDATE content_items SET title = 'عنوان', draft_html = $2, approved_at = now() WHERE id = $1", [contentId, draft]);
    mock = mockFetch((call) => (call.method === "POST" && call.url.pathname === "/wp-json/wp/v2/posts" ? json({ id: 5, link: `${wordpressHost}/p`, status: "publish" }, 201) : undefined), wordpressResponder());

    await processContentOperation(contentId, "PUBLISH");

    const sent = String((mock.calls.find((call) => call.method === "POST" && call.url.pathname === "/wp-json/wp/v2/posts")!.body as { content: string }).content);
    expect(sent).not.toContain("removed-page");
    expect(sent).toContain("رابط ميت");
    expect(sent).toContain("unknown-page"); // unknown URLs are not proven dead, so they stay
    expect((await query("SELECT draft_html FROM content_items WHERE id = $1", [contentId])).rows[0]!.draft_html).toBe(draft);
    expect((await query("SELECT event_type FROM audit_logs WHERE content_item_id = $1 AND event_type = 'INTERNAL_LINKS_REMOVED'", [contentId])).rowCount).toBe(1);
  });

  it("keeps admin decisions when the model re-classifies, and survives a failing model", async () => {
    const siteId = await seedSite({ query });
    await query(
      `INSERT INTO site_pages (site_id, wp_type, wp_id, url, title, kind, kind_source) VALUES
       ($1, 'page', '1', $2, 'خدمة يدوية', 'PRODUCT', 'MANUAL'),
       ($1, 'page', '2', $3, 'خدمة تلقائية', 'OTHER', 'AUTO'),
       ($1, 'page', '3', $4, 'اتصل بنا', 'OTHER', 'AI')`,
      [siteId, `${wordpressHost}/a/`, `${wordpressHost}/b/`, `${wordpressHost}/c/`]
    );
    mock = mockFetch(classifier);
    expect(await classifySitePages(siteId, { onlyNew: false })).toEqual({ classified: 2, skipped: 0 });
    expect((await query("SELECT title, kind, kind_source FROM site_pages WHERE site_id = $1 ORDER BY wp_id", [siteId])).rows).toEqual([
      { title: "خدمة يدوية", kind: "PRODUCT", kind_source: "MANUAL" },
      { title: "خدمة تلقائية", kind: "SERVICE", kind_source: "AI" },
      { title: "اتصل بنا", kind: "CONTACT", kind_source: "AI" }
    ]);
    // "Only new pages" leaves model-classified pages alone: nothing left to send, so no model call.
    mock.restore();
    mock = mockFetch();
    expect(await classifySitePages(siteId, { onlyNew: true })).toEqual({ classified: 0, skipped: 0 });

    // A model that answers nonsense fails the job without touching the pages.
    await query("UPDATE site_pages SET kind_source = 'AUTO' WHERE wp_id = '2'");
    mock.restore();
    mock = mockFetch((call) => (call.url.hostname === "api.anthropic.com" ? anthropicReply("لا أعرف") : undefined));
    await expect(classifySitePages(siteId, { onlyNew: true })).rejects.toThrow("JSON");
    expect((await query("SELECT kind_source FROM site_pages WHERE wp_id = '2'")).rows[0]!.kind_source).toBe("AUTO");
  });
});
