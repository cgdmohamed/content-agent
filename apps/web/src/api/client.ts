import type { ContentState, ProviderName } from "@content-agent/shared";
import type { ContentMode, IntegrationStatus, UserRole, UserStatus } from "@content-agent/types";

const baseUrl = import.meta.env.VITE_API_URL ?? "/api";
type TextProviderName = Exclude<ProviderName, "gemini-image">;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("يجب تسجيل الدخول أولًا.");
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

export interface SiteDto {
  id: string;
  name: string;
  wordpressUrl: string;
  wordpressUsername?: string;
  market: string;
  language: string;
  writingStandard?: string | null;
  gscProperty?: string | null;
  status: "ACTIVE" | "DISABLED";
  wordpressStatus: IntegrationStatus;
  rankMathStatus: IntegrationStatus;
  gscStatus: IntegrationStatus;
  contentCount: number;
  publishedCount: number;
}

export interface ContentDto {
  id: string;
  siteId: string;
  site: string;
  topic: string;
  title: string;
  targetKeyword: string;
  state: ContentState;
  mode: ContentMode;
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
  skipImage: (id: string) => request<ContentDetailDto>(`/content/${id}/skip-image`, { method: "POST" }),
  uploadContentImage: (id: string, body: { imageBase64: string; mimeType: string; filename: string; imageAlt?: string }) =>
    request<ContentDetailDto>(`/content/${id}/upload-image`, { method: "POST", body: JSON.stringify(body) }),
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
  }) => request<SiteDto>(`/sites/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  testWordPress: (id: string) => request<{ id: string; status: IntegrationStatus; message: string }>(`/sites/${id}/test-wordpress`, { method: "POST" }),
  testRankMath: (id: string) => request<{ id: string; status: IntegrationStatus; message: string }>(`/sites/${id}/test-rankmath`, { method: "POST" }),
  testGsc: (id: string) => request<{ id: string; status: IntegrationStatus; message: string }>(`/sites/${id}/test-gsc`, { method: "POST" }),
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
  }) => request<SettingsDto>("/settings", { method: "PATCH", body: JSON.stringify(body) }),
  siteReport: (siteId: string, params?: { from?: string; to?: string }) => {
    const search = new URLSearchParams();
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    return request<SiteReportDto>(`/reports/sites/${siteId}${search.size ? `?${search.toString()}` : ""}`);
  },
  audit: () => request<AuditEventDto[]>("/audit")
};

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
