// Runs the real backup scripts against a real PostgreSQL (TEST_DATABASE_URL) with pg_dump/pg_restore installed.
// Skipped otherwise. The scripts are POSIX sh, so they run here exactly as in the Alpine sidecar.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "../../docker/backup");
const databaseUrl = process.env.TEST_DATABASE_URL;

function has(command) {
  return spawnSync("sh", ["-c", `command -v ${command}`]).status === 0;
}

const tooling = ["pg_dump", "pg_restore", "psql", "age", "age-keygen", "sha256sum"].every(has);
const enabled = Boolean(databaseUrl) && tooling;

function pgEnv() {
  const url = new URL(databaseUrl);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username || "postgres"),
    PGPASSWORD: decodeURIComponent(url.password || ""),
    PGDATABASE: url.pathname.slice(1)
  };
}

function run(script, args, env, dir) {
  return spawnSync("sh", [join(scripts, script), ...args], { env: { ...process.env, ...pgEnv(), BACKUP_DIR: dir, ...env }, encoding: "utf8" });
}

describe.skipIf(!enabled)("backup scripts against real PostgreSQL", () => {
  let root;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "ca-backup-"));
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    // The minimum the scripts expect from the application schema (the API creates the real one on startup).
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await client.query("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY)");
    await client.query("CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL)");
    for (const table of ["sites", "content_items", "job_runs", "api_usage_logs", "audit_logs", "system_settings"]) {
      await client.query(`CREATE TABLE ${table} (id SERIAL PRIMARY KEY)`);
    }
    await client.query("INSERT INTO schema_migrations VALUES ('001_initial')");
    await client.query("INSERT INTO users (email) VALUES ('keep-me@example.com')");
    await client.end();
  });

  it("creates a verified, checksummed dump, proves it restores, and reports healthy", () => {
    const dir = join(root, "plain");
    const result = run("backup.sh", [], { BACKUP_FULL_VERIFY: "always" }, dir);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain("restore check passed");
    const files = readdirSync(join(dir, "daily"));
    expect(files.some((file) => file.endsWith(".dump"))).toBe(true);
    expect(files.some((file) => file.endsWith(".sha256"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "last_backup.json"), "utf8")).ok).toBe(true);
    expect(run("healthcheck.sh", [], {}, dir).status).toBe(0);
    expect(readdirSync(join(dir, "tmp"))).toEqual([]);
  });

  it("encrypts with age, never stores plaintext, and restores into a new database only with the private key", async () => {
    const dir = join(root, "enc");
    mkdirSync(dir, { recursive: true });
    const keyFile = join(root, "key.txt");
    const keygen = spawnSync("age-keygen", ["-o", keyFile], { encoding: "utf8" });
    const recipient = /Public key: (age1\w+)/.exec(keygen.stderr + keygen.stdout)?.[1];
    expect(recipient).toBeTruthy();

    const backup = run("backup.sh", [], { BACKUP_AGE_RECIPIENT: recipient, BACKUP_FULL_VERIFY: "always" }, dir);
    expect(backup.status, backup.stdout + backup.stderr).toBe(0);
    const file = join(dir, "daily", readdirSync(join(dir, "daily")).find((name) => name.endsWith(".age")));
    expect(readFileSync(file).includes("keep-me@example.com")).toBe(false);

    const target = `restored_${process.pid}`;
    expect(run("restore.sh", [file, target], {}, dir).status).toBe(1); // no private key
    const restored = run("restore.sh", [file, target], { AGE_IDENTITY_FILE: keyFile }, dir);
    expect(restored.status, restored.stdout + restored.stderr).toBe(0);

    const client = new pg.Client({ connectionString: databaseUrl.replace(/\/[^/]*$/, `/${target}`) });
    await client.connect();
    expect((await client.query("SELECT email FROM users")).rows).toEqual([{ email: "keep-me@example.com" }]);
    await client.end();
    const admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`DROP DATABASE "${target}"`);
    await admin.end();

    // Refuses to overwrite the live database without explicit confirmation, and detects tampering.
    expect(run("restore.sh", [file, pgEnv().PGDATABASE], { AGE_IDENTITY_FILE: keyFile }, dir).status).toBe(1);
    appendFileSync(file, "x");
    const tampered = run("restore.sh", [file, `${target}_t`], { AGE_IDENTITY_FILE: keyFile }, dir);
    expect(tampered.status).toBe(1);
    expect(tampered.stdout).toContain("checksum mismatch");
  });

  it("keeps only the newest dumps (retention) and removes their checksums with them", () => {
    const dir = join(root, "retention");
    for (let index = 0; index < 3; index += 1) {
      const result = run("backup.sh", [], { BACKUP_KEEP_DAILY: "2", BACKUP_FULL_VERIFY: "never" }, dir);
      expect(result.status).toBe(0);
      execFileSync("sleep", ["1.1"]); // file names carry a one-second timestamp
    }
    const files = readdirSync(join(dir, "daily"));
    expect(files.filter((file) => file.endsWith(".dump"))).toHaveLength(2);
    expect(files.filter((file) => file.endsWith(".sha256"))).toHaveLength(2);
  });

  it("fails loudly: bad database marks the status failed and the healthcheck unhealthy, no temp files left", () => {
    const dir = join(root, "failing");
    const result = run("backup.sh", [], { PGDATABASE: "does_not_exist" }, dir);
    expect(result.status).toBe(1);
    expect(JSON.parse(readFileSync(join(dir, "last_backup.json"), "utf8")).ok).toBe(false);
    expect(run("healthcheck.sh", [], {}, dir).status).toBe(1);
    expect(readdirSync(join(dir, "tmp"))).toEqual([]);
  });

  it("refuses to upload an unencrypted dump off the host unless explicitly allowed", () => {
    const dir = join(root, "s3");
    const result = run("backup.sh", [], { BACKUP_S3_BUCKET: "bucket" }, dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("refusing to upload an unencrypted dump");
    expect(existsSync(join(dir, "daily")) ? readdirSync(join(dir, "daily")) : []).toEqual([]);
    writeFileSync(join(root, "ok"), "");
  });
});
