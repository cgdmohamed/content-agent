import { query } from "./db.js";

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

interface ProviderConfig {
  name: TextProviderName;
  model: string;
  key?: string;
  generate: (prompt: string, maxTokens: number, key: string, model: string) => Promise<string>;
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
  await assertAiBudgetAvailable();
  const preferred = await resolveProviderChain(input.operation, input.preferred ?? ["anthropic", "openai", "perplexity"]);
  const chain = preferred
    .map((name) => providers.find((provider) => provider.name === name))
    .filter((provider): provider is ProviderConfig => Boolean(provider?.key));

  if (chain.length === 0) throw new Error("لا توجد مفاتيح ذكاء اصطناعي مهيأة للعملية النصية.");

  const failures: string[] = [];
  for (const provider of chain) {
    const started = Date.now();
    try {
      const text = await provider.generate(input.prompt, input.maxTokens ?? 2500, provider.key!, provider.model);
      const durationMs = Date.now() - started;
      const inputTokens = estimateTokens(input.prompt);
      const outputTokens = estimateTokens(text);
      await query(
        `INSERT INTO api_usage_logs (provider, model, operation, content_item_id, input_tokens, output_tokens, estimated_cost_usd, duration_ms, success)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [provider.name, provider.model, input.operation, input.contentItemId, inputTokens, outputTokens, estimateCost(provider.name, inputTokens, outputTokens), durationMs]
      );
      return { provider: provider.name, model: provider.model, text, inputTokens, outputTokens, durationMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطأ غير معروف";
      failures.push(`${provider.name}: ${message}`);
      await query(
        `INSERT INTO api_usage_logs (provider, model, operation, content_item_id, duration_ms, success, error)
         VALUES ($1, $2, $3, $4, $5, false, $6)`,
        [provider.name, provider.model, input.operation, input.contentItemId, Date.now() - started, message]
      );
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

async function assertAiBudgetAvailable(): Promise<void> {
  const spend = await query<{ total: string }>(
    "SELECT COALESCE(SUM(estimated_cost_usd), 0)::text AS total FROM api_usage_logs WHERE created_at >= date_trunc('month', now())"
  );
  const settings = await query<{ value: { monthlyAiBudgetUsd?: number; monthlyAiHardLimitUsd?: number } }>(
    "SELECT value FROM system_settings WHERE key = 'production_settings'"
  );
  const hardLimit = effectiveHardLimit(
    settings.rows[0]?.value.monthlyAiBudgetUsd ?? Number(process.env.MONTHLY_AI_BUDGET_USD ?? 30),
    settings.rows[0]?.value.monthlyAiHardLimitUsd ?? Number(process.env.MONTHLY_AI_HARD_LIMIT_USD ?? 40)
  );
  if (isBudgetExceeded(Number(spend.rows[0]?.total ?? 0), hardLimit)) {
    throw new Error("تم تجاوز حد ميزانية الذكاء الاصطناعي الصارم لهذا الشهر.");
  }
}

export function effectiveHardLimit(monthlyBudget: number, hardLimit: number): number {
  if (hardLimit <= 0) return 0;
  return Math.max(monthlyBudget, hardLimit);
}

export function isBudgetExceeded(monthlySpend: number, hardLimit: number): boolean {
  return hardLimit > 0 && monthlySpend >= hardLimit;
}

async function callOpenAI(prompt: string, maxTokens: number, key: string, model: string): Promise<string> {
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
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(`فشل اتصال OpenAI برمز ${response.status}.`);
  return data.choices?.[0]?.message?.content ?? "";
}

async function callPerplexity(prompt: string, maxTokens: number, key: string, model: string): Promise<string> {
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
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(`فشل اتصال Perplexity برمز ${response.status}.`);
  return data.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(prompt: string, maxTokens: number, key: string, model: string): Promise<string> {
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
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(`فشل اتصال Anthropic برمز ${response.status}.`);
  return data.content?.map((item) => item.text ?? "").join("\n") ?? "";
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateCost(provider: TextProviderName, inputTokens: number, outputTokens: number): number {
  const rates: Record<TextProviderName, { input: number; output: number }> = {
    anthropic: { input: 3, output: 15 },
    openai: { input: 0.15, output: 0.6 },
    perplexity: { input: 1, output: 1 }
  };
  const rate = rates[provider];
  return Number(((inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output).toFixed(6));
}
