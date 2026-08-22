import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { StatusBadge } from "../ui/Badge";
import { integrationLabels, stateLabels } from "../ui/labels";
import { EmptyState, ErrorState, LoadingState } from "../ui/StateViews";

const colors = ["#0f766e", "#b7791f", "#9f1239", "#2563eb", "#7c3aed", "#475569"];

export function Dashboard(): ReactElement {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, refetchInterval: 15000 });
  if (dashboard.isLoading) return <LoadingState />;
  if (dashboard.isError || !dashboard.data) return <ErrorState />;

  const cards = [
    ["إجمالي المحتوى", dashboard.data.totalContent],
    ["داخل خط الإنتاج", dashboard.data.pipeline],
    ["منشور", dashboard.data.published],
    ["يحتاج متابعة", dashboard.data.needsAttention],
    ["مجدول", dashboard.data.scheduled],
    ["إنفاق الذكاء الاصطناعي الشهري", `$${dashboard.data.monthlyAiSpend.toFixed(2)}`]
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold">توزيع خط الإنتاج</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={dashboard.data.distribution.map((item) => ({ ...item, label: stateLabels[item.name] }))} dataKey="value" nameKey="label" innerRadius={58} outerRadius={92}>
                  {dashboard.data.distribution.map((entry, index) => (
                    <Cell key={entry.name} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold">ما يحتاج متابعة</h3>
          {dashboard.data.attention.length === 0 ? <div className="mt-4"><EmptyState label="لا توجد عناصر تحتاج متابعة الآن." /></div> : (
          <div className="mt-4 divide-y divide-slate-100">
            {dashboard.data.attention.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{row.title}</p>
                  <p className="text-sm text-slate-500">{row.site} · الدرجة {row.score}</p>
                </div>
                <StatusBadge state={row.state} />
              </div>
            ))}
          </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold">حالة المواقع</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {dashboard.data.sites.map((site) => (
            <div key={site.id} className="rounded-md border border-slate-200 p-4">
              <p className="font-medium">{site.name}</p>
              <p className="mt-1 text-sm text-slate-500">{site.wordpressUrl}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt>ووردبريس</dt><dd>{integrationLabels[site.wordpressStatus]}</dd></div>
                <div className="flex justify-between"><dt>رانك ماث</dt><dd>{integrationLabels[site.rankMathStatus]}</dd></div>
                <div className="flex justify-between"><dt>بحث جوجل</dt><dd>{integrationLabels[site.gscStatus]}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold">فرص بحث جوجل</h3>
        {dashboard.data.opportunities.length === 0 ? (
          <div className="mt-4"><EmptyState label="لا توجد فرص من بحث جوجل بعد." /></div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">الاستعلام</th>
                  <th className="px-4 py-3">الموقع</th>
                  <th className="px-4 py-3">الظهور</th>
                  <th className="px-4 py-3">النقرات</th>
                  <th className="px-4 py-3">نسبة النقر</th>
                  <th className="px-4 py-3">الموضع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dashboard.data.opportunities.map((row) => (
                  <tr key={`${row.siteId}-${row.query}`}>
                    <td className="px-4 py-3 font-medium">{row.query}</td>
                    <td className="px-4 py-3">{row.site}</td>
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
