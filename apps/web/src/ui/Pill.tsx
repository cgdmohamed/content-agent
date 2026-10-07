import type { ReactElement } from "react";

export type Tone = "ok" | "warn" | "bad" | "muted" | "info";

const dot: Record<Tone, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500", muted: "bg-slate-300", info: "bg-sky-500" };
const text: Record<Tone, string> = { ok: "text-emerald-800", warn: "text-amber-800", bad: "text-red-700", muted: "text-slate-500", info: "text-sky-800" };

/** A status is always a dot plus a word, never colour alone. */
export function Pill(props: { tone: Tone; label: string; className?: string }): ReactElement {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${text[props.tone]} ${props.className ?? ""}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot[props.tone]}`} />
      {props.label}
    </span>
  );
}

export function integrationTone(status: string): Tone {
  if (status === "CONNECTED") return "ok";
  if (status === "NOT_CONFIGURED") return "muted";
  if (status === "BRIDGE_MISSING" || status === "PERMISSION_ERROR") return "warn";
  return "bad";
}
