import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { Ban, RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type JobRunDto, type JobsDto } from "../api/client";
import { IconButton } from "../ui/IconButton";
import { PageHeader } from "../ui/PageHeader";
import { Pill, type Tone } from "../ui/Pill";
import { Tabs, type TabItem } from "../ui/Tabs";
import { ActionError, EmptyState, ErrorState, LoadingState } from "../ui/StateViews";
import { eventTypeLabel, operationLabel, providerLabel } from "../ui/labels";

type JobTab = keyof JobsDto | "audit";

const jobTabs: Array<{ id: keyof JobsDto; label: string; tone: Tone }> = [
  { id: "failed", label: "فشلت", tone: "bad" },
  { id: "active", label: "نشطة", tone: "info" },
  { id: "waiting", label: "في الانتظار", tone: "muted" },
  { id: "delayed", label: "مؤجلة", tone: "muted" },
  { id: "completed", label: "مكتملة", tone: "ok" },
  { id: "cancelled", label: "ملغاة", tone: "muted" }
];

/** Open on whatever needs a person first: failures, then running work, then the queue. */
export function defaultJobTab(jobs: JobsDto): JobTab {
  if (jobs.failed.length > 0) return "failed";
  if (jobs.active.length > 0) return "active";
  if (jobs.waiting.length > 0 || jobs.delayed.length > 0) return jobs.waiting.length > 0 ? "waiting" : "delayed";
  return "completed";
}

export function Operations(): ReactElement {
  const queryClient = useQueryClient();
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: api.jobs, refetchInterval: 5000 });
  const audit = useQuery({ queryKey: ["audit"], queryFn: api.audit, refetchInterval: 15000 });
  const [chosen, setChosen] = useState<JobTab | null>(null);
  const [auditLimit, setAuditLimit] = useState(20);
  const retryJob = useMutation({
    meta: { successMessage: "تمت إعادة المحاولة" },
    mutationFn: api.retryJob,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["jobs"] })
  });
  const cancelJob = useMutation({
    meta: { successMessage: "تم إلغاء المهمة" },
    mutationFn: api.cancelJob,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    }
  });
  if (jobs.isLoading) return <LoadingState />;
  if (jobs.isError || !jobs.data) return <ErrorState />;

  const data = jobs.data;
  const tab = chosen ?? defaultJobTab(data);
  const items: Array<TabItem<JobTab>> = [
    ...jobTabs.map((entry) => ({ id: entry.id as JobTab, label: entry.label, count: data[entry.id].length })),
    { id: "audit" as JobTab, label: "سجل التدقيق" }
  ];
  const current = jobTabs.find((entry) => entry.id === tab);

  return (
    <div className="space-y-4">
      <PageHeader title="العمليات" description="المهام التي تعمل في الخلفية، وما فشل منها، وسجل ما فعله المستخدمون." />
      <div className="space-y-2 empty:hidden">
        <ActionError error={retryJob.error} />
        <ActionError error={cancelJob.error} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <Tabs label="تصنيف المهام" items={items} value={tab} onChange={setChosen} className="px-2" />
        <div role="tabpanel">
          {tab === "audit" ? (
            <AuditList audit={audit} limit={auditLimit} onMore={() => setAuditLimit((value) => value + 30)} />
          ) : data[tab].length === 0 ? (
            <div className="p-4"><EmptyState label="لا توجد مهام في هذه الحالة." /></div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data[tab].map((row, index) => (
                <JobRow key={row.id ?? index} row={row} tone={current?.tone ?? "muted"} retrying={retryJob.isPending} cancelling={cancelJob.isPending} onRetry={() => retryJob.mutate(row.id)} onCancel={() => cancelJob.mutate(row.id)} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function JobRow(props: { row: JobRunDto; tone: Tone; retrying: boolean; cancelling: boolean; onRetry: () => void; onCancel: () => void }): ReactElement {
  const { row } = props;
  const title = row.title ?? row.topic ?? "عنصر غير محدد";
  const details = [
    operationLabel(row.operation),
    row.provider ? providerLabel(row.provider) : null,
    typeof row.durationMs === "number" ? formatDuration(row.durationMs) : null,
    row.attempt > 1 ? `المحاولة ${row.attempt}` : null,
    formatDateTime(row.finishedAt ?? row.startedAt)
  ].filter(Boolean);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {row.contentItemId ? (
            <Link className="block truncate font-medium hover:text-teal" to={`/content/${row.contentItemId}`}>{title}</Link>
          ) : (
            <p className="truncate font-medium">{title}</p>
          )}
          <p className="mt-0.5 truncate text-xs text-slate-500">{details.join(" · ")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {row.status === "FAILED" && row.contentItemId ? (
            <IconButton icon={RotateCcw} className="min-h-8 px-3 py-1" disabled={props.retrying} onClick={props.onRetry}>إعادة المحاولة</IconButton>
          ) : null}
          {canCancelJob(row) ? (
            <IconButton icon={Ban} className="min-h-8 px-3 py-1" disabled={props.cancelling} onClick={props.onCancel}>إلغاء</IconButton>
          ) : null}
        </div>
      </div>
      {row.error ? <p className="mt-1.5 line-clamp-2 text-xs text-red-700" title={row.error}><Pill tone="bad" label="الخطأ" className="ml-2" />{row.error}</p> : null}
    </li>
  );
}

function AuditList(props: { audit: ReturnType<typeof useQuery<Awaited<ReturnType<typeof api.audit>>>>; limit: number; onMore: () => void }): ReactElement {
  const { audit } = props;
  if (audit.isLoading) return <div className="p-4"><LoadingState /></div>;
  if (audit.isError) return <div className="p-4"><ErrorState label="تعذر تحميل سجل التدقيق." /></div>;
  if (!audit.data || audit.data.length === 0) return <div className="p-4"><EmptyState label="لا توجد أحداث تدقيق بعد." /></div>;
  const visible = audit.data.slice(0, props.limit);
  return (
    <div>
      <ul className="divide-y divide-slate-100">
        {visible.map((event) => (
          <li key={event.id} className="px-4 py-2.5">
            <p className="text-sm font-medium">{event.message}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {[event.actorName ?? "النظام", event.contentTitle, event.siteName, new Date(event.createdAt).toLocaleString("ar"), eventTypeLabel(event.eventType)].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      {audit.data.length > props.limit ? (
        <div className="border-t border-slate-100 p-3 text-center">
          <button type="button" className="text-sm font-medium text-teal hover:underline" onClick={props.onMore}>عرض المزيد ({audit.data.length - props.limit})</button>
        </div>
      ) : null}
    </div>
  );
}

function canCancelJob(job: JobRunDto): boolean {
  return ["WAITING", "DELAYED"].includes(job.status.toUpperCase());
}

function formatDuration(value: number): string {
  if (value < 1000) return `${value} مللي ثانية`;
  return `${(value / 1000).toFixed(1)} ثانية`;
}

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
