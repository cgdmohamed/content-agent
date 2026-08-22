import { Controller, Get, Global, Injectable, Module } from "@nestjs/common";
import { DatabaseService } from "../database/database.module.js";
import { Roles } from "../security/access-control.js";

export interface AuditEvent {
  actorUserId?: string | null;
  contentItemId?: string | null;
  siteId?: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const sensitiveMetadataKeyPattern = /(password|secret|token|api[_-]?key|private[_-]?key|credential|authorization|cookie|json)/i;
const maxAuditStringLength = 500;
const maxAuditArrayItems = 20;
const maxAuditDepth = 4;

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async record(event: AuditEvent): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_logs (actor_user_id, content_item_id, site_id, event_type, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        event.actorUserId ?? null,
        event.contentItemId ?? null,
        event.siteId ?? null,
        event.eventType,
        event.message,
        JSON.stringify(sanitizeAuditMetadata(event.metadata ?? {}))
      ]
    );
  }

  async listRecent(): Promise<Array<Record<string, unknown>>> {
    const result = await this.db.query(
      `SELECT a.id,
              a.actor_user_id AS "actorUserId",
              u.name AS "actorName",
              a.content_item_id AS "contentItemId",
              c.title AS "contentTitle",
              a.site_id AS "siteId",
              s.name AS "siteName",
              a.event_type AS "eventType",
              a.message,
              a.metadata,
              a.created_at AS "createdAt"
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       LEFT JOIN content_items c ON c.id = a.content_item_id
       LEFT JOIN sites s ON s.id = a.site_id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );
    return result.rows.map((row) => ({
      ...row,
      metadata: sanitizeAuditMetadata(row.metadata)
    }));
  }
}

@Controller("audit")
@Roles("ADMIN")
class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(): Promise<Array<Record<string, unknown>>> {
    return this.audit.listRecent();
  }
}

@Global()
@Module({ controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}

export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > maxAuditDepth) return "[تم الاختصار]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeAuditString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, maxAuditArrayItems).map((item) => sanitizeAuditMetadata(item, depth + 1));
  if (typeof value !== "object") return String(value);

  const clean: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveMetadataKeyPattern.test(key)) {
      clean[key] = "[محجوب]";
      continue;
    }
    clean[key] = sanitizeAuditMetadata(item, depth + 1);
  }
  return clean;
}

function sanitizeAuditString(value: string): string {
  if (value.length <= maxAuditStringLength) return value;
  return `${value.slice(0, maxAuditStringLength)}...`;
}
