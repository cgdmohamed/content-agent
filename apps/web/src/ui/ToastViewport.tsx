import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useSyncExternalStore, type ReactElement } from "react";
import { dismissToast, getToasts, subscribeToasts, type ToastKind } from "./toast";

const styles: Record<ToastKind, string> = {
  success: "border-teal/30 bg-white text-slate-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-slate-200 bg-white text-slate-800"
};

const icons = { success: CheckCircle2, error: AlertCircle, info: Info } as const;
const iconColors: Record<ToastKind, string> = { success: "text-teal", error: "text-red-600", info: "text-slate-500" };

export function ToastViewport(): ReactElement {
  const items = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" dir="rtl">
      {items.map((item) => {
        const Icon = icons[item.kind];
        return (
          <div key={item.id} role={item.kind === "error" ? "alert" : "status"} className={`pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-lg ${styles[item.kind]}`}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColors[item.kind]}`} />
            <p className="flex-1 leading-6">{item.message}</p>
            <button type="button" aria-label="إغلاق" className="rounded p-1 text-slate-500 hover:bg-black/5" onClick={() => dismissToast(item.id)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
