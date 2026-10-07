import cookieParser from "cookie-parser";
import helmet from "helmet";
import { json, urlencoded } from "express";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import type { AppEnv } from "@content-agent/config";
import { ApiExceptionFilter } from "./security/api-exception-filter.js";
import { formBodyLimit, jsonBodyLimit } from "./security/payload-limits.js";
import { observability } from "./observability/observability.js";
import { requestLogger } from "./observability/request-logger.js";
import { requestIdMiddleware } from "./security/request-id.js";
import { validationExceptionFactory } from "./security/validation-errors.js";

/** Everything main.ts applies to the Nest app, shared so integration tests exercise the real HTTP pipeline. */
export function configureApp(app: INestApplication, env: Pick<AppEnv, "PUBLIC_WEB_URL" | "TRUST_PROXY_HOPS">): void {
  app.getHttpAdapter().getInstance().set("trust proxy", env.TRUST_PROXY_HOPS);
  app.enableShutdownHooks();
  app.setGlobalPrefix("api");
  app.use(requestIdMiddleware);
  app.use(requestLogger(observability().logger, observability().http));
  app.use(helmet());
  app.use(json({ limit: jsonBodyLimit }));
  app.use(urlencoded({ extended: true, limit: formBodyLimit }));
  app.use(cookieParser());
  app.enableCors({
    origin: env.PUBLIC_WEB_URL,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory
    })
  );
  app.useGlobalFilters(new ApiExceptionFilter());
}
