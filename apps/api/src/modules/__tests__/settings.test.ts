import { describe, expect, it } from "vitest";
import { assertBudgetLimits, effectiveHardLimit, maskSecretTail } from "../settings.module.js";

describe("settings secret masking", () => {
  it("shows only a safe key tail", () => {
    expect(maskSecretTail("sk-production-secret-1234")).toBe("••••••••1234");
    expect(maskSecretTail("")).toBeNull();
    expect(maskSecretTail(undefined)).toBeNull();
  });
});

describe("settings budget limits", () => {
  it("rejects a hard AI limit below the monthly budget", () => {
    expect(() => assertBudgetLimits({ monthlyAiBudgetUsd: 50, monthlyAiHardLimitUsd: 40 })).toThrow("الحد الصارم");
  });

  it("normalizes stale hard limits for display", () => {
    expect(effectiveHardLimit(50, 40)).toBe(50);
    expect(effectiveHardLimit(50, 0)).toBe(0);
  });
});
