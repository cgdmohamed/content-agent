export type ScoreCheckStatus = "pass" | "warning" | "fail";

export interface ScoreCheck {
  name: string;
  status: ScoreCheckStatus;
  points: number;
  message: string;
}

export interface ScoreInput {
  html: string;
  title: string;
  metaDescription?: string | null;
  targetKeyword?: string | null;
  imageAlt?: string | null;
  siteUrl?: string | null;
  editorialBrief?: string | null;
}

export interface ScoreResult {
  score: number;
  checks: ScoreCheck[];
}

function plainTextFromHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function countMatches(pattern: RegExp, value: string): number {
  return value.match(pattern)?.length ?? 0;
}

function countInternalLinks(html: string, siteUrl?: string | null): number {
  if (!siteUrl) return 0;
  const host = safeHost(siteUrl);
  if (!host) return 0;
  const matches = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)];
  return matches.filter((match) => safeHost(match[1] ?? "") === host).length;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function check(status: ScoreCheckStatus, name: string, points: number, message: string): ScoreCheck {
  return { status, name, points, message };
}

export function scoreContent(input: ScoreInput): ScoreResult {
  const text = plainTextFromHtml(input.html);
  const wordCount = countMatches(/[\p{Script=Arabic}a-zA-Z0-9]+/gu, text);
  const h2Count = countMatches(/<h2[\s>]/gi, input.html);
  const paragraphCount = countMatches(/<p[\s>]/gi, input.html);
  const internalLinks = countInternalLinks(input.html, input.siteUrl);
  const metaLength = input.metaDescription?.trim().length ?? 0;
  const titleLength = input.title.trim().length;
  const targetKeyword = input.targetKeyword?.trim();
  const keywordUses = targetKeyword ? countMatches(new RegExp(targetKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), text) : 0;
  const keywordDensity = wordCount > 0 ? keywordUses / wordCount : 0;

  const checks: ScoreCheck[] = [];
  checks.push(
    titleLength >= 25 && titleLength <= 90
      ? check("pass", "Title quality", 10, "Title length is suitable")
      : check("warning", "Title quality", 0, "Title should be concise but descriptive")
  );
  checks.push(
    metaLength >= 90 && metaLength <= 170
      ? check("pass", "Meta description", 10, "Meta description is within the recommended range")
      : check("warning", "Meta description", 0, "Meta description should be around 90-170 characters")
  );
  checks.push(
    wordCount >= 800
      ? check("pass", "Article depth", 15, `${wordCount} words found`)
      : wordCount >= 500
        ? check("warning", "Article depth", 9, `${wordCount} words found`)
        : check("fail", "Article depth", 0, "Article is too short for a serious SEO page")
  );
  checks.push(
    internalLinks >= 2
      ? check("pass", "Internal links", 20, `${internalLinks} internal links found`)
      : internalLinks === 1
        ? check("warning", "Internal links", 10, "Only one internal link found")
        : check("fail", "Internal links", 0, "No internal links found")
  );
  checks.push(
    h2Count >= 3 && paragraphCount >= 6
      ? check("pass", "Structure", 15, "Headings and paragraphs are easy to scan")
      : check("warning", "Structure", 0, "Add clearer headings and shorter paragraphs")
  );
  checks.push(
    /اسئلة|أسئلة|FAQ|faq|سؤال|س وج/i.test(text)
      ? check("pass", "FAQ coverage", 8, "FAQ-style content is present")
      : check("warning", "FAQ coverage", 0, "No FAQ section detected")
  );
  checks.push(
    input.editorialBrief?.trim()
      ? check("pass", "Editorial brief", 12, "Article is connected to a saved brief")
      : check("warning", "Editorial brief", 0, "No editorial brief is attached")
  );
  checks.push(
    input.imageAlt?.trim()
      ? check("pass", "Image ALT", 5, "Featured image ALT text is ready")
      : check("warning", "Image ALT", 0, "Image ALT text is missing")
  );
  checks.push(
    !targetKeyword
      ? check("warning", "Keyword usage", 0, "No focus keyword selected")
      : keywordDensity > 0.06
        ? check("fail", "Keyword usage", -10, "Possible keyword stuffing detected")
        : keywordUses > 0
          ? check("pass", "Keyword usage", 5, "Focus keyword appears naturally")
          : check("warning", "Keyword usage", 0, "Focus keyword was not found in the article")
  );

  const genericPhrasePenalty = /في عالمنا اليوم|في هذا المقال سوف|يعد .* من أهم|لا شك أن/i.test(text)
    ? check("fail", "Generic phrases", -10, "Generic AI-style phrasing detected")
    : check("pass", "Generic phrases", 5, "No obvious generic opening phrases detected");
  checks.push(genericPhrasePenalty);

  const score = Math.max(0, Math.min(100, checks.reduce((total, item) => total + item.points, 0)));
  return { score, checks };
}
