-- Multilingual disease concepts and automatically discovered aliases.
-- Populated by scripts/bootstrap_multilingual_data.py.  These tables keep
-- discovered terminology separate from the classifier's fixed label set.

CREATE TABLE IF NOT EXISTS disease_concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name TEXT NOT NULL UNIQUE,
    english_name TEXT,
    ontology_system VARCHAR(40),
    ontology_code TEXT,
    ontology_uri TEXT,
    ontology_release VARCHAR(40),
    source VARCHAR(40) NOT NULL DEFAULT 'existing_data',
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE disease_concepts
    ADD COLUMN IF NOT EXISTS ontology_system VARCHAR(40),
    ADD COLUMN IF NOT EXISTS ontology_code TEXT,
    ADD COLUMN IF NOT EXISTS ontology_uri TEXT,
    ADD COLUMN IF NOT EXISTS ontology_release VARCHAR(40);

CREATE TABLE IF NOT EXISTS disease_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID NOT NULL REFERENCES disease_concepts(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    language VARCHAR(12) NOT NULL DEFAULT 'unknown',
    source VARCHAR(40) NOT NULL DEFAULT 'existing_data',
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (concept_id, normalized_alias, language)
);

CREATE INDEX IF NOT EXISTS idx_disease_aliases_normalized
    ON disease_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_disease_aliases_language
    ON disease_aliases(language);

CREATE TABLE IF NOT EXISTS nlp_training_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_report_id UUID REFERENCES raw_reports(id) ON DELETE SET NULL,
    content_hash CHAR(64) NOT NULL UNIQUE,
    text TEXT NOT NULL,
    language VARCHAR(12),
    disease_label TEXT,
    event_type TEXT,
    relevance_score TEXT,
    is_health_related BOOLEAN,
    case_count INT,
    death_count INT,
    source VARCHAR(40) NOT NULL DEFAULT 'existing_event',
    confidence DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    split VARCHAR(12) NOT NULL DEFAULT 'train',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_examples_label
    ON nlp_training_examples(disease_label);
CREATE INDEX IF NOT EXISTS idx_training_examples_language
    ON nlp_training_examples(language);
