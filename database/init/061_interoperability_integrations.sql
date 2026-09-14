-- Administrative catalog of external and internal integrations.
-- This is separate from collector_sources and does not change crawler behavior.
BEGIN;

CREATE TABLE IF NOT EXISTS interoperability_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    integration_type VARCHAR(50) NOT NULL DEFAULT 'API',
    provider VARCHAR(200),
    source_url TEXT,
    endpoint TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'PLANNED'
        CHECK (status IN ('ACTIVE', 'IN_PROGRESS', 'INACTIVE', 'ERROR', 'PLANNED')),
    integrated_in JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_checked_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interoperability_integrations_status
    ON interoperability_integrations(status);
CREATE INDEX IF NOT EXISTS idx_interoperability_integrations_enabled
    ON interoperability_integrations(enabled);
CREATE INDEX IF NOT EXISTS idx_interoperability_integrations_updated_at
    ON interoperability_integrations(updated_at DESC);

COMMIT;
