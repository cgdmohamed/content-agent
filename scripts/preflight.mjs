#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { envSchema, formatEnvIssues } from "../packages/config/dist/index.js";
import { parseEnvFile, productionWarnings } from "./preflight-core.mjs";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const envPath = process.argv.find((arg) => arg.startsWith("--content-env-file="))?.split("=")[1] ?? ".env";
  const fileEnv = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, "utf8")) : {};
  const merged = { ...fileEnv, ...process.env };
  const result = envSchema.safeParse(merged);

  if (!result.success) {
    console.error("فشل فحص إعدادات Content Agent:");
    console.error(formatEnvIssues(result.error));
    process.exit(1);
  }

  const warnings = productionWarnings(result.data, merged);
  if (warnings.length > 0) {
    console.error("فشل فحص الجاهزية للإنتاج:");
    for (const warning of warnings) console.error(`- ${warning}`);
    process.exit(1);
  }

  console.log("إعدادات Content Agent صالحة للتشغيل.");
}
