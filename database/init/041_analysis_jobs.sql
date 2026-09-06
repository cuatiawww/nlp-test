CREATE TABLE IF NOT EXISTS analysis_jobs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 url TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','partial','failed')),
 stage TEXT NOT NULL DEFAULT 'queued',
 result JSONB,
 warnings JSONB NOT NULL DEFAULT '[]',
 error TEXT,
 event_id UUID REFERENCES disease_events(id) ON DELETE SET NULL,
 dispatched_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analysis_jobs_pending ON analysis_jobs(status, updated_at);
