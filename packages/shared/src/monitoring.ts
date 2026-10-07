// Node-only helper: exposed as "@content-agent/shared/monitoring". Error tracking is optional:
// without SENTRY_DSN every function is a cheap no-op and @sentry/node is never even loaded.

type SentryModule = typeof import("@sentry/node");

let sentry: SentryModule | null = null;

export interface MonitoringOptions {
  dsn?: string;
  service: string;
  environment?: string;
  release?: string;
}

export async function initMonitoring(options: MonitoringOptions): Promise<boolean> {
  if (!options.dsn?.trim()) return false;
  const module = await import("@sentry/node");
  module.init({
    dsn: options.dsn,
    environment: options.environment ?? process.env.NODE_ENV,
    release: options.release,
    // Errors only: no performance tracing (PII is not sent unless explicitly enabled, which we never do).
    tracesSampleRate: 0,
    initialScope: { tags: { service: options.service } }
  });
  sentry = module;
  return true;
}

export function monitoringEnabled(): boolean {
  return sentry !== null;
}

export function captureException(error: unknown, context: Record<string, unknown> = {}): void {
  if (!sentry) return;
  sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) scope.setExtra(key, value);
    sentry!.captureException(error);
  });
}

export function captureMessage(message: string, context: Record<string, unknown> = {}): void {
  if (!sentry) return;
  sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) scope.setExtra(key, value);
    sentry!.captureMessage(message, "error");
  });
}

export async function flushMonitoring(timeoutMs = 2000): Promise<void> {
  if (sentry) await sentry.flush(timeoutMs);
}
