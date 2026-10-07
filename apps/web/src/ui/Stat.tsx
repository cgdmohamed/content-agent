import type { ReactElement } from "react";

/** One figure with its label. Only used where the number is the point (dashboard, usage). */
export function Stat(props: { label: string; value: string | number; hint?: string | undefined; tone?: "default" | "warn" | "bad" }): ReactElement {
  const color = props.tone === "bad" ? "text-red-600" : props.tone === "warn" ? "text-amber-700" : "text-ink";
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-slate-500">{props.label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums leading-tight ${color}`}>{props.value}</p>
      {props.hint ? <p className="mt-0.5 truncate text-xs text-slate-500">{props.hint}</p> : null}
    </div>
  );
}
