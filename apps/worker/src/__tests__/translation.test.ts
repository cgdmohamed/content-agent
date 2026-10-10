import { describe, expect, it } from "vitest";
import { buildTranslationPrompt, linkHrefs, missingLinks, parseTranslation } from "../translation.js";
import { polylangLanguageFor } from "../processors.js";
import { termInLanguage } from "../wordpress.js";

const sourceHtml = `<h2>عنوان</h2><p>${"نص المقال الأصلي ".repeat(30)}</p><p><a href="https://example.com/a">رابط</a> و <a href='https://example.com/b'>آخر</a></p>`;

function reply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: "Content marketing guide",
    metaDescription: "A practical guide to content marketing for companies.",
    targetKeyword: "content marketing",
    category: "Marketing",
    tags: ["content", "marketing"],
    imageAlt: "Content marketing",
    contentHtml: `<h2>Heading</h2><p>${"Original article text ".repeat(30)}</p><p><a href="https://example.com/a">link</a></p>`,
    ...overrides
  });
}

describe("translation prompt and parsing", () => {
  it("names both languages and carries the article as JSON", () => {
    const prompt = buildTranslationPrompt({
      title: "عنوان",
      metaDescription: "وصف",
      contentHtml: "<p>نص</p>",
      targetKeyword: "كلمة",
      category: "تسويق",
      tags: ["a"],
      imageAlt: "بديل",
      sourceLanguage: "العربية (ar)",
      targetLanguage: "English (en)",
      siteName: "موقعي",
      market: "SA"
    });
    expect(prompt).toContain("من العربية (ar) إلى English (en)");
    expect(prompt).toContain('"contentHtml":"<p>نص</p>"');
    expect(prompt).toContain("لا تترجم قيم href");
  });

  it("parses a complete translation", () => {
    const article = parseTranslation(`\`\`\`json\n${reply()}\n\`\`\``, { contentHtml: sourceHtml });
    expect(article).toMatchObject({ title: "Content marketing guide", targetKeyword: "content marketing", category: "Marketing", tags: ["content", "marketing"] });
  });

  it("rejects incomplete or cut-off translations", () => {
    expect(() => parseTranslation("not json", { contentHtml: sourceHtml })).toThrow();
    expect(() => parseTranslation(reply({ title: "" }), { contentHtml: sourceHtml })).toThrow("ناقص");
    expect(() => parseTranslation(reply({ contentHtml: "<p>short</p>" }), { contentHtml: sourceHtml })).toThrow("أقصر بكثير");
  });

  it("reports links of the source that the translation dropped", () => {
    expect(linkHrefs(sourceHtml)).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(missingLinks(sourceHtml, '<a href="https://example.com/a">x</a>')).toEqual(["https://example.com/b"]);
    expect(missingLinks(sourceHtml, sourceHtml)).toEqual([]);
  });
});

describe("Polylang publishing helpers", () => {
  const languages = [
    { code: "ar", name: "العربية", isRtl: true, isDefault: true },
    { code: "en", name: "English", isRtl: false, isDefault: false }
  ];

  it("publishes in the article's Polylang language, or the site's for the source article", () => {
    const site = { polylang_status: "CONNECTED", polylang_languages: languages, language: "ar" };
    expect(polylangLanguageFor({ ...site, content_language: null })).toBe("ar");
    expect(polylangLanguageFor({ ...site, content_language: "en" })).toBe("en");
    expect(polylangLanguageFor({ ...site, content_language: "fr" })).toBeUndefined();
  });

  it("sends no language for single-language or unsynced sites", () => {
    expect(polylangLanguageFor({ polylang_status: "NOT_CONFIGURED", polylang_languages: languages, language: "ar", content_language: null })).toBeUndefined();
    expect(polylangLanguageFor({ polylang_status: "CONNECTED", polylang_languages: languages.slice(0, 1), language: "ar", content_language: null })).toBeUndefined();
  });

  it("reuses a category only in the post's language when WordPress reports term languages", () => {
    expect(termInLanguage({ lang: "en" }, "en")).toBe(true);
    expect(termInLanguage({ lang: "ar" }, "en")).toBe(false);
    expect(termInLanguage({}, "en")).toBe(true);
    expect(termInLanguage({ lang: "ar" }, undefined)).toBe(true);
  });
});
