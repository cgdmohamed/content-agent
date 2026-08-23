import { AlertTriangle, BarChart3, Edit3, FilePlus2, Globe2, Power, RefreshCw, SearchCheck, Settings2, SquarePen, Trash2, Wifi } from "lucide-react";
import { useState, type FormEvent, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { SiteDto } from "../api/client";
import { useCurrentUser } from "../auth";
import { IconButton } from "../ui/IconButton";
import { integrationLabels } from "../ui/labels";
import { ActionError, EmptyState, ErrorState, LoadingState } from "../ui/StateViews";

export function Sites(): ReactElement {
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const isAdmin = user.role === "ADMIN";
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites });
  const [formOpen, setFormOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<SiteDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SiteDto | null>(null);
  const createSite = useMutation({
    mutationFn: api.createSite,
    onSuccess: async () => {
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["sites"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  const testWp = useMutation({
    mutationFn: api.testWordPress,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["sites"] })
  });
  const testRankMath = useMutation({
    mutationFn: api.testRankMath,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["sites"] })
  });
  const testGsc = useMutation({
    mutationFn: api.testGsc,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["sites"] })
  });
  const syncGsc = useMutation({
    mutationFn: api.syncGsc,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  const updateSite = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateSite>[1] }) => api.updateSite(id, body),
    onSuccess: async () => {
      setEditingSite(null);
      await queryClient.invalidateQueries({ queryKey: ["sites"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });
  const deleteSite = useMutation({
    mutationFn: api.deleteSite,
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["sites"] });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }
  });

  if (sites.isLoading) return <LoadingState />;
  if (sites.isError || !sites.data) return <ErrorState />;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    createSite.mutate({
      name: String(data.get("name") ?? ""),
      wordpressUrl: String(data.get("wordpressUrl") ?? ""),
      wordpressUsername: String(data.get("wordpressUsername") ?? ""),
      wordpressApplicationPassword: String(data.get("wordpressApplicationPassword") ?? ""),
      market: String(data.get("market") ?? "SA"),
      language: String(data.get("language") ?? "ar"),
      writingStandard: String(data.get("writingStandard") ?? ""),
      gscProperty: String(data.get("gscProperty") ?? ""),
      gscServiceAccountJson: String(data.get("gscServiceAccountJson") ?? "")
    });
  }

  function submitEdit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!editingSite) return;
    const data = new FormData(event.currentTarget);
    updateSite.mutate({
      id: editingSite.id,
      body: {
        name: String(data.get("name") ?? ""),
        wordpressUrl: String(data.get("wordpressUrl") ?? ""),
        wordpressUsername: String(data.get("wordpressUsername") ?? ""),
        wordpressApplicationPassword: optionalString(data.get("wordpressApplicationPassword")),
        market: String(data.get("market") ?? "SA"),
        language: String(data.get("language") ?? editingSite.language),
        writingStandard: String(data.get("writingStandard") ?? ""),
        gscProperty: String(data.get("gscProperty") ?? ""),
        gscServiceAccountJson: optionalString(data.get("gscServiceAccountJson"))
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">المواقع</h2>
        {isAdmin ? <IconButton icon={FilePlus2} tone="primary" onClick={() => setFormOpen((value) => !value)}>إضافة موقع</IconButton> : null}
      </div>
      {formOpen && isAdmin ? (
        <form onSubmit={submit} noValidate className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 md:grid-cols-2">
          <Input name="name" label="اسم الموقع" required />
          <Input name="wordpressUrl" label="رابط ووردبريس" placeholder="https://example.com" required />
          <Input name="wordpressUsername" label="اسم مستخدم ووردبريس" required />
          <Input name="wordpressApplicationPassword" label="كلمة مرور التطبيق" type="password" required />
          <Input name="market" label="السوق" defaultValue="SA" required />
          <LanguageSelect defaultValue="ar" />
          <Input name="gscProperty" label="خاصية بحث جوجل" placeholder="sc-domain:example.com أو https://example.com/" />
          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-600">معيار الكتابة</span>
            <textarea name="writingStandard" className="mt-1 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-600">بيانات حساب خدمة جوجل</span>
            <textarea name="gscServiceAccountJson" className="mt-1 min-h-28 w-full rounded-md border border-slate-200 px-3 py-2 text-left text-xs" dir="ltr" />
          </label>
          <div className="md:col-span-2">
            <button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white" disabled={createSite.isPending}>
              {createSite.isPending ? "جاري الحفظ..." : "حفظ الموقع"}
            </button>
          </div>
          <div className="md:col-span-2"><ActionError error={createSite.error} /></div>
        </form>
      ) : null}
      {editingSite && isAdmin ? (
        <form onSubmit={submitEdit} noValidate className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center justify-between">
            <h3 className="font-semibold">تعديل {editingSite.name}</h3>
            <IconButton icon={Power} tone="ghost" onClick={() => setEditingSite(null)}>إغلاق</IconButton>
          </div>
          <Input name="name" label="اسم الموقع" defaultValue={editingSite.name} required />
          <Input name="wordpressUrl" label="رابط ووردبريس" defaultValue={editingSite.wordpressUrl} required />
          <Input name="wordpressUsername" label="اسم مستخدم ووردبريس" defaultValue={editingSite.wordpressUsername ?? ""} required />
          <Input name="wordpressApplicationPassword" label="كلمة مرور تطبيق جديدة" type="password" />
          <Input name="market" label="السوق" defaultValue={editingSite.market} required />
          <LanguageSelect defaultValue={editingSite.language} />
          <Input name="gscProperty" label="خاصية بحث جوجل" defaultValue={editingSite.gscProperty ?? ""} />
          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-600">معيار الكتابة</span>
            <textarea name="writingStandard" defaultValue={editingSite.writingStandard ?? ""} className="mt-1 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-medium text-slate-600">بيانات حساب خدمة جوجل الجديدة</span>
            <textarea name="gscServiceAccountJson" className="mt-1 min-h-28 w-full rounded-md border border-slate-200 px-3 py-2 text-left text-xs" dir="ltr" />
          </label>
          <div className="md:col-span-2">
            <button className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white" disabled={updateSite.isPending}>
              {updateSite.isPending ? "جاري التحديث..." : "حفظ التعديلات"}
            </button>
          </div>
          <div className="md:col-span-2"><ActionError error={updateSite.error} /></div>
        </form>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {sites.data.map((site) => (
          <div key={site.id} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <Globe2 className="mt-1 h-5 w-5 text-teal" />
              <div>
                <h3 className="font-semibold">{site.name}</h3>
                <p className="text-sm text-slate-500">{site.wordpressUrl}</p>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-slate-500">السوق</dt><dd>{site.market}</dd></div>
              <div><dt className="text-slate-500">اللغة</dt><dd>{languageLabel(site.language)}</dd></div>
              <div><dt className="text-slate-500">الحالة</dt><dd className={site.status === "ACTIVE" ? "text-teal" : "text-red-700"}>{site.status === "ACTIVE" ? "نشط" : "معطل"}</dd></div>
              <div><dt className="text-slate-500">ووردبريس</dt><dd>{integrationLabels[site.wordpressStatus]}</dd></div>
              <div><dt className="text-slate-500">رانك ماث</dt><dd>{integrationLabels[site.rankMathStatus]}</dd></div>
              <div><dt className="text-slate-500">بحث جوجل</dt><dd>{integrationLabels[site.gscStatus]}</dd></div>
              <div><dt className="text-slate-500">المنشور</dt><dd>{site.publishedCount}</dd></div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              {isAdmin ? (
                <>
                  <IconButton icon={Wifi} onClick={() => testWp.mutate(site.id)}>اختبار ووردبريس</IconButton>
                  <IconButton icon={SquarePen} onClick={() => setEditingSite(site)}>تعديل</IconButton>
                  <IconButton icon={Settings2} onClick={() => testRankMath.mutate(site.id)}>اختبار رانك ماث</IconButton>
                  <IconButton icon={SearchCheck} onClick={() => testGsc.mutate(site.id)}>اختبار بحث جوجل</IconButton>
                  <IconButton icon={RefreshCw} onClick={() => syncGsc.mutate(site.id)}>مزامنة بحث جوجل</IconButton>
                  <IconButton
                    icon={Power}
                    disabled={updateSite.isPending}
                    onClick={() => updateSite.mutate({ id: site.id, body: { status: site.status === "ACTIVE" ? "DISABLED" : "ACTIVE" } })}
                  >
                    {site.status === "ACTIVE" ? "تعطيل" : "تفعيل"}
                  </IconButton>
                  <IconButton icon={Trash2} tone="danger" disabled={deleteSite.isPending} onClick={() => setDeleteTarget(site)}>حذف</IconButton>
                </>
              ) : null}
              <Link className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-teal/40 hover:bg-slate-50" to="/content"><Edit3 className="h-4 w-4" />إنشاء محتوى</Link>
              {isAdmin ? <Link className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-teal/40 hover:bg-slate-50" to={`/sites/${site.id}/report`}><BarChart3 className="h-4 w-4" />عرض التقرير</Link> : null}
            </div>
            {isAdmin ? <div className="mt-3 space-y-2">
              <ActionError error={testWp.variables === site.id ? testWp.error : null} />
              <ActionError error={testRankMath.variables === site.id ? testRankMath.error : null} />
              <ActionError error={testGsc.variables === site.id ? testGsc.error : null} />
              <ActionError error={syncGsc.variables === site.id ? syncGsc.error : null} />
              <ActionError error={updateSite.variables?.id === site.id ? updateSite.error : null} />
              <ActionError error={deleteSite.variables === site.id ? deleteSite.error : null} />
            </div> : null}
          </div>
        ))}
      </div>
      {sites.data.length === 0 ? <EmptyState label="لا توجد مواقع مضافة بعد." /> : null}
      {deleteTarget ? (
        <DeleteSiteModal
          site={deleteTarget}
          isPending={deleteSite.isPending}
          error={deleteSite.error}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteSite.mutate(deleteTarget.id)}
        />
      ) : null}
    </div>
  );
}

function DeleteSiteModal(props: { site: SiteDto; isPending: boolean; error: unknown; onCancel: () => void; onConfirm: () => void }): ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-700"><AlertTriangle className="h-5 w-5" /></span>
          <div>
            <h3 className="text-lg font-semibold">حذف الموقع</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              سيتم إخفاء موقع <strong>{props.site.name}</strong> وكل المقالات التابعة له من النظام. لن يتم حذف منشورات ووردبريس نفسها.
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              لو للموقع مقالات مجدولة، سيمنع النظام الحذف حتى يتم سحب الجدولة أو حذف تلك المقالات أولًا.
            </p>
          </div>
        </div>
        <div className="mt-4"><ActionError error={props.error} /></div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50" type="button" onClick={props.onCancel} disabled={props.isPending}>إلغاء</button>
          <button className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="button" onClick={props.onConfirm} disabled={props.isPending}>
            <Trash2 className="h-4 w-4" />{props.isPending ? "جاري الحذف..." : "تأكيد الحذف"}
          </button>
        </div>
      </section>
    </div>
  );
}

function optionalString(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
}

function languageLabel(value: string): string {
  return value === "en" ? "الإنجليزية" : "العربية";
}

function LanguageSelect(props: { defaultValue: string }): ReactElement {
  return (
    <label>
      <span className="text-sm font-medium text-slate-600">لغة المقالات</span>
      <select name="language" defaultValue={props.defaultValue} required className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
        <option value="ar">العربية</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}

function Input(props: { name: string; label: string; type?: string; placeholder?: string; defaultValue?: string; required?: boolean }): ReactElement {
  return (
    <label>
      <span className="text-sm font-medium text-slate-600">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        defaultValue={props.defaultValue}
        required={props.required}
        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
      />
    </label>
  );
}
