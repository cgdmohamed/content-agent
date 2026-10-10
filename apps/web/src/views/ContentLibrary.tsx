import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { ChevronDown, ChevronLeft, Copy, FilePlus2, FolderOpen, Layers3, Play, RotateCcw, Search, SlidersHorizontal, Trash2, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contentStates, nextPrimaryOperation, type ContentOperation } from "@content-agent/shared";
import { api, type ContentDto } from "../api/client";
import { useCurrentUser } from "../auth";
import { StatusBadge } from "../ui/Badge";
import { IconButton } from "../ui/IconButton";
import { PageHeader } from "../ui/PageHeader";
import { RowMenu, type MenuAction } from "../ui/RowMenu";
import { modeLabels, operationLabels, stateLabels } from "../ui/labels";
import { ActionError, EmptyState, ErrorState, LoadingState } from "../ui/StateViews";

export function ContentLibrary(): ReactElement {
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const [formOpen, setFormOpen] = useState(false);
  const [creationMode, setCreationMode] = useState<"manual" | "bulk">("manual");
  const [bulkTopics, setBulkTopics] = useState("");
  const [bulkStartDate, setBulkStartDate] = useState(todayInputValue());
  const [bulkPublishTime, setBulkPublishTime] = useState("09:00");
  const [bulkIntervalDays, setBulkIntervalDays] = useState(2);
  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [minimumScore, setMinimumScore] = useState("");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [updatedTo, setUpdatedTo] = useState("");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const navigate = useNavigate();
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const contentFilters = {
    search: search.trim(),
    siteId: siteFilter,
    state: stateFilter,
    mode: modeFilter,
    minScore: minimumScore,
    updatedFrom,
    updatedTo,
    needsAttention: needsAttentionOnly,
    page,
    pageSize
  };
  const content = useQuery({ queryKey: ["content", contentFilters], queryFn: () => api.content(contentFilters), refetchInterval: 10000 });
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites });
  const defaults = useQuery({ queryKey: ["content-defaults"], queryFn: api.contentDefaults });
  const createContent = useMutation({
    meta: { successMessage: "تم إنشاء المحتوى" },
    mutationFn: api.createContent,
    onSuccess: async () => {
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  const createBulkContent = useMutation({
    meta: { successMessage: "تم إنشاء الدفعة" },
    mutationFn: api.createBulkContent,
    onSuccess: async () => {
      setFormOpen(false);
      setBulkTopics("");
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  const runOperation = useMutation<unknown, Error, { id: string; operation: ContentOperation }>({
    meta: { successMessage: "تمت إضافة المهمة إلى الطابور" },
    mutationFn: ({ id, operation }: { id: string; operation: ContentOperation }) => {
      if (operation === "APPROVE") return api.approveContent(id);
      if (operation === "RETRY") return api.retryContent(id);
      return api.runContentOperation(id, operationPath(operation));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  const deleteContent = useMutation({
    meta: { successMessage: "تم حذف المحتوى" },
    mutationFn: api.deleteContent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    }
  });
  const cleanupContent = useMutation({
    meta: { successMessage: "تم حذف العناصر المحددة" },
    mutationFn: api.cleanupContent,
    onSuccess: async () => {
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    }
  });
  const rollbackPublishing = useMutation({
    meta: { successMessage: "تم سحب النشر للعناصر المحددة" },
    mutationFn: api.rollbackContentPublishing,
    onSuccess: async () => {
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    }
  });
  const duplicateContent = useMutation({
    meta: { successMessage: "تم نسخ المحتوى" },
    mutationFn: api.duplicateContent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    }
  });

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [search, siteFilter, stateFilter, modeFilter, minimumScore, updatedFrom, updatedTo, needsAttentionOnly, pageSize]);

  if (content.isLoading) return <LoadingState />;
  if (content.isError || !content.data) return <ErrorState />;

  function submitManual(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    createContent.mutate({
      siteId: String(data.get("siteId") ?? ""),
      topic: String(data.get("topic") ?? ""),
      ideasCount: normalizedIdeasCount(data.get("ideasCount"), defaults.data?.defaultIdeasCount ?? 5),
      contentGoal: String(data.get("contentGoal") ?? ""),
      audience: String(data.get("audience") ?? ""),
      searchIntent: String(data.get("searchIntent") ?? "تلقائية")
    });
  }

  function submitBulk(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    createBulkContent.mutate({
      siteId: String(data.get("siteId") ?? ""),
      topics: bulkTopics,
      startDate: String(data.get("startDate") ?? bulkStartDate),
      publishTime: String(data.get("publishTime") ?? bulkPublishTime),
      intervalDays: normalizedInteger(data.get("intervalDays"), 2, 1, 30),
      autoPublish: data.get("autoPublish") === "on",
      ideasCount: normalizedIdeasCount(data.get("ideasCount"), defaults.data?.defaultIdeasCount ?? 5),
      contentGoal: String(data.get("contentGoal") ?? ""),
      audience: String(data.get("audience") ?? ""),
      searchIntent: String(data.get("searchIntent") ?? "تلقائية")
    });
  }

  const bulkPreview = buildBulkPreview(bulkTopics, bulkStartDate, bulkPublishTime, bulkIntervalDays);
  const filteredContent = content.data.items;
  const groupedContent = groupContentRows(filteredContent);
  const totalPages = Math.max(1, Math.ceil(content.data.total / content.data.pageSize));
  const currentStart = content.data.total === 0 ? 0 : (content.data.page - 1) * content.data.pageSize + 1;
  const currentEnd = Math.min(content.data.total, content.data.page * content.data.pageSize);
  const deletableIds = filteredContent.filter((row) => canDeleteContent(row.state)).map((row) => row.id);
  const selectedCount = selectedIds.length;

  const advancedCount = [modeFilter !== "all", minimumScore !== "", updatedFrom !== "", updatedTo !== "", needsAttentionOnly].filter(Boolean).length;
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="space-y-4">
      <PageHeader
        title="مكتبة المحتوى"
        description="كل المقالات في مكان واحد: افتح المقال أو أكمل خطوته التالية من نفس الصف."
        actions={
          <IconButton icon={formOpen ? XCircle : FilePlus2} tone="primary" onClick={() => setFormOpen((value) => !value)}>
            {formOpen ? "إغلاق النموذج" : "إنشاء محتوى"}
          </IconButton>
        }
      />
      {formOpen ? (
        <section aria-label="إنشاء محتوى" className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 inline-flex rounded-md border border-slate-200 bg-white p-1 text-sm">
            <button type="button" className={`rounded px-3 py-1.5 ${creationMode === "manual" ? "bg-teal text-white" : "text-slate-600"}`} onClick={() => setCreationMode("manual")}>محتوى فردي</button>
            <button type="button" className={`rounded px-3 py-1.5 ${creationMode === "bulk" ? "bg-teal text-white" : "text-slate-600"}`} onClick={() => setCreationMode("bulk")}>دفعة محتوى</button>
          </div>
          {creationMode === "manual" ? (
            <form onSubmit={submitManual} noValidate className="grid gap-3 md:grid-cols-2">
              <SiteSelect sites={(sites.data ?? []).filter((site) => site.status === "ACTIVE")} />
              <Input name="topic" label="الموضوع" required />
              <Input name="ideasCount" label="عدد الأفكار" type="number" defaultValue={String(defaults.data?.defaultIdeasCount ?? 5)} min={1} max={20} required />
              <Input name="searchIntent" label="نية البحث" defaultValue="تلقائية" />
              <Input name="contentGoal" label="هدف المحتوى" />
              <Input name="audience" label="الجمهور المستهدف" />
              <div className="md:col-span-2">
                <IconButton icon={FilePlus2} type="submit" tone="primary" disabled={createContent.isPending}>
                  {createContent.isPending ? "جاري الإنشاء..." : "حفظ وبدء المسار"}
                </IconButton>
              </div>
              <div className="md:col-span-2"><ActionError error={createContent.error} /></div>
            </form>
          ) : (
            <form onSubmit={submitBulk} noValidate className="grid gap-3 md:grid-cols-2">
              <SiteSelect sites={(sites.data ?? []).filter((site) => site.status === "ACTIVE")} />
              <Input name="ideasCount" label="عدد الأفكار لكل موضوع" type="number" defaultValue={String(defaults.data?.defaultIdeasCount ?? 5)} min={1} max={20} required />
              <label>
                <span className="text-sm font-medium text-slate-600">تاريخ البداية</span>
                <input name="startDate" type="date" value={bulkStartDate} onChange={(event) => setBulkStartDate(event.target.value)} required className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label>
                <span className="text-sm font-medium text-slate-600">وقت النشر</span>
                <input name="publishTime" type="time" value={bulkPublishTime} onChange={(event) => setBulkPublishTime(event.target.value)} required className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label>
                <span className="text-sm font-medium text-slate-600">الفاصل بالأيام</span>
                <input
                  name="intervalDays"
                  type="number"
                  value={bulkIntervalDays}
                  min={1}
                  max={30}
                  onChange={(event) => setBulkIntervalDays(normalizedInteger(event.target.value, 2, 1, 30))}
                  required
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <Input name="searchIntent" label="نية البحث" defaultValue="تلقائية" />
              <Input name="contentGoal" label="هدف المحتوى" />
              <Input name="audience" label="الجمهور المستهدف" />
              <label className="md:col-span-2">
                <span className="text-sm font-medium text-slate-600">الموضوعات</span>
                <textarea
                  value={bulkTopics}
                  onChange={(event) => setBulkTopics(event.target.value)}
                  required
                  className="mt-1 min-h-36 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input name="autoPublish" type="checkbox" className="h-4 w-4" />
                بدء توليد الأفكار تلقائيًا بعد إنشاء الدفعة
              </label>
              {bulkPreview.length > 0 ? (
                <div className="md:col-span-2 rounded-md border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-sm font-semibold">معاينة الجدولة</p>
                  <div className="grid gap-2 text-sm md:grid-cols-2">
                    {bulkPreview.slice(0, 8).map((item) => (
                      <div key={`${item.topic}-${item.date}`} className="flex justify-between gap-3 rounded border border-slate-100 px-3 py-2">
                        <span>{item.topic}</span>
                        <span className="shrink-0 text-slate-500">{item.date}</span>
                      </div>
                    ))}
                  </div>
                  {bulkPreview.length > 8 ? <p className="mt-2 text-xs text-slate-500">+ {bulkPreview.length - 8} موضوعات أخرى</p> : null}
                </div>
              ) : null}
              <div className="md:col-span-2">
                <IconButton icon={FilePlus2} type="submit" tone="primary" disabled={createBulkContent.isPending}>
                  {createBulkContent.isPending ? "جاري إنشاء الدفعة..." : "إنشاء الدفعة"}
                </IconButton>
              </div>
              <div className="md:col-span-2"><ActionError error={createBulkContent.error} /></div>
            </form>
          )}
        </section>
      ) : null}
      <div className="space-y-2 empty:hidden">
        <ActionError error={runOperation.error} />
        <ActionError error={duplicateContent.error} />
        <ActionError error={deleteContent.error} />
        <ActionError error={cleanupContent.error} />
        <ActionError error={rollbackPublishing.error} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto]">
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 focus-within:border-teal">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالعنوان أو الكلمة المستهدفة" aria-label="بحث" className="w-full bg-transparent text-sm outline-none" />
            </label>
            <select aria-label="الموقع" value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="all">كل المواقع</option>
              {(sites.data ?? []).map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
            <select aria-label="الحالة" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="all">كل الحالات</option>
              {contentStates.map((state) => <option key={state} value={state}>{stateLabels[state]}</option>)}
            </select>
            <button type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <SlidersHorizontal className="h-4 w-4" />تصفية متقدمة
              {advancedCount > 0 ? <span className="rounded-full bg-teal px-1.5 text-xs text-white">{advancedCount}</span> : null}
            </button>
          </div>
          {showAdvanced ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-slate-500">النمط
                <select value={modeFilter} onChange={(event) => setModeFilter(event.target.value)} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                  <option value="all">كل الأنماط</option>
                  {Object.entries(modeLabels).map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">أقل درجة جودة
                <input value={minimumScore} onChange={(event) => setMinimumScore(event.target.value)} type="number" min={0} max={100} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900" />
              </label>
              <label className="text-xs text-slate-500">آخر تحديث من
                <input value={updatedFrom} onChange={(event) => setUpdatedFrom(event.target.value)} type="date" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900" />
              </label>
              <label className="text-xs text-slate-500">آخر تحديث إلى
                <input value={updatedTo} onChange={(event) => setUpdatedTo(event.target.value)} type="date" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900" />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2 lg:col-span-4">
                <input checked={needsAttentionOnly} onChange={(event) => setNeedsAttentionOnly(event.target.checked)} type="checkbox" className="h-4 w-4" />
                العناصر التي تحتاج متابعة فقط (فشل أو جودة أقل من 60)
              </label>
            </div>
          ) : null}
        </div>

        {isAdmin && selectedCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal/20 bg-teal/5 px-4 py-2.5" role="region" aria-label="إجراءات على المحدد">
            <span className="text-sm font-medium text-teal">تم تحديد {selectedCount}</span>
            <div className="flex flex-wrap items-center gap-2">
              <IconButton
                icon={RotateCcw}
                disabled={rollbackPublishing.isPending}
                onClick={() => setConfirmDialog({
                  title: "سحب/إلغاء النشر",
                  message: `سيتم سحب المنشور من ووردبريس إلى مسودة وإلغاء جدولة المجدول لعدد ${selectedCount} عنصر محدد.`,
                  confirmLabel: "تأكيد التراجع",
                  onConfirm: () => rollbackPublishing.mutate([...selectedIds])
                })}
              >
                {rollbackPublishing.isPending ? "جاري التراجع..." : "سحب/إلغاء النشر"}
              </IconButton>
              <IconButton
                icon={Trash2}
                tone="danger"
                disabled={cleanupContent.isPending}
                onClick={() => setConfirmDialog({
                  title: "حذف العناصر المحددة",
                  message: `سيتم إلغاء المهام المنتظرة وحذف ${selectedCount} عنصر محتوى قابل للحذف. لن يتم حذف المنشور أو المجدول قبل سحب النشر.`,
                  confirmLabel: "حذف المحدد",
                  tone: "danger",
                  onConfirm: () => cleanupContent.mutate([...selectedIds])
                })}
              >
                {cleanupContent.isPending ? "جاري التنظيف..." : "حذف المحدد"}
              </IconButton>
              <button type="button" className="px-2 py-1 text-sm text-slate-500 hover:text-slate-800" onClick={() => setSelectedIds([])}>إلغاء التحديد</button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          <span>{content.data.total === 0 ? "لا توجد نتائج" : `عرض ${currentStart}–${currentEnd} من ${content.data.total}`}</span>
          {isAdmin && deletableIds.length > 0 ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={deletableIds.every((id) => selectedIds.includes(id))} onChange={(event) => setSelectedIds(event.target.checked ? deletableIds : [])} />
              تحديد القابل للحذف في هذه الصفحة
            </label>
          ) : null}
        </div>

        <div className="hidden grid-cols-[1rem_minmax(0,1fr)_7rem_3rem_6.5rem_11rem] gap-x-3 px-5 pt-3 text-xs font-medium text-slate-400 md:grid">
          <span />
          <span>العنوان</span>
          <span>الحالة</span>
          <span>الجودة</span>
          <span>آخر تحديث</span>
          <span />
        </div>
        <div className="space-y-3 p-2 sm:p-3">
          {groupedContent.map((group) => (
            <ContentGroup
              key={group.id}
              group={group}
              renderRow={(row) => (
                <ContentRow
                  key={row.id}
                  row={row}
                  isAdmin={isAdmin}
                  selected={selectedIds.includes(row.id)}
                  onSelect={(checked) => setSelectedIds((current) => checked ? [...new Set([...current, row.id])] : current.filter((id) => id !== row.id))}
                  primaryAction={renderPrimaryAction(row.id, row.state, isTranslating(row) ? null : nextPrimaryOperation(row.state), runOperation.isPending, isAdmin, (operation) =>
                    runOperation.mutate({ id: row.id, operation })
                  )}
                  menuActions={[
                    { label: "فتح المقال", icon: FolderOpen, onClick: () => navigate(`/content/${row.id}`) },
                    { label: "نسخ", icon: Copy, disabled: duplicateContent.isPending, onClick: () => duplicateContent.mutate(row.id) },
                    ...(isAdmin && canDeleteContent(row.state)
                      ? [{
                          label: "حذف",
                          icon: Trash2,
                          danger: true,
                          disabled: deleteContent.isPending,
                          onClick: () => setConfirmDialog({
                            title: "حذف المحتوى",
                            message: `سيتم حذف "${row.title}" نهائيًا من مكتبة المحتوى إذا لم يكن مرتبطًا بمهمة نشطة.`,
                            confirmLabel: "حذف",
                            tone: "danger",
                            onConfirm: () => deleteContent.mutate(row.id)
                          })
                        }]
                      : [])
                  ]}
                />
              )}
            />
          ))}
          {content.data.total === 0 ? <div className="p-3"><EmptyState label="لا توجد نتائج مطابقة للفلاتر الحالية." /></div> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            لكل صفحة
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="rounded-md border border-slate-200 px-2 py-1">
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-md border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:text-slate-300" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>السابق</button>
            <span className="px-1 text-slate-600 tabular-nums">{content.data.page} / {totalPages}</span>
            <button type="button" className="rounded-md border border-slate-200 px-3 py-1.5 disabled:cursor-not-allowed disabled:text-slate-300" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>التالي</button>
          </div>
        </div>
      </section>
      {confirmDialog ? (
        <ConfirmDialog
          config={confirmDialog}
          onClose={() => setConfirmDialog(null)}
          onConfirm={() => {
            confirmDialog.onConfirm();
            setConfirmDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}

interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "neutral" | "danger";
  onConfirm: () => void;
}

function ConfirmDialog(props: { config: ConfirmDialogConfig; onClose: () => void; onConfirm: () => void }): ReactElement {
  const isDanger = props.config.tone === "danger";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-950">{props.config.title}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">{props.config.message}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4">
          <button type="button" className="min-h-9 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={props.onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className={`min-h-9 rounded-md border px-4 py-2 text-sm font-semibold text-white ${isDanger ? "border-red-600 bg-red-600 hover:bg-red-700" : "border-teal bg-teal hover:bg-teal/90"}`}
            onClick={props.onConfirm}
          >
            {props.config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ContentDisplayGroup {
  id: string;
  title: string;
  subtitle: string;
  kind: "bulk" | "single";
  rows: ContentDto[];
}

function ContentGroup(props: { group: ContentDisplayGroup; renderRow: (row: ContentDto) => ReactElement }): ReactElement {
  const { group } = props;
  const [open, setOpen] = useState(false);
  if (group.kind === "single") {
    return <ul className="divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200">{group.rows.map(props.renderRow)}</ul>;
  }
  const completed = group.rows.filter((row) => ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(row.state)).length;
  const averageScore = Math.round(group.rows.reduce((sum, row) => sum + row.score, 0) / Math.max(1, group.rows.length));
  const Icon = open ? ChevronDown : ChevronLeft;
  return (
    <section className="overflow-hidden rounded-md border border-slate-200">
      <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2.5 text-right hover:bg-slate-100" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="flex min-w-0 items-center gap-2">
          <Layers3 className="h-4 w-4 shrink-0 text-teal" />
          <span className="truncate font-medium">{group.title}</span>
          <span className="hidden text-xs text-slate-500 sm:inline">{group.subtitle}</span>
        </span>
        <span className="flex items-center gap-3 text-xs text-slate-600">
          <span>{group.rows.length} مقال</span>
          <span>{completed} جاهز</span>
          <span className={`rounded px-1.5 py-0.5 font-medium ${scoreClass(averageScore)}`}>متوسط {averageScore}</span>
          <Icon className="h-4 w-4" />
        </span>
      </button>
      {open ? <ul className="divide-y divide-slate-100 border-t border-slate-200">{group.rows.map(props.renderRow)}</ul> : null}
    </section>
  );
}

/** One article = one row: the title opens it, the next step is the only button, everything else is in the menu. */
function ContentRow(props: {
  row: ContentDto;
  isAdmin: boolean;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  primaryAction: ReactElement | null;
  menuActions: MenuAction[];
}): ReactElement {
  const { row } = props;
  const secondary = [row.site, row.language ? `ترجمة ${row.language.toUpperCase()}` : null, row.targetKeyword || null, row.mode === "BULK" ? "دفعة" : null].filter(Boolean).join(" · ");
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 bg-white px-3 py-3 hover:bg-slate-50 md:grid-cols-[1rem_minmax(0,1fr)_7rem_3rem_6.5rem_11rem]">
      {props.isAdmin ? (
        <input type="checkbox" className="h-4 w-4 shrink-0" checked={props.selected} onChange={(event) => props.onSelect(event.target.checked)} aria-label={`تحديد ${row.title}`} />
      ) : (
        <span className="w-4" />
      )}
      <div className="min-w-0">
        <Link to={`/content/${row.id}`} className="block truncate font-medium text-slate-900 hover:text-teal">{row.title}</Link>
        <p className="truncate text-xs text-slate-500">{secondary}</p>
        <div className="mt-1 flex items-center gap-2 md:hidden">
          <StatusBadge state={row.state} />
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${scoreClass(row.score)}`}>{row.score}</span>
        </div>
      </div>
      <div className="hidden md:block"><StatusBadge state={row.state} /></div>
      <div className="hidden md:block"><span className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${scoreClass(row.score)}`}>{row.score}</span></div>
      <div className="hidden text-xs text-slate-500 md:block">
        <p>{formatDate(row.updatedAt)}</p>
        {row.scheduledDate ? <p className="text-amber-700">ينشر {formatDate(row.scheduledDate)}</p> : null}
      </div>
      <div className="flex items-center justify-end gap-1">
        {props.primaryAction}
        <RowMenu label={`المزيد لـ ${row.title}`} actions={props.menuActions} />
      </div>
    </li>
  );
}

function scoreClass(score: number): string {
  if (score >= 80) return "bg-emerald-50 text-emerald-700";
  if (score >= 60) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

function groupContentRows(rows: ContentDto[]): ContentDisplayGroup[] {
  const groups = new Map<string, ContentDisplayGroup>();
  const singles: ContentDto[] = [];
  for (const row of rows) {
    if (!row.batchId) {
      singles.push(row);
      continue;
    }
    const existing = groups.get(row.batchId);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(row.batchId, {
      id: row.batchId,
      title: row.batchName || "دفعة محتوى",
      subtitle: row.batchCreatedAt ? `تم الإنشاء ${formatDate(row.batchCreatedAt)}` : "دفعة محتوى مجمعة",
      kind: "bulk",
      rows: [row]
    });
  }
  const output = [...groups.values()];
  if (singles.length > 0) {
    output.push({
      id: "single-content",
      title: "مقالات فردية",
      subtitle: "محتوى تم إنشاؤه بشكل فردي",
      kind: "single",
      rows: singles
    });
  }
  return output;
}

function canDeleteContent(state: string): boolean {
  return !["QUEUED", "SCHEDULED", "PUBLISHED"].includes(state);
}

function SiteSelect(props: { sites: Array<{ id: string; name: string }> }): ReactElement {
  return (
    <label>
      <span className="text-sm font-medium text-slate-600">الموقع</span>
      <select name="siteId" required className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
        <option value="">اختر موقعًا</option>
        {props.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select>
    </label>
  );
}

/** A translation waits in QUEUED while the AI translates it; it has no pipeline step to run. */
function isTranslating(row: Pick<ContentDto, "state" | "translationOf">): boolean {
  return Boolean(row.translationOf) && row.state === "QUEUED";
}

function renderPrimaryAction(
  id: string,
  state: string,
  operation: ContentOperation | null,
  pending: boolean,
  isAdmin: boolean,
  run: (operation: ContentOperation) => void
): ReactElement | null {
  // Finished and scheduled articles have no next step; the status badge already says so.
  if (state === "SCHEDULED" || !operation) return null;
  if ((operation === "APPROVE" || operation === "PUBLISH") && !isAdmin) return <span className="px-2 text-xs text-slate-400">بانتظار المدير</span>;
  if (operation === "SELECT_IDEA") {
    return <Link className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 px-3 py-1 text-sm font-medium hover:border-teal/40 hover:bg-white" to={`/content/${id}`}>اختيار فكرة</Link>;
  }
  if (operation === "SKIP_IMAGE" || operation === "SCHEDULE") {
    return <Link className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 px-3 py-1 text-sm font-medium hover:border-teal/40 hover:bg-white" to={`/content/${id}`}>{operationLabels[operation]}</Link>;
  }
  return (
    <IconButton icon={Play} className="min-h-8 whitespace-nowrap px-3 py-1" disabled={pending} onClick={() => run(operation)}>
      {operationLabels[operation]}
    </IconButton>
  );
}

function operationPath(operation: ContentOperation): "generate-ideas" | "research" | "write" | "review" | "generate-image" | "publish" {
  const map: Partial<Record<ContentOperation, "generate-ideas" | "research" | "write" | "review" | "generate-image" | "publish">> = {
    GENERATE_IDEAS: "generate-ideas",
    RESEARCH_GAPS: "research",
    WRITE_DRAFT: "write",
    REVIEW_DRAFT: "review",
    GENERATE_IMAGE: "generate-image",
    PUBLISH: "publish"
  };
  const path = map[operation];
  if (!path) throw new Error("لا يوجد مسار برمجي لهذه العملية");
  return path;
}

function normalizedIdeasCount(value: FormDataEntryValue | null, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(20, Math.max(1, parsed));
}

function normalizedInteger(value: FormDataEntryValue | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium" }).format(date);
}

function buildBulkPreview(topicsValue: string, startDate: string, publishTime: string, intervalDays: number): Array<{ topic: string; date: string }> {
  const topics = topicsValue
    .split(/\r?\n/)
    .map((topic) => topic.trim())
    .filter(Boolean);
  const start = new Date(`${startDate}T${publishTime || "09:00"}:00.000Z`);
  if (Number.isNaN(start.getTime())) return [];
  return topics.map((topic, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index * intervalDays);
    return { topic, date: date.toISOString().slice(0, 16).replace("T", " ") };
  });
}

function Input(props: { name: string; label: string; type?: string; defaultValue?: string; min?: number; max?: number; required?: boolean }): ReactElement {
  return (
    <label>
      <span className="text-sm font-medium text-slate-600">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        min={props.min}
        max={props.max}
        required={props.required}
        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
      />
    </label>
  );
}
