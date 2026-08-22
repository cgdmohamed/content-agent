import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = resolve(repoRoot, "apps/api");
const source = resolve(apiRoot, "src/database/migrations");
const target = resolve(apiRoot, "dist/database/migrations");

if (!existsSync(source)) {
  throw new Error(`API migrations source directory not found: ${source}`);
}

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
