import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = resolve(repoRoot, "apps/api");
const source = resolve(apiRoot, "src/database/migrations");
const target = resolve(apiRoot, "dist/database/migrations");
const legacyRuntimeDir = resolve(apiRoot, "dist/apps/api/src");
const legacyMigrationsDir = resolve(legacyRuntimeDir, "database/migrations");

if (!existsSync(source)) {
  throw new Error(`API migrations source directory not found: ${source}`);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
mkdirSync(legacyMigrationsDir, { recursive: true });
cpSync(source, legacyMigrationsDir, { recursive: true });
writeFileSync(resolve(legacyRuntimeDir, "main.js"), 'import "../../../../main.js";\n');
