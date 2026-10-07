import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadEnv } from "@content-agent/config";
import { AppModule } from "./modules/app.module.js";
import { configureApp } from "./app-setup.js";
import { nestLogger } from "./observability/nest-logger.js";
import { observability } from "./observability/observability.js";
import { flushMonitoring, initMonitoring } from "@content-agent/shared/monitoring";

async function bootstrap(): Promise<void> {
  console.info("بدء تشغيل API...");
  const env = loadEnv();
  console.info(`تم تحميل إعدادات API. المنفذ: ${env.API_PORT}`);
  const { logger } = observability();
  const monitoring = await initMonitoring({ dsn: env.SENTRY_DSN, service: "api", environment: env.SENTRY_ENVIRONMENT });
  if (monitoring) logger.info("error tracking enabled");
  // Structured Nest logs in production; Nest's readable default while developing.
  const useJson = env.LOG_FORMAT === "json" || (env.LOG_FORMAT === undefined && env.NODE_ENV === "production");
  const app = await NestFactory.create(AppModule, useJson ? { logger: nestLogger(logger) } : {});
  console.info("تم إنشاء تطبيق API.");
  configureApp(app, env);
  const port = env.API_PORT;
  await app.listen(port);
  console.info(`API جاهز ويستمع على المنفذ ${port}.`);
}

await bootstrap().catch(async (error: unknown) => {
  console.error("فشل تشغيل API.");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  await flushMonitoring();
  process.exit(1);
});
