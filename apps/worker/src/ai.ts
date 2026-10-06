import { findModel, textCostUsd, type ModelProvider } from "@content-agent/shared";
import { effectiveHardLimit, isBudgetExceeded, ratesFor, estimateTokens, type PricedProvider } from "./budget.js";
import { operationKeyFor, providerKey, resolveChainForContent, sanitizeProviderChain } from "./models.js";
import { releaseSpend, reserveSpend, settleSpend } from "./usage.js";

export { effectiveHardLimit, isBudgetExceeded, sanitizeProviderChain };

export type TextProviderName = "anthropic" | "openai" | "perplexity";

export interface GenerateTextInput {
  contentItemId: string;
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
  /** Real token usage reported by the provider, when present. */
  inputTokens?: number;
  outputTokens?: number;
}

const callers: Record<TextProviderName, (prompt: string, maxTokens: number, key: string, model: string) => Promise<ProviderCompletion>> = {
  anthropic: callAnthropic,
  openai: callOpenAI,
  perplexity: callPerplexity
};

export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  const resolved = await resolveChainForContent(input.contentItemId, operationKeyFor(input.operation));
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
      estimatedCostUsd: textCostUsd(spec, rates, promptTokens, maxTokens)
    });
    try {
      const completion = await callers[ref.provider](input.prompt, maxTokens, providerKey(ref.provider as ModelProvider)!, ref.model);
      const durationMs = Date.now() - started;
      const inputTokens = completion.inputTokens ?? promptTokens;
      const outputTokens = completion.outputTokens ?? estimateTokens(completion.text);
      await settleSpend(reservationId, { inputTokens, outputTokens, costUsd: textCostUsd(spec, rates, inputTokens, outputTokens), durationMs });
      return { provider: ref.provider, model: ref.model, text: completion.text, inputTokens, outputTokens, durationMs };
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
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens
  };
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
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens
  };
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
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
  if (!response.ok) throw new Error(`فشل اتصال Anthropic برمز ${response.status}.`);
  return {
    text: data.content?.map((item) => item.text ?? "").join("\n") ?? "",
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens
  };
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}
