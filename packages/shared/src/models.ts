// Model catalog and per-operation routing. Browser-safe: used by the API, the worker and the web app.

export type ModelProvider = "anthropic" | "openai" | "perplexity" | "gemini";
export type ModelKind = "text" | "image";
export type ModelOperation = "ideas" | "research" | "writing" | "review" | "links" | "translation" | "image";
export type ImageSize = "1K" | "2K" | "4K";

export interface ModelRef {
  provider: ModelProvider;
  model: string;
}

export interface ModelSpec extends ModelRef {
  label: string;
  kind: ModelKind;
  /** USD per 1M tokens (text models; for image models these are the prices of the text/thinking tokens). */
  inputPerM?: number;
  outputPerM?: number;
  /** USD per 1M input tokens served from the provider's prompt cache (defaults to inputPerM). */
  cachedInputPerM?: number;
  /** USD per 1M input tokens written to the cache (defaults to inputPerM). */
  cacheWritePerM?: number;
  /** Flat USD charged per request on top of tokens (e.g. web-search fees), used when the provider reports no cost. */
  requestUsd?: number;
  /** Flat USD per generated image (image models); used to reserve budget and as the settled cost when tokens are not reported. */
  imageUsd?: number;
  /** USD per 1M image output tokens; when set and the API reports usage, the real cost is computed from tokens. */
  imageOutputPerM?: number;
  /** Added by an admin from the Settings screen. */
  custom?: boolean;
  /** Price is an assumption the operator should verify. */
  estimated?: boolean;
}

export const modelOperations: Array<{ key: ModelOperation; label: string; kind: ModelKind; workerOperation: string }> = [
  { key: "ideas", label: "توليد الأفكار", kind: "text", workerOperation: "GENERATE_IDEAS" },
  { key: "research", label: "بحث المنافسين", kind: "text", workerOperation: "RESEARCH_GAPS" },
  { key: "writing", label: "كتابة المسودة", kind: "text", workerOperation: "WRITE_DRAFT" },
  { key: "review", label: "المراجعة", kind: "text", workerOperation: "REVIEW_DRAFT" },
  { key: "links", label: "الروابط الداخلية", kind: "text", workerOperation: "OPTIMIZE_LINKS" },
  { key: "translation", label: "الترجمة", kind: "text", workerOperation: "TRANSLATE_CONTENT" },
  { key: "image", label: "الصورة المميزة", kind: "image", workerOperation: "GENERATE_IMAGE" }
];

export const modelProviders: ModelProvider[] = ["anthropic", "openai", "perplexity", "gemini"];

// Prices are list prices at the time of writing; override or add models from Settings when they change.
export const builtinModels: ModelSpec[] = [
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", kind: "text", inputPerM: 1, outputPerM: 5, cachedInputPerM: 0.1, cacheWritePerM: 1.25 },
  { provider: "anthropic", model: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", kind: "text", inputPerM: 3, outputPerM: 15, cachedInputPerM: 0.3, cacheWritePerM: 3.75 },
  { provider: "anthropic", model: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", kind: "text", inputPerM: 3, outputPerM: 15, cachedInputPerM: 0.3, cacheWritePerM: 3.75, estimated: true },
  { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini", kind: "text", inputPerM: 0.15, outputPerM: 0.6, cachedInputPerM: 0.075 },
  { provider: "openai", model: "gpt-4.1-mini", label: "GPT-4.1 mini", kind: "text", inputPerM: 0.4, outputPerM: 1.6, cachedInputPerM: 0.1 },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o", kind: "text", inputPerM: 2.5, outputPerM: 10, cachedInputPerM: 1.25 },
  { provider: "openai", model: "gpt-4.1", label: "GPT-4.1", kind: "text", inputPerM: 2, outputPerM: 8, cachedInputPerM: 0.5 },
  { provider: "perplexity", model: "sonar", label: "Sonar", kind: "text", inputPerM: 1, outputPerM: 1 },
  { provider: "perplexity", model: "sonar-pro", label: "Sonar Pro", kind: "text", inputPerM: 3, outputPerM: 15 },
  { provider: "gemini", model: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", kind: "image", imageUsd: 0.039, imageOutputPerM: 30, inputPerM: 0.3, outputPerM: 2.5 },
  { provider: "gemini", model: "gemini-3-pro-image-preview", label: "Gemini 3 Pro Image (Nano Banana Pro)", kind: "image", imageUsd: 0.134, imageOutputPerM: 120, inputPerM: 2, outputPerM: 12 },
  // Observed bill: 8 images cost 0.82 USD (~0.10 each) with this model, so the old flat 0.04 under-counted the budget.
  { provider: "gemini", model: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", kind: "image", imageUsd: 0.1, estimated: true }
];

export function modelKey(ref: ModelRef): string {
  return `${ref.provider}:${ref.model}`;
}

export function mergeModelCatalog(custom: ModelSpec[] | undefined): ModelSpec[] {
  const byKey = new Map<string, ModelSpec>();
  for (const spec of builtinModels) byKey.set(modelKey(spec), spec);
  // Custom entries win so an admin can correct a built-in price.
  for (const spec of custom ?? []) byKey.set(modelKey(spec), { ...spec, custom: true, estimated: false });
  return [...byKey.values()];
}

export function findModel(catalog: ModelSpec[], ref: ModelRef): ModelSpec | undefined {
  return catalog.find((spec) => spec.provider === ref.provider && spec.model === ref.model);
}

const modelIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

export function isValidModelId(value: unknown): value is string {
  return typeof value === "string" && modelIdPattern.test(value);
}

function isProvider(value: unknown): value is ModelProvider {
  return typeof value === "string" && (modelProviders as string[]).includes(value);
}

/** Validates an admin-supplied custom model. Throws an Arabic message on invalid input. */
export function parseCustomModel(value: unknown): ModelSpec {
  const raw = (value ?? {}) as Record<string, unknown>;
  if (!isProvider(raw.provider)) throw new Error("مزود الموديل غير معروف.");
  if (!isValidModelId(raw.model)) throw new Error("معرّف الموديل غير صالح.");
  const kind: ModelKind = raw.kind === "image" ? "image" : "text";
  if (kind === "image" && raw.provider !== "gemini") throw new Error("الصور مدعومة عبر Gemini فقط.");
  if (kind === "text" && raw.provider === "gemini") throw new Error("Gemini مدعوم للصور فقط.");
  const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 80) : raw.model;
  const nonNegative = (input: unknown): number | undefined => {
    if (input === undefined || input === null || input === "") return undefined;
    const number = Number(input);
    if (!Number.isFinite(number) || number < 0 || number > 10_000) throw new Error("قيمة السعر غير صالحة.");
    return number;
  };
  const spec: ModelSpec = { provider: raw.provider, model: raw.model, label, kind, custom: true };
  if (kind === "text") {
    spec.inputPerM = nonNegative(raw.inputPerM);
    spec.outputPerM = nonNegative(raw.outputPerM);
    if (spec.inputPerM === undefined || spec.outputPerM === undefined) throw new Error("سعر الإدخال والإخراج لكل مليون توكن مطلوب.");
    const cached = nonNegative(raw.cachedInputPerM);
    const written = nonNegative(raw.cacheWritePerM);
    const perRequest = nonNegative(raw.requestUsd);
    if (cached !== undefined) spec.cachedInputPerM = cached;
    if (written !== undefined) spec.cacheWritePerM = written;
    if (perRequest !== undefined) spec.requestUsd = perRequest;
  } else {
    spec.imageUsd = nonNegative(raw.imageUsd);
    spec.imageOutputPerM = nonNegative(raw.imageOutputPerM);
    if (spec.imageUsd === undefined) throw new Error("سعر الصورة الواحدة مطلوب.");
    const textIn = nonNegative(raw.inputPerM);
    const textOut = nonNegative(raw.outputPerM);
    if (textIn !== undefined) spec.inputPerM = textIn;
    if (textOut !== undefined) spec.outputPerM = textOut;
  }
  return spec;
}

/** Keeps only refs that exist in the catalog with the right kind for the operation; drops duplicates. */
export function sanitizeModelChain(value: unknown, operation: ModelOperation, catalog: ModelSpec[]): ModelRef[] {
  if (!Array.isArray(value)) return [];
  const kind = modelOperations.find((item) => item.key === operation)?.kind ?? "text";
  const seen = new Set<string>();
  const chain: ModelRef[] = [];
  for (const entry of value.slice(0, 5)) {
    const ref = entry as Partial<ModelRef> | null;
    if (!ref || !isProvider(ref.provider) || typeof ref.model !== "string") continue;
    const spec = findModel(catalog, { provider: ref.provider, model: ref.model });
    if (!spec || spec.kind !== kind) continue;
    const key = modelKey(spec);
    if (seen.has(key)) continue;
    seen.add(key);
    chain.push({ provider: spec.provider, model: spec.model });
  }
  return chain;
}

export type OperationModels = Partial<Record<ModelOperation, ModelRef[]>>;

export function sanitizeOperationModels(value: unknown, catalog: ModelSpec[]): OperationModels {
  const result: OperationModels = {};
  if (!value || typeof value !== "object") return result;
  for (const { key } of modelOperations) {
    const chain = sanitizeModelChain((value as Record<string, unknown>)[key], key, catalog);
    if (chain.length > 0) result[key] = chain;
  }
  return result;
}

/** Allowed-model list: unknown keys are dropped; an empty result means "no restriction" (null). */
export function sanitizeAllowedModels(value: unknown, catalog: ModelSpec[]): string[] | null {
  if (!Array.isArray(value)) return null;
  const known = new Set(catalog.map(modelKey));
  const keys = [...new Set(value.filter((entry): entry is string => typeof entry === "string" && known.has(entry)))];
  return keys.length > 0 ? keys : null;
}

export interface ResolveChainInput {
  operation: ModelOperation;
  siteOverride?: ModelRef[];
  globalChain?: ModelRef[];
  defaultChain: ModelRef[];
  /** Site-level allow-list of "provider:model" keys; null/undefined means every model is allowed. */
  allowed?: string[] | null;
  isProviderConfigured: (provider: ModelProvider) => boolean;
}

/** Site override > global setting > default chain, then filtered by the site allow-list and configured API keys. */
export function resolveModelChain(input: ResolveChainInput): ModelRef[] {
  const base = input.siteOverride?.length ? input.siteOverride : input.globalChain?.length ? input.globalChain : input.defaultChain;
  const allowed = input.allowed?.length ? new Set(input.allowed) : null;
  return base.filter((ref) => (!allowed || allowed.has(modelKey(ref))) && input.isProviderConfigured(ref.provider));
}

export function textCostUsd(spec: Pick<ModelSpec, "inputPerM" | "outputPerM"> | undefined, fallback: { input: number; output: number }, inputTokens: number, outputTokens: number): number {
  const input = spec?.inputPerM ?? fallback.input;
  const output = spec?.outputPerM ?? fallback.output;
  return Number(((inputTokens / 1_000_000) * input + (outputTokens / 1_000_000) * output).toFixed(6));
}

/**
 * What a text call consumed, normalized across providers:
 * `inputTokens` are the tokens billed at the normal input price (OpenAI's cached tokens are already subtracted
 * from prompt_tokens; Anthropic reports cache tokens separately), cache tokens are billed at their own prices.
 */
export interface TextUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Total cost reported by the provider itself (e.g. Perplexity's usage.cost.total_cost); authoritative when present. */
  reportedCostUsd?: number;
}

export interface CostResult {
  costUsd: number;
  source: "reported" | "estimated";
}

export function textCostFromUsage(
  spec: Pick<ModelSpec, "inputPerM" | "outputPerM" | "cachedInputPerM" | "cacheWritePerM" | "requestUsd"> | undefined,
  fallback: { input: number; output: number },
  usage: TextUsage
): CostResult {
  if (usage.reportedCostUsd !== undefined && Number.isFinite(usage.reportedCostUsd) && usage.reportedCostUsd >= 0) {
    return { costUsd: Number(usage.reportedCostUsd.toFixed(6)), source: "reported" };
  }
  const input = spec?.inputPerM ?? fallback.input;
  const output = spec?.outputPerM ?? fallback.output;
  const cached = spec?.cachedInputPerM ?? input;
  const written = spec?.cacheWritePerM ?? input;
  const tokens =
    usage.inputTokens * input + (usage.cacheReadTokens ?? 0) * cached + (usage.cacheWriteTokens ?? 0) * written + usage.outputTokens * output;
  return { costUsd: Number((tokens / 1_000_000 + (spec?.requestUsd ?? 0)).toFixed(6)), source: "estimated" };
}

export interface ImageUsage {
  imageOutputTokens?: number;
  textInputTokens?: number;
  /** Text and thinking tokens the model produced besides the image. */
  textOutputTokens?: number;
}

/**
 * Real cost from reported tokens when the spec has a token price: image tokens at the image rate plus the text
 * tokens (prompt and thinking) at the text rates, as the provider bills them. Otherwise the flat per-image price.
 */
export function imageCostFromUsage(spec: Pick<ModelSpec, "imageUsd" | "imageOutputPerM" | "inputPerM" | "outputPerM"> | undefined, fallbackUsd: number, usage?: ImageUsage): number {
  const flat = spec?.imageUsd ?? fallbackUsd;
  if (spec?.imageOutputPerM && usage?.imageOutputTokens && usage.imageOutputTokens > 0) {
    const image = usage.imageOutputTokens * spec.imageOutputPerM;
    const text = (usage.textInputTokens ?? 0) * (spec.inputPerM ?? 0) + (usage.textOutputTokens ?? 0) * (spec.outputPerM ?? 0);
    return Number(((image + text) / 1_000_000).toFixed(6));
  }
  return flat;
}

/** A response that carried no image (blocked, text-only) can still be billed for the tokens it used. */
export function imageFailureCostFromUsage(spec: Pick<ModelSpec, "inputPerM" | "outputPerM"> | undefined, usage?: ImageUsage): number {
  if (!usage) return 0;
  const text = (usage.textInputTokens ?? 0) * (spec?.inputPerM ?? 0) + (usage.textOutputTokens ?? 0) * (spec?.outputPerM ?? 0);
  return Number((text / 1_000_000).toFixed(6));
}
