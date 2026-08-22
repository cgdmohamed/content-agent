CREATE TABLE IF NOT EXISTS content_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  topics_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  publish_time TEXT NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 1,
  auto_publish BOOLEAN NOT NULL DEFAULT false,
  shared_editorial_brief JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE content_items ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES content_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS content_batches_site_created_idx ON content_batches(site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_items_batch_idx ON content_items(batch_id);
