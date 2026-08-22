import { describe, expect, it } from "vitest";
import { formatEnvIssues, loadEnv, envSchema } from "../index.js";

const validSource = {
  NODE_ENV: "production",
  API_PORT: "3000",
  PUBLIC_WEB_URL: "https://content.example.com",
  DATABASE_URL: "postgresql://content_agent:secret@postgres:5432/content_agent",
  REDIS_URL: "redis://redis:6379",
  SESSION_SECRET: "a-production-session-secret-with-more-than-32-chars",
  ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 1).toString("base64"),
  MONTHLY_AI_BUDGET_USD: "30",
  MONTHLY_AI_HARD_LIMIT_USD: "40",
  WORKER_CONCURRENCY: "2"
};

describe("environment validation", () => {
  it("accepts a production-ready environment", () => {
    expect(loadEnv(validSource).ENCRYPTION_KEY_BASE64).toBe(validSource.ENCRYPTION_KEY_BASE64);
  });

  it("rejects encryption keys that do not decode to 32 bytes", () => {
    expect(() => loadEnv({ ...validSource, ENCRYPTION_KEY_BASE64: Buffer.alloc(16, 1).toString("base64") })).toThrow(
      /ENCRYPTION_KEY_BASE64/
    );
  });

  it("rejects placeholder production secrets", () => {
    expect(() => loadEnv({ ...validSource, SESSION_SECRET: "replace-with-at-least-32-random-characters" })).toThrow(
      /SESSION_SECRET/
    );
  });

  it("rejects a hard AI limit below the monthly budget", () => {
    expect(() => loadEnv({ ...validSource, MONTHLY_AI_BUDGET_USD: "40", MONTHLY_AI_HARD_LIMIT_USD: "30" })).toThrow(
      /MONTHLY_AI_HARD_LIMIT_USD/
    );
  });

  it("allows zero as a disabled hard AI limit", () => {
    expect(loadEnv({ ...validSource, MONTHLY_AI_BUDGET_USD: "40", MONTHLY_AI_HARD_LIMIT_USD: "0" }).MONTHLY_AI_HARD_LIMIT_USD).toBe(0);
  });

  it("formats environment issues in Arabic", () => {
    const result = envSchema.safeParse({ ...validSource, PUBLIC_WEB_URL: "not-a-url" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatEnvIssues(result.error)).toContain("يجب أن تكون رابطًا صالحًا.");
    }
  });
});
