-- Migration 092: Validation flags column and GIN index on disease_events
-- Records validation alerts: death_exceeds_cases, extreme_count_anomaly, cfr_anomaly, retracted_report, unverified_rumor, conflicting_counts

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'disease_events' AND column_name = 'validation_flags'
    ) THEN
        ALTER TABLE disease_events ADD COLUMN validation_flags JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_disease_events_validation_flags
    ON disease_events USING gin (validation_flags);
