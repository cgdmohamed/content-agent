import type { ImageSize, ImageUsage } from "@content-agent/shared";

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
  usage?: ImageUsage;
}

/** The call succeeded (HTTP 200) but returned no image; the tokens it used are still billed. */
export class ImageNotReturnedError extends Error {
  constructor(
    message: string,
    readonly usage: ImageUsage | undefined
  ) {
    super(message);
    this.name = "ImageNotReturnedError";
  }
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  /** Thinking tokens, billed at the text output price. */
  thoughtsTokenCount?: number;
  candidatesTokensDetails?: Array<{ modality?: string; tokenCount?: number }>;
}

/** Splits Gemini's usageMetadata into the image-output tokens (priced per image) and the text tokens. */
export function imageUsageFrom(metadata: GeminiUsageMetadata | undefined): ImageUsage | undefined {
  if (!metadata) return undefined;
  const imageOutputTokens = metadata.candidatesTokensDetails?.find((detail) => detail.modality?.toUpperCase() === "IMAGE")?.tokenCount;
  const textOutputTokens = metadata.candidatesTokensDetails?.find((detail) => detail.modality?.toUpperCase() === "TEXT")?.tokenCount;
  return { imageOutputTokens, textInputTokens: metadata.promptTokenCount, textOutputTokens: (textOutputTokens ?? 0) + (metadata.thoughtsTokenCount ?? 0) || undefined };
}

export async function generateGeminiImage(prompt: string, options: { model: string; imageSize?: ImageSize | null }): Promise<GeneratedImage> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("مفتاح Gemini غير مهيأ.");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`;
  const generationConfig: Record<string, unknown> = { responseModalities: ["TEXT", "IMAGE"] };
  // Only sent when an admin picked a size: models that do not support it reject unknown config.
  if (options.imageSize) generationConfig.imageConfig = { imageSize: options.imageSize };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig
    }),
    signal: AbortSignal.timeout(180_000)
  });
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> } }>;
    usageMetadata?: GeminiUsageMetadata;
    error?: { message?: string };
  };
  if (!response.ok) {
    const detail = data.error?.message ? ` ${data.error.message}` : "";
    const hint = response.status === 404 ? " تحقق من اسم الموديل وأنه متاح على Gemini API v1beta لهذا المفتاح." : "";
    throw new Error(`فشل توليد صورة Gemini برمز ${response.status}.${hint}${detail}`);
  }

  for (const candidate of data.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inline = part.inlineData ?? (part.inline_data ? { mimeType: part.inline_data.mime_type, data: part.inline_data.data } : undefined);
      if (inline?.data) {
        return {
          bytes: Buffer.from(inline.data, "base64"),
          mimeType: inline.mimeType ?? "image/png",
          usage: imageUsageFrom(data.usageMetadata)
        };
      }
    }
  }
  throw new ImageNotReturnedError("لم يرجع Gemini صورة ضمن الرد.", imageUsageFrom(data.usageMetadata));
}
