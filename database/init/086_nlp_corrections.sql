-- 086_nlp_corrections.sql: NLP Corrections Audit & Continuous Learning Feedback Loop

CREATE TABLE IF NOT EXISTS nlp_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES disease_events(id) ON DELETE SET NULL,
    raw_report_id UUID REFERENCES raw_reports(id) ON DELETE SET NULL,
    field_name VARCHAR(50) NOT NULL,       -- 'case_count', 'death_count', 'disease', 'location', 'country', 'status'
    original_value TEXT,
    corrected_value TEXT NOT NULL,
    correction_source VARCHAR(30) DEFAULT 'user_ui',
    text_snippet TEXT,                     -- Relevant article snippet for retraining
    language VARCHAR(12),
    corrected_by VARCHAR(100) DEFAULT 'operator',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nlp_corrections_event_id ON nlp_corrections(event_id);
CREATE INDEX IF NOT EXISTS idx_nlp_corrections_raw_report_id ON nlp_corrections(raw_report_id);
CREATE INDEX IF NOT EXISTS idx_nlp_corrections_field_name ON nlp_corrections(field_name);

-- Trigger to automatically update disease_events and boost nlp_training_examples confidence
CREATE OR REPLACE FUNCTION apply_nlp_correction() RETURNS TRIGGER AS $$
BEGIN
    -- 1. Apply correction to disease_events if event_id is given
    IF NEW.event_id IS NOT NULL THEN
        IF NEW.field_name = 'case_count' THEN
            UPDATE disease_events 
            SET case_count = NULLIF(NEW.corrected_value, '')::integer,
                confirmed_cases = NULLIF(NEW.corrected_value, '')::bigint
            WHERE id = NEW.event_id;
        ELSIF NEW.field_name = 'death_count' THEN
            UPDATE disease_events 
            SET death_count = NULLIF(NEW.corrected_value, '')::integer
            WHERE id = NEW.event_id;
        ELSIF NEW.field_name = 'disease' THEN
            UPDATE disease_events 
            SET disease_classification = NEW.corrected_value
            WHERE id = NEW.event_id;
        ELSIF NEW.field_name = 'location' THEN
            UPDATE disease_events 
            SET location_name = NEW.corrected_value,
                city = NEW.corrected_value
            WHERE id = NEW.event_id;
        ELSIF NEW.field_name = 'country' THEN
            UPDATE disease_events 
            SET province = COALESCE(province, NEW.corrected_value)
            WHERE id = NEW.event_id;
        END IF;
    END IF;

    -- 2. Boost training example confidence to 1.0 (Human Verified Label)
    IF NEW.raw_report_id IS NOT NULL THEN
        UPDATE nlp_training_examples
        SET confidence = 1.0,
            source = 'human_corrected',
            updated_at = NOW(),
            disease_label = CASE WHEN NEW.field_name = 'disease' THEN NEW.corrected_value ELSE disease_label END,
            case_count = CASE WHEN NEW.field_name = 'case_count' THEN NULLIF(NEW.corrected_value, '')::integer ELSE case_count END,
            death_count = CASE WHEN NEW.field_name = 'death_count' THEN NULLIF(NEW.corrected_value, '')::integer ELSE death_count END
        WHERE raw_report_id = NEW.raw_report_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_nlp_correction ON nlp_corrections;
CREATE TRIGGER trg_apply_nlp_correction
AFTER INSERT ON nlp_corrections
FOR EACH ROW EXECUTE FUNCTION apply_nlp_correction();
