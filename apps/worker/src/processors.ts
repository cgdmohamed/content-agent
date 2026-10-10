import { appendAudit, query } from "./db.js";
import { generateText } from "./ai.js";
import { imageCostUsd } from "./budget.js";
import { forgetImage, recallImage, rememberImage } from "./image-cache.js";
import { resolveChainForContent } from "./models.js";
import { buildTranslationMap, findModel, findSiteLanguage, imageCostFromUsage, imageFailureCostFromUsage, normalizeSiteLanguages, sourceLanguageCode } from "@content-agent/shared";
import { billFailedCall, releaseSpend, reserveSpend, settleSpend } from "./usage.js";
import { sanitizeArticleHtml } from "./html-sanitizer.js";
import { asStringArray, extractJson } from "./json.js";
import { scoreArticle } from "./scoring.js";
import { generateGeminiImage, ImageNotReturnedError } from "./gemini-image.js";
import { fetchGscQueries, type GscSite } from "./google-search-console.js";
import { linkTranslations, publishPost, searchWordPressInternalContent, uploadMedia } from "./wordpress.js";
import { buildTranslationPrompt, missingLinks, parseTranslation } from "./translation.js";

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
  /** The article's own language code ("en" for a translation); null = the site language. */
  content_language: string | null;
  translation_of: string | null;
  polylang_status: string;
  polylang_languages: unknown;
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
    case "TRANSLATE_CONTENT":
      return translateContent(contentItemId);
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
    `SELECT c.*, c.language AS content_language, s.name AS site_name, s.market, s.language, s.writing_standard, s.wordpress_url
            , s.polylang_status, s.polylang_languages
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
  const focusKeyword = String(selected.targetKeyword ?? selected.target_keyword ?? item.target_keyword ?? "");
  const site = {
    wordpress_url: item.wordpress_url,
    wordpress_username: item.wordpress_username,
    wordpress_application_password_encrypted: item.wordpress_application_password_encrypted
  };
  const polylang = polylangLanguageFor(item);
  const result = await publishPost(
    site,
    {
      language: polylang,
      wordpressPostId: item.wordpress_post_id,
      title: item.title,
      contentHtml: item.draft_html,
      metaDescription: item.meta_description,
      focusKeyword,
      slug: slugFromKeyword(focusKeyword || item.title || item.topic),
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
    wordpressStatus: result.status,
    language: polylang
  });
  if (polylang) await linkTranslationGroup(item, site, result.id);
  return { provider: "wordpress" };
}

/**
 * The Polylang language to publish this article in, or undefined when the site is not multilingual
 * (or the article's language is not one of the site's Polylang languages) and WordPress should apply its default.
 */
export function polylangLanguageFor(item: Pick<ContentRecord, "polylang_status" | "polylang_languages" | "content_language" | "language">): string | undefined {
  if (item.polylang_status !== "CONNECTED") return undefined;
  const languages = normalizeSiteLanguages(item.polylang_languages);
  if (languages.length < 2) return undefined;
  return findSiteLanguage(languages, sourceLanguageCode(item.content_language, item.language))?.code;
}

/**
 * Links every already-published version of the article (source + translations) in Polylang. It runs after each
 * publish, so the group grows as the translations go out and the order of publishing does not matter.
 * A linking failure does not undo the publish: it is recorded and the next publish of the group retries it.
 */
async function linkTranslationGroup(item: ContentRecord, site: { wordpress_url: string; wordpress_username: string; wordpress_application_password_encrypted: string }, wordpressPostId: string): Promise<void> {
  const rootId = item.translation_of ?? item.id;
  const rows = await query<{ language: string | null; wordpress_post_id: string | null; site_language: string }>(
    `SELECT COALESCE(c.language, s.language) AS language, c.wordpress_post_id, s.language AS site_language
     FROM content_items c JOIN sites s ON s.id = c.site_id
     WHERE (c.id = $1 OR c.translation_of = $1) AND c.wordpress_post_id IS NOT NULL`,
    [rootId]
  );
  const languages = normalizeSiteLanguages(item.polylang_languages);
  const map = buildTranslationMap(
    rows.rows.map((row) => ({ language: findSiteLanguage(languages, row.language)?.code ?? null, wordpressPostId: row.wordpress_post_id }))
  );
  if (Object.keys(map).length < 2) return;
  try {
    await linkTranslations(site, wordpressPostId, map);
    await appendAudit(item.id, "WORDPRESS_TRANSLATIONS_LINKED", "تم ربط ترجمات المقال في Polylang", { translations: map });
  } catch (error) {
    await appendAudit(item.id, "WORDPRESS_TRANSLATIONS_LINK_FAILED", "تم النشر لكن تعذر ربط الترجمات في Polylang", {
      error: error instanceof Error ? error.message : String(error),
      translations: map
    });
  }
}

async function translateContent(contentItemId: string): Promise<OperationResult> {
  const item = await fetchContent(contentItemId);
  if (!item.translation_of || !item.content_language) throw new Error("عنصر الترجمة غير مرتبط بمقال أصلي ولغة هدف.");
  if (item.polylang_status !== "CONNECTED") throw new Error("الموقع غير متصل بـ Polylang. زامن لغات الموقع أولًا.");
  const source = await fetchContent(item.translation_of);
  if (!source.title || !source.draft_html) throw new Error("المقال الأصلي ليس له عنوان ومحتوى للترجمة.");
  const languages = normalizeSiteLanguages(item.polylang_languages);
  const target = findSiteLanguage(languages, item.content_language);
  if (!target) throw new Error(`اللغة ${item.content_language} غير موجودة في لغات الموقع.`);
  const sourceLanguage = findSiteLanguage(languages, sourceLanguageCode(source.content_language, source.language));

  const sourceArticle = {
    title: source.title,
    metaDescription: source.meta_description ?? "",
    contentHtml: source.draft_html,
    targetKeyword: source.target_keyword ?? "",
    category: source.category ?? "",
    tags: asStringArray(source.tags),
    imageAlt: source.image_alt ?? ""
  };
  const prompt = buildTranslationPrompt({
    ...sourceArticle,
    sourceLanguage: sourceLanguage ? `${sourceLanguage.name} (${sourceLanguage.code})` : languageName(source.language),
    targetLanguage: `${target.name} (${target.code})`,
    siteName: source.site_name,
    market: source.market
  });
  const result = await generateText({ contentItemId, operation: "TRANSLATE_CONTENT", prompt, maxTokens: 8000 });
  const article = parseTranslation(result.text, sourceArticle);
  const lostLinks = missingLinks(source.draft_html, article.contentHtml);
  const score = scoreArticle({
    html: article.contentHtml,
    title: article.title,
    metaDescription: article.metaDescription,
    targetKeyword: article.targetKeyword || undefined,
    imageAlt: article.imageAlt,
    siteUrl: source.wordpress_url
  });
  await query(
    `UPDATE content_items
     SET title = $2,
         topic = $3,
         target_keyword = $4,
         meta_description = $5,
         draft_html = $6,
         category = $7,
         tags = $8::jsonb,
         image_alt = $9,
         image_prompt = $10,
         image_url = $11,
         wordpress_media_id = $12,
         content_score = $13,
         content_score_details = $14::jsonb,
         status = 'IMAGE_READY',
         last_successful_state = 'IMAGE_READY',
         failed_action = NULL,
         error_message = NULL,
         updated_at = now()
     WHERE id = $1`,
    [
      contentItemId,
      article.title,
      source.topic,
      article.targetKeyword || null,
      article.metaDescription,
      article.contentHtml,
      article.category || source.category,
      JSON.stringify(article.tags.length > 0 ? article.tags : asStringArray(source.tags)),
      article.imageAlt || source.image_alt,
      source.image_prompt,
      source.image_url,
      source.wordpress_media_id,
      score.score,
      JSON.stringify(score.checks)
    ]
  );
  await appendAudit(contentItemId, "AI_TRANSLATION_READY", `تمت ترجمة المقال إلى ${target.name} بواسطة ${result.provider}`, {
    provider: result.provider,
    model: result.model,
    language: target.code,
    score: score.score,
    sourceContentItemId: source.id,
    missingLinks: lostLinks
  });
  return { provider: result.provider };
}

async function generateImageWithChain(contentItemId: string, prompt: string): Promise<Awaited<ReturnType<typeof generateGeminiImage>> & { model: string }> {
  const cached = recallImage(contentItemId, prompt);
  if (cached) return { ...cached.image, model: cached.model };

  const resolved = await resolveChainForContent(contentItemId, "image");
  const failures: string[] = [];
  for (const ref of resolved.chain) {
    const spec = findModel(resolved.catalog, ref);
    const fallbackUsd = imageCostUsd();
    const reservationId = await reserveSpend({
      provider: "gemini-image",
      model: ref.model,
      operation: "GENERATE_IMAGE",
      contentItemId,
      estimatedCostUsd: spec?.imageUsd ?? fallbackUsd
    });
    const started = Date.now();
    try {
      const image = await generateGeminiImage(prompt, { model: ref.model, imageSize: resolved.imageSize });
      await settleSpend(reservationId, {
        inputTokens: image.usage?.textInputTokens ?? 0,
        outputTokens: (image.usage?.imageOutputTokens ?? 0) + (image.usage?.textOutputTokens ?? 0),
        costUsd: imageCostFromUsage(spec, fallbackUsd, image.usage),
        durationMs: Date.now() - started
      });
      rememberImage(contentItemId, prompt, ref.model, image);
      return { ...image, model: ref.model };
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطأ غير معروف";
      failures.push(`${ref.model}: ${message}`);
      if (error instanceof ImageNotReturnedError && error.usage) {
        // The model answered without an image: Google still bills the tokens it used.
        await billFailedCall(reservationId, {
          inputTokens: error.usage.textInputTokens ?? 0,
          outputTokens: error.usage.textOutputTokens ?? 0,
          costUsd: imageFailureCostFromUsage(spec, error.usage),
          durationMs: Date.now() - started,
          error: message
        });
      } else {
        await releaseSpend(reservationId, { durationMs: Date.now() - started, error: message });
      }
    }
  }
  throw new Error(`فشل توليد الصورة بكل الموديلات المتاحة: ${failures.join(" | ")}`);
}

async function generateFeaturedImage(contentItemId: string): Promise<OperationResult> {
  const item = await fetchContent(contentItemId);
  if (!item.title) throw new Error("لا يمكن توليد صورة بدون عنوان المقال.");
  const prompt = item.image_prompt?.trim() || `Editorial blog feature image for: ${item.title}`;
  const generated = await generateImageWithChain(contentItemId, prompt);
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
  forgetImage(contentItemId, prompt);
  await appendAudit(contentItemId, "FEATURED_IMAGE_READY", "تم توليد الصورة ورفعها إلى ووردبريس", {
    model: generated.model,
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
    "اجعل targetKeyword قصيرة وطبيعية وقابلة للاستخدام حرفيًا في SEO title وmeta description والـ URL، ويفضل 4 إلى 7 كلمات بدون حروف زائدة.",
    'أعد JSON فقط بالشكل: [{"title":"...","targetKeyword":"...","angle":"..."}]'
  ].join("\n");
  const result = await generateText({ contentItemId, operation: "GENERATE_IDEAS", prompt });
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
  const result = await generateText({ contentItemId, operation: "RESEARCH_GAPS", prompt, maxTokens: 3000 });
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
    `- ${closingInstruction}`,
    "- أضف قسم أسئلة شائعة واضح للإجابة على أسئلة المستخدمين AEO.",
    "- أضف فقرة ملخص تنفيذي أو إجابة مباشرة قابلة للظهور في الإجابات التوليدية GEO.",
    "- يجب أن تظهر الكلمة المستهدفة حرفيًا في SEO title وmeta description وأول فقرة وواحد من عناوين H2/H3 ومحتوى المقال.",
    "- اجعل العنوان 55-60 حرفًا تقريبًا، والوصف التعريفي 140-160 حرفًا، وابدأ العنوان بالكلمة المستهدفة قدر الإمكان.",
    "- اجعل imageAlt يحتوي الكلمة المستهدفة حرفيًا.",
    "- اجعل العنوان والوصف فريدين ويعكسان محتوى هذا المقال تحديدًا؛ ممنوع القوالب العامة الجاهزة مثل «دليل عملي» أو «نصائح عملية وخطوات واضحة».",
    "- أضف رابطين داخليين على الأقل من قائمة الروابط الداخلية المرشحة فقط، وبنص anchor طبيعي داخل الفقرات لا في قائمة منفصلة إلا عند الضرورة.",
    "- ممنوع اختراع أي URL داخلي غير موجود في قائمة الروابط المرشحة. إذا لم تجد رابطًا مناسبًا، لا تضف رابطًا عشوائيًا.",
    "- إذا لم تحتوِ القائمة على رابط مناسب لسياق الفقرة فلا تضف رابطًا داخليًا. لا تربط أبدًا بالصفحة الرئيسية أو بصفحة بحث، ولا تضف قسم «مقالات مرتبطة» لمجرد وجود روابط.",
    "- عند عرض بيانات متعددة في جدول، استخدم HTML table كاملًا فقط: table وthead وtbody وtr وth وtd. ممنوع كتابة أعمدة الجدول كنص متلاصق أو مفصول بمسافات.",
    'أعد JSON فقط بالشكل: {"title":"...","metaDescription":"...","contentHtml":"...","suggestedTags":["..."],"category":"...","imagePrompt":"...","imageAlt":"..."}'
  ].join("\n\n");
  const result = await generateText({ contentItemId, operation: "WRITE_DRAFT", prompt, maxTokens: 6000 });
  const focusKeyword = String(idea.targetKeyword ?? idea.target_keyword ?? item.target_keyword ?? "");
  const article = optimizeArticleForRankMath(parseArticle(result.text), item, focusKeyword);
  const contentHtml = enforceArticleRequirements(article.contentHtml, item, internalLinks);
  const score = scoreArticle({
    html: contentHtml,
    title: article.title,
    metaDescription: article.metaDescription,
    targetKeyword: focusKeyword,
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
    `ارفع جودة المقال إلى معيار SEO/AEO/GEO: إجابة مباشرة، عمق كاف، قسم أسئلة شائعة، وروابط داخلية من قائمة الروابط المرشحة عندما تناسب السياق. ${closingInstruction}`,
    "ممنوع اختراع أي URL داخلي غير موجود في قائمة الروابط المرشحة. احذف الرابط الداخلي غير الموثق بدل استبداله بمسار عشوائي.",
    "تأكد أن الكلمة المستهدفة تظهر حرفيًا في العنوان والوصف وأول فقرة وH2/H3 وALT، مع عنوان لا يتجاوز 60 حرفًا ووصف لا يتجاوز 160 حرفًا.",
    "العنوان والوصف يجب أن يعكسا محتوى هذا المقال تحديدًا، بلا قوالب عامة جاهزة مثل «دليل عملي» أو «نصائح عملية وخطوات واضحة».",
    "أي جدول داخل المقال يجب أن يكون HTML table حقيقيًا يحتوي thead/tbody/tr/th/td، ولا تترك بيانات الجدول كنص متلاصق.",
    "احذف أي نصوص تبدو كحقول نموذج أو placeholders مثل الاسم والبريد ورقم الهاتف واملأ النموذج.",
    `لا يقل الناتج النهائي عن 1200 كلمة إذا كان المقال أقصر من ذلك، وبنفس لغة الموقع فقط: ${languageName(item.language)}.`,
    item.draft_html,
    'أعد JSON فقط بالشكل: {"title":"...","metaDescription":"...","contentHtml":"...","suggestedTags":["..."],"category":"...","imagePrompt":"...","imageAlt":"..."}'
  ].join("\n\n");
  const result = await generateText({ contentItemId, operation: "REVIEW_DRAFT", prompt, maxTokens: 6000 });
  const article = optimizeArticleForRankMath(parseArticle(result.text), item, item.target_keyword ?? "");
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
    "حسن المقال التالي فقط من ناحية الروابط الداخلية بدون إعادة كتابة شاملة.",
    `اسم الموقع: ${item.site_name}`,
    `رابط الموقع الأساسي: ${item.wordpress_url}`,
    `الكلمة المستهدفة: ${item.target_keyword ?? item.topic}`,
    `روابط داخلية مرشحة من نفس الموقع: ${JSON.stringify(internalLinks)}`,
    "المطلوب:",
    "- أضف رابطًا داخليًا (حتى رابطين) من قائمة الروابط المرشحة فقط، داخل فقرة يخدمها الرابط فعلًا وبـ anchor طبيعي يخدم نية البحث. إن لم يوجد رابط مناسب فلا تضف شيئًا.",
    "- ممنوع اختراع أي URL داخلي غير موجود في قائمة الروابط المرشحة، وممنوع الربط بالصفحة الرئيسية أو بصفحة بحث.",
    "- لا تضف روابط خارجية جديدة ولا تستخدم روابط خارج نفس الموقع.",
    "- حافظ على أي جدول كبنية HTML صحيحة، وإذا وجدت جدولًا كنص متلاصق فحوّله إلى table منظم.",
    "- لا تضف CTA أو فقرة ختامية جديدة، ولا تغيّر ختام المقال.",
    "- حافظ على نفس لغة المقال، ونفس العنوان العام، ونفس البنية قدر الإمكان.",
    "- لا تحذف الأسئلة الشائعة أو الجداول أو الروابط الموجودة إلا لو كانت خاطئة.",
    item.draft_html,
    'أعد JSON فقط بالشكل: {"title":"...","metaDescription":"...","contentHtml":"...","suggestedTags":["..."],"category":"...","imagePrompt":"...","imageAlt":"..."}'
  ].join("\n\n");
  const result = await generateText({ contentItemId, operation: "OPTIMIZE_LINKS", prompt, maxTokens: 5000 });
  const article = optimizeArticleForRankMath(parseArticle(result.text), item, item.target_keyword ?? "");
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

type ParsedArticle = ReturnType<typeof parseArticle>;

/**
 * Keeps the model's title, description and image alt text. Only over-long values are shortened, at a word boundary;
 * nothing is replaced by a generic template ("keyword: practical guide"), and a missing keyword is left to the
 * quality score to flag instead of being stuffed in.
 */
function optimizeArticleForRankMath(article: ParsedArticle, _item: ContentRecord, focusKeyword: string): ParsedArticle {
  return {
    ...article,
    title: fitText(article.title, maxSeoTitleLength),
    metaDescription: fitText(article.metaDescription, maxMetaDescriptionLength),
    contentHtml: sanitizeArticleHtml(article.contentHtml),
    imageAlt: article.imageAlt.trim() || focusKeyword.trim()
  };
}

export const maxSeoTitleLength = 60;
export const maxMetaDescriptionLength = 160;

/** Shortens `value` to at most `max` characters, cutting at a word boundary and dropping dangling punctuation. */
export function fitText(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const boundary = cut.lastIndexOf(" ");
  const words = boundary >= max * 0.6 ? cut.slice(0, boundary) : cut;
  return words.replace(/[\s,;:،؛\-–—|/]+$/u, "").trim();
}

function containsPhrase(value: string, phrase: string): boolean {
  return normalizeText(value).includes(normalizeText(phrase));
}


function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[\u064B-\u065F]/g, "").replace(/[^a-z0-9\u0600-\u06FF]+/g, " ").replace(/\s+/g, " ").trim();
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}



/** The article's ending: a natural close, never a generic "contact us" block bolted on regardless of the topic. */
export const closingInstruction =
  "اختم المقال بخاتمة طبيعية تلخّص الفكرة وتخدم موضوعه. لا تضف دعوة لاتخاذ إجراء (CTA) إلا إذا كانت منطقية لهذا الموضوع بالذات، وبصياغة خاصة به. ممنوع العناوين والعبارات العامة الجاهزة مثل «دعوة للتواصل» أو «الخطوة التالية» أو «تواصل معنا الآن».";

/** Search phrases that find related pages: the keyword, the topic and the title, without repeats. */
export function linkSearchTerms(item: Pick<ContentRecord, "target_keyword" | "topic" | "title">): string[] {
  const seen = new Set<string>();
  return [item.target_keyword, item.topic, item.title]
    .map((value) => String(value ?? "").trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

async function fetchInternalLinkCandidates(item: ContentRecord): Promise<InternalLinkCandidate[]> {
  const result = await query<{ title: string | null; topic: string; target_keyword: string | null; wordpress_post_url: string | null }>(
    `SELECT title, topic, target_keyword, wordpress_post_url
     FROM content_items
     WHERE site_id = $1
       AND id <> $2
       AND wordpress_post_url IS NOT NULL
       AND status IN ('PUBLISHED', 'SCHEDULED', 'APPROVED')
       AND language IS NOT DISTINCT FROM $4
     ORDER BY
       CASE WHEN target_keyword IS NOT NULL AND $3 ILIKE '%' || target_keyword || '%' THEN 0 ELSE 1 END,
       content_score DESC,
       updated_at DESC
     LIMIT 8`,
    [item.site_id, item.id, item.topic, item.content_language]
  );
  const savedLinks = result.rows
    .map((row) => ({
      title: String(row.title ?? row.topic).trim(),
      url: String(row.wordpress_post_url ?? "").trim(),
      keyword: row.target_keyword?.trim() || null
    }))
    .filter((row) => row.title && isInternalUrl(row.url, item.wordpress_url));

  const wordpressLinks: InternalLinkCandidate[] = [];
  const site = {
    wordpress_url: item.wordpress_url,
    wordpress_username: item.wordpress_username,
    wordpress_application_password_encrypted: item.wordpress_application_password_encrypted
  };
  for (const term of linkSearchTerms(item)) {
    try {
      const found = await searchWordPressInternalContent(site, term, polylangLanguageFor(item));
      for (const row of found) {
        if (row.title && isInternalUrl(row.url, item.wordpress_url)) wordpressLinks.push({ title: row.title, url: row.url, keyword: row.subtype === "page" ? "page" : null });
      }
    } catch {
      // A failed search only means fewer candidates; the article is still written.
    }
  }

  return uniqueInternalLinks([...savedLinks, ...wordpressLinks], item.wordpress_url).slice(0, 12);
}

/**
 * Cleans what the model wrote without adding anything: form-like text is removed and internal links are kept only
 * when they point at a real candidate page. Nothing is appended — a generic closing or a "related articles" block
 * made of the homepage and a search URL reads as filler and links nowhere useful.
 */
function enforceArticleRequirements(html: string, item: ContentRecord, internalLinks: InternalLinkCandidate[] = []): string {
  return sanitizeArticleHtml(constrainInternalLinks(removeFormLikeCopy(html), item, internalLinks));
}

function uniqueInternalLinks(links: InternalLinkCandidate[], siteUrl: string): InternalLinkCandidate[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = normalizeUrlKey(link.url);
    if (!key || !isInternalUrl(link.url, siteUrl) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function constrainInternalLinks(html: string, item: ContentRecord, internalLinks: InternalLinkCandidate[]): string {
  const allowed = allowedInternalLinkKeys(item, internalLinks);
  return html.replace(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (full, _before, href, _after, label) => {
    if (!isInternalUrl(String(href), item.wordpress_url)) return full;
    return allowed.has(normalizeUrlKey(String(href))) ? full : stripHtml(String(label));
  });
}

/** Internal links an article may keep: the candidate pages only (never the homepage or a search URL). */
export function allowedInternalLinkKeys(item: Pick<ContentRecord, "wordpress_url">, internalLinks: InternalLinkCandidate[]): Set<string> {
  const homepage = normalizeUrlKey(item.wordpress_url);
  return new Set(
    uniqueInternalLinks(internalLinks, item.wordpress_url)
      .map((link) => normalizeUrlKey(link.url))
      .filter((key) => key && key !== homepage && !isSearchUrl(key))
  );
}

function isSearchUrl(url: string): boolean {
  try {
    return new URL(url).searchParams.has("s");
  } catch {
    return false;
  }
}

function removeFormLikeCopy(html: string): string {
  return html
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<(input|textarea|select|button)\b[\s\S]*?>/gi, "")
    .replace(/<p>\s*(?:الاسم|اسمك|البريد الإلكتروني|رقم الهاتف|املأ النموذج|أرسل الطلب|اضغط إرسال)\s*<\/p>/gi, "");
}

function isInternalUrl(url: string, siteUrl: string): boolean {
  const siteHost = safeHost(siteUrl);
  const linkHost = safeHost(url);
  return Boolean(siteHost && linkHost && siteHost === linkHost);
}

function normalizeUrlKey(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
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


function slugFromKeyword(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 75)
    .replace(/-$/g, "") || "article";
}


function defaultWritingStandard(): string {
  return [
    "اكتب بالعربية الطبيعية وبأسلوب محرر خبير.",
    "ابدأ بإجابة مباشرة ومفيدة، وتجنب المقدمات الإنشائية.",
    "استخدم HTML دلالي نظيف: h2 و h3 و p و ul و ol و li و strong و a و table عند الحاجة.",
    "أي جدول يجب أن يكون HTML كاملًا: table وthead وtbody وtr وth وtd، مع صف عناوين واضح، وممنوع إخراج الجداول كنص متلاصق.",
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
