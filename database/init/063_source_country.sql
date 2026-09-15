-- Persist the geographic scope of each collector source.
-- This migration is additive and keeps the existing JSON config untouched.
BEGIN;

ALTER TABLE collector_sources
    ADD COLUMN IF NOT EXISTS country VARCHAR(100);

-- Preserve countries that were already configured in JSONB.
UPDATE collector_sources
SET country = NULLIF(BTRIM(config->>'country'), '')
WHERE country IS NULL
  AND jsonb_typeof(config) = 'object'
  AND NULLIF(BTRIM(config->>'country'), '') IS NOT NULL;

-- Backfill legacy sources that predate the country field. The mapping uses
-- source identity/URL only; article location is intentionally not inferred.
UPDATE collector_sources
SET country = CASE
    WHEN LOWER(name) LIKE '%skdr%' OR LOWER(name) LIKE '%kemenkes%' THEN 'Indonesia'
    WHEN LOWER(name) LIKE '%google news asia%' THEN 'ASEAN / Asia'
    WHEN LOWER(name) LIKE '%google news%health id%'
      OR LOWER(name) LIKE '%google news%disease id%'
      OR LOWER(name) LIKE '%google news%wabah%' THEN 'Indonesia'
    WHEN LOWER(COALESCE(config->>'url', '')) LIKE '%phnompenhpost.com%' THEN 'Cambodia'
    WHEN LOWER(COALESCE(config->>'url', '')) LIKE '%channelnewsasia.com%' THEN 'Singapore'
    WHEN LOWER(COALESCE(config->>'url', '')) LIKE '%rappler.com%' THEN 'Philippines'
    WHEN LOWER(COALESCE(config->>'url', '')) LIKE '%vnexpress.net%' THEN 'Vietnam'
    WHEN LOWER(COALESCE(config->>'url', '')) LIKE '%thaipbsworld.com%'
      OR LOWER(COALESCE(config->>'url', '')) LIKE '%nationthailand.com%' THEN 'Thailand'
    WHEN LOWER(COALESCE(config->>'url', '')) LIKE '%malaymail.com%' THEN 'Malaysia'
    WHEN LOWER(COALESCE(config->>'url', '')) LIKE '%metrotvnews.com%'
      OR LOWER(COALESCE(config->>'url', '')) LIKE '%cnnindonesia.com%'
      OR LOWER(COALESCE(config->>'url', '')) LIKE '%kompas.com%'
      OR LOWER(COALESCE(config->>'url', '')) LIKE '%antaranews.com%' THEN 'Indonesia'
    WHEN LOWER(name) LIKE '%phnom penh%' THEN 'Cambodia'
    WHEN LOWER(name) LIKE '%channel news asia%' THEN 'Singapore'
    WHEN LOWER(name) LIKE '%rappler%' THEN 'Philippines'
    WHEN LOWER(name) LIKE '%vnexpress%' THEN 'Vietnam'
    WHEN LOWER(name) LIKE '%thai pbs%' OR LOWER(name) LIKE '%nation thailand%' THEN 'Thailand'
    WHEN LOWER(name) LIKE '%malay mail%' THEN 'Malaysia'
    WHEN LOWER(name) LIKE '%metro tv%' OR LOWER(name) LIKE '%cnn indonesia%' OR LOWER(name) LIKE '%kompas%' OR LOWER(name) LIKE '%antara%' THEN 'Indonesia'
    WHEN LOWER(name) LIKE '%cdc%' THEN 'United States'
    WHEN LOWER(name) LIKE '%who%'
      OR LOWER(name) LIKE '%reliefweb%'
      OR LOWER(name) LIKE '%reddit%'
      OR LOWER(name) LIKE '%mastodon%'
      OR LOWER(name) LIKE '%outbreak news%'
      OR LOWER(name) LIKE '%google news%' THEN 'International'
    ELSE NULL
END
WHERE country IS NULL;

CREATE INDEX IF NOT EXISTS idx_collector_sources_country
    ON collector_sources(country);

COMMIT;
