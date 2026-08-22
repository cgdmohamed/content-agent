import { z } from "zod";
import { contentStates } from "./workflow.js";

export const contentIdeaSchema = z.object({
  title: z.string().min(3),
  targetKeyword: z.string().min(2),
  angle: z.string().min(3)
});

export const legacyContentIdeaSchema = z
  .object({
    title: z.string().min(3),
    target_keyword: z.string().min(2),
    angle: z.string().min(3)
  })
  .transform((value) => ({
    title: value.title,
    targetKeyword: value.target_keyword,
    angle: value.angle
  }));

export const articleEnvelopeSchema = z.object({
  title: z.string().min(5),
  metaDescription: z.string().min(30).max(180),
  contentHtml: z.string().min(100),
  suggestedTags: z.array(z.string()).default([]),
  category: z.string().optional().default(""),
  imagePrompt: z.string().optional().default(""),
  imageAlt: z.string().optional().default("")
});

export const legacyArticleEnvelopeSchema = z
  .object({
    title: z.string().min(5),
    meta_description: z.string().min(30).max(180),
    content_html: z.string().min(100),
    suggested_tags: z.array(z.string()).default([]),
    suggested_category: z.string().optional().default(""),
    image_prompt: z.string().optional().default(""),
    image_alt: z.string().optional().default("")
  })
  .transform((value) => ({
    title: value.title,
    metaDescription: value.meta_description,
    contentHtml: value.content_html,
    suggestedTags: value.suggested_tags,
    category: value.suggested_category,
    imagePrompt: value.image_prompt,
    imageAlt: value.image_alt
  }));

export const contentStateSchema = z.enum(contentStates);

export type ContentIdea = z.infer<typeof contentIdeaSchema>;
export type ArticleEnvelope = z.infer<typeof articleEnvelopeSchema>;
