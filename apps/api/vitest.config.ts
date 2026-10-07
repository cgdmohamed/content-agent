import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests need PostgreSQL and Redis; run them with `pnpm test:integration`.
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.int.test.ts"]
  }
});
