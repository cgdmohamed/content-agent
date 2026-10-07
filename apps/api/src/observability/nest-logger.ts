import type { LoggerService } from "@nestjs/common";
import type { Logger } from "@content-agent/shared";

/** Routes Nest's own framework logs (startup, route mapping, DI errors) through the structured logger. */
export function nestLogger(logger: Logger): LoggerService {
  const text = (message: unknown): string => (typeof message === "string" ? message : message instanceof Error ? message.message : JSON.stringify(message));
  return {
    log: (message, context) => logger.info(text(message), context ? { context: String(context) } : undefined),
    warn: (message, context) => logger.warn(text(message), context ? { context: String(context) } : undefined),
    error: (message, stack, context) => logger.error(text(message), { stack: typeof stack === "string" ? stack : undefined, context: context ? String(context) : undefined }),
    debug: (message, context) => logger.debug(text(message), context ? { context: String(context) } : undefined),
    verbose: (message, context) => logger.debug(text(message), context ? { context: String(context) } : undefined)
  };
}
