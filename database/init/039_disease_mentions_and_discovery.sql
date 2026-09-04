-- Store explainable disease resolution without changing the legacy primary
-- disease columns used by the dashboard.
ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS disease_mentions JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_disease_events_mentions
    ON disease_events USING GIN (disease_mentions);

-- Unresolved terminology is quarantined here. It can be reviewed/promoted
-- after WHO validation without becoming an active disease concept by accident.
CREATE TABLE IF NOT EXISTS disease_discovery_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surface_form TEXT NOT NULL,
    normalized_form TEXT NOT NULL UNIQUE,
    language VARCHAR(12),
    sample_text TEXT,
    source_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'resolved', 'rejected')),
    resolved_concept_id UUID REFERENCES disease_concepts(id) ON DELETE SET NULL,
    provider VARCHAR(30),
    confidence DOUBLE PRECISION,
    occurrences INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disease_discovery_candidates_status
    ON disease_discovery_candidates(status, updated_at DESC);
