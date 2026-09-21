-- Phase 1: make document identity race-safe at the PostgreSQL boundary.
-- Existing duplicate rows are retained as tombstones and point to the row
-- selected as the durable identity winner. FAILED rows remain eligible for
-- retry and therefore win only when no accepted/active row exists.
BEGIN;

-- The restored production database may not have replayed 001_schema.sql, so
-- do not assume pgcrypto exists before using digest() below.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE raw_reports
SET canonical_url = COALESCE(NULLIF(BTRIM(canonical_url), ''), NULLIF(BTRIM(normalized_url), '')),
    final_url = COALESCE(NULLIF(BTRIM(final_url), ''), NULLIF(BTRIM(canonical_url), ''), NULLIF(BTRIM(normalized_url), ''))
WHERE (canonical_url IS NULL OR BTRIM(canonical_url) = ''
       OR final_url IS NULL OR BTRIM(final_url) = '')
  AND (normalized_url IS NOT NULL AND BTRIM(normalized_url) <> '');

UPDATE raw_reports
SET url_hash = encode(digest(BTRIM(normalized_url), 'sha256'), 'hex')
WHERE NULLIF(BTRIM(url_hash), '') IS NULL
  AND NULLIF(BTRIM(normalized_url), '') IS NOT NULL;

DO $$
DECLARE
    identity_column TEXT;
    duplicate_group RECORD;
    survivor_id UUID;
    duplicate_count BIGINT;
    group_count BIGINT;
    identity_value_text TEXT;
    columns TEXT[] := ARRAY[
        'url', 'normalized_url', 'canonical_url', 'final_url', 'url_hash', 'content_hash'
    ];
BEGIN
    FOREACH identity_column IN ARRAY columns LOOP
        EXECUTE format(
            'SELECT COUNT(*) FROM (
                 SELECT %1$I FROM raw_reports
                  WHERE NULLIF(BTRIM(%1$I), '''') IS NOT NULL
                    AND processing_status IS DISTINCT FROM ''DUPLICATE''
                  GROUP BY %1$I HAVING COUNT(*) > 1
             ) duplicate_groups', identity_column
        ) INTO group_count;
        EXECUTE format(
            'SELECT COALESCE(SUM(group_size - 1), 0) FROM (
                 SELECT COUNT(*) AS group_size FROM raw_reports
                  WHERE NULLIF(BTRIM(%1$I), '''') IS NOT NULL
                    AND processing_status IS DISTINCT FROM ''DUPLICATE''
                  GROUP BY %1$I HAVING COUNT(*) > 1
             ) duplicate_rows', identity_column
        ) INTO duplicate_count;
        RAISE NOTICE 'crawler identity inspection: column=%, duplicate_groups=%, duplicate_rows=%',
            identity_column, group_count, duplicate_count;

        FOR duplicate_group IN EXECUTE format(
            'SELECT %1$I::text AS identity_value FROM raw_reports
              WHERE NULLIF(BTRIM(%1$I), '''') IS NOT NULL
                AND processing_status IS DISTINCT FROM ''DUPLICATE''
              GROUP BY %1$I HAVING COUNT(*) > 1', identity_column
        ) LOOP
            identity_value_text := duplicate_group.identity_value::text;
            EXECUTE format(
                'SELECT id FROM raw_reports
                WHERE %1$I::text = %2$L::text
                    AND processing_status IS DISTINCT FROM ''DUPLICATE''
                  ORDER BY CASE UPPER(COALESCE(processing_status, ''''))
                             WHEN ''PROCESSED'' THEN 0
                             WHEN ''NON_HEALTH'' THEN 1
                             WHEN ''PROCESSING'' THEN 2
                             WHEN ''NEW'' THEN 3
                             WHEN ''FAILED'' THEN 4
                             ELSE 5
                           END,
                           created_at ASC, id ASC
                  LIMIT 1', identity_column, identity_value_text
            ) INTO survivor_id;

            EXECUTE format(
                'UPDATE raw_reports
                    SET processing_status = ''DUPLICATE'',
                        duplicate_of_raw_report_id = %2$L::uuid
                  WHERE %1$I::text = %3$L::text
                    AND id <> %2$L::uuid
                    AND processing_status IS DISTINCT FROM ''DUPLICATE''',
                identity_column, survivor_id, identity_value_text
            );
        END LOOP;
    END LOOP;
END $$;

-- Point tombstones at the surviving root if an earlier identity pass created
-- a short duplicate chain through another row in the same migration.
WITH RECURSIVE lineage AS (
    SELECT id AS duplicate_id, duplicate_of_raw_report_id AS current_id,
           ARRAY[id] AS visited_ids, 1 AS depth
      FROM raw_reports
     WHERE processing_status = 'DUPLICATE'
       AND duplicate_of_raw_report_id IS NOT NULL
    UNION ALL
    SELECT lineage.duplicate_id, next_row.duplicate_of_raw_report_id,
           lineage.visited_ids || next_row.id, lineage.depth + 1
      FROM lineage
      JOIN raw_reports next_row ON next_row.id = lineage.current_id
     WHERE next_row.processing_status = 'DUPLICATE'
       AND next_row.duplicate_of_raw_report_id IS NOT NULL
       AND NOT next_row.id = ANY(lineage.visited_ids)
), roots AS (
    SELECT DISTINCT ON (duplicate_id)
           duplicate_id, current_id AS root_id
      FROM lineage
     WHERE current_id IS NOT NULL
     ORDER BY duplicate_id, depth DESC
)
UPDATE raw_reports duplicate_row
   SET duplicate_of_raw_report_id = roots.root_id
  FROM roots
 WHERE duplicate_row.id = roots.duplicate_id
   AND duplicate_row.duplicate_of_raw_report_id IS DISTINCT FROM roots.root_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_reports_url_identity
    ON raw_reports (url)
    WHERE NULLIF(BTRIM(url), '') IS NOT NULL
      AND processing_status IS DISTINCT FROM 'DUPLICATE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_reports_normalized_url_identity
    ON raw_reports (normalized_url)
    WHERE NULLIF(BTRIM(normalized_url), '') IS NOT NULL
      AND processing_status IS DISTINCT FROM 'DUPLICATE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_reports_canonical_url_identity
    ON raw_reports (canonical_url)
    WHERE NULLIF(BTRIM(canonical_url), '') IS NOT NULL
      AND processing_status IS DISTINCT FROM 'DUPLICATE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_reports_final_url_identity
    ON raw_reports (final_url)
    WHERE NULLIF(BTRIM(final_url), '') IS NOT NULL
      AND processing_status IS DISTINCT FROM 'DUPLICATE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_reports_url_hash_identity
    ON raw_reports (url_hash)
    WHERE NULLIF(BTRIM(url_hash), '') IS NOT NULL
      AND processing_status IS DISTINCT FROM 'DUPLICATE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_reports_content_hash_identity
    ON raw_reports (content_hash)
    WHERE NULLIF(BTRIM(content_hash), '') IS NOT NULL
      AND processing_status IS DISTINCT FROM 'DUPLICATE';

COMMIT;
