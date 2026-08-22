import type { ReactElement } from "react";
import { errorMessage } from "../api/client";

export function LoadingState({ label = "جاري التحميل..." }: { label?: string }): ReactElement {
  return <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{label}</div>;
}

export function ErrorState({ label = "تعذر تحميل البيانات. تأكد من تشغيل الخادم وقاعدة البيانات." }: { label?: string }): ReactElement {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">{label}</div>;
}

export function EmptyState({ label }: { label: string }): ReactElement {
  return <div className="rounded-md border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">{label}</div>;
}

export function ActionError({ error }: { error: unknown }): ReactElement | null {
  if (!error) return null;
  return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage(error)}</div>;
}
