-- Cleanup script to remove duplicated surveillance events caused by repeated URL analysis or crawler runs.
-- Keeps only the latest analysis/crawl run for each article and removes stale/duplicated runs.

BEGIN;

-- 1. Identify older duplicate parent events for the same raw_report_id or source_url
WITH ranked_parents AS (
    SELECT id, raw_report_id, source_url,
           ROW_NUMBER() OVER (
               PARTITION BY COALESCE(raw_report_id::text, source_url)
               ORDER BY created_at DESC, id DESC
           ) as rn
    FROM disease_events
    WHERE parent_event_id IS NULL
      AND (raw_report_id IS NOT NULL OR source_url IS NOT NULL)
),
stale_parents AS (
    SELECT id FROM ranked_parents WHERE rn > 1
)
-- Delete child events belonging to stale parents
DELETE FROM disease_events
WHERE parent_event_id IN (SELECT id FROM stale_parents);

-- Delete the stale parents themselves
WITH ranked_parents AS (
    SELECT id, raw_report_id, source_url,
           ROW_NUMBER() OVER (
               PARTITION BY COALESCE(raw_report_id::text, source_url)
               ORDER BY created_at DESC, id DESC
           ) as rn
    FROM disease_events
    WHERE parent_event_id IS NULL
      AND (raw_report_id IS NOT NULL OR source_url IS NOT NULL)
)
DELETE FROM disease_events
WHERE id IN (SELECT id FROM ranked_parents WHERE rn > 1);

-- 2. Clean up exact duplicate child records under the same parent
WITH ranked_children AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY parent_event_id, location_name, disease_classification, case_count
               ORDER BY id DESC
           ) as rn
    FROM disease_events
    WHERE parent_event_id IS NOT NULL
)
DELETE FROM disease_events
WHERE id IN (SELECT id FROM ranked_children WHERE rn > 1);

-- 3. Targeted cleanup for Pekanbaru smoke haze article if any lingering duplicate remains
WITH pekanbaru_dup AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY location_name, disease_classification, case_count
               ORDER BY created_at DESC, id DESC
           ) as rn
    FROM disease_events
    WHERE (location_name ILIKE '%Pekanbaru%' OR original_text ILIKE '%6.622%')
)
DELETE FROM disease_events
WHERE id IN (SELECT id FROM pekanbaru_dup WHERE rn > 1);

COMMIT;
