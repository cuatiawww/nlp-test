-- Phase 2.1: durable RAW publication recovery and fenced matrix leases.
BEGIN;

CREATE TABLE IF NOT EXISTS raw_report_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_report_id UUID NOT NULL UNIQUE REFERENCES raw_reports(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'published')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_report_outbox_pending
    ON raw_report_outbox(status, next_attempt_at, created_at)
    WHERE status = 'pending';

-- Recover RAW rows created by earlier versions or by a crash before this
-- migration. PROCESSING is included because its worker may have died.
INSERT INTO raw_report_outbox(raw_report_id)
SELECT id
  FROM raw_reports
 WHERE processing_status IN ('NEW', 'FAILED', 'PROCESSING')
ON CONFLICT (raw_report_id) DO NOTHING;

ALTER TABLE crawl_matrix_jobs
    ADD COLUMN IF NOT EXISTS lease_owner TEXT,
    ADD COLUMN IF NOT EXISTS lease_token UUID,
    ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crawl_matrix_jobs_lease
    ON crawl_matrix_jobs(status, lease_expires_at, updated_at);

COMMIT;
