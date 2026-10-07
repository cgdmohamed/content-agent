import type { ReactElement, ReactNode } from "react";

export function PageHeader(props: { title: string; description?: string | undefined; actions?: ReactNode }): ReactElement {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-ink">{props.title}</h1>
        {props.description ? <p className="mt-1 max-w-2xl text-sm text-slate-500">{props.description}</p> : null}
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}
