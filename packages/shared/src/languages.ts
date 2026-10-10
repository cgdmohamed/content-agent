// Site languages (Polylang) and translation helpers. Browser-safe: used by the API, the worker and the web app.

export interface SiteLanguage {
  /** Polylang language slug, e.g. "ar", "en", "pt-br". */
  code: string;
  name: string;
  locale?: string;
  isRtl: boolean;
  isDefault: boolean;
}

const codePattern = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i;

export function isLanguageCode(value: unknown): value is string {
  return typeof value === "string" && codePattern.test(value.trim());
}

/** Accepts what the database or the WordPress bridge returned and keeps only well-formed, unique languages. */
export function normalizeSiteLanguages(value: unknown): SiteLanguage[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const languages: SiteLanguage[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const code = String(row.code ?? row.slug ?? "").trim().toLowerCase();
    if (!isLanguageCode(code) || seen.has(code)) continue;
    seen.add(code);
    languages.push({
      code,
      name: String(row.name ?? code).trim() || code,
      locale: typeof row.locale === "string" && row.locale.trim() ? row.locale.trim() : undefined,
      isRtl: Boolean(row.isRtl ?? row.is_rtl),
      isDefault: Boolean(row.isDefault ?? row.is_default)
    });
  }
  return languages;
}

/** The language an article is written in: its own, else the site's configured language. */
export function sourceLanguageCode(itemLanguage: string | null | undefined, siteLanguage: string | null | undefined): string {
  return (itemLanguage?.trim() || siteLanguage?.trim() || "ar").toLowerCase();
}

/**
 * Polylang slugs and the site's `language` field are both free text ("ar", "ar-SA", "en_US"). Match on the code
 * itself first, then on its primary subtag, so a site set to "ar-SA" still finds the Polylang language "ar".
 */
export function findSiteLanguage(languages: SiteLanguage[], code: string | null | undefined): SiteLanguage | null {
  const wanted = code?.trim().toLowerCase().replace("_", "-");
  if (!wanted) return null;
  const exact = languages.find((language) => language.code.toLowerCase() === wanted);
  if (exact) return exact;
  const primary = wanted.split("-")[0]!;
  return languages.find((language) => language.code.toLowerCase().split("-")[0] === primary) ?? null;
}

/** Keeps requested translation targets that the site really has, drops the source language and duplicates. */
export function sanitizeTargetLanguages(value: unknown, available: SiteLanguage[], sourceCode: string | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const source = findSiteLanguage(available, sourceCode)?.code;
  const targets: string[] = [];
  for (const raw of value) {
    const language = findSiteLanguage(available, typeof raw === "string" ? raw : null);
    if (!language || language.code === source || targets.includes(language.code)) continue;
    targets.push(language.code);
  }
  return targets;
}

export interface TranslationLinkRow {
  language: string | null;
  wordpressPostId: string | null;
}

/** `{ ar: "12", en: "34" }` for Polylang's `translations` field; only articles already created in WordPress can be linked. */
export function buildTranslationMap(rows: TranslationLinkRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    const code = row.language?.trim().toLowerCase();
    const id = Number(row.wordpressPostId);
    if (!code || !Number.isInteger(id) || id <= 0) continue;
    map[code] = id;
  }
  return map;
}
