import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** The browser could not load a code-split file: after a new deploy the old file names no longer exist on the server. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk .* failed|chunkloaderror/i.test(message);
}

const reloadKey = "content-agent:chunk-reload";
const reloadCooldownMs = 30_000;

/**
 * Reloads the page once so it picks up the new version. A second failure within the cooldown is a real problem
 * (e.g. the server is down), so it is left to the error screen instead of looping.
 */
export function reloadForNewVersion(
  now = Date.now(),
  reload: () => void = () => window.location.reload(),
  storage: Pick<Storage, "getItem" | "setItem"> = window.sessionStorage
): boolean {
  try {
    const last = Number(storage.getItem(reloadKey) ?? 0);
    if (last && now - last < reloadCooldownMs) return false;
    storage.setItem(reloadKey, String(now));
  } catch {
    return false; // storage unavailable: cannot guard against a reload loop
  }
  reload();
  return true;
}

/** `lazy()` that recovers from a stale deploy by reloading once instead of showing a crash screen. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyView<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (isChunkLoadError(error) && reloadForNewVersion()) return new Promise<{ default: T }>(() => undefined);
      throw error;
    }
  });
}
