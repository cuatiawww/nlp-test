CREATE TABLE IF NOT EXISTS collector_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('rss','web','csv','social_media','api')),
    config JSONB NOT NULL DEFAULT '{}',
    schedule VARCHAR(50),
    enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collector_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES collector_sources(id) ON DELETE CASCADE,
    status VARCHAR(30) DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCESS','FAILED')),
    records_found INT DEFAULT 0,
    records_ingested INT DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP DEFAULT NOW(),
    finished_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_runs_source_id ON collector_runs(source_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON collector_runs(status);
