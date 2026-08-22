CREATE TABLE IF NOT EXISTS legacy_migration_map (
  legacy_table TEXT NOT NULL,
  legacy_id TEXT NOT NULL,
  new_id UUID NOT NULL,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (legacy_table, legacy_id)
);

CREATE INDEX IF NOT EXISTS legacy_migration_map_new_id_idx ON legacy_migration_map(new_id);
