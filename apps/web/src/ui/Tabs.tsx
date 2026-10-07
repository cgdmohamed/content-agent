import type { KeyboardEvent, ReactElement } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Shown as a small count next to the label; 0 is shown muted so empty tabs are easy to skip. */
  count?: number;
}

/** Accessible tab list (arrow keys move between tabs). Panels are rendered by the caller. */
export function Tabs<T extends string>(props: { label: string; items: Array<TabItem<T>>; value: T; onChange: (id: T) => void; className?: string }): ReactElement {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = props.items.findIndex((item) => item.id === props.value);
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    // In RTL the "next" tab is to the left.
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    let next = index;
    if (event.key === forward) next = (index + 1) % props.items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = props.items.length - 1;
    else next = (index - 1 + props.items.length) % props.items.length;
    props.onChange(props.items[next]!.id);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={props.label} onKeyDown={onKeyDown} className={`flex gap-1 overflow-x-auto border-b border-slate-200 ${props.className ?? ""}`}>
      {props.items.map((item) => {
        const active = item.id === props.value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => props.onChange(item.id)}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              active ? "border-teal text-teal" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? "bg-teal/10 text-teal" : item.count === 0 ? "bg-slate-100 text-slate-400" : "bg-slate-100 text-slate-600"}`}>{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
