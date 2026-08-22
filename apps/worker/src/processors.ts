import { appendAudit, query } from "./db.js";
import { generateText } from "./ai.js";
import { sanitizeArticleHtml } from "./html-sanitizer.js";
import { asStringArray, extractJson } from "./json.js";
import { scoreArticle } from "./scoring.js";
import { generateGeminiImage } from "./gemini-image.js";
import { fetchGscQueries, type GscSite } from "./google-search-console.js";
import { publishPost, uploadMedia } from "./wordpress.js";

interface ContentRecord {
  id: string;
  site_id: string;
  topic: string;
  title: string | null;
  target_keyword: string | null;
  status: string;
  mode: string;
  search_intent: string | null;
  editorial_brief: Record<string, unknown>;
  ideas: unknown[];
  selected_idea: Record<string, unknown> | null;
  competitor_gaps: string | null;
  sources: unknown[];
  draft_html: string | null;
  meta_description: string | null;
  category: string | null;
  tags: unknown[];
  image_prompt: string | null;
  image_alt: string | null;
  image_url: string | null;
  wordpress_media_id: string | null;
  site_name: string;
  site_status: string;
  market: string;
  language: string;
  writing_standard: string | null;
  wordpress_url: string;
  wordpress_username: string;
  wordpress_application_password_encrypted: string;
  wordpress_post_id: string | null;
  scheduled_publish_at: Date | null;
  auto_publish: boolean;
  approved_at: Date | null;
}

interface InternalLinkCandidate {
  title: string;
  url: string;
  keyword: string | null;
}

export interface OperationResult {
  provider?: string;
}

export function providerForOperationResult(result: OperationResult): string | null {
  return result.provider?.trim() || null;
}

export async function processContentOperation(contentItemId: string, operation: string): Promise<OperationResult> {
  await assertContentSiteActive(contentItemId);
  switch (operation) {
    case "GENERATE_IDEAS":
      return generateIdeas(contentItemId);
    case "RESEARCH_GAPS":
      return researchGaps(contentItemId);
    case "WRITE_DRAFT":
      return writeDraft(contentItemId);
    case "REVIEW_DRAFT":
      return reviewDraft(contentItemId);
    case "OPTIMIZE_LINKS":
      return optimizeLinksAndCta(contentItemId);
    case "GENERATE_IMAGE":
      return generateFeaturedImage(contentItemId);
    case "PUBLISH":
      return publishToWordPress(contentItemId);
    default:
      throw new Error(`عملية غير مدعومة: ${operation}`);
  }
}

export async function syncGscForSite(siteId: string): Promise<void> {
  const result = await query<GscSite>(
    "SELECT id, gsc_property, gsc_service_account_encrypted FROM sites WHERE id = $1 AND status = 'ACTIVE'",
    [siteId]
  );
  if (!result.rowCount) throw new Error("الموقع غير موجود أو غير نشط لمزامنة GSC.");
  const endDate = daysAgoIso(1);
  const startDate = daysAgoIso(28);
  const rows = await fetchGscQueries(result.rows[0]!, startDate, endDate, 250);
  for (const row of rows) {
    await query(
      `INSERT INTO gsc_query_snapshots (site_id, query, clicks, impressions, ctr, position, start_date, end_date, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, now())
       ON CONFLICT (site_id, query, start_date, end_date)
       DO UPDATE SET clicks = EXCLUDED.clicks,
                     impressions = EXCLUDED.impressions,
                     ctr = EXCLUDED.ctr,
                     position = EXCLUDED.position,
                     synced_at = now()`,
      [siteId, row.query, row.clicks, row.impressions, row.ctr, row.position, startDate, endDate]
    );
  }
  await query("UPDATE sites SET gsc_status = 'CONNECTED', updated_at = now() WHERE id = $1", [siteId]);
}

async function fetchContent(id: string): Promise<ContentRecord> {
  const result = await query<ContentRecord>(
    `SELECT c.*, s.name AS site_name, s.market, s.language, s.writing_standard, s.wordpress_url
            , s.wordpress_username, s.wordpress_application_password_encrypted, s.status AS site_status
     FROM content_items c
     JOIN sites s ON s.id = c.site_id
     WHERE c.id = $1`,
    [id]
  );
  if (!result.rowCount) throw new Error("عنصر المحتوى غير موجود");
  return result.rows[0]!;
}

async function assertContentSiteActive(contentItemId: string): Promise<void> {
  const result = await query<{ site_status: string }>(
    `SELECT s.status AS site_status
     FROM content_items c
     JOIN sites s ON s.id = c.site_id
     WHERE c.id = $1`,
    [contentItemId]
  );
  if (!result.rowCount) throw new Error("عنصر المحتوى غير موجود");
  if (!isActiveSiteStatus(result.rows[0]!.site_status)) throw new Error("لا يمكن تشغيل مهمة على موقع معطل.");
}

export function isActiveSiteStatus(status: string): boolean {
  return status === "ACTIVE";
}

async function publishToWordPress(contentItemId: string): Promise<OperationResult> {
  const item = await fetchContent(contentItemId);
  if (!item.approved_at) throw new Error("المقال يحتاج اعتماد المدير قبل النشر.");
  if (!item.title || !item.draft_html) throw new Error("لا يمكن النشر بدون عنوان ومحتوى.");
  const selected = item.selected_idea ?? {};
  const tags = asStringArray(item.tags);
  const result = await publishPost(
    {
      wordpress_url: item.wordpress_url,
      wordpress_username: item.wordpress_username,
      wordpress_application_password_encrypted: item.wordpress_application_password_encrypted
    },
    {
      wordpressPostId: item.wordpress_post_id,
      title: item.title,
      contentHtml: item.draft_html,
      metaDescription: item.meta_description,
      focusKeyword: String(selected.targetKeyword ?? selected.target_keyword ?? item.target_keyword ?? ""),
      category: item.category,
      tags,
      featuredMediaId: item.wordpress_media_id,
      scheduledPublishAt: item.scheduled_publish_at,
      publishNow: item.auto_publish || !item.scheduled_publish_at
    }
  );
  const finalStatus = result.status === "future" ? "SCHEDULED" : "PUBLISHED";
  await query(
    `UPDATE content_items
     SET wordpress_post_id = $2,
         wordpress_post_url = $3,
         wordpress_post_status = $4,
         status = $5,
         published_at = CASE WHEN $5 = 'PUBLISHED' THEN now() ELSE published_at END,
         last_successful_state = $5,
         failed_action = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`,
    [contentItemId, result.id, result.link, result.status, finalStatus]
  );
  await appendAudit(contentItemId, "WORDPRESS_PUBLISH_SUCCEEDED", `تم إرسال المقال إلى ووردبريس بحالة ${result.status}`, {
    wordpressPostId: result.id,
    wordpressPostUrl: result.link,
    wordpressStatus: result.status
  });
  return { provider: "wordpress" };
}

async function generateFeaturedImage(contentItemId: string): Promise<OperationResult> {
  const item = await fetchContent(contentItemId);
  if (!item.title) throw new Error("لا يمكن توليد صورة بدون عنوان المقال.");
  const prompt = item.image_prompt?.trim() || `Editorial blog feature image for: ${item.title}`;
  const generated = await generateGeminiImage(prompt);
  const extension = generated.mimeType.includes("jpeg") || generated.mimeType.includes("jpg") ? "jpg" : "png";
  const media = await uploadMedia(
    {
      wordpress_url: item.wordpress_url,
      wordpress_username: item.wordpress_username,
      wordpress_application_password_encrypted: item.wordpress_application_password_encrypted
    },
    {
      bytes: generated.bytes,
      mimeType: generated.mimeType,
      filename: `content-agent-${contentItemId}.${extension}`,
      altText: item.image_alt ?? item.title
    }
  );
  await query(
    `UPDATE content_items
     SET wordpress_media_id = $2,
         image_url = $3,
         status = 'IMAGE_READY',
         last_successful_state = 'IMAGE_READY',
         failed_action = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`,
    [contentItemId, media.id, media.sourceUrl]
  );
  await appendAudit(contentItemId, "FEATURED_IMAGE_READY", "تم توليد الصورة ورفعها إلى ووردبريس", {
    wordpressMediaId: media.id,
    imageUrl: media.sourceUrl,
    mimeType: generated.mimeType
  });
  return { provider: "gemini-image" };
}

async function generateIdeas(contentItemId: string): Promise<OperationResult> {
  const item = await fetchContent(contentItemId);
  const ideasCount = clampNumber(Number(item.editorial_brief?.ideasCount ?? 5), 1, 20);
  const prompt = [
    `اقترح ${ideasCount} أفكار مقالات مختلفة عن الموضوع: ${item.topic}`,
    `السوق: ${item.market}`,
    `اللغة: ${item.language}`,
    `نية البحث: ${item.search_intent ?? "تلقائية"}`,
    `الموجز التحريري: ${JSON.stringify(item.editorial_brief)}`,
    'أعد JSON فقط بالشكل: [{"title":"...","targetKeyword":"...","angle":"..."}]'
  ].join("\n");
  const result = await generateText({ contentItemId, operation: "GENERATE_IDEAS", prompt, preferred: ["perplexity", "openai", "anthropic"] });
  const parsed = extractJson(result.text);
  if (!Array.isArray(parsed)) throw new Error("رد توليد الأفكار ليس JSON array صالحًا.");
  const ideas = parsed.map(normalizeIdea).filter(Boolean);
  if (ideas.length === 0) throw new Error("لم يرجع المزود أفكارًا صالحة.");
  await query(
    `UPDATE content_items
     SET ideas = $2::jsonb,
         status = 'IDEAS_READY',
         last_successful_state = 'IDEAS_READY',
         failed_action = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`,
    [contentItemId, JSON.stringify(ideas)]
  );
  await appendAudit(contentItemId, "AI_IDEAS_GENERATED", `تم توليد الأفكار بواسطة ${result.provider}`, { provider: result.provider, model: result.model });
  if (shouldAutoSelectFirstIdea(item.mode, item.auto_publish)) {
    const selected = ideas[0]!;
    await query(
      `UPDATE content_items
       SET selected_idea = $2::jsonb,
           title = COALESCE(($2::jsonb ->> 'title'), title),
           target_keyword = COALESCE(($2::jsonb ->> 'targetKeyword'), ($2::jsonb ->> 'target_keyword'), target_keyword),
           status = 'IDEA_SELECTED',
           last_successful_state = 'IDEA_SELECTED',
           updated_at = now()
       WHERE id = $1`,
      [contentItemId, JSON.stringify(selected)]
    );
    await appendAudit(contentItemId, "CONTENT_IDEA_AUTO_SELECTED", "تم اختيار أول فكرة تلقائيًا لاستكمال مسار الدفعة", {
      title: selected.title,
      targetKeyword: selected.targetKeyword
    });
  }
  return { provider: result.provider };
}

async function researchGaps(contentItemId: string): Promise<OperationResult> {
  const item = await fetchContent(contentItemId);
  const idea = item.selected_idea;
  if (!idea) throw new Error("لا توجد فكرة مختارة للبحث.");
  const keyword = String(idea.targetKeyword ?? idea.target_keyword ?? item.target_keyword ?? item.topic);
  const prompt = [
    `ابحث عن فجوات المنافسين للكلمة: ${keyword}`,
    `السوق: ${item.market}`,
    trustedResearchInstruction(item.wordpress_url),
    "لخص أعلى الفجوات العملية بدون نسخ المنافسين أو الاعتماد على صفحات ضعيفة فقط لأنها متصدرة.",
    'أعد JSON فقط بالشكل: {"summary":"...","gaps":["..."],"sources":["https://..."]}'
  ].join("\n");
  const result = await generateText({ contentItemId, operation: "RESEARCH_GAPS", prompt, preferred: ["perplexity", "anthropic", "openai"], maxTokens: 3000 });
  const parsed = extractJson(result.text) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object") throw new Error("رد البحث ليس JSON object صالحًا.");
  const gaps = [parsed.summary, ...(Array.isArray(parsed.gaps) ? parsed.gaps : [])].filter(Boolean).join("\n");
  const sources = trustedSources(asStringArray(parsed.sources), item.wordpress_url);
  await query(
    `UPDATE content_items
     SET competitor_gaps = $2,
         sources = $3::jsonb,
         status = 'GAPS_READY',
         last_successful_state = 'GAPS_READY',
         failed_action = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`,
    [contentItemId, gaps, JSON.stringify(sources)]
  );
  await appendAudit(contentItemId, "AI_RESEARCH_COMPLETED", `تم بحث المنافسين بواسطة ${result.provider}`, { provider: result.provider, model: result.model, sources });
  return { provider: result.provider };
}

async function writeDraft(contentItemId: string): Promise<OperationResult> {
  const item = await fetchContent(contentItemId);
  const idea = item.selected_idea;
  if (!idea) throw new Error("لا توجد فكرة مختارة للكتابة.");
  const standard = item.writing_standard?.trim() || defaultWritingStandard();
  const internalLinks = await fetchInternalLinkCandidates(item);
  const prompt = [
    standard,
    languageInstruction(item.language),
    `اكتب مقالًا كاملًا للموقع: ${item.site_name}`,
    `رابط الموقع الأساسي للروابط الداخلية: ${item.wordpress_url}`,
    `العنوان/الفكرة: ${String(idea.title ?? item.topic)}`,
    `الكلمة المستهدفة: ${String(idea.targetKeyword ?? idea.target_keyword ?? item.target_keyword ?? "")}`,
    `الزاوية: ${String(idea.angle ?? "")}`,
    `فجوات المنافسين: ${item.competitor_gaps ?? ""}`,
    `الموجز التحريري: ${JSON.stringify(item.editorial_brief)}`,
    `المصادر: ${JSON.stringify(item.sources)}`,
    `روابط داخلية مرشحة من نفس الموقع: ${JSON.stringify(internalLinks)}`,
    "متطلبات صارمة:",
    `- التزم بلغة الموقع فقط: ${languageName(item.language)}. لا تكتب بالعربية إذا كانت اللغة English.`,
    "- لا يقل المقال عن 1200 كلمة عربية مفيدة، وإن كان الموضوع تنافسيًا اجعله أقرب إلى 1600 كلمة.",
    "- لا تكتب أي نصوص نماذج مثل: الاسم، البريد الإلكتروني، رقم الهاتف، املأ النموذج، أرسل الطلب، أو حقول form.",
    "- أضف CTA طبيعي في نهاية المقال بدون نموذج، مثل دعوة للتواصل أو طلب استشارة أو قراءة مقال مرتبط.",
    "- أضف قسم أسئلة شائعة واضح للإجابة على أسئلة المستخدمين AEO.",
    "- أضف فقرة ملخص تنفيذي أو إجابة مباشرة قابلة للظهور في الإجابات التوليدية GEO.",
    "- أضف رابطين داخليين على الأقل من قائمة الروابط الداخلية المرشحة فقط، وبنص anchor طبيعي داخل الفقرات لا في قائمة منفصلة إلا عند الضرورة.",
    "- إذا كانت القائمة لا تحتوي روابط كافية استخدم رابط الصفحة الرئيسية ورابط بحث داخل الموقع كحل أخير فقط.",
    "- استخدم جدول مقارنة HTML عند وجود بدائل أو مقارنة.",
    'أعد JSON فقط بالشكل: {"title":"...","metaDescription":"...","contentHtml":"...","suggestedTags":["..."],"category":"...","imagePrompt":"...","imageAlt":"..."}'
  ].join("\n\n");
  const result = await generateText({ contentItemId, operation: "WRITE_DRAFT", prompt, preferred: ["anthropic", "openai"], maxTokens: 6000 });
  const article = parseArticle(result.text);
  const contentHtml = enforceArticleRequirements(article.contentHtml, item, internalLinks);
  const score = scoreArticle({
    html: contentHtml,
    title: article.title,
    metaDescription: article.metaDescription,
    targetKeyword: String(idea.targetKeyword ?? idea.target_keyword ?? ""),
    imageAlt: article.imageAlt,
    siteUrl: item.wordpress_url
  });
  await query(
    `UPDATE content_items
     SET title = $2,
         meta_description = $3,
         draft_html = $4,
         tags = $5::jsonb,
         category = $6,
         image_prompt = $7,
         image_alt = $8,
         content_score = $9,
         content_score_details = $10::jsonb,
         status = 'DRAFTED',
         last_successful_state = 'DRAFTED',
         failed_action = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`,
    [contentItemId, article.title, article.metaDescription, contentHtml, JSON.stringify(article.suggestedTags), article.category, article.imagePrompt, article.imageAlt, score.score, JSON.stringify(score.checks)]
  );
  await appendAudit(contentItemId, "AI_DRAFT_WRITTEN", `تمت كتابة المسودة بواسطة ${result.provider}`, { provider: result.provider, model: result.model, score: score.score });
  return { provider: result.provider };
}

async function reviewDraft(contentItemId: string): Promise<OperationResult> {
  const item = await fetchContent(contentItemId);
  if (!item.draft_html) throw new Error("لا توجد مسودة لمراجعتها.");
  const internalLinks = await fetchInternalLinkCandidates(item);
  const prompt = [
    defaultWritingStandard(),
    languageInstruction(item.language),
    "راجع المقال التالي وحسنه دون فقدان الروابط أو المعنى.",
    `رابط الموقع الأساسي للروابط الداخلية: ${item.wordpress_url}`,
    `روابط داخلية مرشحة من نفس الموقع: ${JSON.stringify(internalLinks)}`,
    "ركز على نية البحث، الوضوح، إزالة التكرار، تحسين العناوين، الوصف التعريفي، والأسئلة الشائعة.",
    "ارفع جودة المقال إلى معيار SEO/AEO/GEO: إجابة مباشرة، عمق كاف، قسم أسئلة شائعة، CTA طبيعي، وروابط داخلية من قائمة الروابط المرشحة.",
    "احذف أي نصوص تبدو كحقول نموذج أو placeholders مثل الاسم والبريد ورقم الهاتف واملأ النموذج.",
    `لا يقل الناتج النهائي عن 1200 كلمة إذا كان المقال أقصر من ذلك، وبنفس لغة الموقع فقط: ${languageName(item.language)}.`,
    item.draft_html,
    'أعد JSON فقط بالشكل: {"title":"...","metaDescription":"...","contentHtml":"...","suggestedTags":["..."],"category":"...","imagePrompt":"...","imageAlt":"..."}'
  ].join("\n\n");
  const result = await generateText({ contentItemId, operation: "REVIEW_DRAFT", prompt, preferred: ["anthropic", "openai"], maxTokens: 6000 });
  const article = parseArticle(result.text);
  const contentHtml = enforceArticleRequirements(article.contentHtml, item, internalLinks);
  const score = scoreArticle({
    html: contentHtml,
    title: article.title,
    metaDescription: article.metaDescription,
    targetKeyword: item.target_keyword ?? undefined,
    imageAlt: article.imageAlt,
    siteUrl: item.wordpress_url
  });
  await query(
    `UPDATE content_items
     SET title = $2,
         meta_description = $3,
         draft_html = $4,
         tags = $5::jsonb,
         category = $6,
         image_prompt = $7,
         image_alt = $8,
         content_score = $9,
         content_score_details = $10::jsonb,
         status = 'REVIEWED',
         last_successful_state = 'REVIEWED',
         failed_action = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`,
    [contentItemId, article.title, article.metaDescription, contentHtml, JSON.stringify(article.suggestedTags), article.category, article.imagePrompt, article.imageAlt, score.score, JSON.stringify(score.checks)]
  );
  await appendAudit(contentItemId, "AI_DRAFT_REVIEWED", `تمت مراجعة المقال بواسطة ${result.provider}`, { provider: result.provider, model: result.model, score: score.score });
  return { provider: result.provider };
}

async function optimizeLinksAndCta(contentItemId: string): Promise<OperationResult> {
  const item = await fetchContent(contentItemId);
  if (!item.draft_html) throw new Error("لا توجد مسودة لتحسين الروابط.");
  if (!["DRAFTED", "REVIEWED", "IMAGE_READY"].includes(item.status)) {
    throw new Error("يمكن إعادة بناء الروابط الداخلية قبل الاعتماد والجدولة فقط.");
  }
  const internalLinks = await fetchInternalLinkCandidates(item);
  const prompt = [
    languageInstruction(item.language),
    "حسن المقال التالي فقط من ناحية الروابط الداخلية والـ CTA بدون إعادة كتابة شاملة.",
    `اسم الموقع: ${item.site_name}`,
    `رابط الموقع الأساسي: ${item.wordpress_url}`,
    `الكلمة المستهدفة: ${item.target_keyword ?? item.topic}`,
    `روابط داخلية مرشحة من نفس الموقع: ${JSON.stringify(internalLinks)}`,
    "المطلوب:",
    "- أضف رابطين داخليين على الأقل داخل فقرات مناسبة وبـ anchor طبيعي يخدم نية البحث.",
    "- لا تضف روابط خارجية جديدة ولا تستخدم روابط خارج نفس الموقع.",
    "- إذا وجدت CTA ضعيفًا أو غير موجود، أضف فقرة CTA طبيعية في موضع مناسب قرب النهاية بدون نموذج أو حقول.",
    "- حافظ على نفس لغة المقال، ونفس العنوان العام، ونفس البنية قدر الإمكان.",
    "- لا تحذف الأسئلة الشائعة أو الجداول أو الروابط الموجودة إلا لو كانت خاطئة.",
    item.draft_html,
    'أعد JSON فقط بالشكل: {"title":"...","metaDescription":"...","contentHtml":"...","suggestedTags":["..."],"category":"...","imagePrompt":"...","imageAlt":"..."}'
  ].join("\n\n");
  const result = await generateText({ contentItemId, operation: "OPTIMIZE_LINKS", prompt, preferred: ["anthropic", "openai"], maxTokens: 5000 });
  const article = parseArticle(result.text);
  const contentHtml = enforceArticleRequirements(article.contentHtml, item, internalLinks);
  const score = scoreArticle({
    html: contentHtml,
    title: article.title,
    metaDescription: article.metaDescription,
    targetKeyword: item.target_keyword ?? undefined,
    imageAlt: article.imageAlt,
    siteUrl: item.wordpress_url
  });
  await query(
    `UPDATE content_items
     SET title = COALESCE($2, title),
         meta_description = COALESCE($3, meta_description),
         draft_html = $4,
         tags = CASE WHEN jsonb_array_length($5::jsonb) > 0 THEN $5::jsonb ELSE tags END,
         category = COALESCE(NULLIF($6, ''), category),
         image_prompt = COALESCE(NULLIF($7, ''), image_prompt),
         image_alt = COALESCE(NULLIF($8, ''), image_alt),
         content_score = $9,
         content_score_details = $10::jsonb,
         failed_action = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`,
    [contentItemId, article.title, article.metaDescription, contentHtml, JSON.stringify(article.suggestedTags), article.category, article.imagePrompt, article.imageAlt, score.score, JSON.stringify(score.checks)]
  );
  await appendAudit(contentItemId, "AI_INTERNAL_LINKS_OPTIMIZED", `تم تحسين الروابط الداخلية والـ CTA بواسطة ${result.provider}`, {
    provider: result.provider,
    model: result.model,
    internalLinks: internalLinks.slice(0, 5).map((link) => link.url),
    score: score.score
  });
  return { provider: result.provider };
}

function normalizeIdea(value: unknown): { title: string; targetKeyword: string; angle: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const title = String(record.title ?? "").trim();
  const targetKeyword = String(record.targetKeyword ?? record.target_keyword ?? "").trim();
  const angle = String(record.angle ?? "").trim();
  if (!title || !targetKeyword || !angle) return null;
  return { title, targetKeyword, angle };
}

function parseArticle(value: string): {
  title: string;
  metaDescription: string;
  contentHtml: string;
  suggestedTags: string[];
  category: string;
  imagePrompt: string;
  imageAlt: string;
} {
  const parsed = extractJson(value) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object") throw new Error("رد المقال ليس JSON object صالحًا.");
  const title = String(parsed.title ?? "").trim();
  const metaDescription = String(parsed.metaDescription ?? parsed.meta_description ?? "").trim();
  const contentHtml = sanitizeArticleHtml(String(parsed.contentHtml ?? parsed.content_html ?? "").trim());
  if (!title || !metaDescription || !contentHtml) throw new Error("رد المقال ناقص: العنوان أو الوصف أو المحتوى غير موجود.");
  return {
    title,
    metaDescription,
    contentHtml,
    suggestedTags: asStringArray(parsed.suggestedTags ?? parsed.suggested_tags),
    category: String(parsed.category ?? parsed.suggested_category ?? "").trim(),
    imagePrompt: String(parsed.imagePrompt ?? parsed.image_prompt ?? "").trim(),
    imageAlt: String(parsed.imageAlt ?? parsed.image_alt ?? "").trim()
  };
}

async function fetchInternalLinkCandidates(item: ContentRecord): Promise<InternalLinkCandidate[]> {
  const result = await query<{ title: string | null; topic: string; target_keyword: string | null; wordpress_post_url: string | null }>(
    `SELECT title, topic, target_keyword, wordpress_post_url
     FROM content_items
     WHERE site_id = $1
       AND id <> $2
       AND wordpress_post_url IS NOT NULL
       AND status IN ('PUBLISHED', 'SCHEDULED', 'APPROVED')
     ORDER BY
       CASE WHEN target_keyword IS NOT NULL AND $3 ILIKE '%' || target_keyword || '%' THEN 0 ELSE 1 END,
       content_score DESC,
       updated_at DESC
     LIMIT 8`,
    [item.site_id, item.id, item.topic]
  );
  return result.rows
    .map((row) => ({
      title: String(row.title ?? row.topic).trim(),
      url: String(row.wordpress_post_url ?? "").trim(),
      keyword: row.target_keyword?.trim() || null
    }))
    .filter((row) => row.title && isInternalUrl(row.url, item.wordpress_url));
}

function enforceArticleRequirements(html: string, item: ContentRecord, internalLinks: InternalLinkCandidate[] = []): string {
  let next = removeFormLikeCopy(html);
  if (!hasCta(next, item.language)) {
    next += buildCtaFallback(item);
  }
  if (countInternalLinks(next, item.wordpress_url) < 2) {
    next += buildInternalLinksFallback(item, internalLinks);
  }
  return sanitizeArticleHtml(next);
}

function buildInternalLinksFallback(item: ContentRecord, internalLinks: InternalLinkCandidate[]): string {
  const links = uniqueInternalLinks(internalLinks, item.wordpress_url).slice(0, 2);
  const baseUrl = normalizeBaseUrl(item.wordpress_url);
  if (links.length < 2) {
    const keyword = encodeURIComponent(String(item.target_keyword ?? item.topic).trim());
    links.push({ title: item.language === "en" ? "Visit the homepage" : "زيارة الصفحة الرئيسية", url: baseUrl, keyword: null });
    links.push({ title: item.language === "en" ? "Explore related articles" : "استكشاف مقالات مرتبطة", url: `${baseUrl}?s=${keyword}`, keyword: null });
  }
  const heading = item.language === "en" ? "Related Articles" : "مقالات مرتبطة";
  return `<h2>${heading}</h2><ul>${links.slice(0, 2).map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.title)}</a></li>`).join("")}</ul>`;
}

function buildCtaFallback(item: ContentRecord): string {
  if (item.language === "en") {
    return `<h2>Next Steps</h2><p>If you are comparing your options and want a clearer decision, review your priorities and contact ${escapeHtml(item.site_name)} for guidance tailored to your trip.</p>`;
  }
  return `<h2>الخطوة التالية</h2><p>إذا كنت تقارن الخيارات وتريد قرارًا أدق، راجع احتياجاتك الفعلية وابدأ بتطبيق التوصيات المناسبة، أو تواصل مع فريق ${escapeHtml(item.site_name)} للحصول على توجيه يناسب حالتك.</p>`;
}

function uniqueInternalLinks(links: InternalLinkCandidate[], siteUrl: string): InternalLinkCandidate[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (!isInternalUrl(link.url, siteUrl) || seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function removeFormLikeCopy(html: string): string {
  return html
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<(input|textarea|select|button)\b[\s\S]*?>/gi, "")
    .replace(/<p>\s*(?:الاسم|اسمك|البريد الإلكتروني|رقم الهاتف|املأ النموذج|أرسل الطلب|اضغط إرسال)\s*<\/p>/gi, "");
}

function hasCta(html: string, language = "ar"): boolean {
  const text = html.replace(/<[^>]+>/g, " ");
  const arabicCta = /تواصل|احجز|ابدأ|اطلب|استشر|راسل|الخطوة التالية|اتصل/i;
  const englishCta = /contact|book|start|request|quote|speak|plan your|next steps|call|email|whatsapp/i;
  return language === "en" ? englishCta.test(text) : arabicCta.test(text) || englishCta.test(text);
}

function countInternalLinks(html: string, siteUrl: string): number {
  const host = safeHost(siteUrl);
  if (!host) return 0;
  return [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)].filter((match) => safeHost(match[1] ?? "") === host).length;
}

function isInternalUrl(url: string, siteUrl: string): boolean {
  const siteHost = safeHost(siteUrl);
  const linkHost = safeHost(url);
  return Boolean(siteHost && linkHost && siteHost === linkHost);
}

function trustedResearchInstruction(siteUrl: string): string {
  const host = safeHost(siteUrl) ?? "the client site";
  return [
    "استخدم المصادر الموثوقة فقط، وليس مجرد الصفحات المتصدرة في نتائج البحث.",
    "الأولوية: مواقع رسمية حكومية أو سياحية أو تعليمية، منظمات معروفة، مواقع المتاحف/المطارات/التأشيرات الرسمية، مصادر بيانات أصلية، وناشرون تحريريًا موثوقون.",
    "تجنب: صفحات المنافسين التجارية المباشرة، المنتديات، Reddit/Quora، Pinterest، Medium، Blogspot، مواقع كوبونات أو affiliate، ومقالات SEO سطحية بلا مصدر أصلي.",
    `لا تستخدم ${host} كمصدر خارجي للمنافسين، لكن يمكن استخدامه فقط للروابط الداخلية لاحقًا.`,
    "لو لم تجد مصادر موثوقة كافية، أعد مصادر أقل عددًا ولا تملأ القائمة بمواقع ضعيفة."
  ].join("\n");
}

function trustedSources(sources: string[], siteUrl: string): string[] {
  const ownHost = safeHost(siteUrl);
  const seen = new Set<string>();
  return sources.filter((source) => {
    const host = safeHost(source);
    if (!host || host === ownHost || seen.has(source)) return false;
    seen.add(source);
    return isTrustedSourceHost(host);
  });
}

function isTrustedSourceHost(host: string): boolean {
  const normalized = host.replace(/^www\./, "");
  const blocked = [
    "reddit.com",
    "quora.com",
    "pinterest.com",
    "medium.com",
    "blogspot.com",
    "wordpress.com",
    "tripadvisor.com",
    "facebook.com",
    "x.com",
    "twitter.com",
    "instagram.com",
    "tiktok.com"
  ];
  if (blocked.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`))) return false;
  if (/\.(gov|edu|ac)(\.[a-z]{2})?$/.test(normalized)) return true;
  if (normalized.endsWith(".gov.uk") || normalized.endsWith(".gov.eg")) return true;
  const trustedDomains = [
    "unesco.org",
    "who.int",
    "worldbank.org",
    "oecd.org",
    "iata.org",
    "caa.co.uk",
    "visitbritain.com",
    "egypt.travel",
    "metmuseum.org",
    "britishmuseum.org",
    "louvre.fr",
    "lonelyplanet.com",
    "britannica.com",
    "nationalgeographic.com",
    "bbc.com",
    "reuters.com"
  ];
  return trustedDomains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function defaultWritingStandard(): string {
  return [
    "اكتب بالعربية الطبيعية وبأسلوب محرر خبير.",
    "ابدأ بإجابة مباشرة ومفيدة، وتجنب المقدمات الإنشائية.",
    "استخدم HTML دلالي نظيف: h2 و h3 و p و ul و ol و li و strong و a و table عند الحاجة.",
    "راع SEO وAEO وGEO والوضوح ونية البحث دون حشو كلمات مفتاحية.",
    "أجب مباشرة، ثم توسع بتفاصيل عملية، ثم أضف أسئلة شائعة وCTA طبيعي.",
    "لا تضف حقول نموذج أو placeholders أو نصوص form داخل المقال.",
    "لا تخترع مصادر خارجية، ولا تذكر أنك ذكاء اصطناعي."
  ].join("\n");
}

function languageInstruction(language: string): string {
  return language === "en"
    ? "Language requirement: write the full article in English only. Use natural UK English. Do not output Arabic headings, Arabic paragraphs, or mixed-language content."
    : "متطلب اللغة: اكتب المقال كاملًا بالعربية الفصحى فقط. لا تخلط الإنجليزية داخل العناوين أو الفقرات إلا عند الحاجة للكلمات المفتاحية.";
}

function languageName(language: string): string {
  return language === "en" ? "English" : "Arabic";
}

function daysAgoIso(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function shouldAutoSelectFirstIdea(mode: string, autoPublish: boolean): boolean {
  return autoPublish && (mode === "BULK" || mode === "AUTO_PILOT");
}
