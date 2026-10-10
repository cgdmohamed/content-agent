import { sanitizeArticleHtml } from "./html-sanitizer.js";
import { asStringArray, extractJson } from "./json.js";

export interface TranslationSource {
  title: string;
  metaDescription: string;
  contentHtml: string;
  targetKeyword: string;
  category: string;
  tags: string[];
  imageAlt: string;
}

export interface TranslationPromptInput extends TranslationSource {
  sourceLanguage: string;
  targetLanguage: string;
  siteName: string;
  market: string;
}

export interface TranslatedArticle extends TranslationSource {}

export function buildTranslationPrompt(input: TranslationPromptInput): string {
  return [
    `ترجم المقال التالي من ${input.sourceLanguage} إلى ${input.targetLanguage} ترجمة تحريرية طبيعية كأنه كُتب أصلًا بهذه اللغة، لموقع "${input.siteName}" وسوق ${input.market}.`,
    "قواعد صارمة:",
    "- أبقِ بنية HTML كما هي تمامًا (الوسوم، الترتيب، الجداول، القوائم، الروابط) وترجم النص فقط.",
    "- لا تترجم قيم href أو src ولا تغيّر أي رابط، ولا تضف روابط جديدة ولا تحذف روابط.",
    "- أبقِ أسماء العلامات التجارية والأرقام والرموز كما هي، وطبّق عرف الأرقام والعملة المعتاد في اللغة الهدف.",
    "- لا تُضف معلومات جديدة ولا تحذف فقرات أو أقسامًا؛ الطول يكون قريبًا من الأصل.",
    `- targetKeyword: أفضل مكافئ للكلمة المستهدفة يبحث به متحدثو ${input.targetLanguage} فعلًا (قصير وطبيعي)، واستخدمه حرفيًا في العنوان والوصف وأول فقرة وH2 وALT.`,
    "- العنوان لا يتجاوز 60 حرفًا والوصف لا يتجاوز 160 حرفًا.",
    "المقال الأصلي (JSON):",
    JSON.stringify({
      title: input.title,
      metaDescription: input.metaDescription,
      targetKeyword: input.targetKeyword,
      category: input.category,
      tags: input.tags,
      imageAlt: input.imageAlt,
      contentHtml: input.contentHtml
    }),
    'أعد JSON فقط بنفس المفاتيح: {"title":"...","metaDescription":"...","targetKeyword":"...","category":"...","tags":["..."],"imageAlt":"...","contentHtml":"..."}'
  ].join("\n");
}

/** A translation shorter than this share of the source is almost certainly cut off by the model's output limit. */
export const minTranslationLengthRatio = 0.4;

export function parseTranslation(text: string, source: Pick<TranslationSource, "contentHtml">): TranslatedArticle {
  const parsed = extractJson(text) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("رد الترجمة ليس JSON object صالحًا.");
  const title = String(parsed.title ?? "").trim();
  const metaDescription = String(parsed.metaDescription ?? parsed.meta_description ?? "").trim();
  const contentHtml = sanitizeArticleHtml(String(parsed.contentHtml ?? parsed.content_html ?? "").trim());
  if (!title || !metaDescription || !contentHtml) throw new Error("رد الترجمة ناقص: العنوان أو الوصف أو المحتوى غير موجود.");
  if (contentHtml.length < source.contentHtml.length * minTranslationLengthRatio) {
    throw new Error("الترجمة أقصر بكثير من الأصل (غالبًا انقطع رد المزود). أعد المحاولة أو اختر موديلًا أكبر لعملية الترجمة.");
  }
  return {
    title,
    metaDescription,
    contentHtml,
    targetKeyword: String(parsed.targetKeyword ?? parsed.target_keyword ?? "").trim(),
    category: String(parsed.category ?? "").trim(),
    tags: asStringArray(parsed.tags ?? parsed.suggestedTags),
    imageAlt: String(parsed.imageAlt ?? parsed.image_alt ?? "").trim()
  };
}

/** Hrefs of anchors in an HTML string; used to verify a translation kept every link of the source. */
export function linkHrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]!);
}

export function missingLinks(sourceHtml: string, translatedHtml: string): string[] {
  const kept = new Set(linkHrefs(translatedHtml));
  return [...new Set(linkHrefs(sourceHtml))].filter((href) => !kept.has(href));
}
