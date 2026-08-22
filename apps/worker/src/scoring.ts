export interface ScoreResult {
  score: number;
  checks: string[];
}

export function scoreArticle(input: { html: string; title: string; metaDescription?: string; targetKeyword?: string; imageAlt?: string; siteUrl?: string }): ScoreResult {
  const text = input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = text.match(/[\p{Script=Arabic}a-zA-Z0-9]+/gu)?.length ?? 0;
  const h2Count = input.html.match(/<h2[\s>]/gi)?.length ?? 0;
  const paragraphCount = input.html.match(/<p[\s>]/gi)?.length ?? 0;
  const metaLength = input.metaDescription?.trim().length ?? 0;
  const internalLinks = countInternalLinks(input.html, input.siteUrl);
  const checks: string[] = [];
  let score = 0;

  if (input.title.trim().length >= 25) {
    score += 10;
    checks.push("العنوان مناسب");
  } else checks.push("العنوان يحتاج تحسين");

  if (metaLength >= 90 && metaLength <= 170) {
    score += 10;
    checks.push("الوصف التعريفي مناسب");
  } else checks.push("الوصف التعريفي يحتاج ضبط");

  if (wordCount >= 1200) {
    score += 20;
    checks.push("المقال عميق كفاية");
  } else if (wordCount >= 800) {
    score += 12;
    checks.push("طول المقال مقبول لكنه يحتاج توسعة");
  } else checks.push("المقال قصير");

  if (h2Count >= 3 && paragraphCount >= 6) {
    score += 20;
    checks.push("البنية واضحة");
  } else checks.push("البنية تحتاج عناوين وفقرات أكثر");

  if (internalLinks >= 2) {
    score += 15;
    checks.push("يوجد روابط داخلية كافية");
  } else if (internalLinks === 1) {
    score += 7;
    checks.push("يوجد رابط داخلي واحد");
  } else checks.push("لا توجد روابط داخلية");

  if (/اسئلة|أسئلة|FAQ|faq|سؤال/i.test(text)) {
    score += 10;
    checks.push("يوجد قسم أسئلة");
  } else checks.push("لا يوجد قسم أسئلة AEO");

  if (/خلاصة|ملخص|الإجابة المختصرة|باختصار|نقاط رئيسية/i.test(text)) {
    score += 5;
    checks.push("يوجد ملخص مناسب للـ GEO");
  } else checks.push("لا يوجد ملخص GEO واضح");

  if (/تواصل|احجز|ابدأ|اطلب|استشر|راسل|الخطوة التالية|اتصل/i.test(text)) {
    score += 5;
    checks.push("يوجد CTA واضح");
  } else {
    score -= 10;
    checks.push("لا يوجد CTA واضح");
  }

  if (input.imageAlt?.trim()) {
    score += 5;
    checks.push("النص البديل للصورة جاهز");
  }

  if (input.targetKeyword && text.includes(input.targetKeyword)) {
    score += 10;
    checks.push("الكلمة المستهدفة موجودة");
  }

  if (/في عالمنا اليوم|في هذا المقال سوف|لا شك أن|الاسم|البريد الإلكتروني|رقم الهاتف|املأ النموذج|أرسل الطلب/i.test(text)) {
    score -= 10;
    checks.push("توجد عبارات عامة أو نصوص نموذج تحتاج تحرير");
  }

  return { score: Math.max(0, Math.min(100, score)), checks };
}

function countInternalLinks(html: string, siteUrl?: string): number {
  if (!siteUrl) return 0;
  const host = safeHost(siteUrl);
  if (!host) return 0;
  return [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)].filter((match) => safeHost(match[1] ?? "") === host).length;
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}
