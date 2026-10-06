import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalDraft, readLocalDraft, saveLocalDraft } from "./draft-storage";

function installStorage(): void {
  const data = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    length: 0
  };
}

describe("local article draft", () => {
  beforeEach(installStorage);

  it("round-trips and clears a draft", () => {
    saveLocalDraft("a1", "<p>نص</p>");
    expect(readLocalDraft("a1")?.html).toBe("<p>نص</p>");
    clearLocalDraft("a1");
    expect(readLocalDraft("a1")).toBeNull();
  });

  it("ignores corrupt entries and unavailable storage", () => {
    localStorage.setItem("content-agent:draft:a2", "not json");
    expect(readLocalDraft("a2")).toBeNull();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); }
    };
    expect(() => saveLocalDraft("a3", "x")).not.toThrow();
    expect(readLocalDraft("a3")).toBeNull();
    expect(() => clearLocalDraft("a3")).not.toThrow();
  });
});
