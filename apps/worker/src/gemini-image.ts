export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
}

export async function generateGeminiImage(prompt: string): Promise<GeneratedImage> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("مفتاح Gemini غير مهيأ.");
  const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    }),
    signal: AbortSignal.timeout(180_000)
  });
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> } }>;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(`فشل توليد صورة Gemini برمز ${response.status}.`);

  for (const candidate of data.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      const inline = part.inlineData ?? (part.inline_data ? { mimeType: part.inline_data.mime_type, data: part.inline_data.data } : undefined);
      if (inline?.data) {
        return {
          bytes: Buffer.from(inline.data, "base64"),
          mimeType: inline.mimeType ?? "image/png"
        };
      }
    }
  }
  throw new Error("لم يرجع Gemini صورة ضمن الرد.");
}
