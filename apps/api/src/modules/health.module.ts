import { Controller, Get, HttpStatus, Injectable, Module, OnModuleDestroy, Res } from "@nestjs/common";
import IORedis from "ioredis";
import type { Response } from "express";
import { loadEnv } from "@content-agent/config";
import { DatabaseService } from "../database/database.module";
import { Public } from "../security/access-control";

@Injectable()
class RedisHealthService implements OnModuleDestroy {
  private readonly client = new IORedis(loadEnv().REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    commandTimeout: 2000
  });

  constructor() {
    this.client.on("error", () => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === "ready") await this.client.quit();
    else this.client.disconnect();
  }

  async ping(): Promise<boolean> {
    if (this.client.status === "wait") await this.client.connect();
    return (await this.client.ping()) === "PONG";
  }
}

@Public()
@Controller("health")
class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisHealthService
  ) {}

  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) response: Response): Promise<{ status: "ok" | "degraded"; checks: Record<string, string> }> {
    const checks: Record<string, string> = {};
    try {
      await this.db.query("SELECT 1");
      checks.postgres = "جاهز";
    } catch {
      checks.postgres = "غير جاهز";
    }
    try {
      checks.redis = (await this.redis.ping()) ? "جاهز" : "غير جاهز";
    } catch {
      checks.redis = "غير جاهز";
    }
    const status = readinessStatus(checks);
    response.status(readinessHttpStatus(status));
    return { status, checks };
  }
}

export function readinessStatus(checks: Record<string, string>): "ok" | "degraded" {
  return checks.postgres === "جاهز" && checks.redis === "جاهز" ? "ok" : "degraded";
}

export function readinessHttpStatus(status: "ok" | "degraded"): number {
  return status === "ok" ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
}

@Module({ controllers: [HealthController], providers: [RedisHealthService] })
export class HealthModule {}
