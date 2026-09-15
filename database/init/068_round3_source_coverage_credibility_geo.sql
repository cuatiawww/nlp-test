-- Round 3: source country vs coverage, credibility refresh, province/city, geocode review.

-- ---------------------------------------------------------------------------
-- 1) Source coverage: outlet country != article event country
-- ---------------------------------------------------------------------------
ALTER TABLE collector_sources
    ADD COLUMN IF NOT EXISTS coverage_scope TEXT NOT NULL DEFAULT 'unclassified',
    ADD COLUMN IF NOT EXISTS covers_asean BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS credibility_score DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS credibility_reason TEXT,
    ADD COLUMN IF NOT EXISTS last_credibility_refresh TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS credibility_override DOUBLE PRECISION;

COMMENT ON COLUMN collector_sources.coverage_scope IS
    'asean_outlet | global_outlet | unclassified. Outlet attribution, not article event country.';
COMMENT ON COLUMN collector_sources.covers_asean IS
    'True when a global/unclassified outlet is used to monitor ASEAN health stories (e.g. Google News Health).';
COMMENT ON COLUMN collector_sources.credibility_score IS
    'Last computed source credibility 0-1 (type + domain + override). Not epidemiologist verification.';
COMMENT ON COLUMN collector_sources.credibility_reason IS
    'Reason code for last credibility refresh (type_baseline, domain_boost, override).';
COMMENT ON COLUMN collector_sources.credibility_override IS
    'Optional admin override; when set, recompute uses this value.';

CREATE OR REPLACE FUNCTION abvc_asean11_source_country(country text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE LOWER(BTRIM(COALESCE(country, '')))
    WHEN 'brunei' THEN 'Brunei'
    WHEN 'brunei darussalam' THEN 'Brunei'
    WHEN 'cambodia' THEN 'Cambodia'
    WHEN 'kampuchea' THEN 'Cambodia'
    WHEN 'indonesia' THEN 'Indonesia'
    WHEN 'laos' THEN 'Laos'
    WHEN 'lao' THEN 'Laos'
    WHEN 'lao pdr' THEN 'Laos'
    WHEN 'malaysia' THEN 'Malaysia'
    WHEN 'myanmar' THEN 'Myanmar'
    WHEN 'burma' THEN 'Myanmar'
    WHEN 'philippines' THEN 'Philippines'
    WHEN 'singapore' THEN 'Singapore'
    WHEN 'singapura' THEN 'Singapore'
    WHEN 'thailand' THEN 'Thailand'
    WHEN 'vietnam' THEN 'Vietnam'
    WHEN 'viet nam' THEN 'Vietnam'
    WHEN 'timor-leste' THEN 'Timor-Leste'
    WHEN 'timor leste' THEN 'Timor-Leste'
    WHEN 'east timor' THEN 'Timor-Leste'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION abvc_source_coverage_scope(country text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN abvc_asean11_source_country(country) IS NOT NULL THEN 'asean_outlet'
    WHEN UPPER(BTRIM(COALESCE(country, ''))) IN ('GLOBAL', 'INTERNATIONAL', 'WORLD') THEN 'global_outlet'
    ELSE 'unclassified'
  END;
$$;

CREATE OR REPLACE FUNCTION abvc_source_domain_boost(config jsonb, name text)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN blob LIKE '%who.int%' OR blob LIKE '%kemenkes.go.id%' OR blob LIKE '%kemkes.go.id%' THEN 0.98
    WHEN blob LIKE '%cdc.gov%' THEN 0.97
    WHEN blob LIKE '%bbc.com%' OR blob LIKE '%bbc.co.uk%' OR blob LIKE '%reuters.com%' THEN 0.94
    WHEN blob LIKE '%cidrap%' OR blob LIKE '%apnews.com%' OR blob LIKE '%dw.com%' THEN 0.92
    WHEN blob LIKE '%antaranews.com%' OR blob LIKE '%detik.com%' THEN 0.90
    WHEN blob LIKE '%kompas.com%' OR blob LIKE '%cnnindonesia.com%' OR blob LIKE '%channelnewsasia.com%' THEN 0.88
    ELSE NULL
  END
  FROM (
    SELECT LOWER(COALESCE(config->>'url', '') || ' ' || COALESCE(config->>'rss_url', '') || ' ' || COALESCE(name, '')) AS blob
  ) t;
$$;

-- Never store fake country "ASEAN" / "Outside ASEAN". Aggregators → GLOBAL.
UPDATE collector_sources
SET country = 'GLOBAL'
WHERE country IS NOT NULL
  AND LOWER(TRIM(country)) IN (
      'outside asean', 'asean', 'asean / asia', 'international',
      'global', 'worldwide', 'asia', 'world', 'regional'
  );

-- Google News / WHO / CIDRAP / CDC / ReliefWeb are global aggregators even
-- when a feed locale is ID/EN. Locale ≠ outlet country.
UPDATE collector_sources
SET country = 'GLOBAL'
WHERE LOWER(COALESCE(name, '')) ~ '(google news|cidrap|promed|healthmap|outbreak news|reliefweb|^who | who |^cdc | cdc )'
   OR LOWER(COALESCE(config->>'url', '') || ' ' || COALESCE(config->>'rss_url', ''))
        ~ '(news\.google|who\.int|reliefweb\.int|cidrap\.umn\.edu|cdc\.gov|promedmail|healthmap)';

UPDATE collector_sources
SET coverage_scope = abvc_source_coverage_scope(country);

-- covers_asean is about monitoring use, not "this outlet is an ASEAN newspaper".
UPDATE collector_sources
SET covers_asean = TRUE
WHERE coverage_scope = 'asean_outlet'
   OR (
      coverage_scope IN ('global_outlet', 'unclassified')
      AND (
          LOWER(COALESCE(name, '')) ~ '(google news|who |reliefweb|cidrap|promed|healthmap|gideon|outbreak|asean|searo|wpro)'
          OR LOWER(COALESCE(config->>'url', '') || ' ' || COALESCE(config->>'rss_url', '')) ~ '(news\.google|who\.int|reliefweb|cidrap|promedmail|healthmap|gideononline|cdc\.gov)'
      )
   );

CREATE INDEX IF NOT EXISTS idx_collector_sources_coverage_scope
    ON collector_sources (coverage_scope);
CREATE INDEX IF NOT EXISTS idx_collector_sources_covers_asean
    ON collector_sources (covers_asean)
    WHERE covers_asean = TRUE;

CREATE OR REPLACE FUNCTION abvc_recompute_source_credibility()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    n integer;
BEGIN
    -- Refresh scores only. Does not wipe name/url/schedule/events.
    UPDATE collector_sources cs
    SET
        credibility_score = LEAST(1.0, GREATEST(0.0, calc.score)),
        credibility_reason = calc.reason,
        last_credibility_refresh = NOW()
    FROM (
        SELECT
            s.id,
            COALESCE(
                s.credibility_override,
                GREATEST(
                    COALESCE(abvc_source_domain_boost(s.config, s.name), 0),
                    COALESCE(sc.score, 0.50)
                )
            ) AS score,
            CASE
                WHEN s.credibility_override IS NOT NULL THEN 'override'
                WHEN abvc_source_domain_boost(s.config, s.name) IS NOT NULL
                     AND abvc_source_domain_boost(s.config, s.name) >= COALESCE(sc.score, 0.50)
                    THEN 'domain_boost'
                ELSE 'type_baseline'
            END AS reason
        FROM collector_sources s
        LEFT JOIN source_credibility sc
          ON LOWER(sc.source_type) = abvc_source_credibility_type(s.config, s.source_type)
         AND sc.is_active = TRUE
    ) calc
    WHERE cs.id = calc.id;

    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;

SELECT abvc_recompute_source_credibility();

-- ---------------------------------------------------------------------------
-- 2) First-class province / city on disease events (Phase 1 parity)
-- ---------------------------------------------------------------------------
ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS province TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT;

COMMENT ON COLUMN disease_events.province IS
    'Admin-1 / province / state extracted or entered; not a substitute for location_name.';
COMMENT ON COLUMN disease_events.city IS
    'Admin-2 / city / district when known.';

CREATE INDEX IF NOT EXISTS idx_disease_events_province
    ON disease_events (province)
    WHERE province IS NOT NULL;

ALTER TABLE crawl_matrix_rows
    ADD COLUMN IF NOT EXISTS province TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT;

-- ---------------------------------------------------------------------------
-- 3) Geocode review flag; clear known-bad pins (Singapore / "Were")
-- ---------------------------------------------------------------------------
ALTER TABLE disease_event_locations
    ADD COLUMN IF NOT EXISTS geocode_confidence DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geocode_needs_review BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN disease_event_locations.geocode_confidence IS
    '0-1 gazetteer/Nominatim confidence. Low scores should leave lat/lon null.';
COMMENT ON COLUMN disease_event_locations.geocode_needs_review IS
    'True when coordinates were rejected (outside country bbox / low confidence).';

CREATE OR REPLACE FUNCTION abvc_coords_in_asean11_bbox(lat double precision, lon double precision, country text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lat IS NULL OR lon IS NULL THEN FALSE
    ELSE CASE abvc_asean11_source_country(country)
      WHEN 'Brunei' THEN lat BETWEEN 4.0 AND 5.15 AND lon BETWEEN 114.0 AND 115.5
      WHEN 'Cambodia' THEN lat BETWEEN 10.3 AND 14.75 AND lon BETWEEN 102.3 AND 107.7
      WHEN 'Indonesia' THEN lat BETWEEN -11.2 AND 6.35 AND lon BETWEEN 94.9 AND 141.1
      WHEN 'Laos' THEN lat BETWEEN 13.9 AND 22.55 AND lon BETWEEN 100.0 AND 107.8
      WHEN 'Malaysia' THEN lat BETWEEN 0.85 AND 7.55 AND lon BETWEEN 99.55 AND 119.4
      WHEN 'Myanmar' THEN lat BETWEEN 9.5 AND 28.55 AND lon BETWEEN 92.1 AND 101.2
      WHEN 'Philippines' THEN lat BETWEEN 4.55 AND 21.25 AND lon BETWEEN 116.9 AND 126.7
      WHEN 'Singapore' THEN lat BETWEEN 1.15 AND 1.48 AND lon BETWEEN 103.60 AND 104.10
      WHEN 'Thailand' THEN lat BETWEEN 5.55 AND 20.55 AND lon BETWEEN 97.3 AND 105.7
      WHEN 'Vietnam' THEN lat BETWEEN 8.35 AND 23.45 AND lon BETWEEN 102.1 AND 109.55
      WHEN 'Timor-Leste' THEN lat BETWEEN -9.55 AND -8.1 AND lon BETWEEN 124.0 AND 127.45
      ELSE TRUE
    END
  END;
$$;

-- Curated island centroid — never keep a Singapore pin in the Bay of Bengal.
UPDATE locations
SET latitude = 1.3521, longitude = 103.8198
WHERE LOWER(BTRIM(name)) IN ('singapore', 'singapura')
  AND (
      latitude IS NULL OR longitude IS NULL
      OR NOT (latitude BETWEEN 1.15 AND 1.48 AND longitude BETWEEN 103.60 AND 104.10)
  );

-- Drop gazetteer coords that sit outside the attributed ASEAN member bbox.
UPDATE locations
SET latitude = NULL, longitude = NULL
WHERE abvc_asean11_source_country(country) IS NOT NULL
  AND latitude IS NOT NULL
  AND LOWER(BTRIM(name)) NOT IN ('singapore', 'singapura')
  AND NOT abvc_coords_in_asean11_bbox(latitude, longitude, country);

-- Singapore pins in the Bay of Bengal (or any non-island coordinate) are wrong.
UPDATE disease_events
SET geom = NULL, needs_review = TRUE
WHERE LOWER(BTRIM(COALESCE(location_name, ''))) IN ('singapore', 'singapura')
  AND geom IS NOT NULL
  AND NOT (
      ST_Y(geom) BETWEEN 1.15 AND 1.48
      AND ST_X(geom) BETWEEN 103.60 AND 104.10
  );

UPDATE disease_event_locations
SET latitude = NULL, longitude = NULL, geocode_needs_review = TRUE
WHERE LOWER(BTRIM(COALESCE(location_name, ''))) IN ('singapore', 'singapura')
  AND latitude IS NOT NULL
  AND NOT (
      latitude BETWEEN 1.15 AND 1.48
      AND longitude BETWEEN 103.60 AND 104.10
  );

-- English auxiliary "Were" is not an Indonesia province.
UPDATE disease_events
SET location_name = NULL, geom = NULL, needs_review = TRUE, province = NULL
WHERE LOWER(BTRIM(COALESCE(location_name, ''))) = 'were'
   OR LOWER(BTRIM(COALESCE(province, ''))) = 'were';

UPDATE disease_event_locations
SET location_name = NULL, latitude = NULL, longitude = NULL, geocode_needs_review = TRUE
WHERE LOWER(BTRIM(COALESCE(location_name, ''))) = 'were';

-- Optional backfill: null pins that sit outside the event's ASEAN member bbox.
UPDATE disease_events e
SET geom = NULL, needs_review = TRUE
WHERE e.geom IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM locations loc
      WHERE loc.is_active = TRUE
        AND LOWER(loc.name) = LOWER(e.location_name)
        AND abvc_asean11_source_country(loc.country) IS NOT NULL
        AND NOT abvc_coords_in_asean11_bbox(ST_Y(e.geom), ST_X(e.geom), loc.country)
  );

UPDATE disease_event_locations del
SET latitude = NULL, longitude = NULL, geocode_needs_review = TRUE
WHERE del.latitude IS NOT NULL
  AND abvc_asean11_source_country(del.country) IS NOT NULL
  AND NOT abvc_coords_in_asean11_bbox(del.latitude, del.longitude, del.country);

-- First-class province for existing rows: copy location_name when it is not a country.
UPDATE disease_events
SET province = NULLIF(BTRIM(location_name), '')
WHERE province IS NULL
  AND NULLIF(BTRIM(location_name), '') IS NOT NULL
  AND abvc_asean11_source_country(location_name) IS NULL
  AND LOWER(BTRIM(location_name)) <> 'were';
