import { Eye, EyeOff, ExternalLink, RefreshCw, Sparkles, Star } from "lucide-react";
import { useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type PageKindKey, type SitePageDto } from "../api/client";
import { useCurrentUser } from "../auth";
import { IconButton } from "../ui/IconButton";
import { PageHeader } from "../ui/PageHeader";
import { Tabs } from "../ui/Tabs";
import { ActionError, EmptyState, ErrorState, LoadingState } from "../ui/StateViews";

export const pageKindLabels: Record<PageKindKey, string> = {
  SERVICE: "خدمة",
  PRODUCT: "منتج / باقة",
  ARTICLE: "مقال",
  ABOUT: "تعريفية",
  CONTACT: "تواصل",
  OTHER: "أخرى"
};

type KindTab = "all" | PageKindKey;

/** The site's own pages, as articles may link to them: admins correct the kind, mark priority pages or hide pages. */
export function SitePages(): ReactElement {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const isAdmin = useCurrentUser().role === "ADMIN";
  const [tab, setTab] = useState<KindTab>("all");
  const [search, setSearch] = useState("");
  const site = useQuery({ queryKey: ["sites"], queryFn: api.sites });
  const pages = useQuery({
    queryKey: ["site-pages", id, tab, search],
    queryFn: () => api.sitePages(id, { kind: tab === "all" ? undefined : tab, search: search.trim() || undefined }),
    enabled: Boolean(id),
    refetchInterval: 10_000
  });
  const counts = useQuery({ queryKey: ["site-pages", id, "counts"], queryFn: () => api.sitePages(id), enabled: Boolean(id), refetchInterval: 10_000 });
  const update = useMutation({
    mutationFn: ({ pageId, body }: { pageId: string; body: Parameters<typeof api.updateSitePage>[2] }) => api.updateSitePage(id, pageId, body),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["site-pages", id] })
  });
  const sync = useMutation({
    meta: { successMessage: "بدأت مزامنة الصفحات. ستظهر النتائج هنا خلال لحظات" },
    mutationFn: () => api.syncSitePages(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["site-pages", id] })
  });

  const classify = useMutation({
    meta: { successMessage: "بدأ تصنيف الصفحات بالموديل. ستتحدث القائمة خلال لحظات" },
    mutationFn: () => api.classifySitePages(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["site-pages", id] })
  });

  if (pages.isLoading || counts.isLoading) return <LoadingState />;
  if (pages.isError || !pages.data || !counts.data) return <ErrorState label="تعذر تحميل صفحات الموقع." />;
  const siteName = site.data?.find((candidate) => candidate.id === id)?.name ?? "الموقع";
  const total = counts.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`صفحات ${siteName}`}
        description="الصفحات التي يستخدمها النظام كروابط داخلية في المقالات: لا يربط المقال إلا بصفحة من هذه القائمة."
        actions={
          isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <IconButton icon={Sparkles} disabled={classify.isPending} onClick={() => classify.mutate()}>
                {classify.isPending ? "جاري الإضافة للطابور..." : "تصنيف بالموديل"}
              </IconButton>
              <IconButton icon={RefreshCw} tone="primary" disabled={sync.isPending} onClick={() => sync.mutate()}>
                {sync.isPending ? "جاري الإضافة للطابور..." : "مزامنة الصفحات"}
              </IconButton>
            </div>
          ) : undefined
        }
      />
      <p className="text-sm text-slate-500">
        {total.syncedAt ? <>آخر مزامنة: <span className="tabular-nums">{new Date(total.syncedAt).toLocaleString("ar")}</span> · تتم تلقائيًا كل يوم.</> : "لم تتم المزامنة بعد. اضغط «مزامنة الصفحات» لجلب الخدمات والمقالات والصفحات من ووردبريس."}
        {total.hidden > 0 ? <> · <span className="tabular-nums">{total.hidden}</span> صفحة مخفية.</> : null}
      </p>
      <ActionError error={sync.error} />
      <ActionError error={classify.error} />
      <ActionError error={update.error} />

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <Tabs
            label="نوع الصفحة"
            value={tab}
            onChange={setTab}
            items={[
              { id: "all", label: "الكل", count: total.total },
              ...(Object.keys(pageKindLabels) as PageKindKey[]).map((kind) => ({ id: kind, label: pageKindLabels[kind], count: total.byKind[kind] ?? 0 }))
            ]}
          />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالعنوان أو الرابط" aria-label="بحث" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
        </div>
        {pages.data.items.length === 0 ? (
          <div className="p-4"><EmptyState label={total.total === 0 ? "لا توجد صفحات في الفهرس بعد." : "لا توجد صفحات مطابقة."} /></div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pages.data.items.map((page) => (
              <PageRow key={page.id} page={page} isAdmin={isAdmin} onChange={(body) => update.mutate({ pageId: page.id, body })} />
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-slate-500">
        تعديلك على نوع الصفحة أو أولويتها أو إخفائها يبقى كما هو بعد كل مزامنة وبعد أي تصنيف بالموديل. «تصنيف بالموديل» يعيد النظر في الصفحات غير المعدّلة يدويًا (موديل «تصنيف صفحات الموقع» من الإعدادات). <Link to="/sites" className="text-teal hover:underline">العودة للمواقع</Link>
      </p>
    </div>
  );
}

function PageRow(props: { page: SitePageDto; isAdmin: boolean; onChange: (body: { kind?: PageKindKey; priority?: boolean; hidden?: boolean }) => void }): ReactElement {
  const { page } = props;
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 ${page.hidden ? "bg-slate-50 text-slate-500" : ""}`}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate">{page.title}</span>
          {page.language ? <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600" dir="ltr">{page.language.toUpperCase()}</span> : null}
          {page.source === "MANUAL" ? <span className="text-xs font-normal text-slate-400">معدّلة يدويًا</span> : page.source === "AI" ? <span className="text-xs font-normal text-slate-400">صنّفها الموديل</span> : null}
        </p>
        <a href={page.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-xs text-slate-500 hover:text-teal" dir="ltr">
          <span className="truncate">{page.url}</span><ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      </div>
      <div className="flex items-center gap-2">
        <select
          aria-label={`نوع ${page.title}`}
          value={page.kind}
          disabled={!props.isAdmin}
          onChange={(event) => {
            const kind = event.target.value as PageKindKey;
            props.onChange({ kind, priority: kind === "SERVICE" || kind === "PRODUCT" ? true : false });
          }}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
        >
          {(Object.keys(pageKindLabels) as PageKindKey[]).map((kind) => <option key={kind} value={kind}>{pageKindLabels[kind]}</option>)}
        </select>
        <button
          type="button"
          disabled={!props.isAdmin}
          aria-pressed={page.priority}
          aria-label={page.priority ? `إلغاء أولوية ${page.title}` : `جعل ${page.title} صفحة مهمة`}
          title={page.priority ? "صفحة مهمة: تُعرض على الكاتب حتى لو لم يتطابق عنوانها مع الموضوع" : "اجعلها صفحة مهمة"}
          onClick={() => props.onChange({ priority: !page.priority })}
          className={`rounded-md border p-2 ${page.priority ? "border-amber-300 bg-amber-50 text-amber-600" : "border-slate-200 text-slate-400 hover:text-slate-600"}`}
        >
          <Star className="h-4 w-4" fill={page.priority ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          disabled={!props.isAdmin}
          aria-pressed={page.hidden}
          aria-label={page.hidden ? `إظهار ${page.title}` : `إخفاء ${page.title}`}
          title={page.hidden ? "مخفية: لن يربط بها أي مقال" : "إخفاء من الروابط الداخلية"}
          onClick={() => props.onChange({ hidden: !page.hidden })}
          className="rounded-md border border-slate-200 p-2 text-slate-500 hover:text-slate-800"
        >
          {page.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}
