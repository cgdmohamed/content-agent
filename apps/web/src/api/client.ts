import type { ContentState, ProviderName } from "@content-agent/shared";
import type { ContentMode, IntegrationStatus, UserRole, UserStatus } from "@content-agent/types";

const baseUrl = import.meta.env.VITE_API_URL ?? "/api";
type TextProviderName = Exclude<ProviderName, "gemini-image">;

export const sessionExpiredMessage = "يجب تسجيل الدخول أولًا.";
export const sessionExpiredEvent = "content-agent:session-expired";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });
  if (!response.ok) {
    // The login endpoint answers 401 with its own message ("wrong credentials"); every other 401 means the session ended.
    if (response.status === 401 && path !== "/auth/login") {
      // A 401 on any call except the login/session probes means the session ended mid-work.
      if (!path.startsWith("/auth/")) window.dispatchEvent(new Event(sessionExpiredEvent));
      throw new Error(sessionExpiredMessage);
    }
    if (response.status === 413) throw new Error("حجم الطلب أكبر من المسموح. قلّل حجم الملف وحاول مرة أخرى.");
    if (response.status === 403) throw new Error("ليست لديك صلاحية لتنفيذ هذا الإجراء.");
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return "تعذر تنفيذ الطلب.";
  try {
    const parsed = JSON.parse(text) as { message?: string | string[]; error?: string };
    if (Array.isArray(parsed.message)) return parsed.message.join("، ");
    if (parsed.message) return parsed.message;
    if (parsed.error) return parsed.error;
  } catch {
    return text;
  }
  return text;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
}

export type ModelOperationKey = "ideas" | "research" | "writing" | "review" | "links" | "translation" | "pages" | "image";

export interface ModelRefDto {
  provider: "anthropic" | "openai" | "perplexity" | "gemini";
  model: string;
}

export interface ModelSpecDto extends ModelRefDto {
  label: string;
  kind: "text" | "image";
  inputPerM?: number;
  outputPerM?: number;
  imageUsd?: number;
  imageOutputPerM?: number;
  cachedInputPerM?: number;
  cacheWritePerM?: number;
  requestUsd?: number;
  custom?: boolean;
  estimated?: boolean;
  providerConfigured: boolean;
}

export interface ModelOperationDto {
  key: ModelOperationKey;
  label: string;
  kind: "text" | "image";
}

export type OperationModelsDto = Partial<Record<ModelOperationKey, ModelRefDto[]>>;

export interface SiteLanguageDto {
  code: string;
  name: string;
  locale?: string;
  isRtl: boolean;
  isDefault: boolean;
}

export interface TranslationItemDto {
  id: string;
  language: string | null;
  state: ContentState;
  title: string;
  wordpressPostUrl: string | null;
  isSource: boolean;
}

export type PageKindKey = "SERVICE" | "PRODUCT" | "ARTICLE" | "ABOUT" | "CONTACT" | "OTHER";

export interface SitePageDto {
  id: string;
  type: string;
  title: string;
  url: string;
  kind: PageKindKey;
  priority: boolean;
  hidden: boolean;
  /** AUTO = guessed by rules, AI = judged by the model, MANUAL = set by an admin (never overwritten). */
  source: "AUTO" | "AI" | "MANUAL";
  language: string | null;
  summary: string;
}

export interface SitePagesDto {
  syncedAt: string | null;
  total: number;
  hidden: number;
  byKind: Partial<Record<PageKindKey, number>>;
  items: SitePageDto[];
}

export interface SiteDto {
  id: string;
  name: string;
  wordpressUrl: string;
  wordpressUsername?: string;
  market: string;
  language: string;
  writingStandard?: string | null;
  gscProperty?: string | null;
  allowedModels?: string[];
  operationModels?: OperationModelsDto;
  status: "ACTIVE" | "DISABLED";
  wordpressStatus: IntegrationStatus;
  rankMathStatus: IntegrationStatus;
  gscStatus: IntegrationStatus;
  polylangStatus: IntegrationStatus;
  /** Polylang languages synced from WordPress; empty for single-language sites. */
  languages: SiteLanguageDto[];
  /** Languages every approved article is also translated and published in. */
  publishLanguages: string[];
  pagesSyncedAt: string | null;
  contentCount: number;
  publishedCount: number;
}

export interface ContentDto {
  id: string;
  siteId: string;
  site: string;
  batchId: string | null;
  batchName: string | null;
  batchCreatedAt: string | null;
  topic: string;
  title: string;
  targetKeyword: string;
  state: ContentState;
  mode: ContentMode;
  /** Polylang language code of a translation; null for the article in the site's own language. */
  language: string | null;
  translationOf: string | null;
  scheduledDate: string | null;
  score: number;
  updatedAt: string;
  createdAt: string;
}

export interface ContentListParams {
  search?: string;
  siteId?: string;
  state?: string;
  mode?: string;
  minScore?: string;
  updatedFrom?: string;
  updatedTo?: string;
  needsAttention?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ContentListResponseDto {
  items: ContentDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContentDetailDto extends ContentDto {
  wordpressUrl: string;
  direction: "rtl" | "ltr";
  /** The source article and its translations (empty when the article has none). */
  translations: TranslationItemDto[];
  ideas: Array<{ title: string; targetKeyword: string; angle: string }>;
  selectedIdea: { title?: string; targetKeyword?: string; angle?: string } | null;
  draftHtml: string;
  metaDescription: string;
  category: string;
  tags: string[];
  imagePrompt: string;
  imageAlt: string;
  imageUrl: string;
  competitorGaps: string;
  sources: string[];
  activity: ContentActivityDto[];
  versions: ContentVersionDto[];
}

export interface ContentVersionDto {
  id: string;
  actorName: string | null;
  title: string | null;
  contentScore: number;
  changeSummary: string;
  createdAt: string;
}

export interface ContentActivityDto {
  id: string;
  type: "AUDIT" | "JOB" | "USAGE";
  label: string;
  detail: string;
  status: string;
  error?: string | null;
  durationMs?: number | null;
  estimatedCostUsd?: number;
  createdAt: string;
}

export interface JobsDto {
  active: JobRunDto[];
  waiting: JobRunDto[];
  delayed: JobRunDto[];
  failed: JobRunDto[];
  completed: JobRunDto[];
  cancelled: JobRunDto[];
}

export interface JobRunDto {
  id: string;
  contentItemId: string | null;
  title?: string | null;
  topic?: string | null;
  operation: string;
  queueName: string;
  bullJobId?: string | null;
  provider?: string | null;
  attempt: number;
  status: string;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface SessionUserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  exp: number;
}

export interface DashboardDto {
  totalContent: number;
  pipeline: number;
  published: number;
  needsAttention: number;
  scheduled: number;
  monthlyAiSpend: number;
  averageScore: number;
  distribution: Array<{ name: ContentState; value: number }>;
  sites: SiteDto[];
  attention: ContentDto[];
  opportunities: Array<{
    siteId: string;
    site: string;
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    syncedAt: string;
  }>;
}

export interface UsageSiteRowDto {
  siteId: string;
  name: string;
  status: string;
  costUsd: number;
  unconfirmedCostUsd: number;
  calls: number;
  failedCalls: number;
  images: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  contentCreated: number;
  contentPublished: number;
  costPerPublishedUsd: number | null;
  shareOfTotal: number;
}

export interface UsageProviderRowDto {
  provider: string;
  costUsd: number;
  reportedCostUsd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
}

export interface UsageOverviewDto {
  from: string;
  to: string;
  totalCostUsd: number;
  totalCalls: number;
  unattributedCostUsd: number;
  unattributedCalls: number;
  month: { costUsd: number; budgetUsd: number; hardLimitUsd: number };
  byProvider: UsageProviderRowDto[];
  sites: UsageSiteRowDto[];
}

export interface SiteUsageDto {
  siteId: string;
  siteName: string;
  siteStatus: string;
  from: string;
  to: string;
  totals: {
    costUsd: number;
    confirmedCostUsd: number;
    unconfirmedCostUsd: number;
    abandonedCostUsd: number;
    calls: number;
    successfulCalls: number;
    failedCalls: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
    reportedCostUsd: number;
    images: number;
    articlesWithUsage: number;
    costPerArticleUsd: number | null;
    costPerPublishedUsd: number | null;
  };
  activity: {
    contentCreated: number;
    contentPublished: number;
    scheduledNow: number;
    pipelineNow: number;
    failedNow: number;
    jobsCompleted: number;
    jobsFailed: number;
    jobsCancelled: number;
  };
  byOperation: Array<{ operation: string; calls: number; successfulCalls: number; failedCalls: number; costUsd: number; inputTokens: number; outputTokens: number }>;
  byModel: Array<{ provider: string; model: string; calls: number; costUsd: number; inputTokens: number; outputTokens: number; cacheTokens: number }>;
  byDay: Array<{ date: string; costUsd: number; calls: number }>;
  topContent: Array<{ contentItemId: string | null; label: string; status: string | null; deleted: boolean; costUsd: number; calls: number }>;
  recentActivity: Array<{ id: string; eventType: string; message: string; createdAt: string; contentItemId: string | null; actor: string | null }>;
}

export interface SettingsDto {
  monthlyAiBudgetUsd: number;
  monthlyAiHardLimitUsd: number;
  defaultIdeasCount: number;
  defaultMarket: string;
  autoPublishAfterApproval: boolean;
  providerRouting: {
    ideas: TextProviderName[];
    research: TextProviderName[];
    writing: TextProviderName[];
  };
  modelCatalog: ModelSpecDto[];
  operationModels: OperationModelsDto;
  modelOperations: ModelOperationDto[];
  imageSize: "1K" | "2K" | "4K" | null;
  providers: {
    openai: ProviderStatusDto;
    anthropic: ProviderStatusDto;
    perplexity: ProviderStatusDto;
    gemini: ProviderStatusDto;
  };
}

export interface ProviderStatusDto {
  configured: boolean;
  maskedKey: string | null;
  model: string | null;
}

export interface ContentDefaultsDto {
  defaultIdeasCount: number;
  defaultMarket: string;
}

export interface BulkContentResultDto {
  id: string;
  siteId: string;
  acceptedCount: number;
  rejectedCount: number;
  items: Array<{
    id: string;
    topic: string;
    scheduledPublishAt: string | null;
  }>;
  rejected: Array<Record<string, unknown>>;
}

export interface SiteReportDto {
  siteId: string;
  from: string;
  to: string;
  totalContent: number;
  published: number;
  pipeline: number;
  duplicates: number;
  failed: number;
  averageContentScore: number;
  aiCost: number;
  quality: {
    draftedCount: number;
    withInternalLinks: number;
    withoutInternalLinks: number;
    internalLinkCoverage: number;
    withFaq: number;
    faqCoverage: number;
    topKeywords: Array<{ keyword: string; count: number }>;
    recentContent: Array<{
      id: string;
      title: string;
      keyword: string;
      score: number;
      status: ContentState;
      createdAt: string;
      publishedAt: string | null;
    }>;
    lowScore: Array<{
      id: string;
      title: string;
      score: number;
      status: ContentState;
      createdAt: string;
    }>;
  };
  opportunities: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    syncedAt: string;
  }>;
}

export interface SiteAuditDto {
  siteId: string;
  siteName: string;
  scannedAt: string;
  score: number;
  totals: {
    pages: number;
    posts: number;
    issues: number;
    high: number;
    medium: number;
    low: number;
  };
  checklist: Array<{
    id: string;
    label: string;
    count: number;
    priority: "HIGH" | "MEDIUM" | "LOW";
    action: "OPTIMIZE_LINKS" | "EDIT_WORDPRESS" | "ADD_IMAGE" | "ADD_SCHEMA" | "REVIEW_MANUALLY";
  }>;
  pages: Array<{
    id: string;
    type: "post" | "page";
    title: string;
    url: string;
    status: string;
    modified: string | null;
    contentItemId: string | null;
    score: number;
    metrics: {
      wordCount: number;
      h1Count: number;
      h2Count: number;
      internalLinks: number;
      externalLinks: number;
      images: number;
      imagesMissingAlt: number;
      hasFaq: boolean;
      hasCta: boolean;
      titleLength: number;
      slugLength: number;
      excerptLength: number;
    };
    issues: SiteAuditIssueDto[];
  }>;
  issues: SiteAuditIssueDto[];
}

export interface SiteAuditIssueDto {
  id: string;
  pageId: string;
  pageTitle: string;
  pageUrl: string;
  type: "post" | "page";
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: "SEO" | "AEO" | "GEO" | "CONTENT" | "TECHNICAL" | "UX" | "RANKMATH";
  message: string;
  recommendation: string;
  action: "OPTIMIZE_LINKS" | "EDIT_WORDPRESS" | "ADD_IMAGE" | "ADD_SCHEMA" | "REVIEW_MANUALLY";
  contentItemId?: string | null;
}

export interface AuditEventDto {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  contentItemId: string | null;
  contentTitle: string | null;
  siteId: string | null;
  siteName: string | null;
  eventType: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const api = {
  me: () => request<SessionUserDto | null>("/auth/me"),
  login: (body: { email: string; password: string }) => request<{ user: Omit<SessionUserDto, "exp"> }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  content: (params?: ContentListParams) => request<ContentListResponseDto>(`/content${queryString(params)}`),
  contentItem: (id: string) => request<ContentDetailDto>(`/content/${id}`),
  updateContent: (id: string, body: { title?: string; draftHtml?: string; metaDescription?: string; category?: string; imageAlt?: string; tags?: string[] }) =>
    request<ContentDetailDto>(`/content/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  restoreContentVersion: (id: string, versionId: string) => request<ContentDetailDto>(`/content/${id}/versions/${versionId}/restore`, { method: "POST" }),
  selectIdea: (id: string, ideaIndex: number) => request<ContentDetailDto>(`/content/${id}/select-idea`, { method: "POST", body: JSON.stringify({ ideaIndex }) }),
  createContent: (body: { siteId: string; topic: string; ideasCount: number; contentGoal?: string; audience?: string; searchIntent?: string }) =>
    request<ContentDto>("/content", { method: "POST", body: JSON.stringify(body) }),
  deleteContent: (id: string) => request<{ ok: true; id: string }>(`/content/${id}`, { method: "DELETE" }),
  cleanupContent: (ids: string[]) => request<{ ok: true; deleted: string[]; cancelledJobs: number; skipped: Array<{ id: string; reason: string }> }>("/content/cleanup", { method: "POST", body: JSON.stringify({ ids }) }),
  rollbackContentPublishing: (ids: string[]) => request<{ ok: true; rolledBack: string[]; cancelledJobs: number; skipped: Array<{ id: string; reason: string }> }>("/content/rollback-publishing", { method: "POST", body: JSON.stringify({ ids }) }),
  duplicateContent: (id: string) => request<ContentDetailDto>(`/content/${id}/duplicate`, { method: "POST" }),
  retryContent: (id: string) => request<{ statusCode: 202; jobId: string; contentItemId: string }>(`/content/${id}/retry`, { method: "POST" }),
  createBulkContent: (body: {
    siteId: string;
    topics: string;
    startDate: string;
    publishTime: string;
    intervalDays: number;
    autoPublish: boolean;
    ideasCount: number;
    contentGoal?: string;
    audience?: string;
    searchIntent?: string;
  }) => request<BulkContentResultDto>("/content/bulk", { method: "POST", body: JSON.stringify(body) }),
  runContentOperation: (id: string, path: "generate-ideas" | "research" | "write" | "review" | "generate-image" | "publish") =>
    request<{ statusCode: 202; jobId: string; contentItemId: string }>(`/content/${id}/${path}`, { method: "POST" }),
  optimizeContentLinks: (id: string) =>
    request<{ statusCode: 202; jobId: string; contentItemId: string }>(`/content/${id}/optimize-links`, { method: "POST" }),
  skipImage: (id: string) => request<ContentDetailDto>(`/content/${id}/skip-image`, { method: "POST" }),
  uploadContentImage: (id: string, body: { imageBase64: string; mimeType: string; filename: string; imageAlt?: string }) =>
    request<ContentDetailDto>(`/content/${id}/upload-image`, { method: "POST", body: JSON.stringify(body) }),
  createTranslations: (id: string, languages: string[]) => request<{ sourceId: string; created: string[]; existing: string[]; translations: TranslationItemDto[] }>(`/content/${id}/translations`, { method: "POST", body: JSON.stringify({ languages }) }),
  publishTranslations: (id: string) => request<{ sourceId: string; queued: string[]; translations: TranslationItemDto[] }>(`/content/${id}/translations/publish`, { method: "POST" }),
  approveContent: (id: string) => request<ContentDetailDto>(`/content/${id}/approve`, { method: "PATCH" }),
  scheduleContent: (id: string, scheduledPublishAt: string) =>
    request<ContentDetailDto>(`/content/${id}/schedule`, { method: "PATCH", body: JSON.stringify({ scheduledPublishAt }) }),
  sites: () => request<SiteDto[]>("/sites"),
  createSite: (body: {
    name: string;
    wordpressUrl: string;
    wordpressUsername: string;
    wordpressApplicationPassword: string;
    market: string;
    language: string;
    writingStandard?: string;
    gscProperty?: string;
    gscServiceAccountJson?: string;
  }) => request<SiteDto>("/sites", { method: "POST", body: JSON.stringify(body) }),
  updateSite: (id: string, body: {
    name?: string;
    wordpressUrl?: string;
    wordpressUsername?: string;
    wordpressApplicationPassword?: string;
    market?: string;
    language?: string;
    writingStandard?: string;
    gscProperty?: string;
    gscServiceAccountJson?: string;
    status?: "ACTIVE" | "DISABLED";
    allowedModels?: string[];
    operationModels?: OperationModelsDto;
    publishLanguages?: string[];
  }) => request<SiteDto>(`/sites/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSite: (id: string) => request<{ ok: true; id: string; hiddenContent: number }>(`/sites/${id}`, { method: "DELETE" }),
  testWordPress: (id: string) => request<{ id: string; status: IntegrationStatus; message: string }>(`/sites/${id}/test-wordpress`, { method: "POST" }),
  testRankMath: (id: string) => request<{ id: string; status: IntegrationStatus; message: string }>(`/sites/${id}/test-rankmath`, { method: "POST" }),
  testGsc: (id: string) => request<{ id: string; status: IntegrationStatus; message: string }>(`/sites/${id}/test-gsc`, { method: "POST" }),
  syncLanguages: (id: string) => request<{ id: string; status: IntegrationStatus; message: string; languages: SiteLanguageDto[] }>(`/sites/${id}/sync-languages`, { method: "POST" }),
  sitePages: (id: string, params: { kind?: string; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.kind) query.set("kind", params.kind);
    if (params.search) query.set("search", params.search);
    return request<SitePagesDto>(`/sites/${id}/pages${query.size ? `?${query}` : ""}`);
  },
  updateSitePage: (id: string, pageId: string, body: { kind?: PageKindKey; priority?: boolean; hidden?: boolean }) =>
    request<{ ok: true }>(`/sites/${id}/pages/${pageId}`, { method: "PATCH", body: JSON.stringify(body) }),
  classifySitePages: (id: string, onlyNew = false) => request<{ statusCode: 202; jobId: string; siteId: string }>(`/sites/${id}/classify-pages`, { method: "POST", body: JSON.stringify({ onlyNew }) }),
  syncSitePages: (id: string) => request<{ statusCode: 202; jobId: string; siteId: string }>(`/sites/${id}/sync-pages`, { method: "POST" }),
  syncGsc: (id: string) => request<{ statusCode: 202; jobId: string; siteId: string }>(`/sites/${id}/sync-gsc`, { method: "POST" }),
  jobs: () => request<JobsDto>("/jobs"),
  retryJob: (id: string) => request<{ statusCode: 202; jobId: string }>(`/jobs/${id}/retry`, { method: "POST" }),
  cancelJob: (id: string) => request<{ ok: true; id: string }>(`/jobs/${id}/cancel`, { method: "POST" }),
  users: () => request<UserDto[]>("/users"),
  createUser: (body: { name: string; email: string; password: string; role: UserRole }) =>
    request<UserDto>("/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: string, body: { name?: string; role?: UserRole; status?: UserStatus; password?: string }) =>
    request<UserDto>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  dashboard: () => request<DashboardDto>("/dashboard"),
  contentDefaults: () => request<ContentDefaultsDto>("/settings/content-defaults"),
  settings: () => request<SettingsDto>("/settings"),
  updateSettings: (body: {
    monthlyAiBudgetUsd?: number;
    monthlyAiHardLimitUsd?: number;
    defaultIdeasCount?: number;
    defaultMarket?: string;
    autoPublishAfterApproval?: boolean;
    providerRouting?: {
      ideas?: TextProviderName[];
      research?: TextProviderName[];
      writing?: TextProviderName[];
    };
    operationModels?: OperationModelsDto;
    customModels?: Array<Partial<ModelSpecDto>>;
    imageSize?: "1K" | "2K" | "4K" | "";
  }) => request<SettingsDto>("/settings", { method: "PATCH", body: JSON.stringify(body) }),
  siteReport: (siteId: string, params?: { from?: string; to?: string }) => {
    const search = new URLSearchParams();
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    return request<SiteReportDto>(`/reports/sites/${siteId}${search.size ? `?${search.toString()}` : ""}`);
  },
  usageOverview: (params?: { from?: string; to?: string }) => request<UsageOverviewDto>(`/reports/usage${rangeQuery(params)}`),
  siteUsage: (siteId: string, params?: { from?: string; to?: string }) => request<SiteUsageDto>(`/reports/sites/${siteId}/usage${rangeQuery(params)}`),
  siteAudit: (siteId: string) => request<SiteAuditDto>(`/reports/sites/${siteId}/audit`),
  audit: () => request<AuditEventDto[]>("/audit")
};

function rangeQuery(params?: { from?: string; to?: string }): string {
  const search = new URLSearchParams();
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  return search.size ? `?${search.toString()}` : "";
}

function queryString(params?: ContentListParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === false || value === "all") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
