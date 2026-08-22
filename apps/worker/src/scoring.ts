export interface ScoreResult {
  score: number;
  checks: string[];
}

export function scoreArticle(input: { html: string; title: string; metaDescription?: string; targetKeyword?: string; imageAlt?: string }): ScoreResult {
  const text = input.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = text.match(/[\p{Script=Arabic}a-zA-Z0-9]+/gu)?.length ?? 0;
  const h2Count = input.html.match(/<h2[\s>]/gi)?.length ?? 0;
  const paragraphCount = input.html.match(/<p[\s>]/gi)?.length ?? 0;
  const metaLength = input.metaDescription?.trim().length ?? 0;
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

  if (wordCount >= 800) {
    score += 20;
    checks.push("المقال عميق كفاية");
  } else if (wordCount >= 500) {
    score += 12;
    checks.push("طول المقال متوسط");
  } else checks.push("المقال قصير");

  if (h2Count >= 3 && paragraphCount >= 6) {
    score += 20;
    checks.push("البنية واضحة");
  } else checks.push("البنية تحتاج عناوين وفقرات أكثر");

  if (/<a\s+/i.test(input.html)) {
    score += 15;
    checks.push("يوجد روابط داخلية أو مرجعية");
  } else checks.push("لا توجد روابط");

  if (/اسئلة|أسئلة|FAQ|faq|سؤال/i.test(text)) {
    score += 10;
    checks.push("يوجد قسم أسئلة");
  }

  if (input.imageAlt?.trim()) {
    score += 5;
    checks.push("النص البديل للصورة جاهز");
  }

  if (input.targetKeyword && text.includes(input.targetKeyword)) {
    score += 10;
    checks.push("الكلمة المستهدفة موجودة");
  }

  if (/في عالمنا اليوم|في هذا المقال سوف|لا شك أن/i.test(text)) {
    score -= 10;
    checks.push("توجد عبارات عامة تحتاج تحرير");
  }

  return { score: Math.max(0, Math.min(100, score)), checks };
}
