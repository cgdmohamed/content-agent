import { Global, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { loadEnv } from "@content-agent/config";

export const migrationAdvisoryLockKey = [20260822, 1137] as const;

export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: loadEnv().DATABASE_URL
  });

  async onModuleInit(): Promise<void> {
    await this.runMigrations();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(work: (query: <R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<R>>) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(<R extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) => client.query<R>(text, values));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async runMigrations(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1, $2)", [...migrationAdvisoryLockKey]);
      await this.runMigrationsWithClient(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async runMigrationsWithClient(client: PoolClient): Promise<void> {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = join(currentDir, "migrations");
    const files = readdirSync(migrationsDir)
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort((left, right) => left.localeCompare(right));

    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const applied = await client.query("SELECT version FROM schema_migrations WHERE version = $1", [version]);
      if (applied.rowCount) continue;
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
    }
  }
}

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService]
})
export class DatabaseModule {}
