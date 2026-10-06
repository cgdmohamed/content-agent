import {
  mergeModelCatalog,
  modelOperations,
  resolveModelChain,
  sanitizeAllowedModels,
  sanitizeOperationModels,
  type ImageSize,
  type ModelOperation,
  type ModelProvider,
  type ModelRef,
  type ModelSpec
} from "@content-agent/shared";
import { query } from "./db.js";

type TextProviderName = "anthropic" | "openai" | "perplexity";

export interface ResolvedModelChain {
  operation: ModelOperation;
  chain: ModelRef[];
  catalog: ModelSpec[];
  imageSize: ImageSize | null;
}

interface StoredSettings {
  providerRouting?: { ideas?: unknown; research?: unknown; writing?: unknown };
  operationModels?: unknown;
  customModels?: ModelSpec[];
  imageSize?: ImageSize | null;
}

const providerKeys: Record<ModelProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  gemini: "GEMINI_API_KEY"
};

export function isProviderConfigured(provider: ModelProvider, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[providerKeys[provider]]?.trim());
}

export function providerKey(provider: ModelProvider): string | undefined {
  return process.env[providerKeys[provider]]?.trim() || undefined;
}

export function operationKeyFor(workerOperation: string): ModelOperation {
  const match = modelOperations.find((item) => item.workerOperation === workerOperation);
  if (!match) throw new Error(`عملية ذكاء اصطناعي غير معروفة: ${workerOperation}`);
  return match.key;
}

export function sanitizeProviderChain(value: unknown, fallback: TextProviderName[]): TextProviderName[] {
  if (!Array.isArray(value)) return fallback;
  const allowed: TextProviderName[] = ["anthropic", "openai", "perplexity"];
  const unique = value.filter((provider, index): provider is TextProviderName => allowed.includes(provider) && value.indexOf(provider) === index);
  return unique.length > 0 ? unique : fallback;
}

function envModel(provider: TextProviderName, env: NodeJS.ProcessEnv): string {
  const defaults = { anthropic: "claude-3-5-sonnet-latest", openai: "gpt-4o-mini", perplexity: "sonar-pro" };
  const names = { anthropic: "ANTHROPIC_MODEL", openai: "OPENAI_MODEL", perplexity: "PERPLEXITY_MODEL" };
  return env[names[provider]]?.trim() || defaults[provider];
}

/** Chain used when neither the site nor the system settings choose models: the legacy provider order with env-configured models. */
export function defaultModelChain(operation: ModelOperation, routing: StoredSettings["providerRouting"], env: NodeJS.ProcessEnv = process.env): ModelRef[] {
  if (operation === "image") return [{ provider: "gemini", model: env.GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-image" }];
  const providers =
    operation === "ideas"
      ? sanitizeProviderChain(routing?.ideas, ["perplexity", "openai", "anthropic"])
      : operation === "research"
        ? sanitizeProviderChain(routing?.research, ["perplexity", "anthropic", "openai"])
        : sanitizeProviderChain(routing?.writing, ["anthropic", "openai"]);
  return providers.map((provider) => ({ provider, model: envModel(provider, env) }));
}

export async function resolveChainForContent(contentItemId: string, operation: ModelOperation): Promise<ResolvedModelChain> {
  const site = await query<{ allowed_models: unknown; operation_models: unknown }>(
    `SELECT s.allowed_models, s.operation_models
     FROM content_items c JOIN sites s ON s.id = c.site_id
     WHERE c.id = $1`,
    [contentItemId]
  );
  const settings = await query<{ value: StoredSettings }>("SELECT value FROM system_settings WHERE key = 'production_settings'");
  const stored = settings.rows[0]?.value ?? {};
  const catalog = mergeModelCatalog(stored.customModels);
  const siteRow = site.rows[0];
  const chain = resolveModelChain({
    operation,
    siteOverride: sanitizeOperationModels(siteRow?.operation_models, catalog)[operation],
    globalChain: sanitizeOperationModels(stored.operationModels, catalog)[operation],
    defaultChain: defaultModelChain(operation, stored.providerRouting),
    allowed: sanitizeAllowedModels(siteRow?.allowed_models, catalog),
    isProviderConfigured: (provider) => isProviderConfigured(provider)
  });
  const label = modelOperations.find((item) => item.key === operation)?.label ?? operation;
  if (chain.length === 0) {
    throw new Error(`لا يوجد موديل متاح لعملية «${label}» لهذا الموقع. راجع الموديلات المسموحة للموقع ومفاتيح المزودين.`);
  }
  return { operation, chain, catalog, imageSize: stored.imageSize ?? null };
}
