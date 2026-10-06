// Tiny external store so toasts can be raised from anywhere (including the QueryClient's MutationCache).

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const maxVisible = 4;
const defaultDurations: Record<ToastKind, number> = { success: 4000, info: 4000, error: 8000 };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const recent = new Map<string, number>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): ToastItem[] {
  return items;
}

export function dismissToast(id: number): void {
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

export function showToast(kind: ToastKind, message: string, durationMs = defaultDurations[kind], now = Date.now()): number | null {
  const text = message.trim();
  if (!text) return null;
  // The same message twice within a second (e.g. a double click) is one toast.
  const signature = `${kind}:${text}`;
  if (now - (recent.get(signature) ?? 0) < 1000) return null;
  recent.set(signature, now);
  if (recent.size > 50) recent.clear();

  const id = nextId++;
  items = [...items, { id, kind, message: text }].slice(-maxVisible);
  emit();
  if (typeof window !== "undefined") window.setTimeout(() => dismissToast(id), durationMs);
  return id;
}

export const toast = {
  success: (message: string) => showToast("success", message),
  error: (message: string) => showToast("error", message),
  info: (message: string) => showToast("info", message)
};

export function resetToastsForTests(): void {
  items = [];
  recent.clear();
  emit();
}
