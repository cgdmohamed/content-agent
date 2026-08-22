#!/usr/bin/env node
import { randomBytes } from "node:crypto";

const sessionSecret = randomBytes(48).toString("base64url");
const encryptionKey = randomBytes(32).toString("base64");
const postgresPassword = randomBytes(32).toString("base64url");
const bootstrapPassword = `${randomBytes(18).toString("base64url")}Aa1!`;

console.log(`# انسخ القيم التالية إلى ملف .env الإنتاجي`);
console.log(`POSTGRES_PASSWORD=${postgresPassword}`);
console.log(`DATABASE_URL=postgresql://content_agent:${postgresPassword}@postgres:5432/content_agent`);
console.log(`SESSION_SECRET=${sessionSecret}`);
console.log(`ENCRYPTION_KEY_BASE64=${encryptionKey}`);
console.log(`BOOTSTRAP_ADMIN_PASSWORD=${bootstrapPassword}`);
