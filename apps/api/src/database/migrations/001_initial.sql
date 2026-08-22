CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'EDITOR')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  wordpress_url TEXT NOT NULL,
  wordpress_username TEXT NOT NULL,
  wordpress_application_password_encrypted TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT 'SA',
  language TEXT NOT NULL DEFAULT 'ar',
  writing_standard TEXT,
  gsc_property TEXT,
  gsc_service_account_encrypted TEXT,
  wordpress_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  rank_math_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  gsc_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  topic TEXT NOT NULL,
  title TEXT,
  target_keyword TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  mode TEXT NOT NULL DEFAULT 'MANUAL',
  search_intent TEXT,
  editorial_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  ideas JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_idea JSONB,
  competitor_gaps TEXT,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  draft_html TEXT,
  meta_description TEXT,
  category TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_prompt TEXT,
  image_alt TEXT,
  image_url TEXT,
  wordpress_media_id TEXT,
  wordpress_post_id TEXT,
  wordpress_post_url TEXT,
  wordpress_post_status TEXT,
  scheduled_publish_at TIMESTAMPTZ,
  auto_publish BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  content_score INTEGER NOT NULL DEFAULT 0,
  content_score_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_successful_state TEXT,
  failed_action TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS content_items_site_status_idx ON content_items(site_id, status);
CREATE INDEX IF NOT EXISTS content_items_topic_trgm_idx ON content_items USING gin(topic gin_trgm_ops);
CREATE INDEX IF NOT EXISTS content_items_title_trgm_idx ON content_items USING gin(title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  provider TEXT,
  queue_name TEXT NOT NULL,
  bull_job_id TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'WAITING',
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_runs_bull_job_id_idx ON job_runs(bull_job_id) WHERE bull_job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  operation TEXT NOT NULL,
  content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content_item_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  site_id UUID REFERENCES sites(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
