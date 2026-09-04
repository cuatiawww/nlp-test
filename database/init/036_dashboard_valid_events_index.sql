-- Keep the public dashboard date-range and dedup queries indexable.
-- The predicate mirrors the dashboard's valid-event definition.
CREATE INDEX IF NOT EXISTS idx_disease_events_dashboard_published_valid
    ON disease_events (published_at DESC, raw_report_id, confidence DESC, created_at DESC)
    WHERE is_health_related = TRUE
      AND disease_classification IS NOT NULL
      AND UPPER(disease_classification) <> 'UNKNOWN'
      AND UPPER(disease_classification) NOT LIKE 'NEGATIVE%'
      AND confidence >= 0.15;
