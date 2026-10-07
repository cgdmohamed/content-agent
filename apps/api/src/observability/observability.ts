import { createLogger, HttpMetrics, type Logger } from "@content-agent/shared";

export interface Observability {
  logger: Logger;
  http: HttpMetrics;
  startedAt: number;
}

function defaults(): Observability {
  const format = process.env.LOG_FORMAT === "json" || (process.env.LOG_FORMAT !== "pretty" && process.env.NODE_ENV === "production") ? "json" : "pretty";
  const level = (["debug", "info", "warn", "error"] as const).find((candidate) => candidate === process.env.LOG_LEVEL) ?? "info";
  return { logger: createLogger({ service: "api", format, level }), http: new HttpMetrics(), startedAt: Date.now() };
}

let current: Observability | null = null;

/** Process-wide logger and HTTP counters, created lazily from the environment. */
export function observability(): Observability {
  current ??= defaults();
  return current;
}

export function setObservabilityForTests(value: Observability | null): void {
  current = value;
}
