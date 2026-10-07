import { useQuery } from "@tanstack/react-query";
import { useState, type ReactElement, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type UsageOverviewDto, type UsageProviderRowDto, type UsageSiteRowDto } from "../api/client";
import { providerLabels, usageOperationLabel } from "../ui/labels";
import { EmptyState, ErrorState, LoadingState } from "../ui/StateViews";

export function usd(value: number): string {
  if (value === 0) return "$0.00";
  return `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

export function count(value: number): string {
  return value.toLocaleString("en-US");
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthStart(): string {
  const now = new Date();
  return isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
}

export function budgetTone(spent: number, budget: number, hardLimit: number): "ok" | "warn" | "danger" {
  if (hardLimit > 0 && spent >= hardLimit) return "danger";
  if (budget > 0 && spent >= budget) return "danger";
  if (budget > 0 && spent >= budget * 0.8) return "warn";
  return "ok";
}

export type ReconcileStatus = "match" | "close" | "off";

/** Compares what the app recorded with what the provider's invoice says, as a share of the invoice. */
export function reconcile(estimatedUsd: number, invoiceUsd: number): { deltaUsd: number; ratio: number | null; status: ReconcileStatus } {
  const deltaUsd = Number((estimatedUsd - invoiceUsd).toFixed(6));
  if (invoiceUsd <= 0) return { deltaUsd, ratio: null, status: estimatedUsd <= 0.005 ? "match" : "off" };
  const ratio = deltaUsd / invoiceUsd;
  const size = Math.abs(ratio);
  // Invoices round to cents, so tiny absolute differences always count as a match.
  if (Math.abs(deltaUsd) <= 0.01 || size <= 0.05) return { deltaUsd, ratio, status: "match" };
  return { deltaUsd, ratio, status: size <= 0.15 ? "close" : "off" };
}

export function Usage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const [from, setFrom] = useState(params.get("from") ?? monthStart());
  const [to, setTo] = useState(params.get("to") ?? isoDay(new Date()));
  const selected = params.get("site");
  const overview = useQuery({ queryKey: ["usage", from, to], queryFn: () => api.usageOverview({ from, to }), refetchInterval: 30_000 });

  function select(siteId: string | null): void {
    const next = new URLSearchParams(params);
    if (siteId) next.set("site", siteId);
    else next.delete("site");
    setParams(next, { replace: true });
  }

  if (overview.isLoading) return <LoadingState />;
  if (overview.isError || !overview.data) return <ErrorState label="تعذر تحميل تقرير الاستهلاك." />;
  const data = overview.data;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">الاستهلاك والنشاط لكل موقع</h2>
            <p className="text-sm text-slate-500">من {data.from} إلى {data.to} · التكلفة تقديرية بالدولار من أرقام الاستهلاك التي يرجعها كل مزود.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Preset label="هذا الشهر" onClick={() => { setFrom(monthStart()); setTo(isoDay(new Date())); }} />
            <Preset label="آخر 30 يومًا" onClick={() => { setFrom(isoDay(new Date(Date.now() - 29 * 86_400_000))); setTo(isoDay(new Date())); }} />
            <DateInput label="من" value={from} onChange={setFrom} />
            <DateInput label="إلى" value={to} onChange={setTo} />
          </div>
        </div>
        <BudgetBar month={data.month} />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Card label="إجمالي الاستهلاك في الفترة" value={usd(data.totalCostUsd)} />
          <Card label="عدد استدعاءات الذكاء الاصطناعي" value={count(data.totalCalls)} />
          <Card label="غير منسوب لموقع" value={usd(data.unattributedCostUsd)} hint={data.unattributedCalls > 0 ? `${count(data.unattributedCalls)} استدعاء (بيانات قديمة)` : undefined} />
        </div>
      </section>

      <InvoiceReconciliation providers={data.byProvider} />

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">المواقع</h3>
        {data.sites.length === 0 ? <EmptyState label="لا توجد مواقع." /> : <SitesTable sites={data.sites} selected={selected} onSelect={select} />}
      </section>

      {selected ? <SiteUsagePanel siteId={selected} from={from} to={to} onClose={() => select(null)} /> : null}
    </div>
  );
}

function InvoiceReconciliation(props: { providers: UsageProviderRowDto[] }): ReactElement | null {
  const [invoices, setInvoices] = useState<Record<string, string>>({});
  if (props.providers.length === 0) return null;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h3 className="font-semibold">مطابقة الفواتير</h3>
      <p className="mt-1 text-xs text-slate-500">أدخل المبلغ الذي تظهره لوحة كل مزود لنفس الفترة لتعرف إن كان حساب النظام مطابقًا. الفرق الكبير يعني سعرًا غير صحيح لموديل (عدّله من الإعدادات → موديلات مخصصة) أو استخدامًا خارج النظام على نفس المفتاح.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-right text-sm">
          <thead className="text-xs text-slate-500">
            <tr><th className="py-2">المزود</th><th>حساب النظام</th><th>منه مأخوذ من المزود</th><th>التوكنات (دخل / خرج / كاش)</th><th>الفاتورة الفعلية $</th><th>الفرق</th></tr>
          </thead>
          <tbody>
            {props.providers.map((row) => {
              const raw = invoices[row.provider];
              const result = raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? reconcile(row.costUsd, Number(raw)) : null;
              const tone = result?.status === "match" ? "text-teal" : result?.status === "close" ? "text-amber-700" : "text-red-600";
              return (
                <tr key={row.provider} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{providerLabels[row.provider] ?? row.provider}</td>
                  <td>{usd(row.costUsd)}</td>
                  <td className="text-slate-500">{row.reportedCostUsd > 0 ? usd(row.reportedCostUsd) : "—"}</td>
                  <td className="text-xs text-slate-600">{count(row.inputTokens)} / {count(row.outputTokens)} / {count(row.cacheTokens)}</td>
                  <td>
                    <input type="number" min={0} step="0.01" inputMode="decimal" aria-label={`فاتورة ${providerLabels[row.provider] ?? row.provider}`} value={raw ?? ""} onChange={(event) => setInvoices({ ...invoices, [row.provider]: event.target.value })} className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm" />
                  </td>
                  <td className={result ? tone : "text-slate-400"}>
                    {result ? `${result.deltaUsd >= 0 ? "+" : "−"}${usd(Math.abs(result.deltaUsd))}${result.ratio === null ? "" : ` (${Math.round(result.ratio * 100)}%)`} · ${result.status === "match" ? "مطابق" : result.status === "close" ? "قريب" : "غير مطابق"}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BudgetBar(props: { month: UsageOverviewDto["month"] }): ReactElement {
  const { costUsd, budgetUsd, hardLimitUsd } = props.month;
  const cap = hardLimitUsd > 0 ? hardLimitUsd : budgetUsd;
  const ratio = cap > 0 ? Math.min(1, costUsd / cap) : 0;
  const tone = budgetTone(costUsd, budgetUsd, hardLimitUsd);
  const color = tone === "danger" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : "bg-teal";
  return (
    <div className="mt-4 rounded-md border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-slate-700">ميزانية الشهر الحالي (UTC)</span>
        <span className="text-slate-600">{usd(costUsd)} من {usd(budgetUsd)} · الإيقاف الصارم عند {hardLimitUsd > 0 ? usd(hardLimitUsd) : "معطل"}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${color}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      {tone !== "ok" ? <p className={`mt-2 text-xs ${tone === "danger" ? "text-red-600" : "text-amber-700"}`}>{tone === "danger" ? "تجاوزت الميزانية الشهرية. عند الوصول للحد الصارم تتوقف كل عمليات الذكاء الاصطناعي." : "اقتربت من الميزانية الشهرية."}</p> : null}
    </div>
  );
}

function SitesTable(props: { sites: UsageSiteRowDto[]; selected: string | null; onSelect: (id: string) => void }): ReactElement {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[760px] text-right text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="py-2">الموقع</th>
            <th>الاستهلاك</th>
            <th>الحصة</th>
            <th>استدعاءات</th>
            <th>فشل</th>
            <th>صور</th>
            <th>محتوى جديد</th>
            <th>منشور</th>
            <th>تكلفة المنشور</th>
          </tr>
        </thead>
        <tbody>
          {props.sites.map((site) => (
            <tr key={site.siteId} className={`border-t border-slate-100 ${props.selected === site.siteId ? "bg-teal/5" : ""}`}>
              <td className="py-2">
                <button type="button" className="font-semibold text-teal hover:underline" onClick={() => props.onSelect(site.siteId)}>{site.name}</button>
                {site.status === "DELETED" ? <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">محذوف</span> : null}
              </td>
              <td className="font-medium">{usd(site.costUsd)}{site.unconfirmedCostUsd > 0 ? <span className="mr-1 text-xs text-amber-700" title="استدعاءات لم تُغلق">*</span> : null}</td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-teal" style={{ width: `${Math.round(site.shareOfTotal * 100)}%` }} /></div>
                  <span className="text-xs text-slate-500">{Math.round(site.shareOfTotal * 100)}%</span>
                </div>
              </td>
              <td>{count(site.calls)}</td>
              <td className={site.failedCalls > 0 ? "text-red-600" : ""}>{count(site.failedCalls)}</td>
              <td>{count(site.images)}</td>
              <td>{count(site.contentCreated)}</td>
              <td>{count(site.contentPublished)}</td>
              <td>{site.costPerPublishedUsd === null ? "—" : usd(site.costPerPublishedUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">* يتضمن استدعاءات بدأت ولم تُغلق (توقف العامل أثناءها): تُحتسب في الميزانية احتياطًا لأن المزود قد يكون حاسب عليها.</p>
    </div>
  );
}

function SiteUsagePanel(props: { siteId: string; from: string; to: string; onClose: () => void }): ReactElement {
  const usage = useQuery({ queryKey: ["site-usage", props.siteId, props.from, props.to], queryFn: () => api.siteUsage(props.siteId, { from: props.from, to: props.to }) });
  if (usage.isLoading) return <LoadingState />;
  if (usage.isError || !usage.data) return <ErrorState label="تعذر تحميل تفاصيل الموقع." />;
  const data = usage.data;
  const { totals, activity } = data;

  return (
    <section className="space-y-4 rounded-lg border border-teal/30 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{data.siteName}</h3>
          <p className="text-sm text-slate-500">ماذا حدث وكم استهلك من {data.from} إلى {data.to}</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50" to={`/sites/${data.siteId}/report`}>تقرير الجودة</Link>
          <button type="button" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={props.onClose}>إغلاق</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="الاستهلاك" value={usd(totals.costUsd)} hint={totals.unconfirmedCostUsd > 0 ? `منها ${usd(totals.unconfirmedCostUsd)} غير مؤكدة` : undefined} />
        <Card label="الاستدعاءات" value={count(totals.calls)} hint={`نجح ${count(totals.successfulCalls)} · فشل ${count(totals.failedCalls)}`} />
        <Card label="التوكنات" value={count(totals.inputTokens + totals.outputTokens + totals.cacheTokens)} hint={`دخل ${count(totals.inputTokens)} · خرج ${count(totals.outputTokens)}${totals.cacheTokens > 0 ? ` · كاش ${count(totals.cacheTokens)}` : ""}`} />
        <Card label="صور مولّدة" value={count(totals.images)} />
        <Card label="متوسط تكلفة المقال" value={totals.costPerArticleUsd === null ? "—" : usd(totals.costPerArticleUsd)} hint={`${count(totals.articlesWithUsage)} مقال`} />
        <Card label="تكلفة المقال المنشور" value={totals.costPerPublishedUsd === null ? "—" : usd(totals.costPerPublishedUsd)} />
        <Card label="تكلفة محتوى لم يُنشر" value={usd(totals.abandonedCostUsd)} hint="محذوف أو فاشل أو مكرر" />
        <Card label="مهام مكتملة / فاشلة" value={`${count(activity.jobsCompleted)} / ${count(activity.jobsFailed)}`} hint={activity.jobsCancelled > 0 ? `ملغاة ${count(activity.jobsCancelled)}` : undefined} />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700">النشاط في الفترة</h4>
        <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Card label="محتوى جديد" value={count(activity.contentCreated)} />
          <Card label="تم نشره" value={count(activity.contentPublished)} />
          <Card label="مجدول الآن" value={count(activity.scheduledNow)} />
          <Card label="داخل المسار الآن" value={count(activity.pipelineNow)} />
          <Card label="فاشل الآن" value={count(activity.failedNow)} />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700">الاستهلاك اليومي</h4>
        {data.byDay.length === 0 ? <EmptyState label="لا يوجد استهلاك في هذه الفترة." /> : (
          <div className="mt-2 h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: number) => `$${value}`} width={48} />
                <Tooltip formatter={(value: number) => [usd(value), "الاستهلاك"]} />
                <Bar dataKey="costUsd" fill="#0f766e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="حسب العملية" head={["العملية", "استدعاءات", "فشل", "التكلفة"]} rows={data.byOperation.map((row) => [usageOperationLabel(row.operation), count(row.calls), count(row.failedCalls), usd(row.costUsd)])} />
        <Table title="حسب الموديل" head={["الموديل", "استدعاءات", "توكنات", "التكلفة"]} rows={data.byModel.map((row) => [`${providerLabels[row.provider] ?? row.provider} · ${row.model}`, count(row.calls), count(row.inputTokens + row.outputTokens + row.cacheTokens), usd(row.costUsd)])} />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700">أعلى المقالات تكلفة</h4>
        {data.topContent.length === 0 ? <EmptyState label="لا توجد بيانات." /> : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {data.topContent.map((row) => (
              <li key={`${row.contentItemId ?? "deleted"}-${row.label}`} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {row.contentItemId ? <Link className="text-teal hover:underline" to={`/content/${row.contentItemId}`}>{row.label}</Link> : row.label}
                  {row.deleted ? <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">محذوف</span> : null}
                </span>
                <span className="shrink-0 text-slate-600">{count(row.calls)} استدعاء · <strong>{usd(row.costUsd)}</strong></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-slate-700">آخر الأحداث على الموقع</h4>
        {data.recentActivity.length === 0 ? <EmptyState label="لا توجد أحداث في هذه الفترة." /> : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {data.recentActivity.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{event.message}{event.actor ? <span className="text-slate-500"> · {event.actor}</span> : null}</span>
                <time className="text-xs text-slate-500" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("ar-SA")}</time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Card(props: { label: string; value: string; hint?: string | undefined }): ReactElement {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{props.label}</p>
      <p className="mt-2 text-xl font-semibold">{props.value}</p>
      {props.hint ? <p className="mt-1 text-xs text-slate-500">{props.hint}</p> : null}
    </div>
  );
}

function Table(props: { title: string; head: string[]; rows: ReactNode[][] }): ReactElement {
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-700">{props.title}</h4>
      {props.rows.length === 0 ? <EmptyState label="لا توجد بيانات." /> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="text-xs text-slate-500"><tr>{props.head.map((cell) => <th key={cell} className="py-1">{cell}</th>)}</tr></thead>
            <tbody>
              {props.rows.map((row, index) => (
                <tr key={index} className="border-t border-slate-100">{row.map((cell, cellIndex) => <td key={cellIndex} className="py-1.5">{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Preset(props: { label: string; onClick: () => void }): ReactElement {
  return <button type="button" className="min-h-9 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-teal/40 hover:bg-slate-50" onClick={props.onClick}>{props.label}</button>;
}

function DateInput(props: { label: string; value: string; onChange: (value: string) => void }): ReactElement {
  return (
    <label className="text-xs text-slate-500">
      {props.label}
      <input type="date" value={props.value} onChange={(event) => props.onChange(event.target.value)} className="mt-1 block rounded-md border border-slate-200 px-2 py-2 text-sm text-slate-900" />
    </label>
  );
}
