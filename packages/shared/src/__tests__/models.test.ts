import { describe, expect, it } from "vitest";
import {
  builtinModels,
  imageCostFromUsage,
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
