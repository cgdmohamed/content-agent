CREATE INDEX IF NOT EXISTS content_items_updated_idx ON content_items(updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS content_items_status_updated_idx ON content_items(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS content_items_site_created_idx ON content_items(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_items_site_score_idx ON content_items(site_id, content_score ASC, updated_at DESC);
CREATE INDEX IF NOT EXISTS content_items_scheduled_idx ON content_items(scheduled_publish_at) WHERE scheduled_publish_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_items_wordpress_post_idx ON content_items(wordpress_post_id) WHERE wordpress_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS job_runs_created_idx ON job_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS job_runs_content_created_idx ON job_runs(content_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_runs_content_active_idx ON job_runs(content_item_id, status) WHERE status IN ('WAITING', 'ACTIVE', 'DELAYED');
CREATE INDEX IF NOT EXISTS job_runs_operation_created_idx ON job_runs(operation, created_at DESC);

CREATE INDEX IF NOT EXISTS api_usage_logs_created_idx ON api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_logs_content_created_idx ON api_usage_logs(content_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_logs_provider_created_idx ON api_usage_logs(provider, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_content_created_idx ON audit_logs(content_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_site_created_idx ON audit_logs(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sites_status_created_idx ON sites(status, created_at DESC);
