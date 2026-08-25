import { describe, expect, it } from "vitest";
import { productionWarnings } from "../preflight-core.mjs";

const productionEnv = {
  NODE_ENV: "production",
  PUBLIC_WEB_URL: "https://content.example.com",
  DATABASE_URL: "postgresql://content_agent:very-strong-db-password@postgres:5432/content_agent",
  REDIS_URL: "redis://redis:6379",
  SESSION_SECRET: "a-production-session-secret-with-more-than-32-chars",
  ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 1).toString("base64")
};

describe("production preflight", () => {
  it("accepts production service URLs and matching database password", () => {
    expect(productionWarnings(productionEnv, { POSTGRES_PASSWORD: "very-strong-db-password" })).toEqual([]);
  });

  it("accepts URL-encoded database passwords in DATABASE_URL", () => {
    const password = "very-strong@db#password";
    const encoded = encodeURIComponent(password);
    expect(
      productionWarnings(
        { ...productionEnv, DATABASE_URL: `postgresql://content_agent:${encoded}@postgres:5432/content_agent` },
        { POSTGRES_PASSWORD: password }
      )
    ).toEqual([]);
  });

  it("rejects common unsafe production settings", () => {
    const warnings = productionWarnings(
      {
        ...productionEnv,
        PUBLIC_WEB_URL: "http://content.example.com",
        DATABASE_URL: "postgresql://content_agent:short@localhost:5432/content_agent",
        REDIS_URL: "redis://127.0.0.1:6379"
      },
      { POSTGRES_PASSWORD: "short" }
    );

    expect(warnings).toContain("POSTGRES_PASSWORD يجب أن يكون أطول وأقوى قبل الإنتاج.");
    expect(warnings).toContain("PUBLIC_WEB_URL يجب أن يستخدم HTTPS في الإنتاج حتى تعمل كوكي الجلسة الآمنة.");
    expect(warnings).toContain("DATABASE_URL يشير إلى localhost؛ استخدم اسم خدمة قاعدة البيانات داخل Docker مثل postgres.");
    expect(warnings).toContain("REDIS_URL يشير إلى localhost؛ استخدم اسم خدمة Redis داخل Docker مثل redis.");
  });

  it("rejects production placeholder secrets", () => {
    const password = "replace-with-a-long-random-database-password";
    const warnings = productionWarnings(
      {
        ...productionEnv,
        DATABASE_URL: `postgresql://content_agent:${password}@postgres:5432/content_agent`
      },
      {
        POSTGRES_PASSWORD: password,
        ENCRYPTION_KEY_BASE64: Buffer.from("replace-with-32-byte-base64-key!").toString("base64"),
        BOOTSTRAP_ADMIN_PASSWORD: "replace-with-strong-admin-password-2026!"
      }
    );

    expect(warnings).toContain("POSTGRES_PASSWORD يجب تغييره قبل الإنتاج.");
    expect(warnings).toContain("ENCRYPTION_KEY_BASE64 يجب تغييره قبل الإنتاج.");
    expect(warnings).toContain("BOOTSTRAP_ADMIN_PASSWORD يجب تغييره قبل الإنتاج.");
  });
});
