-- Version interactive URL-analysis cache so extraction-rule fixes re-run.
-- Also persist reporting-window fields used by teammate QA (cumulative vs incident).
ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS nlp_pipeline_version TEXT,
    ADD COLUMN IF NOT EXISTS count_period_type TEXT,
    ADD COLUMN IF NOT EXISTS event_date_start DATE,
    ADD COLUMN IF NOT EXISTS event_date_end DATE,
    ADD COLUMN IF NOT EXISTS date_needs_review BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_disease_events_nlp_pipeline_version
    ON disease_events (nlp_pipeline_version);
