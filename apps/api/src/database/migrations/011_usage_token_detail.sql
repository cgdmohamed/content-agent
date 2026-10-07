-- Providers bill cached and uncached tokens at different prices, and some report their own cost. Keep that detail so
-- usage reports and the invoice reconciliation can explain the numbers instead of guessing.
ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS cache_read_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS cache_write_tokens INTEGER NOT NULL DEFAULT 0;
-- 'reported' = cost taken from the provider's own response, 'estimated' = tokens x configured prices.
ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS cost_source TEXT NOT NULL DEFAULT 'estimated';
