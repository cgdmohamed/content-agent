// Runs before any module is imported so loadEnv() and the bootstrap admin see the test configuration.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/content_agent_test";
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379";
process.env.SESSION_SECRET = "integration-test-secret-with-more-than-32-chars";
process.env.ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 9).toString("base64");
process.env.NODE_ENV = "test";
process.env.PUBLIC_WEB_URL = "http://localhost:5173";
process.env.BOOTSTRAP_ADMIN_EMAIL = "admin@example.com";
process.env.BOOTSTRAP_ADMIN_PASSWORD = "Str0ng-Passw0rd!2026";
process.env.METRICS_TOKEN = "integration-metrics-token-value";
process.env.LOG_LEVEL = "error";
