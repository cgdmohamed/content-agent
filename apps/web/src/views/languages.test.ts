import { describe, expect, it } from "vitest";
import { missingLanguages } from "./ArticleLanguages";

const site = {
  language: "ar",
  languages: [
    { code: "ar", name: "العربية", isRtl: true, isDefault: true },
    { code: "en", name: "English", isRtl: false, isDefault: false },
    { code: "fr", name: "Français", isRtl: false, isDefault: false }
  ]
};

describe("languages still missing for an article", () => {
  it("offers every site language except the article's own", () => {
    expect(missingLanguages(site, { language: null, translations: [] })).toEqual(["en", "fr"]);
  });

  it("skips languages that already have a translation", () => {
    const translations = [
      { id: "1", language: null, state: "PUBLISHED" as const, title: "a", wordpressPostUrl: null, isSource: true },
      { id: "2", language: "en", state: "QUEUED" as const, title: "b", wordpressPostUrl: null, isSource: false }
    ];
    expect(missingLanguages(site, { language: null, translations })).toEqual(["fr"]);
  });

  it("works from a translation's own language too", () => {
    expect(missingLanguages(site, { language: "en", translations: [] })).toEqual(["ar", "fr"]);
  });
});
