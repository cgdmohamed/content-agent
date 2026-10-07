// Runs before any module is imported so loadEnv() sees the test configuration.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/content_agent_test";
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379";
process.env.SESSION_SECRET = "integration-test-secret-with-more-than-32-chars";
process.env.ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 9).toString("base64");
process.env.NODE_ENV = "test";
process.env.MONTHLY_AI_BUDGET_USD = "30";
process.env.MONTHLY_AI_HARD_LIMIT_USD = "40";
for (const name of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "PERPLEXITY_API_KEY", "GEMINI_API_KEY"]) process.env[name] = `test-${name.toLowerCase()}`;
for (const name of ["ANTHROPIC_MODEL", "OPENAI_MODEL", "PERPLEXITY_MODEL", "GEMINI_IMAGE_MODEL"]) delete process.env[name];
