import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type ReactElement } from "react";

export interface MenuAction {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Secondary actions behind one "more" button so a row shows its main action and nothing else. */
export function RowMenu(props: { label: string; actions: MenuAction[] }): ReactElement | null {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent): void {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (props.actions.length === 0) return null;
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div role="menu" className="absolute end-0 top-full z-30 mt-1 min-w-44 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {props.actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 ${action.danger ? "text-red-600" : "text-slate-700"}`}
              >
                {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
