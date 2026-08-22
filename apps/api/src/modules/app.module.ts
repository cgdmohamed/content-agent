import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuditModule } from "../audit/audit.module";
import { DatabaseModule } from "../database/database.module";
import { JobQueueModule } from "../queue/job-queue.module";
import { SessionGuard } from "../security/access-control";
import { AuthModule } from "./auth.module";
import { ContentModule } from "./content.module";
import { DashboardModule } from "./dashboard.module";
import { HealthModule } from "./health.module";
import { JobsModule } from "./jobs.module";
import { ReportsModule } from "./reports.module";
import { SettingsModule } from "./settings.module";
import { SitesModule } from "./sites.module";
import { UsersModule } from "./users.module";

@Module({
  imports: [DatabaseModule, AuditModule, JobQueueModule, AuthModule, SitesModule, ContentModule, DashboardModule, JobsModule, ReportsModule, SettingsModule, UsersModule, HealthModule],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }]
})
export class AppModule {}
