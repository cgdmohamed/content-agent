export type ProviderName = "openai" | "anthropic" | "perplexity" | "gemini-image";
export type ProviderOperation = "ideas" | "research" | "writing" | "review" | "image";

export interface GenerateRequest {
  operation: ProviderOperation;
  prompt: string;
  model?: string;
  metadata?: Record<string, string>;
}

export interface GenerateResult {
  provider: ProviderName;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface TextAIProvider {
  name: ProviderName;
  generate(input: GenerateRequest): Promise<GenerateResult>;
}

export interface ProviderAttempt {
  provider: ProviderName;
  success: boolean;
  error?: string;
  durationMs: number;
}

export interface FallbackResult {
  result: GenerateResult;
  attempts: ProviderAttempt[];
}

export async function callProviderChain(
  providers: TextAIProvider[],
  request: GenerateRequest,
  recordAttempt?: (attempt: ProviderAttempt) => Promise<void> | void
): Promise<FallbackResult> {
  const attempts: ProviderAttempt[] = [];
  for (const provider of providers) {
    const startedAt = Date.now();
    try {
      const result = await provider.generate(request);
      const attempt = { provider: provider.name, success: true, durationMs: Date.now() - startedAt };
      attempts.push(attempt);
      await recordAttempt?.(attempt);
      return { result, attempts };
    } catch (error) {
      const attempt = {
        provider: provider.name,
        success: false,
        error: error instanceof Error ? error.message : "خطأ غير معروف من مزود الذكاء الاصطناعي",
        durationMs: Date.now() - startedAt
      };
      attempts.push(attempt);
      await recordAttempt?.(attempt);
    }
  }
  throw new Error(`فشل كل مزودي الذكاء الاصطناعي للعملية ${request.operation}.`);
}

export function estimateCostUsd(inputTokens: number, outputTokens: number, inputPerMillion: number, outputPerMillion: number): number {
  return Number(((inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion).toFixed(6));
}
