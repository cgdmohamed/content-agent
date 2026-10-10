-- Index of a site's own pages (services, products, articles...) used as the only source of internal links in articles.
CREATE TABLE IF NOT EXISTS site_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  wp_type TEXT NOT NULL,
  wp_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  language TEXT,
  kind TEXT NOT NULL DEFAULT 'OTHER',
  kind_source TEXT NOT NULL DEFAULT 'AUTO',
  priority BOOLEAN NOT NULL DEFAULT false,
  hidden BOOLEAN NOT NULL DEFAULT false,
  gone BOOLEAN NOT NULL DEFAULT false,
  modified_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, wp_type, wp_id)
);
CREATE INDEX IF NOT EXISTS site_pages_site_idx ON site_pages(site_id, kind) WHERE gone = false;

ALTER TABLE sites ADD COLUMN IF NOT EXISTS pages_synced_at TIMESTAMPTZ;
