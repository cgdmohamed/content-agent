-- Usage must stay attributable to a site even after its content is deleted: content_item_id is SET NULL on
-- delete, which used to make that spend vanish from the site's totals while still counting in the global total.
ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE SET NULL;
-- Snapshot of the article title/topic at the time of the call, so deleted articles can still be named in reports.
ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS content_label TEXT;

UPDATE api_usage_logs a
SET site_id = COALESCE(a.site_id, c.site_id),
    content_label = COALESCE(a.content_label, c.title, c.topic)
FROM content_items c
WHERE a.content_item_id = c.id
  AND (a.site_id IS NULL OR a.content_label IS NULL);

CREATE INDEX IF NOT EXISTS api_usage_logs_site_created_idx ON api_usage_logs(site_id, created_at DESC);
