import type { ReactElement } from "react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContentState } from "@content-agent/shared";
import { Download, ExternalLink, FileText, Printer, RefreshCcw, Sparkles } from "lucide-react";
import { api, type SiteAuditDto, type SiteAuditIssueDto } from "../api/client";
import { StatusBadge } from "../ui/Badge";
import { ActionError, EmptyState, ErrorState, LoadingState } from "../ui/StateViews";

export function SiteReport(): ReactElement {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(today());
  const [doneItems, setDoneItems] = useState<Record<string, boolean>>({});
  const report = useQuery({ queryKey: ["site-report", id, from, to], queryFn: () => api.siteReport(id, { from, to }), enabled: Boolean(id) });
  const audit = useQuery({ queryKey: ["site-audit", id], queryFn: () => api.siteAudit(id), enabled: Boolean(id), staleTime: 60_000 });
  const optimize = useMutation({
    mutationFn: (contentItemId: string) => api.optimizeContentLinks(contentItemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["site-audit", id] });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
    }
  });
  if (report.isLoading) return <LoadingState />;
  if (report.isError || !report.data) return <ErrorState label="تعذر تحميل تقرير الموقع." />;

  const cards = [
    ["إجمالي المحتوى", report.data.totalContent],
    ["منشور", report.data.published],
    ["داخل المسار", report.data.pipeline],
    ["مكرر", report.data.duplicates],
    ["فشل", report.data.failed],
    ["متوسط الجودة", report.data.averageContentScore],
    ["تكلفة الذكاء الاصطناعي", `$${report.data.aiCost.toFixed(2)}`]
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">تقرير الموقع</h2>
            <p className="text-sm text-slate-500">من {report.data.from} إلى {report.data.to}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DateInput label="من" value={from} onChange={setFrom} />
            <DateInput label="إلى" value={to} onChange={setTo} />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-200 p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">فحص الموقع المباشر</h3>
            <p className="mt-1 text-sm text-slate-500">يشمل المقالات والصفحات المسحوبة من ووردبريس: SEO وAEO وGEO وRankMath وتجربة المستخدم.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-teal/40 hover:bg-slate-50" type="button" onClick={() => audit.refetch()} disabled={audit.isFetching}>
              <RefreshCcw className={`h-4 w-4 ${audit.isFetching ? "animate-spin" : ""}`} />إعادة الفحص
            </button>
            {audit.data ? <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-teal/40 hover:bg-slate-50" type="button" onClick={() => downloadAuditCsv(audit.data)}>
              <Download className="h-4 w-4" />CSV
            </button> : null}
            {audit.data ? <button className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-teal/40 hover:bg-slate-50" type="button" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />PDF
            </button> : null}
          </div>
        </div>
        {audit.isLoading ? <div className="mt-4"><LoadingState label="جاري فحص صفحات ومقالات ووردبريس..." /></div> : null}
        {audit.isError ? <div className="mt-4"><ErrorState label="تعذر فحص ووردبريس. تأكد من بيانات الاتصال والصلاحيات." /></div> : null}
        {audit.data ? (
          <div className="mt-5 space-y-5">
            <AuditSummary audit={audit.data} />
            <AuditChecklist audit={audit.data} doneItems={doneItems} onToggle={(key) => setDoneItems((current) => ({ ...current, [key]: !current[key] }))} />
            <AuditIssues issues={audit.data.issues} onOptimize={(contentItemId) => optimize.mutate(contentItemId)} pendingId={optimize.variables} isPending={optimize.isPending} />
            <ActionError error={optimize.error} />
            <AuditPages audit={audit.data} />
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-semibold">جودة المحتوى</h3>
          <div className="mt-4 space-y-3 text-sm">
            <Metric label="مسودات قابلة للتحليل" value={report.data.quality.draftedCount} />
            <Metric label="تغطية الروابط الداخلية" value={percent(report.data.quality.internalLinkCoverage)} />
            <Metric label="مقالات بدون روابط داخلية" value={report.data.quality.withoutInternalLinks} />
            <Metric label="تغطية الأسئلة الشائعة" value={percent(report.data.quality.faqCoverage)} />
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="font-semibold">أكثر الكلمات تكرارًا</h3>
          {report.data.quality.topKeywords.length === 0 ? (
            <div className="mt-4"><EmptyState label="لا توجد كلمات مستهدفة محفوظة ضمن الفترة." /></div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {report.data.quality.topKeywords.slice(0, 18).map((keyword) => (
                <span key={keyword.keyword} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm">
                  {keyword.keyword} · {keyword.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">محتوى يحتاج تحسين</h3>
        {report.data.quality.lowScore.length === 0 ? (
          <div className="mt-4"><EmptyState label="لا توجد مقالات منخفضة الجودة ضمن الفترة." /></div>
        ) : (
          <ReportTable
            rows={report.data.quality.lowScore.map((row) => ({
              id: row.id,
              title: row.title,
              detail: `${row.score}/100`,
              state: row.status,
              date: row.createdAt
            }))}
          />
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">آخر المحتوى</h3>
        {report.data.quality.recentContent.length === 0 ? (
          <div className="mt-4"><EmptyState label="لا يوجد محتوى ضمن الفترة." /></div>
        ) : (
          <ReportTable
            rows={report.data.quality.recentContent.map((row) => ({
              id: row.id,
              title: row.title,
              detail: row.keyword || "بدون كلمة مستهدفة",
              state: row.status,
              date: row.createdAt
            }))}
          />
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">فرص بحث جوجل</h3>
        {report.data.opportunities.length === 0 ? (
          <div className="mt-4"><EmptyState label="لا توجد فرص محفوظة لهذا الموقع بعد." /></div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">الاستعلام</th>
                  <th className="px-4 py-3">الظهور</th>
                  <th className="px-4 py-3">النقرات</th>
                  <th className="px-4 py-3">نسبة النقر</th>
                  <th className="px-4 py-3">الموضع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.data.opportunities.map((row) => (
                  <tr key={row.query}>
                    <td className="px-4 py-3 font-medium">{row.query}</td>
                    <td className="px-4 py-3">{row.impressions}</td>
                    <td className="px-4 py-3">{row.clicks}</td>
                    <td className="px-4 py-3">{(row.ctr * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3">{row.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AuditSummary(props: { audit: SiteAuditDto }): ReactElement {
  const items = [
    ["درجة الموقع", `${props.audit.score}/100`],
    ["الصفحات", props.audit.totals.pages],
    ["المقالات", props.audit.totals.posts],
    ["مشاكل عالية", props.audit.totals.high],
    ["متوسطة", props.audit.totals.medium],
    ["منخفضة", props.audit.totals.low]
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-bold">{value}</p>
        </div>
      ))}
    </div>
  );
}

function AuditChecklist(props: { audit: SiteAuditDto; doneItems: Record<string, boolean>; onToggle: (key: string) => void }): ReactElement {
  if (props.audit.checklist.length === 0) return <EmptyState label="لا توجد تحسينات حرجة في الفحص الحالي." />;
  return (
    <div className="rounded-md border border-slate-200">
      <div className="border-b border-slate-100 px-4 py-3">
        <h4 className="font-semibold">تشيك ليست التحسينات</h4>
        <p className="mt-1 text-xs text-slate-500">علّم البنود بعد تنفيذها، ثم أعد الفحص للتأكد من التحسن.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {props.audit.checklist.map((item) => (
          <label key={item.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="flex items-center gap-3">
              <input type="checkbox" checked={Boolean(props.doneItems[item.id])} onChange={() => props.onToggle(item.id)} className="h-4 w-4 rounded border-slate-300" />
              <span className={props.doneItems[item.id] ? "text-slate-400 line-through" : "font-medium"}>{item.label}</span>
            </span>
            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${severityClass(item.priority)}`}>{item.count} عنصر</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function AuditIssues(props: { issues: SiteAuditIssueDto[]; onOptimize: (contentItemId: string) => void; pendingId?: string; isPending: boolean }): ReactElement {
  const visible = props.issues.slice(0, 30);
  if (visible.length === 0) return <EmptyState label="لا توجد مشاكل ظاهرة في الفحص الحالي." />;
  return (
    <div className="rounded-md border border-slate-200">
      <div className="border-b border-slate-100 px-4 py-3">
        <h4 className="font-semibold">أهم المشاكل والإجراءات</h4>
      </div>
      <div className="divide-y divide-slate-100">
        {visible.map((issue) => (
          <div key={issue.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-1 text-xs font-semibold ${severityClass(issue.severity)}`}>{severityLabel(issue.severity)}</span>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{categoryLabel(issue.category)}</span>
                <span className="text-xs text-slate-500">{issue.type === "post" ? "مقال" : "صفحة"}</span>
              </div>
              <p className="mt-2 font-semibold">{issue.message}</p>
              <p className="mt-1 text-sm text-slate-500">{issue.pageTitle}</p>
              <p className="mt-1 text-sm text-slate-600">{issue.recommendation}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {issue.action === "OPTIMIZE_LINKS" && issue.contentItemId ? (
                <button className="inline-flex min-h-9 items-center gap-2 rounded-md bg-teal px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" type="button" disabled={props.isPending && props.pendingId === issue.contentItemId} onClick={() => props.onOptimize(issue.contentItemId!)}>
                  <Sparkles className="h-4 w-4" />{props.isPending && props.pendingId === issue.contentItemId ? "جاري التحسين..." : "تحسين بالذكاء"}
                </button>
              ) : null}
              <a className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-teal/40 hover:bg-slate-50" href={issue.pageUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />فتح
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditPages(props: { audit: SiteAuditDto }): ReactElement {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full min-w-[980px] text-right text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-4 py-3">الصفحة</th>
            <th className="px-4 py-3">النوع</th>
            <th className="px-4 py-3">الدرجة</th>
            <th className="px-4 py-3">كلمات</th>
            <th className="px-4 py-3">روابط داخلية</th>
            <th className="px-4 py-3">FAQ</th>
            <th className="px-4 py-3">CTA</th>
            <th className="px-4 py-3">صور بلا ALT</th>
            <th className="px-4 py-3">آخر تعديل</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {props.audit.pages.map((page) => (
            <tr key={`${page.type}-${page.id}`}>
              <td className="max-w-sm px-4 py-3">
                <a className="font-semibold text-teal hover:underline" href={page.url} target="_blank" rel="noreferrer">{page.title}</a>
              </td>
              <td className="px-4 py-3">{page.type === "post" ? "مقال" : "صفحة"}</td>
              <td className="px-4 py-3 font-bold">{page.score}/100</td>
              <td className="px-4 py-3">{page.metrics.wordCount}</td>
              <td className="px-4 py-3">{page.metrics.internalLinks}</td>
              <td className="px-4 py-3">{page.metrics.hasFaq ? "نعم" : "لا"}</td>
              <td className="px-4 py-3">{page.metrics.hasCta ? "نعم" : "لا"}</td>
              <td className="px-4 py-3">{page.metrics.imagesMissingAlt}</td>
              <td className="px-4 py-3">{page.modified ? formatDate(page.modified) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DateInput(props: { label: string; value: string; onChange: (value: string) => void }): ReactElement {
  return (
    <label className="text-xs font-medium text-slate-500">
      {props.label}
      <input type="date" value={props.value} onChange={(event) => props.onChange(event.target.value)} className="mt-1 block rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700" />
    </label>
  );
}

function Metric(props: { label: string; value: string | number }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2">
      <span className="text-slate-500">{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ReportTable(props: { rows: Array<{ id: string; title: string; detail: string; state: ContentState; date: string }> }): ReactElement {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[720px] text-right text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-4 py-3">العنوان</th>
            <th className="px-4 py-3">التفاصيل</th>
            <th className="px-4 py-3">الحالة</th>
            <th className="px-4 py-3">التاريخ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {props.rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-medium">{row.title}</td>
              <td className="px-4 py-3">{row.detail}</td>
              <td className="px-4 py-3"><StatusBadge state={row.state} /></td>
              <td className="px-4 py-3">{formatDate(row.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium" }).format(new Date(value));
}

function severityLabel(value: SiteAuditIssueDto["severity"]): string {
  if (value === "HIGH") return "عالي";
  if (value === "MEDIUM") return "متوسط";
  return "منخفض";
}

function severityClass(value: SiteAuditIssueDto["severity"]): string {
  if (value === "HIGH") return "bg-red-100 text-red-700";
  if (value === "MEDIUM") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function categoryLabel(value: SiteAuditIssueDto["category"]): string {
  const labels: Record<SiteAuditIssueDto["category"], string> = {
    SEO: "SEO",
    AEO: "AEO",
    GEO: "GEO",
    CONTENT: "المحتوى",
    TECHNICAL: "تقني",
    UX: "تجربة المستخدم",
    RANKMATH: "RankMath"
  };
  return labels[value];
}

function downloadAuditCsv(audit: SiteAuditDto): void {
  const rows = [
    ["page", "type", "score", "severity", "category", "issue", "recommendation", "url"],
    ...audit.issues.map((issue) => [
      issue.pageTitle,
      issue.type,
      "",
      issue.severity,
      issue.category,
      issue.message,
      issue.recommendation,
      issue.pageUrl
    ]),
    [],
    ["page", "type", "score", "words", "internal_links", "external_links", "faq", "cta", "missing_alt", "url"],
    ...audit.pages.map((page) => [
      page.title,
      page.type,
      String(page.score),
      String(page.metrics.wordCount),
      String(page.metrics.internalLinks),
      String(page.metrics.externalLinks),
      page.metrics.hasFaq ? "yes" : "no",
      page.metrics.hasCta ? "yes" : "no",
      String(page.metrics.imagesMissingAlt),
      page.url
    ])
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `site-audit-${audit.siteName}-${audit.scannedAt.slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.toISOString().slice(0, 10);
}
