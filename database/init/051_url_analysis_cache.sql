-- Keep interactive URL cache lookups fast without enforcing URL uniqueness.
-- A source may legitimately be stored more than once by different collectors.
CREATE INDEX IF NOT EXISTS idx_raw_reports_url_created_at
    ON raw_reports (url, created_at DESC)
    WHERE url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_disease_events_raw_report_created_at
    ON disease_events (raw_report_id, created_at DESC)
    WHERE raw_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_url_status
    ON analysis_jobs (url, status, created_at)
    WHERE status IN ('queued', 'processing');
