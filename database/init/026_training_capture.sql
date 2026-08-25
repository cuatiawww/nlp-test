-- Capture processed events as pseudo-labelled examples for the bounded,
-- confidence-filtered self-training pipeline. The exporter remains the gate;
-- this table is not used directly by runtime inference.

CREATE OR REPLACE FUNCTION capture_nlp_training_example()
RETURNS TRIGGER AS $$
DECLARE
    example_text TEXT;
    example_hash CHAR(64);
BEGIN
    example_text := COALESCE(NEW.original_text, '');
    example_hash := encode(
        digest(
            example_text || E'\n' || COALESCE(NEW.language, 'unknown') || E'\n' ||
            COALESCE(NEW.disease_classification, '') || E'\n' || COALESCE(NEW.event_type, ''),
            'sha256'
        ),
        'hex'
    );

    INSERT INTO nlp_training_examples
      (raw_report_id, content_hash, text, language, disease_label,
       event_type, relevance_score, is_health_related, case_count,
       death_count, source, confidence, split)
    VALUES
      (NEW.raw_report_id, example_hash, example_text, NEW.language,
       NULLIF(NEW.disease_classification, 'UNKNOWN'), NEW.event_type,
       NEW.relevance_score, NEW.is_health_related, NEW.case_count,
       NEW.death_count, 'auto_event', COALESCE(NEW.confidence, 0.0), 'train')
    ON CONFLICT (content_hash) DO UPDATE SET
      confidence = GREATEST(nlp_training_examples.confidence, EXCLUDED.confidence),
      updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_capture_nlp_training_example ON disease_events;
CREATE TRIGGER trg_capture_nlp_training_example
AFTER INSERT ON disease_events
FOR EACH ROW EXECUTE FUNCTION capture_nlp_training_example();

-- Backfill events collected before this trigger existed.
-- Beberapa disease_events lama dapat mempunyai payload klasifikasi identik dan
-- karena itu menghasilkan content_hash yang sama. Pilih satu event terbaik per
-- hash sebelum INSERT; PostgreSQL melarang satu ON CONFLICT memperbarui row
-- target yang sama lebih dari sekali dalam satu statement.
WITH candidates AS (
  SELECT
    e.*,
    encode(
      digest(
        COALESCE(e.original_text, '') || E'\n' || COALESCE(e.language, 'unknown') || E'\n' ||
        COALESCE(e.disease_classification, '') || E'\n' || COALESCE(e.event_type, ''),
        'sha256'
      ),
      'hex'
    ) AS generated_content_hash
  FROM disease_events e
  WHERE COALESCE(e.original_text, '') <> ''
), deduplicated AS (
  SELECT DISTINCT ON (generated_content_hash) *
  FROM candidates
  ORDER BY generated_content_hash, confidence DESC NULLS LAST, created_at DESC, id
)
INSERT INTO nlp_training_examples
  (raw_report_id, content_hash, text, language, disease_label,
   event_type, relevance_score, is_health_related, case_count,
   death_count, source, confidence, split)
SELECT
  e.raw_report_id,
  e.generated_content_hash,
  COALESCE(e.original_text, ''), e.language,
  NULLIF(e.disease_classification, 'UNKNOWN'), e.event_type,
  e.relevance_score, e.is_health_related, e.case_count, e.death_count,
  'auto_event', COALESCE(e.confidence, 0.0), 'train'
FROM deduplicated e
ON CONFLICT (content_hash) DO UPDATE SET
  confidence = GREATEST(nlp_training_examples.confidence, EXCLUDED.confidence),
  updated_at = NOW();
