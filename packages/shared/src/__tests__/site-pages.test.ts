import { describe, expect, it } from "vitest";
import { classifyPage, limitRepeatedLinks, normalizeLinkKey, pageRelevance, pageTokens, rankPageCandidates, type RankablePage } from "../site-pages.js";

describe("page classification", () => {
  it("classifies from the WordPress type, then the slug and title", () => {
    expect(classifyPage({ wpType: "post", title: "x", slug: "x" })).toMatchObject({ kind: "ARTICLE", priority: false });
    expect(classifyPage({ wpType: "page", title: "خدمات تصميم المواقع", slug: "web-design" })).toMatchObject({ kind: "SERVICE", priority: true });
    expect(classifyPage({ wpType: "service", title: "x", slug: "x" })).toMatchObject({ kind: "SERVICE", priority: true });
    expect(classifyPage({ wpType: "page", title: "Contact us", slug: "contact" }).kind).toBe("CONTACT");
    expect(classifyPage({ wpType: "page", title: "من نحن", slug: "about" }).kind).toBe("ABOUT");
    expect(classifyPage({ wpType: "page", title: "باقات الاشتراك", slug: "plans" })).toMatchObject({ kind: "PRODUCT", priority: true });
  });

  it("hides legal and utility pages", () => {
    expect(classifyPage({ wpType: "page", title: "سياسة الخصوصية", slug: "privacy-policy" })).toMatchObject({ hidden: true, priority: false });
    expect(classifyPage({ wpType: "page", title: "Checkout", slug: "checkout" }).hidden).toBe(true);
    expect(classifyPage({ wpType: "page", title: "عنوان عادي", slug: "something" })).toMatchObject({ kind: "OTHER", hidden: false });
  });
});

describe("page ranking", () => {
  const pages: RankablePage[] = [
    { title: "خدمة تحسين محركات البحث", url: "https://s.com/seo", slug: "seo", summary: "نساعدك على الظهور في نتائج البحث", kind: "SERVICE", priority: true },
    { title: "خدمة تصميم الشعارات", url: "https://s.com/logo", slug: "logo", kind: "SERVICE", priority: true },
    { title: "كيف تكتب مقالا ناجحا", url: "https://s.com/blog/write", slug: "write", kind: "ARTICLE", priority: false },
    { title: "التسويق بالمحتوى للشركات", url: "https://s.com/blog/content", slug: "content-marketing", kind: "ARTICLE", priority: false },
    { title: "أخبار الشركة", url: "https://s.com/news", slug: "news", kind: "OTHER", priority: false }
  ];

  it("normalizes words", () => {
    expect(pageTokens("التسويقُ بالمحتوى في the guide")).toEqual(["تسويق", "بالمحتوى"]);
  });

  it("scores pages by shared words, title first", () => {
    expect(pageRelevance("التسويق بالمحتوى للشركات", pages[3]!)).toBeGreaterThan(pageRelevance("التسويق بالمحتوى للشركات", pages[0]!));
    expect(pageRelevance("", pages[0]!)).toBe(0);
  });

  it("offers matching pages plus priority services, and no unrelated non-priority page", () => {
    const urls = rankPageCandidates("التسويق بالمحتوى للشركات وتحسين محركات البحث", pages).map((page) => page.url);
    expect(urls.slice(0, 2).sort()).toEqual(["https://s.com/blog/content", "https://s.com/seo"]); // the two real matches come first
    expect(urls).toContain("https://s.com/logo"); // priority extra
    expect(urls).not.toContain("https://s.com/news");
  });

  it("respects the limits", () => {
    expect(rankPageCandidates("خدمة تحسين", pages, { limit: 1, priorityLimit: 0 })).toHaveLength(1);
  });
});

describe("repeated links", () => {
  const kinds = new Map([
    [normalizeLinkKey("https://s.com/a"), "SERVICE" as const],
    [normalizeLinkKey("https://s.com/b"), "SERVICE" as const],
    [normalizeLinkKey("https://s.com/c"), "SERVICE" as const],
    [normalizeLinkKey("https://s.com/post"), "ARTICLE" as const]
  ]);

  it("keeps every link once and at most two services", () => {
    const html = '<p><a href="https://s.com/a">أ</a> <a href="https://s.com/a/">أ مرة أخرى</a> <a href="https://s.com/b">ب</a> <a href="https://s.com/c">ج</a> <a href="https://s.com/post">م</a> <a href="https://x.com">خارجي</a></p>';
    const out = limitRepeatedLinks(html, kinds);
    expect(out).toContain('href="https://s.com/a"');
    expect(out).toContain('href="https://s.com/b"');
    expect(out).not.toContain('href="https://s.com/c"');
    expect(out).toContain("أ مرة أخرى");
    expect(out).not.toContain('href="https://s.com/a/"');
    expect(out).toContain('href="https://s.com/post"');
    expect(out).toContain('href="https://x.com"');
  });
});
