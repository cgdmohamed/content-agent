-- Multi-language publishing through Polylang: which languages a site has, which of them to publish by default,
-- and translated articles stored as ordinary content items linked to the source article.
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS polylang_status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN IF NOT EXISTS polylang_languages JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS publish_languages JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS translation_of UUID REFERENCES content_items(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS content_items_translation_unique_idx
  ON content_items(translation_of, language)
  WHERE translation_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_items_translation_of_idx ON content_items(translation_of) WHERE translation_of IS NOT NULL;
