import type { Logger } from "@content-agent/shared";
import type { HttpMetrics } from "@content-agent/shared";

interface LoggedRequest {
  method: string;
  originalUrl?: string;
  url?: string;
  requestId?: string;
  user?: { id?: string };
}

interface LoggedResponse {
  statusCode: number;
  on(event: "finish", listener: () => void): unknown;
}

const quietPrefixes = ["/api/health", "/api/metrics"];

/** Path only: query strings can carry search terms or identifiers that do not belong in logs. */
export function pathOf(request: LoggedRequest): string {
  return (request.originalUrl ?? request.url ?? "").split("?")[0] ?? "";
}

export function requestLogger(logger: Logger, http: HttpMetrics) {
  return (request: LoggedRequest, response: LoggedResponse, next: () => void): void => {
    const started = process.hrtime.bigint();
    response.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const path = pathOf(request);
      http.record(request.method, response.statusCode, durationMs);
      if (quietPrefixes.some((prefix) => path.startsWith(prefix)) && response.statusCode < 500) return;
      const fields = { requestId: request.requestId, method: request.method, path, status: response.statusCode, durationMs: Math.round(durationMs), userId: request.user?.id };
      if (response.statusCode >= 500) logger.error("http request failed", fields);
      else if (response.statusCode >= 400) logger.warn("http request rejected", fields);
      else logger.info("http request", fields);
    });
    next();
  };
}
