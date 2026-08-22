import "reflect-metadata";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { loadEnv } from "@content-agent/config";
import { AppModule } from "./modules/app.module.js";
import { ApiExceptionFilter } from "./security/api-exception-filter.js";
import { formBodyLimit, jsonBodyLimit } from "./security/payload-limits.js";
import { requestIdMiddleware } from "./security/request-id.js";
import { validationExceptionFactory } from "./security/validation-errors.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.enableShutdownHooks();
  app.setGlobalPrefix("api");
  app.use(requestIdMiddleware);
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
  const port = env.API_PORT;
  await app.listen(port);
}

void bootstrap();
