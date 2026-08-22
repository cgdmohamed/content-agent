import type { ReactElement } from "react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ContentState } from "@content-agent/shared";
import { api } from "../api/client";
import { StatusBadge } from "../ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "../ui/StateViews";

export function SiteReport(): ReactElement {
  const { id = "" } = useParams();
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(today());
  const report = useQuery({ queryKey: ["site-report", id, from, to], queryFn: () => api.siteReport(id, { from, to }), enabled: Boolean(id) });
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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFrom(): string {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.toISOString().slice(0, 10);
}
