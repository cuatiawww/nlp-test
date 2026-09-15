-- Cache DeepSeek draft notes keyed by template + scope + period + stats hash.
-- Never stores original_text / crawl corpora.

CREATE TABLE IF NOT EXISTS report_narrative_cache (
    cache_key     TEXT PRIMARY KEY,
    template_id   TEXT NOT NULL,
    scope         TEXT NOT NULL,
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    data_hash     TEXT NOT NULL,
    highlights    JSONB NOT NULL DEFAULT '[]'::jsonb,
    narrative     JSONB NOT NULL DEFAULT '{}'::jsonb,
    section_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
    llm_used      BOOLEAN NOT NULL DEFAULT FALSE,
    model         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_narrative_cache_lookup
    ON report_narrative_cache (template_id, scope, period_start, period_end, data_hash);

COMMENT ON TABLE report_narrative_cache IS
  'Token-safe DeepSeek draft cache. Input is truncated KPI/matrix stats only; never original_text.';
