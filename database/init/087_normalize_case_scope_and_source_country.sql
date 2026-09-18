-- Normalize the case/source country contract without deleting historical data.
-- Timor-Leste is part of the single ASEAN scope used by the product.

ALTER TABLE raw_reports
    ADD COLUMN IF NOT EXISTS source_country TEXT;

ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS source_country TEXT;

ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS surveillance_scope TEXT;

ALTER TABLE crawl_matrix_rows
    ADD COLUMN IF NOT EXISTS source_country TEXT;

ALTER TABLE crawl_matrix_rows
    ADD COLUMN IF NOT EXISTS surveillance_scope TEXT;

-- Preserve known source metadata where it is already available. This never
-- derives an article case country from the publisher country.
UPDATE crawl_matrix_rows m
SET source_country = NULLIF(BTRIM(rr.source_country), '')
FROM raw_reports rr
WHERE m.raw_report_id = rr.id
  AND NULLIF(BTRIM(m.source_country), '') IS NULL
  AND NULLIF(BTRIM(rr.source_country), '') IS NOT NULL;

UPDATE disease_events e
SET source_country = NULLIF(BTRIM(rr.source_country), '')
FROM raw_reports rr
WHERE e.raw_report_id = rr.id
  AND NULLIF(BTRIM(e.source_country), '') IS NULL
  AND NULLIF(BTRIM(rr.source_country), '') IS NOT NULL;

-- Normalize historical scope labels. Case country remains untouched.
UPDATE crawl_matrix_rows
SET region = CASE
    WHEN LOWER(BTRIM(COALESCE(region, ''))) IN (
        'asean', 'asean11', 'asean 11', 'asean-11',
        'asean + timor-leste', 'asean + timor leste', 'asean+',
        'asean plus timor-leste', 'asean plus timor leste'
    ) THEN 'ASEAN'
    WHEN LOWER(BTRIM(COALESCE(region, ''))) IN ('outside asean', 'outside-asean', 'global')
        THEN 'Outside ASEAN'
    ELSE region
END
WHERE region IS NOT NULL;

UPDATE crawl_matrix_rows
SET surveillance_scope = CASE
    WHEN LOWER(BTRIM(COALESCE(country, ''))) IN (
        'brunei', 'brunei darussalam', 'cambodia', 'indonesia', 'laos', 'lao pdr',
        'malaysia', 'myanmar', 'burma', 'philippines', 'singapore', 'thailand',
        'timor-leste', 'timor leste', 'east timor', 'vietnam', 'viet nam'
    ) THEN 'ASEAN'
    WHEN NULLIF(BTRIM(country), '') IS NOT NULL THEN 'Outside ASEAN'
    ELSE NULL
END
WHERE surveillance_scope IS NULL;

UPDATE disease_events
SET surveillance_scope = CASE
    WHEN LOWER(BTRIM(COALESCE(location_name, ''))) IN (
        'brunei', 'brunei darussalam', 'cambodia', 'indonesia', 'laos', 'lao pdr',
        'malaysia', 'myanmar', 'burma', 'philippines', 'singapore', 'thailand',
        'timor-leste', 'timor leste', 'east timor', 'vietnam', 'viet nam'
    ) THEN 'ASEAN'
    WHEN NULLIF(BTRIM(location_name), '') IS NOT NULL THEN 'Outside ASEAN'
    ELSE NULL
END
WHERE surveillance_scope IS NULL;

CREATE INDEX IF NOT EXISTS idx_raw_reports_source_country
    ON raw_reports(source_country);

CREATE INDEX IF NOT EXISTS idx_crawl_matrix_rows_source_country
    ON crawl_matrix_rows(source_country);

CREATE INDEX IF NOT EXISTS idx_disease_events_source_country
    ON disease_events(source_country);
