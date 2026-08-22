CREATE TABLE IF NOT EXISTS content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT,
  draft_html TEXT,
  meta_description TEXT,
  category TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_alt TEXT,
  content_score INTEGER NOT NULL DEFAULT 0,
  content_score_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_summary TEXT NOT NULL DEFAULT 'تحرير يدوي',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_versions_item_created_idx ON content_versions(content_item_id, created_at DESC);

