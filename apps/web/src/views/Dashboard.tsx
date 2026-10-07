import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ContentState } from "@content-agent/shared";
import { api } from "../api/client";
import { StatusBadge } from "../ui/Badge";
import { integrationLabels } from "../ui/labels";
import { PageHeader } from "../ui/PageHeader";
import { integrationTone, Pill } from "../ui/Pill";
import { Stat } from "../ui/Stat";
import { EmptyState, ErrorState, LoadingState } from "../ui/StateViews";

export interface PipelineStage {
  id: string;
  label: string;
  value: number;
  color: string;
  /** Stages that need a person to act get the status colour and a warning icon in the legend. */
  problem?: boolean;
}

const stageDefinitions: Array<{ id: string; label: string; states: ContentState[]; color: string; problem?: boolean }> = [
  { id: "prep", label: "قيد التحضير", states: ["NEW", "QUEUED", "IDEAS_READY", "IDEA_SELECTED", "GAPS_READY"], color: "#cbd5e1" },
  { id: "draft", label: "مسودة ومراجعة", states: ["DRAFTED", "REVIEWED", "IMAGE_READY"], color: "#7cc4bb" },
  { id: "ready", label: "جاهز للنشر أو مجدول", states: ["APPROVED", "SCHEDULED"], color: "#2f958b" },
  { id: "published", label: "منشور", states: ["PUBLISHED"], color: "#0f766e" },
  { id: "problem", label: "فشل أو مكرر", states: ["FAILED", "DUPLICATE"], color: "#dc2626", problem: true }
];

/** Thirteen workflow states are too many to read at a glance: group them into the five stages people think in. */
export function groupPipeline(distribution: Array<{ name: ContentState; value: number }>): PipelineStage[] {
  return stageDefinitions.map((stage) => ({
    id: stage.id,
    label: stage.label,
    color: stage.color,
    problem: stage.problem,
    value: distribution.filter((item) => stage.states.includes(item.name)).reduce((total, item) => total + item.value, 0)
  }));
}

export function Dashboard(): ReactElement {
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, refetchInterval: 15000 });
  if (dashboard.isLoading) return <LoadingState />;
  if (dashboard.isError || !dashboard.data) return <ErrorState />;
  const data = dashboard.data;
  const stages = groupPipeline(data.distribution);
  const total = stages.reduce((sum, stage) => sum + stage.value, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="لوحة التحكم" description="أين وصل الإنتاج، وما يحتاج قرارك، وكم أنفقت هذا الشهر." />

      <section aria-label="ملخص" className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-lg border border-slate-200 bg-white p-5 lg:grid-cols-4">
        <Stat label="إجمالي المحتوى" value={data.totalContent} hint={`${data.pipeline} داخل المسار`} />
        <Stat label="منشور" value={data.published} hint={data.scheduled > 0 ? `${data.scheduled} مجدول` : undefined} />
        <Stat label="يحتاج متابعة" value={data.needsAttention} tone={data.needsAttention > 0 ? "warn" : "default"} hint="فشل أو جودة أقل من 60" />
        <Stat label="إنفاق الذكاء الاصطناعي هذا الشهر" value={`$${data.monthlyAiSpend.toFixed(2)}`} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-base font-semibold">خط الإنتاج</h2>
          {total === 0 ? (
            <div className="mt-4"><EmptyState label="لا يوجد محتوى بعد. أنشئ أول مقال من مكتبة المحتوى." /></div>
          ) : (
            <>
              <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={stages.map((stage) => `${stage.label}: ${stage.value}`).join("، ")}>
                {stages.filter((stage) => stage.value > 0).map((stage) => (
                  <div key={stage.id} style={{ width: `${(stage.value / total) * 100}%`, backgroundColor: stage.color }} />
                ))}
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {stages.map((stage) => (
                  <li key={stage.id} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: stage.color }} />
                      <span className={stage.value === 0 ? "text-slate-400" : ""}>{stage.label}</span>
                    </span>
                    <span className="flex items-baseline gap-2 tabular-nums text-slate-600">
                      <span>{stage.value}</span>
                      <span className="w-9 text-start text-xs text-slate-400">{Math.round((stage.value / total) * 100)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">ما يحتاج متابعة</h2>
            {data.attention.length > 0 ? <Link className="text-sm text-teal hover:underline" to="/content">كل المحتوى</Link> : null}
          </div>
          {data.attention.length === 0 ? (
            <div className="mt-4"><EmptyState label="لا توجد عناصر تحتاج متابعة الآن." /></div>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {data.attention.map((row) => (
                <li key={row.id}>
                  <Link to={`/content/${row.id}`} className="flex items-center justify-between gap-3 rounded-md py-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.title}</span>
                      <span className="block truncate text-sm text-slate-500">{row.site} · الدرجة {row.score}</span>
                    </span>
                    <StatusBadge state={row.state} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-base font-semibold">المواقع</h2>
          <Link className="text-sm text-teal hover:underline" to="/sites">إدارة المواقع</Link>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-right text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">الموقع</th>
                <th className="px-3 py-2 font-medium">ووردبريس</th>
                <th className="px-3 py-2 font-medium">رانك ماث</th>
                <th className="px-3 py-2 font-medium">بحث جوجل</th>
                <th className="px-5 py-2 font-medium">منشور</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.sites.map((site) => (
                <tr key={site.id}>
                  <td className="px-5 py-3"><span className="font-medium">{site.name}</span></td>
                  <td className="px-3 py-3"><Pill tone={integrationTone(site.wordpressStatus)} label={integrationLabels[site.wordpressStatus]} /></td>
                  <td className="px-3 py-3"><Pill tone={integrationTone(site.rankMathStatus)} label={integrationLabels[site.rankMathStatus]} /></td>
                  <td className="px-3 py-3"><Pill tone={integrationTone(site.gscStatus)} label={integrationLabels[site.gscStatus]} /></td>
                  <td className="px-5 py-3 tabular-nums">{site.publishedCount} <span className="text-slate-400">من {site.contentCount}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.sites.length === 0 ? <div className="p-5"><EmptyState label="أضف أول موقع من شاشة المواقع." /></div> : null}
      </section>

      {data.opportunities.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white">
          <h2 className="px-5 pt-5 text-base font-semibold">فرص بحث جوجل</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-right text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">الاستعلام</th>
                  <th className="px-3 py-2 font-medium">الموقع</th>
                  <th className="px-3 py-2 font-medium">الظهور</th>
                  <th className="px-3 py-2 font-medium">النقرات</th>
                  <th className="px-3 py-2 font-medium">نسبة النقر</th>
                  <th className="px-5 py-2 font-medium">الموضع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {data.opportunities.map((row) => (
                  <tr key={`${row.siteId}-${row.query}`}>
                    <td className="px-5 py-3 font-medium">{row.query}</td>
                    <td className="px-3 py-3">{row.site}</td>
                    <td className="px-3 py-3">{row.impressions}</td>
                    <td className="px-3 py-3">{row.clicks}</td>
                    <td className="px-3 py-3">{(row.ctr * 100).toFixed(1)}%</td>
                    <td className="px-5 py-3">{row.position.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="text-sm text-slate-400">لا توجد فرص من بحث جوجل بعد. تظهر هنا بعد ربط الموقع ومزامنة البيانات.</p>
      )}
    </div>
  );
}
