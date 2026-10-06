import { describe, expect, it } from "vitest";
import { estimateCostUsd, imageCostUsd, ratesFor } from "../budget.js";

describe("AI cost estimation", () => {
  it("prices real token usage per provider", () => {
    expect(estimateCostUsd("anthropic", 1_000_000, 1_000_000, {})).toBe(18);
    expect(estimateCostUsd("openai", 2000, 1000, {})).toBeCloseTo(0.0009, 6);
  });

  it("lets operators override rates and image cost through the environment", () => {
    const env = { AI_PRICE_ANTHROPIC_INPUT_PER_M: "1", AI_PRICE_ANTHROPIC_OUTPUT_PER_M: "5", GEMINI_IMAGE_COST_USD: "0.1" } as NodeJS.ProcessEnv;
    expect(ratesFor("anthropic", env)).toEqual({ input: 1, output: 5 });
    expect(imageCostUsd(env)).toBe(0.1);
    expect(imageCostUsd({} as NodeJS.ProcessEnv)).toBe(0.04);
    expect(ratesFor("openai", { AI_PRICE_OPENAI_INPUT_PER_M: "abc" } as NodeJS.ProcessEnv).input).toBe(0.15);
  });
});
