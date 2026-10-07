import { describe, expect, it } from "vitest";
import { imageUsageFrom } from "../gemini-image.js";
import { forgetImage, recallImage, rememberImage } from "../image-cache.js";
import { parseAnthropicUsage, parseOpenAiStyleUsage } from "../ai.js";
import { defaultModelChain, isProviderConfigured, operationKeyFor } from "../models.js";

describe("default model chains", () => {
  it("keeps the legacy provider order with env-configured models", () => {
    const env = { ANTHROPIC_MODEL: "claude-sonnet-5-5" } as NodeJS.ProcessEnv;
    expect(defaultModelChain("writing", undefined, env)).toEqual([
      { provider: "anthropic", model: "claude-sonnet-5-5" },
      { provider: "openai", model: "gpt-4o-mini" }
    ]);
    expect(defaultModelChain("ideas", { ideas: ["openai"] }, env)).toEqual([{ provider: "openai", model: "gpt-4o-mini" }]);
    expect(defaultModelChain("image", undefined, { GEMINI_IMAGE_MODEL: "gemini-2.5-flash-image" } as NodeJS.ProcessEnv)).toEqual([
      { provider: "gemini", model: "gemini-2.5-flash-image" }
    ]);
  });

  it("maps worker operations to model operations and checks provider keys", () => {
    expect(operationKeyFor("OPTIMIZE_LINKS")).toBe("links");
    expect(operationKeyFor("GENERATE_IMAGE")).toBe("image");
    expect(() => operationKeyFor("PUBLISH")).toThrow();
    expect(isProviderConfigured("openai", { OPENAI_API_KEY: " sk " } as NodeJS.ProcessEnv)).toBe(true);
    expect(isProviderConfigured("openai", { OPENAI_API_KEY: "  " } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("Gemini usage", () => {
  it("separates image output tokens from text tokens", () => {
    expect(
      imageUsageFrom({ promptTokenCount: 20, candidatesTokensDetails: [{ modality: "TEXT", tokenCount: 30 }, { modality: "IMAGE", tokenCount: 1290 }] })
    ).toEqual({ imageOutputTokens: 1290, textInputTokens: 20, textOutputTokens: 30 });
    expect(imageUsageFrom(undefined)).toBeUndefined();
  });
});

describe("image cache", () => {
  const image = { bytes: Buffer.from("x"), mimeType: "image/png" };

  it("reuses a paid-for image until it is forgotten or expires", () => {
    rememberImage("c1", "prompt", "m", image, 1000);
    expect(recallImage("c1", "prompt", 2000)?.model).toBe("m");
    expect(recallImage("c1", "other prompt", 2000)).toBeNull();
    expect(recallImage("c1", "prompt", 1000 + 31 * 60 * 1000)).toBeNull();
    rememberImage("c2", "p", "m", image, 1000);
    forgetImage("c2", "p");
    expect(recallImage("c2", "p", 1500)).toBeNull();
  });
});

describe("provider usage parsing", () => {
  it("splits OpenAI cached tokens out of prompt_tokens so they are billed at the cached price", () => {
    expect(parseOpenAiStyleUsage({ prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 600 } })).toEqual({ inputTokens: 400, outputTokens: 200, cacheReadTokens: 600 });
    expect(parseOpenAiStyleUsage({ prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 99 } })?.inputTokens).toBe(0); // never negative
    expect(parseOpenAiStyleUsage(undefined)).toBeUndefined();
  });

  it("keeps the cost a provider reports (Perplexity usage.cost.total_cost)", () => {
    expect(parseOpenAiStyleUsage({ prompt_tokens: 100, completion_tokens: 50, cost: { total_cost: 0.0123 } })?.reportedCostUsd).toBe(0.0123);
  });

  it("reads Anthropic cache reads/writes, which input_tokens already excludes", () => {
    expect(parseAnthropicUsage({ input_tokens: 50, output_tokens: 20, cache_read_input_tokens: 900, cache_creation_input_tokens: 100 })).toEqual({ inputTokens: 50, outputTokens: 20, cacheReadTokens: 900, cacheWriteTokens: 100 });
  });
});
