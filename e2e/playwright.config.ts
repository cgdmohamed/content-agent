import { defineConfig } from "@playwright/test";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/content_agent_e2e";
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379";
const webUrl = "http://127.0.0.1:4173";
const apiPort = 3100;

export const adminCredentials = { email: "admin@example.com", password: "Str0ng-Passw0rd!2026" };

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: webUrl,
    locale: "ar-SA",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] } : { args: ["--no-sandbox"] }
  },
  webServer: [
    {
      // Fresh database, then the compiled API (run `pnpm build` first).
      command: "node e2e/reset-db.mjs && node apps/api/dist/main.js",
      cwd: "..",
      url: `http://127.0.0.1:${apiPort}/api/health/ready`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
        API_PORT: String(apiPort),
        NODE_ENV: "test",
        PUBLIC_WEB_URL: webUrl,
        SESSION_SECRET: "e2e-secret-value-with-more-than-32-characters",
        ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 5).toString("base64"),
        BOOTSTRAP_ADMIN_EMAIL: adminCredentials.email,
        BOOTSTRAP_ADMIN_PASSWORD: adminCredentials.password,
        TRUST_PROXY_HOPS: "0"
      }
    },
    {
      command: "pnpm --filter @content-agent/web exec vite preview --host 127.0.0.1",
      cwd: "..",
      url: webUrl,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` }
    }
  ]
});
