import { describe, expect, it } from "vitest";
import { buildTranslationMap, findSiteLanguage, normalizeSiteLanguages, sanitizeTargetLanguages, sourceLanguageCode } from "../languages.js";

const languages = normalizeSiteLanguages([
  { code: "ar", name: "العربية", locale: "ar", isRtl: true, isDefault: true },
  { code: "en", name: "English", isRtl: false },
  { slug: "pt-br", name: "Português", is_rtl: false },
  { code: "ar", name: "duplicate" },
  { code: "not a code" },
  null
]);

describe("site languages", () => {
  it("keeps well-formed unique languages and accepts Polylang's field names", () => {
    expect(languages.map((language) => language.code)).toEqual(["ar", "en", "pt-br"]);
    expect(languages[0]).toMatchObject({ isRtl: true, isDefault: true });
    expect(normalizeSiteLanguages("nope")).toEqual([]);
  });

  it("matches a site language such as ar-SA to the Polylang language ar", () => {
    expect(findSiteLanguage(languages, "ar-SA")?.code).toBe("ar");
    expect(findSiteLanguage(languages, "EN")?.code).toBe("en");
    expect(findSiteLanguage(languages, "pt_BR")?.code).toBe("pt-br");
    expect(findSiteLanguage(languages, "fr")).toBeNull();
    expect(findSiteLanguage(languages, null)).toBeNull();
  });

  it("picks the article language, then the site language", () => {
    expect(sourceLanguageCode("EN", "ar")).toBe("en");
    expect(sourceLanguageCode(null, "ar")).toBe("ar");
    expect(sourceLanguageCode("", undefined)).toBe("ar");
  });

  it("limits translation targets to the site's languages, without the source and duplicates", () => {
    expect(sanitizeTargetLanguages(["en", "ar", "en", "fr", "pt_BR", 5], languages, "ar")).toEqual(["en", "pt-br"]);
    expect(sanitizeTargetLanguages("en", languages, "ar")).toEqual([]);
    expect(sanitizeTargetLanguages(["ar"], languages, "ar-SA")).toEqual([]);
  });

  it("builds the Polylang translations map from published articles only", () => {
    expect(
      buildTranslationMap([
        { language: "AR", wordpressPostId: "12" },
        { language: "en", wordpressPostId: "34" },
        { language: "fr", wordpressPostId: null },
        { language: null, wordpressPostId: "99" },
        { language: "de", wordpressPostId: "abc" }
      ])
    ).toEqual({ ar: 12, en: 34 });
  });
});
