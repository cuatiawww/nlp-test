-- Human review metadata. Corrections retain the original prediction and
-- evidence as an audit trail while the existing trigger synchronizes the
-- reviewed value into the event projection.
ALTER TABLE nlp_corrections
    ADD COLUMN IF NOT EXISTS review_reason TEXT,
    ADD COLUMN IF NOT EXISTS evidence_offset_start INTEGER,
    ADD COLUMN IF NOT EXISTS evidence_offset_end INTEGER,
    ADD COLUMN IF NOT EXISTS prediction_version VARCHAR(100),
    ADD COLUMN IF NOT EXISTS review_action VARCHAR(30) DEFAULT 'corrected',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_nlp_corrections_created_at
    ON nlp_corrections(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nlp_corrections_review_action
    ON nlp_corrections(review_action);
