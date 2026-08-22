import { describe, expect, it } from "vitest";
import { nextAutomatedOperation, shouldAutoContinue } from "../automation.js";
import { effectiveHardLimit, isBudgetExceeded, sanitizeProviderChain } from "../ai.js";
import { sanitizeArticleHtml } from "../html-sanitizer.js";
import { clampNumber, isActiveSiteStatus, providerForOperationResult, shouldAutoSelectFirstIdea } from "../processors.js";

describe("AI budget limits", () => {
  it("blocks calls at or above the hard monthly limit", () => {
    expect(isBudgetExceeded(40, 40)).toBe(true);
    expect(isBudgetExceeded(41, 40)).toBe(true);
    expect(isBudgetExceeded(39.99, 40)).toBe(false);
  });

  it("treats zero hard limit as disabled", () => {
    expect(isBudgetExceeded(999, 0)).toBe(false);
  });

  it("does not let a stale hard limit fall below the monthly budget", () => {
    expect(effectiveHardLimit(50, 40)).toBe(50);
    expect(effectiveHardLimit(30, 40)).toBe(40);
    expect(effectiveHardLimit(30, 0)).toBe(0);
  });

  it("allows configured idea batches up to twenty", () => {
    expect(clampNumber(20, 1, 20)).toBe(20);
    expect(clampNumber(21, 1, 20)).toBe(20);
  });

  it("continues automatic batches without bypassing admin approval", () => {
    expect(shouldAutoSelectFirstIdea("BULK", true)).toBe(true);
    expect(shouldAutoSelectFirstIdea("MANUAL", true)).toBe(false);
    expect(shouldAutoContinue({ status: "DRAFTED", mode: "BULK", auto_publish: true })).toBe(true);
    expect(nextAutomatedOperation("IDEA_SELECTED")).toBe("RESEARCH_GAPS");
    expect(nextAutomatedOperation("REVIEWED")).toBe("GENERATE_IMAGE");
    expect(nextAutomatedOperation("IMAGE_READY")).toBeNull();
    expect(nextAutomatedOperation("APPROVED")).toBeNull();
  });

  it("does not process disabled sites", () => {
    expect(isActiveSiteStatus("ACTIVE")).toBe(true);
    expect(isActiveSiteStatus("DISABLED")).toBe(false);
  });

  it("exposes the provider used by a finished job for operations reporting", () => {
    expect(providerForOperationResult({ provider: "openai" })).toBe("openai");
    expect(providerForOperationResult({ provider: "   " })).toBeNull();
    expect(providerForOperationResult({})).toBeNull();
  });

  it("keeps provider routing valid and unique", () => {
    expect(sanitizeProviderChain(["openai", "openai", "bad", "anthropic"], ["perplexity"])).toEqual(["openai", "anthropic"]);
    expect(sanitizeProviderChain([], ["perplexity"])).toEqual(["perplexity"]);
  });

  it("removes executable HTML before article publishing", () => {
    const html = sanitizeArticleHtml('<p onclick="run()">نص</p><a href="javascript:alert(1)">رابط</a><script>alert(1)</script>');
    expect(html).toContain("<p>نص</p>");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
  });
});
