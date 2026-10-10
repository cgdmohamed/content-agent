import { describe, expect, it, vi } from "vitest";
import { isChunkLoadError, reloadForNewVersion } from "./lazy-view";

describe("stale deploy recovery", () => {
  it("recognises the browsers' messages for a missing code-split file", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x.com/assets/A-1.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 12 failed."))).toBe(true);
    expect(isChunkLoadError(new Error("x.data.map is not a function"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it("reloads once, then leaves a repeated failure to the error screen", () => {
    const reload = vi.fn();
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
    expect(reloadForNewVersion(1_000, reload, storage)).toBe(true);
    expect(reloadForNewVersion(10_000, reload, storage)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForNewVersion(40_000, reload, storage)).toBe(true); // a later deploy may reload again
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not loop when storage is unavailable", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => undefined };
    const reload = vi.fn();
    expect(reloadForNewVersion(1_000, reload, broken)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
