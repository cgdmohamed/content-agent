import { findModel, textCostFromUsage, textCostUsd, type ModelProvider, type TextUsage } from "@content-agent/shared";
import { effectiveHardLimit, isBudgetExceeded, ratesFor, estimateTokens, type PricedProvider } from "./budget.js";
import { operationKeyFor, providerKey, resolveChainForContent, resolveChainForSite, sanitizeProviderChain } from "./models.js";
import { releaseSpend, reserveSpend, settleSpend } from "./usage.js";

export { effectiveHardLimit, isBudgetExceeded, sanitizeProviderChain };

export type TextProviderName = "anthropic" | "openai" | "perplexity";

export interface GenerateTextInput {
  /** The article the call is for; omit for site-level work and pass `siteId` instead. */
  contentItemId?: string;
  siteId?: string;
  /** What the spend is attributed to in reports when there is no article (e.g. "تصنيف صفحات الموقع"). */
  label?: string;
  /** Worker operation name, e.g. WRITE_DRAFT; the model chain is resolved from site/system settings. */
  operation: string;
  prompt: string;
  maxTokens?: number;
}

export interface GenerateTextResult {
  provider: TextProviderName;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

interface ProviderCompletion {
  text: string;
  /** Real usage reported by the provider, when present (cache tokens and provider-reported cost included). */
  usage?: TextUsage;
}

interface OpenAiStyleUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  /** Perplexity reports what the call actually cost, including per-request search fees. */
  cost?: { total_cost?: number };
}

/** OpenAI/Perplexity count cached tokens inside prompt_tokens; split them out so each is billed at its own price. */
export function parseOpenAiStyleUsage(usage: OpenAiStyleUsage | undefined): TextUsage | undefined {
  if (!usage || (usage.prompt_tokens === undefined && usage.completion_tokens === undefined)) return undefined;
  const cached = Math.min(usage.prompt_tokens ?? 0, usage.prompt_tokens_details?.cached_tokens ?? 0);
  const reported = usage.cost?.total_cost;
  return {
    inputTokens: Math.max(0, (usage.prompt_tokens ?? 0) - cached),
    outputTokens: usage.completion_tokens ?? 0,
    cacheReadTokens: cached,
    ...(typeof reported === "number" ? { reportedCostUsd: reported } : {})
  };
}

/** Anthropic's input_tokens already excludes cache reads and writes, which are reported separately. */
export function parseAnthropicUsage(usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined): TextUsage | undefined {
  if (!usage || (usage.input_tokens === undefined && usage.output_tokens === undefined)) return undefined;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0
  };
}

const callers: Record<TextProviderName, (prompt: string, maxTokens: number, key: string, model: string) => Promise<ProviderCompletion>> = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  perplexity: callPerplexity
};

export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  const operationKey = operationKeyFor(input.operation);
  const resolved = input.contentItemId
    ? await resolveChainForContent(input.contentItemId, operationKey)
    : input.siteId
      ? await resolveChainForSite(input.siteId, operationKey)
      : (() => { throw new Error("generateText يحتاج contentItemId أو siteId."); })();
  const chain = resolved.chain.filter((ref): ref is typeof ref & { provider: TextProviderName } => ref.provider !== "gemini");
  if (chain.length === 0) throw new Error("لا توجد مفاتيح ذكاء اصطناعي مهيأة للعملية النصية.");

  const failures: string[] = [];
  for (const ref of chain) {
    const started = Date.now();
    const maxTokens = input.maxTokens ?? 2500;
    const promptTokens = estimateTokens(input.prompt);
    const spec = findModel(resolved.catalog, ref);
    const rates = ratesFor(ref.provider as PricedProvider);
    // Throws (and stops the whole chain) when the monthly hard limit is reached.
    const reservationId = await reserveSpend({
      provider: ref.provider,
      model: ref.model,
      operation: input.operation,
      contentItemId: input.contentItemId,
      siteId: input.siteId,
      label: input.label,
      estimatedCostUsd: textCostUsd(spec, rates, promptTokens, maxTokens)
    });
    try {
      const completion = await callers[ref.provider](input.prompt, maxTokens, providerKey(ref.provider as ModelProvider)!, ref.model);
      const durationMs = Date.now() - started;
      const usage: TextUsage = completion.usage ?? { inputTokens: promptTokens, outputTokens: estimateTokens(completion.text) };
      const cost = textCostFromUsage(spec, rates, usage);
      await settleSpend(reservationId, {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        costUsd: cost.costUsd,
        costSource: cost.source,
        durationMs
      });
      return {
        provider: ref.provider,
        model: ref.model,
        text: completion.text,
        inputTokens: usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
        outputTokens: usage.outputTokens,
        durationMs
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطأ غير معروف";
      failures.push(`${ref.provider}/${ref.model}: ${message}`);
      await releaseSpend(reservationId, { durationMs: Date.now() - started, error: message });
    }
  }

  throw new Error(`فشل كل مزودي الذكاء الاصطناعي: ${failures.join(" | ")}`);
}

async function callOpenAI(prompt: string, maxTokens: number, key: string, model: string): Promise<ProviderCompletion> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: maxTokens
    }),
    signal: AbortSignal.timeout(120_000)
  });
  const data = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) throw new Error(`فشل اتصال OpenAI برمز ${response.status}.`);
  return { text: data.choices?.[0]?.message?.content ?? "", usage: parseOpenAiStyleUsage(data.usage) };
}

async function callPerplexity(prompt: string, maxTokens: number, key: string, model: string): Promise<ProviderCompletion> {
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: maxTokens
    }),
    signal: AbortSignal.timeout(120_000)
  });
  const data = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) throw new Error(`فشل اتصال Perplexity برمز ${response.status}.`);
  return { text: data.choices?.[0]?.message?.content ?? "", usage: parseOpenAiStyleUsage(data.usage) };
}

async function callAnthropic(prompt: string, maxTokens: number, key: string, model: string): Promise<ProviderCompletion> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }]
    }),
    signal: AbortSignal.timeout(120_000)
  });
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }; error?: { message?: string } };
  if (!response.ok) throw new Error(`فشل اتصال Anthropic برمز ${response.status}.`);
  return { text: data.content?.map((item) => item.text ?? "").join("\n") ?? "", usage: parseAnthropicUsage(data.usage) };
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: OpenAiStyleUsage;
  error?: { message?: string };
}
