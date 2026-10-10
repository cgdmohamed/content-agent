export { classifyPage, limitRepeatedLinks, normalizeLinkKey, rankPageCandidates, type PageKind, type RankablePage } from "@content-agent/shared";

/** A page belongs to the site when it is served from the site's own host (www. ignored). */
export function isInternalPageUrl(url: string, siteUrl: string): boolean {
  try {
    const host = (value: string): string => new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return host(url) === host(siteUrl);
  } catch {
    return false;
  }
}
