import type { GeneratedImage } from "./gemini-image.js";

interface Entry {
  image: GeneratedImage;
  model: string;
  expiresAt: number;
}

const ttlMs = 30 * 60 * 1000;
const maxEntries = 20;
const entries = new Map<string, Entry>();

function key(contentItemId: string, prompt: string): string {
  return `${contentItemId}\n${prompt}`;
}

/**
 * Generated images are billed per call. If the WordPress upload fails and BullMQ retries the job,
 * reuse the bytes we already paid for instead of generating (and paying for) another image.
 */
export function rememberImage(contentItemId: string, prompt: string, model: string, image: GeneratedImage, now = Date.now()): void {
  for (const [entryKey, entry] of entries) if (entry.expiresAt <= now) entries.delete(entryKey);
  entries.set(key(contentItemId, prompt), { image, model, expiresAt: now + ttlMs });
  while (entries.size > maxEntries) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
}

export function recallImage(contentItemId: string, prompt: string, now = Date.now()): { image: GeneratedImage; model: string } | null {
  const entry = entries.get(key(contentItemId, prompt));
  if (!entry || entry.expiresAt <= now) return null;
  return { image: entry.image, model: entry.model };
}

export function forgetImage(contentItemId: string, prompt: string): void {
  entries.delete(key(contentItemId, prompt));
}
