import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, query } from "../db.js";
import { processContentOperation } from "../processors.js";
import { anthropicReply, integrationEnabled, json, mockFetch, resetDatabase, seedContent, seedSite, wordpressHost, wordpressResponder, type FetchMock, type RecordedCall } from "./helpers.js";

const paragraph = "التسويق بالمحتوى يساعد الشركات على الوصول إلى جمهورها بطريقة طبيعية ومفيدة. ".repeat(8);
const englishParagraph = "Content marketing helps companies reach their audience in a natural and useful way. ".repeat(8);
const translationJson = JSON.stringify({
  title: "Content marketing: a practical guide",
  metaDescription: "A practical guide that explains how companies build a content strategy that brings visitors and customers.",
  targetKeyword: "content marketing",
  category: "Marketing",
  tags: ["content", "marketing"],
  imageAlt: "Content marketing",
  contentHtml: `<h2>What is content marketing</h2><p>${englishParagraph}</p><p><a href="${wordpressHost}/related">Related</a></p>`
});

let mock: FetchMock | null = null;

/** Hands out a new post id per created post and remembers what each post was sent. */
function numberedPosts(): (call: RecordedCall) => Response | undefined {
  let next = 100;
  return (call) => {
    if (call.url.origin === wordpressHost && call.url.pathname === "/wp-json/wp/v2/posts" && call.method === "POST") {
      next += 1;
      return json({ id: next, link: `${wordpressHost}/post-${next}`, status: "publish" }, 201);
    }
    return undefined;
  };
}

async function seedMultilingualSite(): Promise<string> {
  const siteId = await seedSite({ query });
  await query("UPDATE sites SET polylang_status = 'CONNECTED', polylang_languages = $2::jsonb, publish_languages = '[\"en\"]'::jsonb WHERE id = $1", [
    siteId,
    JSON.stringify([
      { code: "ar", name: "العربية", isRtl: true, isDefault: true },
      { code: "en", name: "English", isRtl: false, isDefault: false }
    ])
  ]);
  return siteId;
}

describe.skipIf(!integrationEnabled)("Polylang translations against real PostgreSQL", () => {
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

  it("translates an approved article, publishes both languages and links them in Polylang", async () => {
    const siteId = await seedMultilingualSite();
    const sourceId = await seedContent({ query }, siteId, { status: "IMAGE_READY" });
    await query(
      `UPDATE content_items SET title = 'التسويق بالمحتوى: دليل عملي', draft_html = $2, meta_description = 'وصف', category = 'تسويق', tags = '["محتوى"]'::jsonb,
         target_keyword = 'التسويق بالمحتوى', image_alt = 'بديل', wordpress_media_id = '9', image_url = 'https://203.0.113.10/uploads/featured.png',
         approved_at = now(), status = 'APPROVED' WHERE id = $1`,
      [sourceId, `<h2>ما هو التسويق بالمحتوى</h2><p>${paragraph}</p><p><a href="${wordpressHost}/related">مرتبط</a></p>`]
    );
    const child = await query(
      `INSERT INTO content_items (site_id, topic, title, status, mode, language, translation_of, wordpress_media_id, image_url)
       VALUES ($1, 'التسويق بالمحتوى', 'x', 'QUEUED', 'MANUAL', 'en', $2, '9', 'https://203.0.113.10/uploads/featured.png') RETURNING id`,
      [siteId, sourceId]
    );
    const childId = String(child.rows[0]!.id);

    mock = mockFetch((call) => (call.url.hostname === "api.anthropic.com" ? anthropicReply(translationJson) : undefined), numberedPosts(), wordpressResponder());

    await processContentOperation(childId, "TRANSLATE_CONTENT");
    const translated = (await query("SELECT status, title, language, target_keyword, wordpress_media_id, category, content_score FROM content_items WHERE id = $1", [childId])).rows[0]!;
    expect(translated).toMatchObject({ status: "IMAGE_READY", title: "Content marketing: a practical guide", language: "en", target_keyword: "content marketing", wordpress_media_id: "9", category: "Marketing" });
    expect((await query("SELECT operation, site_id FROM api_usage_logs WHERE content_item_id = $1", [childId])).rows[0]).toMatchObject({ operation: "TRANSLATE_CONTENT", site_id: siteId });

    await query("UPDATE content_items SET approved_at = now(), status = 'APPROVED' WHERE id = $1", [childId]);
    await processContentOperation(sourceId, "PUBLISH");
    await processContentOperation(childId, "PUBLISH");

    const postCalls = mock.calls.filter((call) => call.method === "POST" && call.url.pathname === "/wp-json/wp/v2/posts");
    expect(postCalls.map((call) => (call.body as { lang?: string }).lang)).toEqual(["ar", "en"]);
    // Categories and tags are created in the language of the post they belong to.
    const termCreates = mock.calls.filter((call) => call.method === "POST" && /\/wp-json\/wp\/v2\/(categories|tags)$/.test(call.url.pathname));
    expect(termCreates.some((call) => (call.body as { lang?: string; name?: string }).lang === "en" && (call.body as { name?: string }).name === "Marketing")).toBe(true);
    expect(termCreates.some((call) => (call.body as { lang?: string; name?: string }).lang === "ar" && (call.body as { name?: string }).name === "تسويق")).toBe(true);
    // Only the second publish can link both posts.
    const links = mock.calls.filter((call) => call.method === "POST" && /\/wp-json\/wp\/v2\/posts\/\d+$/.test(call.url.pathname) && (call.body as { translations?: unknown }).translations);
    expect(links).toHaveLength(1);
    expect(links[0]!.body).toEqual({ translations: { ar: 101, en: 102 } });
    expect((await query("SELECT status FROM content_items WHERE id = ANY($1)", [[sourceId, childId]])).rows.map((row) => row.status)).toEqual(["PUBLISHED", "PUBLISHED"]);
  });

  it("sends no language to a site without Polylang", async () => {
    const siteId = await seedSite({ query });
    const contentId = await seedContent({ query }, siteId, { status: "APPROVED" });
    await query("UPDATE content_items SET title = 'عنوان', draft_html = $2, approved_at = now() WHERE id = $1", [contentId, `<h2>عنوان</h2><p>${paragraph}</p>`]);
    mock = mockFetch(numberedPosts(), wordpressResponder());
    await processContentOperation(contentId, "PUBLISH");
    const post = mock.calls.find((call) => call.method === "POST" && call.url.pathname === "/wp-json/wp/v2/posts")!;
    expect(post.body).not.toHaveProperty("lang");
    expect(mock.calls.some((call) => (call.body as { translations?: unknown } | undefined)?.translations)).toBe(false);
  });

  it("keeps the article published when Polylang linking fails and records it", async () => {
    const siteId = await seedMultilingualSite();
    const sourceId = await seedContent({ query }, siteId, { status: "APPROVED" });
    await query("UPDATE content_items SET title = 'عنوان', draft_html = $2, approved_at = now() WHERE id = $1", [sourceId, `<h2>عنوان</h2><p>${paragraph}</p>`]);
    await query(
      `INSERT INTO content_items (site_id, topic, title, draft_html, status, mode, language, translation_of, approved_at, wordpress_post_id)
       VALUES ($1, 't', 'Title', $2, 'PUBLISHED', 'MANUAL', 'en', $3, now(), '55')`,
      [siteId, `<h2>Title</h2><p>${englishParagraph}</p>`, sourceId]
    );
    mock = mockFetch(
      numberedPosts(),
      (call) => (/\/wp-json\/wp\/v2\/posts\/\d+$/.test(call.url.pathname) && (call.body as { translations?: unknown } | undefined)?.translations ? json({ message: "translations rejected" }, 400) : undefined),
      wordpressResponder()
    );
    await processContentOperation(sourceId, "PUBLISH");
    expect((await query("SELECT status FROM content_items WHERE id = $1", [sourceId])).rows[0]!.status).toBe("PUBLISHED");
    const audit = await query("SELECT event_type, metadata FROM audit_logs WHERE content_item_id = $1 AND event_type = 'WORDPRESS_TRANSLATIONS_LINK_FAILED'", [sourceId]);
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows[0]!.metadata)).toContain("translations rejected");
  });
});
