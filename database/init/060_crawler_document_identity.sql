-- Additive crawler identity fields. Existing records are retained unchanged;
-- identity values are populated as reports are seen again by updated workers.
BEGIN;

ALTER TABLE raw_reports
    ADD COLUMN IF NOT EXISTS normalized_url TEXT,
    ADD COLUMN IF NOT EXISTS canonical_url TEXT,
    ADD COLUMN IF NOT EXISTS url_hash CHAR(64),
    ADD COLUMN IF NOT EXISTS content_hash CHAR(64),
    ADD COLUMN IF NOT EXISTS final_url TEXT,
    ADD COLUMN IF NOT EXISTS author TEXT,
    ADD COLUMN IF NOT EXISTS duplicate_of_raw_report_id UUID
        REFERENCES raw_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_raw_reports_normalized_url
    ON raw_reports(normalized_url) WHERE normalized_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_reports_canonical_url
    ON raw_reports(canonical_url) WHERE canonical_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_reports_url_hash
    ON raw_reports(url_hash) WHERE url_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_reports_content_hash
    ON raw_reports(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_reports_duplicate_of
    ON raw_reports(duplicate_of_raw_report_id)
    WHERE duplicate_of_raw_report_id IS NOT NULL;

ALTER TABLE analysis_jobs
    ADD COLUMN IF NOT EXISTS normalized_url TEXT,
    ADD COLUMN IF NOT EXISTS url_hash CHAR(64);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_normalized_active
    ON analysis_jobs(normalized_url, created_at DESC)
    WHERE normalized_url IS NOT NULL AND status IN ('queued', 'processing');

-- Pipeline-specific cache prevents repeated NLP work while keeping RAW as the
-- source of truth. Different NLP contracts may keep separate cache entries.
CREATE TABLE IF NOT EXISTS crawler_nlp_cache (
    identity_hash CHAR(64) NOT NULL,
    pipeline VARCHAR(80) NOT NULL,
    raw_report_id UUID REFERENCES raw_reports(id) ON DELETE SET NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (identity_hash, pipeline)
);

CREATE INDEX IF NOT EXISTS idx_crawler_nlp_cache_raw_report
    ON crawler_nlp_cache(raw_report_id) WHERE raw_report_id IS NOT NULL;

ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS event_date DATE,
    ADD COLUMN IF NOT EXISTS confirmed_cases BIGINT,
    ADD COLUMN IF NOT EXISTS suspected_cases BIGINT,
    ADD COLUMN IF NOT EXISTS hospitalizations BIGINT,
    ADD COLUMN IF NOT EXISTS epidemiological_evidence JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_disease_events_event_date
    ON disease_events(event_date) WHERE event_date IS NOT NULL;

-- Google News links are redirect wrappers. Resolve a small bounded subset to
-- the publisher canonical URL so the same article from first-party RSS and
-- Google News receives one identity. Other RSS feeds keep the safe fallback.
UPDATE collector_sources
SET config = jsonb_set(
        jsonb_set(
            jsonb_set(COALESCE(config, '{}'::jsonb), '{fetch_full_article}', 'true'::jsonb, true),
            '{full_article_limit}', '5'::jsonb, true
        ),
        '{fetch_mode}', '"http"'::jsonb, true
    )
WHERE source_type='rss'
  AND COALESCE(config->>'url', '') LIKE 'https://news.google.com/%';

COMMIT;
