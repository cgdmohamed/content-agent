import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { Ban, CheckCircle2, Clock3, FolderOpen, History, LoaderCircle, RotateCcw, Timer, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type JobRunDto } from "../api/client";
import { IconButton } from "../ui/IconButton";
import { ActionError, EmptyState, ErrorState, LoadingState } from "../ui/StateViews";
import { eventTypeLabel, operationLabel, providerLabel, queueLabel } from "../ui/labels";

export function Operations(): ReactElement {
  const queryClient = useQueryClient();
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: api.jobs, refetchInterval: 5000 });
  const audit = useQuery({ queryKey: ["audit"], queryFn: api.audit, refetchInterval: 15000 });
  const retryJob = useMutation({
    mutationFn: api.retryJob,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["jobs"] })
  });
  const cancelJob = useMutation({
    mutationFn: api.cancelJob,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["audit"] });
    }
  });
  if (jobs.isLoading) return <LoadingState />;
  if (jobs.isError || !jobs.data) return <ErrorState />;

  const groups = [
    ["مهام نشطة", jobs.data.active, LoaderCircle],
    ["مهام في الانتظار", jobs.data.waiting, Clock3],
    ["مهام مؤجلة", jobs.data.delayed, Timer],
    ["مهام فشلت", jobs.data.failed, XCircle],
    ["مهام مكتملة", jobs.data.completed, CheckCircle2],
    ["مهام ملغاة", jobs.data.cancelled, Ban]
  ] as const;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2 space-y-2">
        <ActionError error={retryJob.error} />
        <ActionError error={cancelJob.error} />
      </div>
      {groups.map(([group, items, GroupIcon]) => (
        <section key={group} className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold"><GroupIcon className="h-4 w-4 text-teal" />{group}</h2>
          {items.length === 0 ? <div className="mt-4"><EmptyState label="لا توجد مهام في هذه الحالة." /></div> : (
            <div className="mt-4 space-y-2 text-sm">
              {items.map((item, index) => {
                const row = item as JobRunDto;
                return (
                  <div key={index} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{row.title ?? row.topic ?? "عنصر محتوى غير محدد"}</p>
                      {row.status === "FAILED" && row.contentItemId ? (
                        <IconButton icon={RotateCcw} className="min-h-7 px-2 py-1 text-xs" disabled={retryJob.isPending} onClick={() => retryJob.mutate(row.id)}>
                          إعادة المحاولة
                        </IconButton>
                      ) : null}
                      {canCancelJob(row) ? (
                        <IconButton icon={Ban} className="min-h-7 px-2 py-1 text-xs" disabled={cancelJob.isPending} onClick={() => cancelJob.mutate(row.id)}>
                          إلغاء
                        </IconButton>
                      ) : null}
                      {row.contentItemId ? (
                        <Link className="inline-flex min-h-7 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium hover:border-teal/40 hover:bg-slate-50" to={`/content/${row.contentItemId}`}>
                          <FolderOpen className="h-3.5 w-3.5" />
                          فتح المحتوى
                        </Link>
                      ) : null}
                    </div>
                    <dl className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                      <div><dt>العملية</dt><dd>{operationLabel(row.operation)}</dd></div>
                      <div><dt>الطابور</dt><dd>{queueLabel(row.queueName)}</dd></div>
                      <div><dt>المزود</dt><dd>{row.provider ? providerLabel(row.provider) : "غير محدد"}</dd></div>
                      <div><dt>المحاولة</dt><dd>{row.attempt ?? 0}</dd></div>
                      <div><dt>المدة</dt><dd>{typeof row.durationMs === "number" ? formatDuration(row.durationMs) : "غير متاحة"}</dd></div>
                      <div><dt>بدأت</dt><dd>{formatDateTime(row.startedAt)}</dd></div>
                      <div><dt>انتهت</dt><dd>{formatDateTime(row.finishedAt)}</dd></div>
                      <div><dt>الخطأ</dt><dd>{row.error ?? "لا يوجد"}</dd></div>
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}
      <section className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2">
        <h2 className="flex items-center gap-2 font-semibold"><History className="h-4 w-4 text-teal" />سجل التدقيق</h2>
        {audit.isLoading ? <div className="mt-4"><LoadingState /></div> : null}
        {audit.isError ? <div className="mt-4"><ErrorState label="تعذر تحميل سجل التدقيق." /></div> : null}
        {audit.data?.length === 0 ? <div className="mt-4"><EmptyState label="لا توجد أحداث تدقيق بعد." /></div> : null}
        {audit.data && audit.data.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-right text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">الحدث</th>
                  <th className="px-4 py-3">المستخدم</th>
                  <th className="px-4 py-3">المحتوى</th>
                  <th className="px-4 py-3">الموقع</th>
                  <th className="px-4 py-3">الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {audit.data.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-3"><span className="font-medium">{event.message}</span><span className="block text-xs text-slate-500">{eventTypeLabel(event.eventType)}</span></td>
                    <td className="px-4 py-3">{event.actorName ?? "النظام"}</td>
                    <td className="px-4 py-3">{event.contentTitle ?? "-"}</td>
                    <td className="px-4 py-3">{event.siteName ?? "-"}</td>
                    <td className="px-4 py-3">{new Date(event.createdAt).toLocaleString("ar")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
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

function formatDateTime(value?: string | null): string {
  if (!value) return "لم تبدأ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير متاح";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
