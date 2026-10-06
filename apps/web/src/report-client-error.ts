const baseUrl = import.meta.env.VITE_API_URL ?? "/api";
const maxReportsPerPageLoad = 5;
let sent = 0;

export interface ClientErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
}

/** Fire-and-forget: reporting must never throw or trigger the session-expiry flow itself. */
export function reportClientError(report: ClientErrorReport): void {
  console.error("[client-error]", report.message, report.stack ?? "");
  if (sent >= maxReportsPerPageLoad) return;
  sent += 1;
  try {
    void fetch(`${baseUrl}/client-errors`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: report.message.slice(0, 500),
        stack: report.stack?.slice(0, 4000),
        componentStack: report.componentStack?.slice(0, 4000),
        url: window.location.pathname
      })
    }).catch(() => undefined);
  } catch {
    // Nothing else to do: the error is already in the console.
  }
}

export function installGlobalErrorReporting(): void {
  window.addEventListener("error", (event) => {
    reportClientError({ message: event.message || "window error", stack: event.error instanceof Error ? event.error.stack : undefined });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    reportClientError({ message: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack : undefined });
  });
}
