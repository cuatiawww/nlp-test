-- Migration 091: Epistemic Status column and index on disease_events
-- Supports epistemic classification: confirmed, suspected, rumor, official_report, retracted, reported

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'disease_events' AND column_name = 'epistemic_status'
    ) THEN
        ALTER TABLE disease_events ADD COLUMN epistemic_status VARCHAR(32) DEFAULT 'confirmed';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_disease_events_epistemic_status
    ON disease_events (epistemic_status)
    WHERE epistemic_status IS NOT NULL;
