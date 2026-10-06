// Local safety net for unsaved article edits: survives tab close, navigation and session expiry.
// Every access is wrapped because storage can be unavailable (private mode, blocked site data).

const prefix = "content-agent:draft:";

export interface LocalDraft {
  html: string;
  savedAt: number;
}

export function saveLocalDraft(contentId: string, html: string): void {
  try {
    localStorage.setItem(prefix + contentId, JSON.stringify({ html, savedAt: Date.now() } satisfies LocalDraft));
  } catch {
    // Storage full or unavailable: the beforeunload warning is still active.
  }
}

export function readLocalDraft(contentId: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(prefix + contentId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    return typeof parsed.html === "string" && typeof parsed.savedAt === "number" ? { html: parsed.html, savedAt: parsed.savedAt } : null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(contentId: string): void {
  try {
    localStorage.removeItem(prefix + contentId);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
