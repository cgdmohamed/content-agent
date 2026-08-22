#!/usr/bin/env node
import { createCipheriv, randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import pg from "pg";
import sodium from "libsodium-wrappers";

const { Pool } = pg;
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = !apply;

const required = ["DATABASE_URL", "ENCRYPTION_KEY_BASE64"];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`متغير البيئة المطلوب غير موجود: ${name}`);
    process.exit(1);
  }
}

const legacyConfig = process.env.LEGACY_MYSQL_URL
  ? process.env.LEGACY_MYSQL_URL
  : {
      host: process.env.LEGACY_MYSQL_HOST,
      port: process.env.LEGACY_MYSQL_PORT ? Number(process.env.LEGACY_MYSQL_PORT) : 3306,
      user: process.env.LEGACY_MYSQL_USER,
      password: process.env.LEGACY_MYSQL_PASSWORD,
      database: process.env.LEGACY_MYSQL_DATABASE,
      charset: "utf8mb4"
    };

if (!process.env.LEGACY_MYSQL_URL) {
  for (const name of ["LEGACY_MYSQL_HOST", "LEGACY_MYSQL_USER", "LEGACY_MYSQL_DATABASE"]) {
    if (!process.env[name]) {
      console.error(`متغير البيئة المطلوب غير موجود: ${name}`);
      process.exit(1);
    }
  }
}

await sodium.ready;

const legacyKey = process.env.LEGACY_ENCRYPTION_KEY_BASE64 ? Buffer.from(process.env.LEGACY_ENCRYPTION_KEY_BASE64, "base64") : null;
const targetKey = Buffer.from(process.env.ENCRYPTION_KEY_BASE64, "base64");
if (targetKey.length !== 32) {
  console.error("ENCRYPTION_KEY_BASE64 يجب أن يفك إلى 32 بايت بالضبط.");
  process.exit(1);
}
if (legacyKey && legacyKey.length !== sodium.crypto_secretbox_KEYBYTES) {
  console.error("LEGACY_ENCRYPTION_KEY_BASE64 يجب أن يفك إلى 32 بايت بالضبط.");
  process.exit(1);
}

const mysqlConn = await mysql.createConnection(legacyConfig);
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

const stats = {
  users: { imported: 0, skipped: 0 },
  sites: { imported: 0, skipped: 0 },
  content: { imported: 0, skipped: 0 },
  usage: { imported: 0, skipped: 0 }
};

try {
  const tables = await getLegacyTables();
  if (!tables.has("users") || !tables.has("sites") || !tables.has("content_items")) {
    throw new Error("قاعدة البيانات القديمة يجب أن تحتوي على جداول users و sites و content_items.");
  }

  await ensureTargetReady();
  const columns = {
    users: await getColumns("users"),
    sites: await getColumns("sites"),
    content: await getColumns("content_items"),
    usage: tables.has("api_usage_log") ? await getColumns("api_usage_log") : new Set()
  };

  await withTargetTransaction(async (client) => {
    const userMap = await migrateUsers(client, columns.users);
    const siteMap = await migrateSites(client, columns.sites);
    await migrateContent(client, columns.content, userMap, siteMap);
    if (tables.has("api_usage_log")) await migrateUsage(client, columns.usage);
  });

  printSummary();
} finally {
  await mysqlConn.end();
  await pgPool.end();
}

async function withTargetTransaction(callback) {
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    await callback(client);
    if (dryRun) {
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureTargetReady() {
  const { rows } = await pgPool.query(
    "SELECT to_regclass('public.users') users, to_regclass('public.sites') sites, to_regclass('public.content_items') content, to_regclass('public.legacy_migration_map') map"
  );
  const missing = Object.entries(rows[0])
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`قاعدة البيانات الجديدة ينقصها الجداول المطلوبة: ${missing.join(", ")}. شغل API مرة واحدة لتطبيق الترحيلات أولًا.`);
  }
}

async function getLegacyTables() {
  const [rows] = await mysqlConn.query("SHOW TABLES");
  return new Set(rows.flatMap((row) => Object.values(row).map(String)));
}

async function getColumns(table) {
  const [rows] = await mysqlConn.query(`SHOW COLUMNS FROM ${table}`);
  return new Set(rows.map((row) => row.Field));
}

function selectColumns(table, columns) {
  return [...columns].map((column) => `\`${column}\``).join(", ");
}

async function migrateUsers(client, columns) {
  const map = new Map();
  const [rows] = await mysqlConn.query(`SELECT ${selectColumns("users", columns)} FROM users ORDER BY id`);
  for (const row of rows) {
    const legacyId = String(row.id);
    const existing = await lookup(client, "users", legacyId);
    if (existing) {
      map.set(Number(row.id), existing);
      stats.users.skipped++;
      continue;
    }

    const email = cleanText(row.email);
    const current = email ? await client.query("SELECT id FROM users WHERE email = $1", [email]) : { rows: [] };
    const newId =
      current.rows[0]?.id ??
      (
        await client.query(
          `INSERT INTO users (name, email, password_hash, role, status, created_at)
           VALUES ($1, $2, $3, $4, 'ACTIVE', COALESCE($5, now()))
           RETURNING id`,
          [
            cleanText(row.name) || email || `legacy-user-${legacyId}`,
            email || `legacy-user-${legacyId}@invalid.local`,
            cleanText(row.password_hash) || "legacy-password-reset-required",
            normalizeRole(row.role),
            row.created_at ?? null
          ]
        )
      ).rows[0].id;

    await remember(client, "users", legacyId, newId, { email });
    map.set(Number(row.id), newId);
    stats.users.imported++;
  }
  return map;
}

async function migrateSites(client, columns) {
  const map = new Map();
  const [rows] = await mysqlConn.query(`SELECT ${selectColumns("sites", columns)} FROM sites ORDER BY id`);
  for (const row of rows) {
    const legacyId = String(row.id);
    const existing = await lookup(client, "sites", legacyId);
    if (existing) {
      map.set(Number(row.id), existing);
      stats.sites.skipped++;
      continue;
    }

    if (!legacyKey && (row.wp_app_password || row.gsc_service_account_json)) {
      throw new Error("LEGACY_ENCRYPTION_KEY_BASE64 مطلوب لترحيل بيانات المواقع المشفرة.");
    }

    const wpPassword = row.wp_app_password ? decryptLegacySecret(String(row.wp_app_password)) : "";
    const gscServiceAccount = row.gsc_service_account_json ? decryptLegacySecret(String(row.gsc_service_account_json)) : null;
    const { rows: inserted } = await client.query(
      `INSERT INTO sites (
         name, wordpress_url, wordpress_username, wordpress_application_password_encrypted,
         market, language, writing_standard, gsc_property, gsc_service_account_encrypted,
         wordpress_status, rank_math_status, gsc_status, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'NOT_CONFIGURED', 'NOT_CONFIGURED', $10, 'ACTIVE')
       RETURNING id`,
      [
        cleanText(row.name) || `Legacy site ${legacyId}`,
        cleanText(row.wp_url) || "https://example.invalid",
        cleanText(row.wp_user) || "",
        encryptTargetSecret(wpPassword),
        cleanText(row.market) || "SA",
        cleanText(row.language) || "ar",
        cleanText(row.writing_standard) || null,
        cleanText(row.gsc_property) || null,
        gscServiceAccount ? encryptTargetSecret(gscServiceAccount) : null,
        gscServiceAccount || row.gsc_property ? "NOT_CONFIGURED" : "NOT_CONFIGURED"
      ]
    );

    await remember(client, "sites", legacyId, inserted[0].id, { name: row.name, wordpressUrl: row.wp_url });
    map.set(Number(row.id), inserted[0].id);
    stats.sites.imported++;
  }
  return map;
}

async function migrateContent(client, columns, userMap, siteMap) {
  const [rows] = await mysqlConn.query(`SELECT ${selectColumns("content_items", columns)} FROM content_items ORDER BY id`);
  for (const row of rows) {
    const legacyId = String(row.id);
    if (await lookup(client, "content_items", legacyId)) {
      stats.content.skipped++;
      continue;
    }

    const siteId = siteMap.get(Number(row.site_id));
    if (!siteId) {
      stats.content.skipped++;
      continue;
    }

    const status = mapLegacyStatus(row.status);
    const legacyBrief = cleanText(row.differentiators);
    const legacyLog = cleanText(row.log);
    const { rows: inserted } = await client.query(
      `INSERT INTO content_items (
         site_id, topic, title, target_keyword, status, mode, editorial_brief, ideas, selected_idea,
         competitor_gaps, sources, draft_html, meta_description, category, tags,
         image_prompt, image_alt, image_url, wordpress_media_id, scheduled_publish_at,
         auto_publish, approved_by, approved_at, content_score, content_score_details,
         last_successful_state, failed_action, error_message, retry_count, last_attempted_at,
         created_by, created_at, updated_at, published_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb,
         $10, $11::jsonb, $12, $13, $14, $15::jsonb,
         $16, $17, $18, $19, $20,
         $21, $22, $23, $24, $25::jsonb,
         $26, $27, $28, $29, $30,
         $31, COALESCE($32, now()), now(), $33
       )
       RETURNING id`,
      [
        siteId,
        cleanText(row.topic) || cleanText(row.title) || `Legacy content ${legacyId}`,
        cleanText(row.title) || null,
        extractTargetKeyword(row.selected_idea),
        status,
        normalizeMode(row.origin),
        JSON.stringify(legacyBrief ? { legacyBrief } : {}),
        JSON.stringify(parseJson(row.ideas, [])),
        jsonOrNull(row.selected_idea),
        cleanText(row.competitor_gaps) || null,
        JSON.stringify(parseJson(row.sources, [])),
        cleanText(row.draft_html) || null,
        cleanText(row.meta_description) || null,
        cleanText(row.category) || null,
        JSON.stringify(parseTags(row.tags)),
        cleanText(row.image_prompt) || null,
        cleanText(row.image_alt) || null,
        cleanText(row.image_url) || null,
        row.featured_media_id ? String(row.featured_media_id) : null,
        row.scheduled_publish_at ?? null,
        Boolean(Number(row.auto_publish ?? 0)),
        row.approved_by ? userMap.get(Number(row.approved_by)) ?? null : null,
        row.approved_at ?? null,
        Number(row.content_score ?? 0),
        JSON.stringify(parseJson(row.content_score_details, [])),
        status === "FAILED" ? lastStateFromLegacyAction(row.last_action) : status,
        status === "FAILED" ? normalizeLegacyAction(row.last_action) : null,
        cleanText(row.error_message) || null,
        status === "FAILED" ? 1 : 0,
        status === "FAILED" ? row.created_at ?? null : null,
        null,
        row.created_at ?? null,
        status === "PUBLISHED" ? row.created_at ?? null : null
      ]
    );

    const newId = inserted[0].id;
    await remember(client, "content_items", legacyId, newId, { topic: row.topic, status: row.status });
    await client.query(
      `INSERT INTO audit_logs (content_item_id, event_type, message, metadata, created_at)
       VALUES ($1, 'LEGACY_CONTENT_IMPORTED', 'تم استيراد العنصر من النسخة القديمة', $2::jsonb, COALESCE($3, now()))`,
      [newId, JSON.stringify({ legacyId, legacyStatus: row.status, legacyLastAction: row.last_action, legacyLog }), row.created_at ?? null]
    );
    stats.content.imported++;
  }
}

async function migrateUsage(client, columns) {
  const [rows] = await mysqlConn.query(`SELECT ${selectColumns("api_usage_log", columns)} FROM api_usage_log ORDER BY id`);
  for (const row of rows) {
    const legacyId = String(row.id);
    if (await lookup(client, "api_usage_log", legacyId)) {
      stats.usage.skipped++;
      continue;
    }

    const contentItemId = row.item_id ? await lookup(client, "content_items", String(row.item_id)) : null;
    const { rows: inserted } = await client.query(
      `INSERT INTO api_usage_logs (
         provider, model, operation, content_item_id, input_tokens, output_tokens,
         estimated_cost_usd, duration_ms, success, created_at
       )
       VALUES ($1, $2, 'LEGACY_IMPORT', $3, $4, $5, $6, 0, true, COALESCE($7, now()))
       RETURNING id`,
      [
        cleanText(row.provider) || "legacy",
        cleanText(row.model) || "unknown",
        contentItemId,
        Number(row.input_tokens ?? 0),
        Number(row.output_tokens ?? 0),
        Number(row.estimated_cost_usd ?? 0),
        row.created_at ?? null
      ]
    );
    await remember(client, "api_usage_log", legacyId, inserted[0].id, { provider: row.provider, model: row.model });
    stats.usage.imported++;
  }
}

async function lookup(client, legacyTable, legacyId) {
  const { rows } = await client.query("SELECT new_id FROM legacy_migration_map WHERE legacy_table = $1 AND legacy_id = $2", [legacyTable, legacyId]);
  return rows[0]?.new_id ?? null;
}

async function remember(client, legacyTable, legacyId, newId, metadata) {
  await client.query(
    `INSERT INTO legacy_migration_map (legacy_table, legacy_id, new_id, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (legacy_table, legacy_id) DO NOTHING`,
    [legacyTable, legacyId, newId, JSON.stringify(metadata ?? {})]
  );
}

function encryptTargetSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", targetKey, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

function decryptLegacySecret(value) {
  if (!legacyKey) throw new Error("LEGACY_ENCRYPTION_KEY_BASE64 مطلوب.");
  const decoded = Buffer.from(value, "base64");
  const nonce = decoded.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
  const cipher = decoded.subarray(sodium.crypto_secretbox_NONCEBYTES);
  const plain = sodium.crypto_secretbox_open_easy(cipher, nonce, legacyKey, "text");
  if (!plain) throw new Error("تعذر فك تشفير سر من الموقع القديم. تحقق من LEGACY_ENCRYPTION_KEY_BASE64.");
  return plain;
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseJson(value, fallback) {
  const text = cleanText(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function jsonOrNull(value) {
  const parsed = parseJson(value, null);
  return parsed === null ? null : JSON.stringify(parsed);
}

function parseTags(value) {
  const parsed = parseJson(value, null);
  if (Array.isArray(parsed)) return parsed.filter(Boolean);
  const text = cleanText(value);
  return text ? text.split(",").map((tag) => tag.trim()).filter(Boolean) : [];
}

function extractTargetKeyword(value) {
  const parsed = parseJson(value, null);
  return parsed && typeof parsed === "object" ? cleanText(parsed.target_keyword) || null : null;
}

function normalizeRole(role) {
  return cleanText(role).toLowerCase() === "admin" ? "ADMIN" : "EDITOR";
}

function normalizeMode(origin) {
  return cleanText(origin).toLowerCase() === "bulk" ? "BULK" : "MANUAL";
}

function mapLegacyStatus(status) {
  const map = {
    new: "NEW",
    queued: "QUEUED",
    ideas_ready: "IDEAS_READY",
    idea_selected: "IDEA_SELECTED",
    gaps_ready: "GAPS_READY",
    drafted: "DRAFTED",
    reviewed: "REVIEWED",
    image_ready: "IMAGE_READY",
    duplicate: "DUPLICATE",
    error: "FAILED",
    failed: "FAILED",
    published: "PUBLISHED"
  };
  return map[cleanText(status).toLowerCase()] ?? "NEW";
}

function normalizeLegacyAction(action) {
  const map = {
    generate_ideas: "GENERATE_IDEAS",
    analyze_gaps: "RESEARCH_GAPS",
    write_draft: "WRITE_DRAFT",
    review_draft: "REVIEW_DRAFT",
    generate_image: "GENERATE_IMAGE",
    publish: "PUBLISH",
    queue: "RETRY",
    duplicate_check: "GENERATE_IDEAS"
  };
  return map[cleanText(action).toLowerCase()] ?? (cleanText(action).toUpperCase() || "LEGACY_ACTION");
}

function lastStateFromLegacyAction(action) {
  const map = {
    generate_ideas: "NEW",
    analyze_gaps: "IDEA_SELECTED",
    write_draft: "GAPS_READY",
    review_draft: "DRAFTED",
    generate_image: "REVIEWED",
    publish: "APPROVED",
    queue: "QUEUED",
    duplicate_check: "NEW"
  };
  return map[cleanText(action).toLowerCase()] ?? "NEW";
}

function printSummary() {
  const mode = dryRun ? "DRY RUN - no changes committed" : "APPLIED";
  console.log(`Legacy migration ${mode}`);
  for (const [name, value] of Object.entries(stats)) {
    console.log(`${name}: imported=${value.imported}, skipped=${value.skipped}`);
  }
}
