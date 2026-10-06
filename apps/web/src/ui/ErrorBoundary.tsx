import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactElement, type ReactNode } from "react";
import { reportClientError } from "../report-client-error";

interface Props {
  children: ReactNode;
  /** Changing this value (e.g. the route path) clears a previous error. */
  resetKey?: string;
  /** "page" fills the screen; "section" renders inside the layout so navigation stays usable. */
  scope?: "page" | "section";
}

interface State {
  error: Error | null;
  resetKey?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError({ message: error.message, stack: error.stack, componentStack: info.componentStack ?? undefined });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <ErrorFallback scope={this.props.scope ?? "section"} onRetry={() => this.setState({ error: null })} />;
  }
}

function ErrorFallback(props: { scope: "page" | "section"; onRetry: () => void }): ReactElement {
  const panel = (
    <div role="alert" className="mx-auto max-w-lg rounded-lg border border-red-200 bg-white p-6 text-right">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-100 text-red-700"><AlertTriangle className="h-5 w-5" /></span>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">حدث خطأ في عرض هذه الصفحة</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">تم تسجيل المشكلة تلقائيًا. تعديلاتك غير المحفوظة في المقالات محفوظة محليًا وستُعرض عليك للاسترجاع. جرّب إعادة المحاولة، وإن تكرر الخطأ حدّث الصفحة أو تواصل مع المسؤول.</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => window.location.assign("/")}>
          <Home className="h-4 w-4" />الرئيسية
        </button>
        <button type="button" className="inline-flex items-center gap-2 rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white" onClick={props.onRetry}>
          <RotateCcw className="h-4 w-4" />إعادة المحاولة
        </button>
      </div>
    </div>
  );
  if (props.scope === "page") return <main className="flex min-h-screen items-center justify-center bg-mist px-5" dir="rtl">{panel}</main>;
  return <div className="py-10" dir="rtl">{panel}</div>;
}
