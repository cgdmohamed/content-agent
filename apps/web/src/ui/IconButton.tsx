import type { ComponentType, ReactElement } from "react";
import { clsx } from "clsx";

type Tone = "primary" | "neutral" | "danger" | "ghost";

const toneClasses: Record<Tone, string> = {
  primary: "border-teal bg-teal text-white hover:bg-teal/90",
  neutral: "border-slate-200 bg-white text-slate-700 hover:border-teal/40 hover:bg-slate-50",
  danger: "border-red-200 bg-white text-red-700 hover:bg-red-50",
  ghost: "border-transparent bg-transparent text-slate-600 hover:bg-slate-100"
};

export function IconButton(props: {
  icon: ComponentType<{ className?: string }>;
  children: string;
  type?: "button" | "submit";
  tone?: Tone;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}): ReactElement {
  const Icon = props.icon;
  return (
    <button
      type={props.type ?? "button"}
      className={clsx(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400",
        toneClasses[props.tone ?? "neutral"],
        props.className
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.children}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{props.children}</span>
    </button>
  );
}
