import { describe, expect, it } from "vitest";
import {
  builtinModels,
  imageCostFromUsage,
  imageFailureCostFromUsage,
  textCostFromUsage,
  mergeModelCatalog,
  modelKey,
  parseCustomModel,
  resolveModelChain,
  sanitizeAllowedModels,
  sanitizeOperationModels
} from "../models.js";

const catalog = mergeModelCatalog(undefined);
const always = () => true;

describe("model catalog", () => {
  it("lets a custom model override a built-in price", () => {
    const merged = mergeModelCatalog([parseCustomModel({ provider: "openai", model: "gpt-4o-mini", kind: "text", inputPerM: 9, outputPerM: 9 })]);
    expect(merged.find((spec) => spec.model === "gpt-4o-mini")?.inputPerM).toBe(9);
    expect(merged.length).toBe(builtinModels.length);
  });

  it("validates custom models", () => {
    expect(() => parseCustomModel({ provider: "openai", model: "bad model!", kind: "text", inputPerM: 1, outputPerM: 1 })).toThrow();
    expect(() => parseCustomModel({ provider: "openai", model: "x", kind: "image", imageUsd: 1 })).toThrow("Gemini");
    expect(() => parseCustomModel({ provider: "openai", model: "x", kind: "text", inputPerM: 1 })).toThrow("مطلوب");
    expect(parseCustomModel({ provider: "gemini", model: "img-1", kind: "image", imageUsd: "0.07" }).imageUsd).toBe(0.07);
  });

  it("drops unknown models and wrong kinds from per-operation settings", () => {
    const result = sanitizeOperationModels(
      {
        writing: [{ provider: "anthropic", model: "claude-3-5-sonnet-latest" }, { provider: "anthropic", model: "nope" }, { provider: "anthropic", model: "claude-3-5-sonnet-latest" }],
        image: [{ provider: "openai", model: "gpt-4o" }],
        ideas: "bad"
      },
      catalog
    );
    expect(result.writing).toEqual([{ provider: "anthropic", model: "claude-3-5-sonnet-latest" }]);
    expect(result.image).toBeUndefined();
    expect(result.ideas).toBeUndefined();
  });

  it("treats an empty allow-list as unrestricted", () => {
    expect(sanitizeAllowedModels([], catalog)).toBeNull();
    expect(sanitizeAllowedModels(["openai:gpt-4o", "x:y"], catalog)).toEqual(["openai:gpt-4o"]);
  });
});

describe("resolveModelChain", () => {
  const defaultChain = [
    { provider: "anthropic" as const, model: "claude-3-5-sonnet-latest" },
    { provider: "openai" as const, model: "gpt-4o-mini" }
  ];

  it("prefers the site override, then the global chain, then defaults", () => {
    const siteOverride = [{ provider: "openai" as const, model: "gpt-4o" }];
    const globalChain = [{ provider: "perplexity" as const, model: "sonar" }];
    expect(resolveModelChain({ operation: "writing", siteOverride, globalChain, defaultChain, isProviderConfigured: always })).toEqual(siteOverride);
    expect(resolveModelChain({ operation: "writing", globalChain, defaultChain, isProviderConfigured: always })).toEqual(globalChain);
    expect(resolveModelChain({ operation: "writing", defaultChain, isProviderConfigured: always })).toEqual(defaultChain);
  });

  it("applies the site allow-list and skips providers without keys", () => {
    const chain = resolveModelChain({
      operation: "writing",
      defaultChain,
      allowed: [modelKey(defaultChain[1]!)],
      isProviderConfigured: () => true
    });
    expect(chain).toEqual([defaultChain[1]]);
    expect(resolveModelChain({ operation: "writing", defaultChain, isProviderConfigured: (provider) => provider !== "anthropic" })).toEqual([defaultChain[1]]);
  });
});

describe("imageCostFromUsage", () => {
  it("uses reported image tokens when the model has a token price", () => {
    const spec = { imageUsd: 0.039, imageOutputPerM: 30 };
    expect(imageCostFromUsage(spec, 0.04, { imageOutputTokens: 1290 })).toBeCloseTo(0.0387, 4);
    expect(imageCostFromUsage(spec, 0.04, undefined)).toBe(0.039);
    expect(imageCostFromUsage({ imageUsd: 0.1 }, 0.04, { imageOutputTokens: 5000 })).toBe(0.1);
    expect(imageCostFromUsage(undefined, 0.04)).toBe(0.04);
  });
});

describe("cost from real provider usage (matches the invoices)", () => {
  // Agent API invoice: 63,356 cache-write @0.25, 83,712 cache-read @0.02, 14,218 output @1.2, 1,872 uncached input @0.2 (USD per 1M)
  const agentApi = { inputPerM: 0.2, outputPerM: 1.2, cachedInputPerM: 0.02, cacheWritePerM: 0.25 };

  it("bills every token class at its own price instead of one flat input price", () => {
    const usage = { inputTokens: 1_872, outputTokens: 14_218, cacheReadTokens: 83_712, cacheWriteTokens: 63_356 };
    const exact = textCostFromUsage(agentApi, { input: 3, output: 15 }, usage);
    expect(exact.costUsd).toBeCloseTo(0.034949, 5); // the invoice shows $0.03
    expect(exact.source).toBe("estimated");
    // Pricing the same call as plain input/output (what the app used to do) is more than 10x off.
    const naive = textCostFromUsage({ inputPerM: 3, outputPerM: 15 }, { input: 3, output: 15 }, { inputTokens: 1_872 + 83_712 + 63_356, outputTokens: 14_218 });
    expect(naive.costUsd).toBeGreaterThan(exact.costUsd * 10);
  });

  it("trusts the cost a provider reports about itself", () => {
    const result = textCostFromUsage(agentApi, { input: 3, output: 15 }, { inputTokens: 10, outputTokens: 10, reportedCostUsd: 0.0123456789 });
    expect(result).toEqual({ costUsd: 0.012346, source: "reported" });
    expect(textCostFromUsage(agentApi, { input: 3, output: 15 }, { inputTokens: 10, outputTokens: 10, reportedCostUsd: Number.NaN }).source).toBe("estimated");
  });

  it("adds a flat per-request fee when the provider does not report cost", () => {
    expect(textCostFromUsage({ inputPerM: 1, outputPerM: 1, requestUsd: 0.005 }, { input: 1, output: 1 }, { inputTokens: 1000, outputTokens: 1000 }).costUsd).toBeCloseTo(0.007, 6);
  });

  it("prices a Gemini 3 Pro Image call as image tokens + text/thinking tokens (6 images ~ $0.83)", () => {
    const pro = builtinModels.find((spec) => spec.model === "gemini-3-pro-image-preview")!;
    // One 1K/2K image is 1,120 image tokens at $120/M = $0.1344; ~670 text/thinking tokens at $12/M add under a cent.
    const perImage = imageCostFromUsage(pro, 0.134, { imageOutputTokens: 1_120, textInputTokens: 60, textOutputTokens: 670 });
    expect(perImage).toBeCloseTo(0.1344 + 0.00012 + 0.00804, 5);
    expect(perImage * 6).toBeCloseTo(0.83, 1);
    expect(imageCostFromUsage(pro, 0.134, { imageOutputTokens: 2_000 })).toBeCloseTo(0.24, 5); // 4K
  });

  it("bills the text tokens of a response that returned no image, and nothing when usage is unknown", () => {
    const pro = builtinModels.find((spec) => spec.model === "gemini-3-pro-image-preview")!;
    expect(imageFailureCostFromUsage(pro, { textInputTokens: 100, textOutputTokens: 500 })).toBeCloseTo(0.0062, 6);
    expect(imageFailureCostFromUsage(pro, undefined)).toBe(0);
  });
});
