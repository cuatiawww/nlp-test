-- Global ingestion hold and resumable re-analysis runs.
BEGIN;

CREATE TABLE IF NOT EXISTS pipeline_control (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    mode TEXT NOT NULL DEFAULT 'RUNNING'
        CHECK (mode IN ('RUNNING', 'DRAINING', 'REANALYZING', 'RESUMING')),
    operation_id UUID,
    snapshot_at TIMESTAMPTZ,
    reason TEXT,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO pipeline_control(id, mode)
VALUES (1, 'RUNNING')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS reanalysis_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'running', 'completed', 'failed', 'cancelled')),
    total_items BIGINT NOT NULL DEFAULT 0,
    processed_items BIGINT NOT NULL DEFAULT 0,
    failed_items BIGINT NOT NULL DEFAULT 0,
    last_created_at TIMESTAMP WITHOUT TIME ZONE,
    last_event_id UUID,
    error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reanalysis_runs_status
    ON reanalysis_runs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS pipeline_maintenance_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_name TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'published', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_maintenance_messages_pending
    ON pipeline_maintenance_messages(status, queue_name, created_at)
    WHERE status = 'pending';

COMMIT;
