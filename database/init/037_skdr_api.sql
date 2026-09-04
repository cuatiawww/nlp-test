-- SKDR EBS and Alert collector support. Credentials stay in the runtime
-- environment and are deliberately not stored in this migration.

ALTER TABLE collector_sources
DROP CONSTRAINT IF EXISTS collector_sources_source_type_check;

ALTER TABLE collector_sources
ADD CONSTRAINT collector_sources_source_type_check
CHECK (source_type IN ('rss','web','csv','social_media','api','skdr_api'));

CREATE TABLE IF NOT EXISTS skdr_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES collector_sources(id) ON DELETE CASCADE,
    endpoint_name VARCHAR(30) NOT NULL CHECK (endpoint_name IN ('ebs', 'ibs')),
    external_key TEXT,
    report_year INTEGER NOT NULL,
    epidemiological_week INTEGER,
    report_date DATE,
    page_number INTEGER,
    payload JSONB NOT NULL,
    normalized_text TEXT NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    dedupe_key CHAR(64) NOT NULL UNIQUE,
    raw_report_id UUID REFERENCES raw_reports(id) ON DELETE SET NULL,
    last_enqueued_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skdr_reports_year_week
    ON skdr_reports(report_year, epidemiological_week);
CREATE INDEX IF NOT EXISTS idx_skdr_reports_source_endpoint
    ON skdr_reports(source_id, endpoint_name);
CREATE INDEX IF NOT EXISTS idx_skdr_reports_external_key
    ON skdr_reports(external_key);

INSERT INTO collector_sources (name, source_type, config, schedule, enabled)
SELECT 'SKDR EBS Kemenkes', 'skdr_api',
       '{"endpoint":"ebs","limit":100,"year_mode":"current"}'::jsonb,
       'daily:00:00', FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM collector_sources WHERE source_type='skdr_api' AND config->>'endpoint'='ebs'
);

INSERT INTO collector_sources (name, source_type, config, schedule, enabled)
SELECT 'SKDR IBS Kemenkes', 'skdr_api',
       '{"endpoint":"alert","limit":500,"year_mode":"current","mode":"daily"}'::jsonb,
       'daily:00:00', FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM collector_sources WHERE source_type='skdr_api' AND config->>'endpoint'='alert'
);
