-- Indexes for the public dashboard / location-based EWS snapshot.
-- Kept as a normal idempotent migration because init files run automatically
-- before the backend starts serving requests.

CREATE INDEX IF NOT EXISTS idx_disease_events_dashboard_health
    ON disease_events (disease_classification, location_name, created_at DESC)
    WHERE is_health_related = TRUE AND disease_classification IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_disease_events_raw_report_confidence
    ON disease_events (raw_report_id, confidence DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_reports_url_nonempty
    ON raw_reports (url)
    WHERE url IS NOT NULL AND url <> '';

CREATE INDEX IF NOT EXISTS idx_locations_lower_name_active
    ON locations (LOWER(name))
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_outbreak_rules_lower_disease_active
    ON disease_outbreak_rules (LOWER(disease_name))
    WHERE is_active = TRUE;
