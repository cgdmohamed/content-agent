// Structured logging shared by the API and the worker. One JSON object per line so log shippers
// (Loki, CloudWatch, Coolify's log viewer) can filter on fields instead of parsing prose.

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  service: string;
  format?: "json" | "pretty";
  level?: LogLevel;
  /** Test seam; defaults to console.* so container runtimes split stdout/stderr by level. */
  sink?: (level: LogLevel, line: string) => void;
  now?: () => Date;
  baseFields?: LogFields;
}

const levelOrder: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const sensitiveKey = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential|private/i;
const maxStringLength = 2000;

export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack?.slice(0, 4000) };
  return { message: String(error) };
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return serializeError(value);
  if (typeof value === "string") return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}…` : value;
  if (value === null || typeof value !== "object") return value;
  if (depth >= 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogValue(item, depth + 1));
  const result: LogFields = {};
  for (const [key, inner] of Object.entries(value as LogFields)) {
    result[key] = sensitiveKey.test(key) ? "[redacted]" : sanitizeLogValue(inner, depth + 1);
  }
  return result;
}

export function createLogger(options: LoggerOptions): Logger {
  const threshold = levelOrder[options.level ?? "info"];
  const format = options.format ?? "json";
  const now = options.now ?? (() => new Date());
  const sink =
    options.sink ??
    ((level: LogLevel, line: string) => {
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    });

  function emit(level: LogLevel, message: string, fields: LogFields | undefined, base: LogFields): void {
    if (levelOrder[level] < threshold) return;
    const merged = sanitizeLogValue({ ...base, ...fields }) as LogFields;
    if (format === "pretty") {
      const extra = Object.keys(merged).length > 0 ? ` ${JSON.stringify(merged)}` : "";
      sink(level, `${now().toISOString()} ${level.toUpperCase()} [${options.service}] ${message}${extra}`);
      return;
    }
    // Reserved keys last so a caller cannot overwrite them by accident.
    sink(level, JSON.stringify({ ...merged, ts: now().toISOString(), level, service: options.service, msg: message }));
  }

  function make(base: LogFields): Logger {
    return {
      debug: (message, fields) => emit("debug", message, fields, base),
      info: (message, fields) => emit("info", message, fields, base),
      warn: (message, fields) => emit("warn", message, fields, base),
      error: (message, fields) => emit("error", message, fields, base),
      child: (fields) => make({ ...base, ...fields })
    };
  }
  return make(options.baseFields ?? {});
}
