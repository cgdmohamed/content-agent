import { query } from "./db.js";
import { effectiveHardLimit, estimateCostUsd, estimateTokens, isBudgetExceeded } from "./budget.js";
import { releaseSpend, reserveSpend, settleSpend } from "./usage.js";

export { effectiveHardLimit, isBudgetExceeded };

export type TextProviderName = "anthropic" | "openai" | "perplexity";

export interface GenerateTextInput {
  contentItemId: string;
  operation: string;
  prompt: string;
  maxTokens?: number;
  preferred?: TextProviderName[];
}

export interface GenerateTextResult {
  provider: TextProviderName;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

type ProviderRoutingOperation = "GENERATE_IDEAS" | "RESEARCH_GAPS" | "WRITE_DRAFT" | "REVIEW_DRAFT";

interface ProviderCompletion {
  text: string;
  /** Real token usage reported by the provider, when present. */
  inputTokens?: number;
  outputTokens?: number;
}

interface ProviderConfig {
  name: TextProviderName;
  model: string;
  key?: string;
  generate: (prompt: string, maxTokens: number, key: string, model: string) => Promise<ProviderCompletion>;
}

const providers: ProviderConfig[] = [
  {
    name: "anthropic",
    model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
    key: process.env.ANTHROPIC_API_KEY,
    generate: callAnthropic
  },
  {
    name: "openai",
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    key: process.env.OPENAI_API_KEY,
    generate: callOpenAI
  },
  {
    name: "perplexity",
    model: process.env.PERPLEXITY_MODEL ?? "sonar-pro",
    key: process.env.PERPLEXITY_API_KEY,
    generate: callPerplexity
  }
];

export async function generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
  const preferred = await resolveProviderChain(input.operation, input.preferred ?? ["anthropic", "openai", "perplexity"]);
  const chain = preferred
    .map((name) => providers.find((provider) => provider.name === name))
    .filter((provider): provider is ProviderConfig => Boolean(provider?.key));

  if (chain.length === 0) throw new Error("لا توجد مفاتيح ذكاء اصطناعي مهيأة للعملية النصية.");

  const failures: string[] = [];
  for (const provider of chain) {
    const started = Date.now();
    const maxTokens = input.maxTokens ?? 2500;
    const promptTokens = estimateTokens(input.prompt);
    // Throws (and stops the whole chain) when the monthly hard limit is reached.
    const reservationId = await reserveSpend({
      provider: provider.name,
      model: provider.model,
      operation: input.operation,
      contentItemId: input.contentItemId,
      estimatedCostUsd: estimateCostUsd(provider.name, promptTokens, maxTokens)
    });
    try {
      const completion = await provider.generate(input.prompt, maxTokens, provider.key!, provider.model);
      const durationMs = Date.now() - started;
      const inputTokens = completion.inputTokens ?? promptTokens;
      const outputTokens = completion.outputTokens ?? estimateTokens(completion.text);
      await settleSpend(reservationId, { inputTokens, outputTokens, costUsd: estimateCostUsd(provider.name, inputTokens, outputTokens), durationMs });
      return { provider: provider.name, model: provider.model, text: completion.text, inputTokens, outputTokens, durationMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطأ غير معروف";
      failures.push(`${provider.name}: ${message}`);
      await releaseSpend(reservationId, { durationMs: Date.now() - started, error: message });
    }
  }

  throw new Error(`فشل كل مزودي الذكاء الاصطناعي: ${failures.join(" | ")}`);
}

export function sanitizeProviderChain(value: unknown, fallback: TextProviderName[]): TextProviderName[] {
  if (!Array.isArray(value)) return fallback;
  const allowed: TextProviderName[] = ["anthropic", "openai", "perplexity"];
  const unique = value.filter((provider, index): provider is TextProviderName => allowed.includes(provider) && value.indexOf(provider) === index);
  return unique.length > 0 ? unique : fallback;
}

async function resolveProviderChain(operation: string, fallback: TextProviderName[]): Promise<TextProviderName[]> {
  const routingKey = providerRoutingKey(operation);
  if (!routingKey) return fallback;
  const settings = await query<{ value: { providerRouting?: Record<string, unknown> } }>(
    "SELECT value FROM system_settings WHERE key = 'production_settings'"
  );
  return sanitizeProviderChain(settings.rows[0]?.value.providerRouting?.[routingKey], fallback);
}

function providerRoutingKey(operation: string): keyof Record<"ideas" | "research" | "writing", unknown> | null {
  const map: Record<ProviderRoutingOperation, "ideas" | "research" | "writing"> = {
    GENERATE_IDEAS: "ideas",
    RESEARCH_GAPS: "research",
    WRITE_DRAFT: "writing",
    REVIEW_DRAFT: "writing"
  };
  return map[operation as ProviderRoutingOperation] ?? null;
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
