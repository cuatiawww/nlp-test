-- Direct PostgreSQL quality repair for health events.
--
-- This script deliberately does not call the application, NLP API, or worker.
-- It only applies corrections that are deterministic from the existing WHO
-- concept/alias tables and the stored source evidence. Ambiguous values are
-- retained but marked for review; they are not guessed.
--
-- Run with:
--   docker exec -i db-postgres psql -v ON_ERROR_STOP=1 \
--     -U postgres -d disease_ai < scripts/repair_health_event_data.sql

BEGIN;

CREATE TEMP TABLE dq_disease_map ON COMMIT DROP AS
WITH candidates AS (
    SELECT c.id AS concept_id,
           c.canonical_name,
           lower(btrim(c.canonical_name)) AS label
    FROM disease_concepts c
    WHERE c.is_active
    UNION ALL
    SELECT c.id,
           c.canonical_name,
           lower(btrim(a.alias)) AS label
    FROM disease_aliases a
    JOIN disease_concepts c ON c.id = a.concept_id
    WHERE a.is_active
      AND c.is_active
), unique_labels AS (
    SELECT label,
           min(concept_id::text)::uuid AS concept_id,
           min(canonical_name) AS canonical_name
    FROM candidates
    WHERE NULLIF(label, '') IS NOT NULL
    GROUP BY label
    HAVING count(DISTINCT concept_id) = 1
)
SELECT label, concept_id, canonical_name
FROM unique_labels;

CREATE UNIQUE INDEX dq_disease_map_label_idx ON dq_disease_map(label);

-- A few historical training labels contain an obvious typo or a status
-- prefix ("suspek"). These are normalized only in the training table; the
-- original event epistemic status is not rewritten by this script.
CREATE TEMP TABLE dq_training_label_map (
    label text PRIMARY KEY,
    concept_id uuid NOT NULL,
    canonical_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO dq_training_label_map(label, concept_id, canonical_name)
SELECT label, concept_id, canonical_name
FROM dq_disease_map;

INSERT INTO dq_training_label_map(label, concept_id, canonical_name)
SELECT v.label, c.id, c.canonical_name
FROM (VALUES
    ('diarrhoeal diseases', 'Acute diarrhea'),
    ('kasus observasi difteri', 'Diphtheria'),
    ('malaria konfirmasi', 'Malaria'),
    ('pnemonia', 'Pneumonia'),
    ('suspek campak', 'Measles'),
    ('suspek chikungunya', 'Chikungunya'),
    ('suspek demam tifoid', 'typhoid fever'),
    ('suspek dengue', 'Dengue'),
    ('suspek flu burung pada manusia', 'Avian influenza'),
    ('suspek hfmd', 'Hand, foot and mouth disease'),
    ('suspek leptospirosis', 'Leptospirosis'),
    ('suspek pertusis', 'Pertussis'),
    ('suspek tetanus', 'Tetanus')
) AS v(label, canonical_name)
JOIN disease_concepts c
  ON c.is_active AND lower(c.canonical_name) = lower(v.canonical_name)
ON CONFLICT (label) DO NOTHING;

CREATE TEMP TABLE dq_country_map (
    country_name text PRIMARY KEY,
    country_iso3 varchar(3),
    surveillance_scope text NOT NULL
) ON COMMIT DROP;

INSERT INTO dq_country_map(country_name, country_iso3, surveillance_scope)
VALUES
    ('Indonesia', 'IDN', 'ASEAN'),
    ('Malaysia', 'MYS', 'ASEAN'),
    ('Philippines', 'PHL', 'ASEAN'),
    ('Vietnam', 'VNM', 'ASEAN'),
    ('Thailand', 'THA', 'ASEAN'),
    ('Singapore', 'SGP', 'ASEAN'),
    ('Cambodia', 'KHM', 'ASEAN'),
    ('Laos', 'LAO', 'ASEAN'),
    ('Myanmar', 'MMR', 'ASEAN'),
    ('Brunei', 'BRN', 'ASEAN'),
    ('Timor-Leste', 'TLS', 'ASEAN'),
    ('Democratic Republic of the Congo', 'COD', 'Outside ASEAN'),
    ('South Sudan', 'SSD', 'Outside ASEAN'),
    ('United States', 'USA', 'Outside ASEAN'),
    ('United Kingdom', 'GBR', 'Outside ASEAN'),
    ('India', 'IND', 'Outside ASEAN'),
    ('Australia', 'AUS', 'Outside ASEAN'),
    ('Russia', 'RUS', 'Outside ASEAN'),
    ('Bangladesh', 'BGD', 'Outside ASEAN'),
    ('China', 'CHN', 'Outside ASEAN'),
    ('Japan', 'JPN', 'Outside ASEAN'),
    ('France', 'FRA', 'Outside ASEAN'),
    ('Canada', 'CAN', 'Outside ASEAN'),
    ('Brazil', 'BRA', 'Outside ASEAN'),
    ('Germany', 'DEU', 'Outside ASEAN'),
    ('Italy', 'ITA', 'Outside ASEAN'),
    ('Spain', 'ESP', 'Outside ASEAN'),
    ('Pakistan', 'PAK', 'Outside ASEAN'),
    ('Nigeria', 'NGA', 'Outside ASEAN'),
    ('Egypt', 'EGY', 'Outside ASEAN'),
    ('South Africa', 'ZAF', 'Outside ASEAN'),
    ('Saudi Arabia', 'SAU', 'Outside ASEAN'),
    ('New Zealand', 'NZL', 'Outside ASEAN'),
    ('South Korea', 'KOR', 'Outside ASEAN'),
    ('Outside ASEAN', NULL, 'Outside ASEAN'),
    ('GLOBAL', NULL, 'Outside ASEAN');

-- Only use a gazetteer location when that name resolves to one country in the
-- existing registry. Ambiguous names such as "Maria" are not overwritten.
CREATE TEMP TABLE dq_unique_location_country ON COMMIT DROP AS
SELECT lower(btrim(l.name)) AS location_name,
       min(l.country_iso3) AS country_iso3,
       min(l.country) AS country
FROM locations l
WHERE l.is_active
  AND NULLIF(btrim(l.country_iso3), '') IS NOT NULL
  AND NULLIF(btrim(l.name), '') IS NOT NULL
GROUP BY lower(btrim(l.name))
HAVING count(DISTINCT l.country_iso3) = 1;

UPDATE disease_events e
SET country_iso3 = g.country_iso3,
    source_country = g.country,
    surveillance_scope = CASE
        WHEN g.country_iso3 IN ('IDN','MYS','PHL','VNM','THA','SGP','KHM','LAO','MMR','BRN','TLS')
            THEN 'ASEAN'
        ELSE 'Outside ASEAN'
    END
FROM dq_unique_location_country g
WHERE e.is_health_related IS TRUE
  AND lower(btrim(coalesce(e.location_name, ''))) = g.location_name
  AND (
      e.country_iso3 IS DISTINCT FROM g.country_iso3
      OR e.source_country IS DISTINCT FROM g.country
      OR e.surveillance_scope IS DISTINCT FROM CASE
          WHEN g.country_iso3 IN ('IDN','MYS','PHL','VNM','THA','SGP','KHM','LAO','MMR','BRN','TLS')
              THEN 'ASEAN'
          ELSE 'Outside ASEAN'
      END
  );

UPDATE disease_events e
SET country_iso3 = c.country_iso3,
    source_country = CASE WHEN c.country_iso3 IS NULL THEN c.country_name ELSE c.country_name END,
    surveillance_scope = c.surveillance_scope
FROM dq_country_map c
WHERE e.is_health_related IS TRUE
  AND lower(btrim(coalesce(e.location_name, ''))) = lower(c.country_name)
  AND (
      e.country_iso3 IS DISTINCT FROM c.country_iso3
      OR e.source_country IS DISTINCT FROM c.country_name
      OR e.surveillance_scope IS DISTINCT FROM c.surveillance_scope
  );

UPDATE disease_events
SET source_country = 'OUTSIDE ASEAN',
    country_iso3 = NULL,
    surveillance_scope = 'Outside ASEAN'
WHERE is_health_related IS TRUE
  AND upper(btrim(coalesce(location_name, ''))) = 'OUTSIDE ASEAN'
  AND (
      source_country IS DISTINCT FROM 'OUTSIDE ASEAN'
      OR country_iso3 IS NOT NULL
      OR surveillance_scope IS DISTINCT FROM 'Outside ASEAN'
  );

-- When the event already has an ISO3 country, the scope must agree with it
-- even if the locality name is ambiguous in the gazetteer.
UPDATE disease_events
SET surveillance_scope = CASE
    WHEN country_iso3 IN ('IDN','MYS','PHL','VNM','THA','SGP','KHM','LAO','MMR','BRN','TLS')
        THEN 'ASEAN'
    ELSE 'Outside ASEAN'
END
WHERE is_health_related IS TRUE
  AND NULLIF(btrim(country_iso3), '') IS NOT NULL
  AND surveillance_scope IS DISTINCT FROM CASE
      WHEN country_iso3 IN ('IDN','MYS','PHL','VNM','THA','SGP','KHM','LAO','MMR','BRN','TLS')
          THEN 'ASEAN'
      ELSE 'Outside ASEAN'
  END;

-- This report is explicitly national. Jakarta is the speaker's dateline,
-- while the reported 39,672 cases and 105 deaths are for Indonesia.
UPDATE disease_events e
SET location_name = 'Indonesia',
    country_iso3 = 'IDN',
    source_country = 'Indonesia',
    surveillance_scope = 'ASEAN',
    province = NULL,
    city = NULL,
    admin1_name = NULL,
    admin2_name = NULL,
    validation_flags = CASE
        WHEN coalesce(e.validation_flags, '[]'::jsonb) ? 'location_scope_corrected'
            THEN coalesce(e.validation_flags, '[]'::jsonb)
        ELSE coalesce(e.validation_flags, '[]'::jsonb) || '["location_scope_corrected"]'::jsonb
    END
FROM raw_reports r
WHERE e.raw_report_id = r.id
  AND e.is_health_related IS TRUE
  AND r.url ILIKE '%antaranews.com/berita/5609084/%';

-- Negative records must not remain in the health-event population.
UPDATE disease_events
SET is_health_related = false,
    outbreak_alert = false,
    needs_review = false,
    case_count = NULL,
    death_count = NULL,
    confirmed_cases = NULL,
    suspected_cases = NULL,
    hospitalizations = NULL
WHERE is_health_related IS TRUE
  AND upper(btrim(coalesce(disease_classification, ''))) LIKE 'NEGATIVE%';

-- UNKNOWN is not a usable disease classification. Keep the source/event row
-- for audit, but remove it from the health-event population and clear metrics
-- that would otherwise make an unidentified article look like a disease case.
UPDATE disease_events
SET is_health_related = false,
    outbreak_alert = false,
    needs_review = false,
    case_count = NULL,
    death_count = NULL,
    confirmed_cases = NULL,
    suspected_cases = NULL,
    hospitalizations = NULL
WHERE is_health_related IS TRUE
  AND upper(btrim(coalesce(disease_classification, ''))) IN ('UNKNOWN', 'UNKOWN', '');

-- Normalize disease labels to the active WHO-backed canonical name and keep
-- the foreign-key concept aligned with the display label.
UPDATE disease_events e
SET disease_classification = m.canonical_name,
    primary_disease_concept_id = m.concept_id
FROM dq_disease_map m
WHERE e.is_health_related IS TRUE
  AND lower(btrim(coalesce(e.disease_classification, ''))) = m.label
  AND (
      e.disease_classification IS DISTINCT FROM m.canonical_name
      OR e.primary_disease_concept_id IS DISTINCT FROM m.concept_id
  );

-- Keep the relation table canonical where doing so cannot create a duplicate
-- (event, role, disease) row. Conflicting relations are left for review.
UPDATE disease_event_diseases d
SET disease_concept_id = m.concept_id
FROM dq_disease_map m
WHERE lower(btrim(d.disease_name)) = m.label;

WITH targets AS (
    SELECT d.id,
           m.canonical_name,
           row_number() OVER (
               PARTITION BY d.disease_event_id, d.role, m.canonical_name
               ORDER BY d.id
           ) AS rn
    FROM disease_event_diseases d
    JOIN dq_disease_map m ON lower(btrim(d.disease_name)) = m.label
    WHERE d.disease_name IS DISTINCT FROM m.canonical_name
), selected AS (
    SELECT t.id, t.canonical_name
    FROM targets t
    WHERE t.rn = 1
      AND NOT EXISTS (
          SELECT 1
          FROM disease_event_diseases duplicate
          WHERE duplicate.disease_event_id = (
                    SELECT source.disease_event_id
                    FROM disease_event_diseases source
                    WHERE source.id = t.id
                )
            AND duplicate.role = (
                    SELECT source.role
                    FROM disease_event_diseases source
                    WHERE source.id = t.id
                )
            AND duplicate.disease_name = t.canonical_name
            AND duplicate.id <> t.id
      )
)
UPDATE disease_event_diseases d
SET disease_name = s.canonical_name
FROM selected s
WHERE d.id = s.id;

-- Apply the same deterministic label normalization to the training source.
UPDATE nlp_training_examples t
SET disease_label = m.canonical_name,
    source = CASE WHEN t.source = 'human_corrected' THEN t.source ELSE 'data_quality_repair' END,
    updated_at = now()
FROM dq_training_label_map m
WHERE lower(btrim(coalesce(t.disease_label, ''))) = m.label
  AND t.disease_label IS DISTINCT FROM m.canonical_name;

-- Do not feed non-canonical disease labels into fine-tuning. The examples are
-- retained for later WHO review, but their confidence is lowered so the
-- read-only exporter excludes them at the normal 0.90 threshold. Negative
-- examples remain eligible because they are the explicit non-health class.
UPDATE nlp_training_examples t
SET confidence = 0.0,
    source = 'data_quality_review',
    updated_at = now()
WHERE COALESCE(t.confidence, 0) >= 0.90
  AND NULLIF(btrim(t.disease_label), '') IS NOT NULL
  AND upper(btrim(t.disease_label)) NOT LIKE 'NEGATIVE%'
  AND NOT EXISTS (
      SELECT 1
      FROM dq_training_label_map m
      WHERE m.label = lower(btrim(t.disease_label))
  );

-- The pipeline historically stored zero when a count was not found. Convert
-- that sentinel to NULL unless the source explicitly says zero. This avoids
-- training and dashboard consumers treating "unknown" as "zero".
UPDATE disease_events
SET case_count = NULL
WHERE is_health_related IS TRUE
  AND case_count = 0
  AND confirmed_cases IS NULL
  AND suspected_cases IS NULL
  AND hospitalizations IS NULL
  AND original_text !~* '(^|[^0-9])0[[:space:]]*(cases?|infections?|patients?|people|persons|confirmed|suspected|kasus|pasien|orang|terkonfirmasi|suspek|ca|người|ผู้ป่วย|ราย)([^0-9]|$)'
  AND original_text !~* '(no|zero|without|tidak ada|tidak ditemukan|không có|ไม่มี)[[:space:]]+([^.;,]{0,30})[[:space:]]*(cases?|infections?|patients?|kasus|pasien|orang|ca|người|ผู้ป่วย|ราย)';

UPDATE disease_events
SET death_count = NULL
WHERE is_health_related IS TRUE
  AND death_count = 0
  AND original_text !~* '(^|[^0-9])0[[:space:]]*(deaths?|fatalities|died|dead|meninggal|kematian|tewas|tử vong|chết|เสียชีวิต)([^0-9]|$)'
  AND original_text !~* '(no|zero|without|tidak ada|tidak ditemukan|không có|ไม่มี)[[:space:]]+([^.;,]{0,30})[[:space:]]*(deaths?|fatalities|meninggal|kematian|tewas|tử vong|chết|เสียชีวิต)';

-- Preserve a machine-readable audit trail for values that still need human
-- verification. Do not overwrite existing validation flags.
UPDATE disease_events e
SET validation_flags = CASE
        WHEN coalesce(e.validation_flags, '[]'::jsonb) ? 'unmapped_disease_label'
            THEN coalesce(e.validation_flags, '[]'::jsonb)
        ELSE coalesce(e.validation_flags, '[]'::jsonb) || '["unmapped_disease_label"]'::jsonb
    END,
    needs_review = true
WHERE e.is_health_related IS TRUE
  AND NULLIF(btrim(e.disease_classification), '') IS NOT NULL
  AND upper(btrim(e.disease_classification)) <> 'UNKNOWN'
  AND NOT EXISTS (
      SELECT 1
      FROM dq_disease_map m
      WHERE m.label = lower(btrim(e.disease_classification))
  );

-- If the canonical disease cannot be found in the stored source evidence,
-- retain the record but exclude it from automatic training until reviewed.
UPDATE disease_events e
SET validation_flags = CASE
        WHEN coalesce(e.validation_flags, '[]'::jsonb) ? 'disease_not_found_in_source'
            THEN coalesce(e.validation_flags, '[]'::jsonb)
        ELSE coalesce(e.validation_flags, '[]'::jsonb) || '["disease_not_found_in_source"]'::jsonb
    END,
    needs_review = true
WHERE e.is_health_related IS TRUE
  AND NULLIF(btrim(e.disease_classification), '') IS NOT NULL
  AND upper(btrim(e.disease_classification)) <> 'UNKNOWN'
  AND NOT EXISTS (
      SELECT 1
      FROM disease_aliases a
      JOIN disease_concepts c ON c.id = a.concept_id
      WHERE c.is_active
        AND a.is_active
        AND c.canonical_name = e.disease_classification
        AND length(regexp_replace(lower(a.alias), '[^[:alnum:]]', '', 'g')) >= 4
        AND position(
            regexp_replace(lower(a.alias), '[^[:alnum:]]', '', 'g')
            IN regexp_replace(lower(coalesce(e.original_text, '')), '[^[:alnum:]]', '', 'g')
        ) > 0
  );

-- Location is left untouched when it is present because a database-side
-- heuristic cannot reliably distinguish a city, province, or country in all
-- ASEAN languages. Missing locations are explicitly marked for review.
UPDATE disease_events e
SET validation_flags = CASE
        WHEN coalesce(e.validation_flags, '[]'::jsonb) ? 'location_missing'
            THEN coalesce(e.validation_flags, '[]'::jsonb)
        ELSE coalesce(e.validation_flags, '[]'::jsonb) || '["location_missing"]'::jsonb
    END,
    needs_review = true
WHERE e.is_health_related IS TRUE
  AND NULLIF(btrim(e.location_name), '') IS NULL;

-- Counts that contradict the basic epidemiological invariant require review;
-- they are not silently changed because the source may be reporting different
-- denominators or historical and current values in one article.
UPDATE disease_events e
SET validation_flags = CASE
        WHEN coalesce(e.validation_flags, '[]'::jsonb) ? 'metric_inconsistency'
            THEN coalesce(e.validation_flags, '[]'::jsonb)
        ELSE coalesce(e.validation_flags, '[]'::jsonb) || '["metric_inconsistency"]'::jsonb
    END,
    needs_review = true
WHERE e.is_health_related IS TRUE
  AND e.death_count IS NOT NULL
  AND e.case_count IS NOT NULL
  AND e.death_count > e.case_count;

COMMIT;

SELECT 'health_events_remaining' AS metric, count(*) AS value
FROM disease_events
WHERE is_health_related IS TRUE
UNION ALL
SELECT 'health_events_needs_review', count(*)
FROM disease_events
WHERE is_health_related IS TRUE AND needs_review IS TRUE
UNION ALL
SELECT 'canonical_training_examples', count(*)
FROM nlp_training_examples
WHERE disease_label IS NOT NULL AND btrim(disease_label) <> '';
