import type { ContentState } from "@content-agent/shared";
import type { ReactElement } from "react";
import { stateLabels } from "./labels";

const stateTone: Record<ContentState, string> = {
  NEW: "bg-slate-100 text-slate-700",
  QUEUED: "bg-sky-100 text-sky-700",
  IDEAS_READY: "bg-cyan-100 text-cyan-800",
  IDEA_SELECTED: "bg-teal-100 text-teal-800",
  GAPS_READY: "bg-emerald-100 text-emerald-800",
  DRAFTED: "bg-amber-100 text-amber-800",
  REVIEWED: "bg-indigo-100 text-indigo-800",
  IMAGE_READY: "bg-fuchsia-100 text-fuchsia-800",
  APPROVED: "bg-lime-100 text-lime-800",
  SCHEDULED: "bg-orange-100 text-orange-800",
  PUBLISHED: "bg-green-100 text-green-800",
  DUPLICATE: "bg-rose-100 text-rose-800",
  FAILED: "bg-red-100 text-red-800"
};

export function StatusBadge({ state }: { state: ContentState }): ReactElement {
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${stateTone[state]}`}>{stateLabels[state]}</span>;
}
