CREATE TABLE IF NOT EXISTS gsc_query_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(12, 6) NOT NULL DEFAULT 0,
  position NUMERIC(12, 4) NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, query, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS gsc_query_snapshots_site_synced_idx ON gsc_query_snapshots(site_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS gsc_query_snapshots_opportunity_idx ON gsc_query_snapshots(site_id, impressions DESC, clicks ASC, position ASC);
