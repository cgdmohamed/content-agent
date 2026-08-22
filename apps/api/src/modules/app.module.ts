import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { JobQueueModule } from "../queue/job-queue.module.js";
import { SessionGuard } from "../security/access-control.js";
import { AuthModule } from "./auth.module.js";
import { ContentModule } from "./content.module.js";
import { DashboardModule } from "./dashboard.module.js";
import { HealthModule } from "./health.module.js";
import { JobsModule } from "./jobs.module.js";
import { ReportsModule } from "./reports.module.js";
import { SettingsModule } from "./settings.module.js";
import { SitesModule } from "./sites.module.js";
import { UsersModule } from "./users.module.js";

@Module({
  imports: [DatabaseModule, AuditModule, JobQueueModule, AuthModule, SitesModule, ContentModule, DashboardModule, JobsModule, ReportsModule, SettingsModule, UsersModule, HealthModule],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }]
})
export class AppModule {}
