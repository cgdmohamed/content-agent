import { beforeEach, describe, expect, it, vi } from "vitest";
import { dismissToast, getToasts, resetToastsForTests, showToast } from "./toast";

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) });
  vi.useFakeTimers();
  resetToastsForTests();
});

describe("toast store", () => {
  it("adds toasts, auto-dismisses them and keeps errors longer than successes", () => {
    showToast("success", "تم الحفظ");
    showToast("error", "فشل الحفظ", undefined, 5000);
    expect(getToasts().map((item) => item.kind)).toEqual(["success", "error"]);
    vi.advanceTimersByTime(4100);
    expect(getToasts().map((item) => item.kind)).toEqual(["error"]);
    vi.advanceTimersByTime(4000);
    expect(getToasts()).toEqual([]);
  });

  it("ignores empty messages and duplicates within a second", () => {
    expect(showToast("success", "  ")).toBeNull();
    expect(showToast("success", "تم", 4000, 10_000)).not.toBeNull();
    expect(showToast("success", "تم", 4000, 10_500)).toBeNull();
    expect(showToast("success", "تم", 4000, 11_500)).not.toBeNull();
  });

  it("shows at most four toasts and supports manual dismissal", () => {
    for (let index = 0; index < 6; index += 1) showToast("info", `رسالة ${index}`);
    expect(getToasts()).toHaveLength(4);
    dismissToast(getToasts()[0]!.id);
    expect(getToasts()).toHaveLength(3);
  });
});
