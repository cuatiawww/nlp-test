-- Multi-event support: parent-child linking and source URL dedup.
-- Allows one document (URL) to produce N disease_events rows,
-- each with a specific (disease, location, case_count) tuple.

-- Add parent-child linking for multi-event decomposition
ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES disease_events(id)
                                             ON DELETE SET NULL;

ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Copy existing URL data from raw_reports for dedup
UPDATE disease_events de
SET source_url = rr.url
FROM raw_reports rr
WHERE de.raw_report_id = rr.id
  AND rr.url IS NOT NULL
  AND de.source_url IS NULL;

CREATE INDEX IF NOT EXISTS idx_disease_events_parent
    ON disease_events(parent_event_id) WHERE parent_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_disease_events_source_url
    ON disease_events(source_url) WHERE source_url IS NOT NULL;
