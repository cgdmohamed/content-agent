export type PricedProvider = "anthropic" | "openai" | "perplexity";

interface Rate {
  /** USD per one million tokens. */
  input: number;
  output: number;
}

const defaultRates: Record<PricedProvider, Rate> = {
  anthropic: { input: 3, output: 15 },
  openai: { input: 0.15, output: 0.6 },
  perplexity: { input: 1, output: 1 }
};

const defaultImageCostUsd = 0.04;

export function effectiveHardLimit(monthlyBudget: number, hardLimit: number): number {
  if (hardLimit <= 0) return 0;
  return Math.max(monthlyBudget, hardLimit);
}

export function isBudgetExceeded(monthlySpend: number, hardLimit: number): boolean {
  return hardLimit > 0 && monthlySpend >= hardLimit;
}

function envNumber(env: NodeJS.ProcessEnv, name: string): number | null {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Per-provider rates, overridable with AI_PRICE_<PROVIDER>_INPUT_PER_M / AI_PRICE_<PROVIDER>_OUTPUT_PER_M (USD per 1M tokens). */
export function ratesFor(provider: PricedProvider, env: NodeJS.ProcessEnv = process.env): Rate {
  const key = provider.toUpperCase();
  return {
    input: envNumber(env, `AI_PRICE_${key}_INPUT_PER_M`) ?? defaultRates[provider].input,
    output: envNumber(env, `AI_PRICE_${key}_OUTPUT_PER_M`) ?? defaultRates[provider].output
  };
}

export function estimateCostUsd(provider: PricedProvider, inputTokens: number, outputTokens: number, env: NodeJS.ProcessEnv = process.env): number {
  const rate = ratesFor(provider, env);
  return Number(((inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output).toFixed(6));
}

export function imageCostUsd(env: NodeJS.ProcessEnv = process.env): number {
  return envNumber(env, "GEMINI_IMAGE_COST_USD") ?? defaultImageCostUsd;
}

/** Rough pre-call token estimate used only for reservations; settled with the provider's real usage afterwards. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3));
}
