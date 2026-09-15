-- Materialized KPI snapshots so dashboard, heatmap, trend, morbidity, TV,
-- and reports read the same stored totals for a filter key.
-- Refresh is on-demand (advisory-locked upsert) after ingest/NLP, or when
-- the row is marked stale. Readers always return the last stored row plus
-- computed_at; they never invent numbers.

CREATE TABLE IF NOT EXISTS kpi_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filter_key TEXT NOT NULL UNIQUE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    country TEXT NOT NULL DEFAULT 'ASEAN',
    disease TEXT NOT NULL DEFAULT 'all',
    source TEXT NOT NULL DEFAULT 'all',
    cases BIGINT NOT NULL DEFAULT 0,
    deaths BIGINT NOT NULL DEFAULT 0,
    events BIGINT NOT NULL DEFAULT 0,
    active_locations BIGINT NOT NULL DEFAULT 0,
    alerts BIGINT NOT NULL DEFAULT 0,
    location_master_count BIGINT NOT NULL DEFAULT 0,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_stale BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_window
    ON kpi_snapshots (start_date, end_date, country, disease);

-- Stop inventing a case when extraction left the column unset.
ALTER TABLE disease_events ALTER COLUMN case_count DROP DEFAULT;
ALTER TABLE disease_events ALTER COLUMN case_count SET DEFAULT NULL;

COMMENT ON TABLE kpi_snapshots IS
  'Canonical headline KPI row per filter. Refresh semantics: mark is_stale on ingest; first reader after stale recomputes under pg_advisory_xact_lock(filter_key) and upserts. Concurrent widgets share that row (snapshot_id). Until refresh, previous totals + computed_at are served.';
