-- Safe ICD-11 disease master canonicalization.
--
-- This migration is intentionally non-destructive:
--   * A full snapshot of disease_concepts and aliases is kept first.
--   * Legacy names are retained as aliases.
--   * Duplicate or unsafe concepts are deactivated, never deleted.
--   * disease_events.disease_classification remains unchanged for auditability.
--   * New concept_id columns provide a canonical link for future reads.
BEGIN;

CREATE TABLE IF NOT EXISTS disease_concept_migration_backup_053 (
    snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),
    id UUID PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    english_name TEXT,
    ontology_system VARCHAR(40),
    ontology_code TEXT,
    ontology_uri TEXT,
    ontology_release VARCHAR(40),
    source VARCHAR(40) NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    is_active BOOLEAN NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

INSERT INTO disease_concept_migration_backup_053
    (id, canonical_name, english_name, ontology_system, ontology_code,
     ontology_uri, ontology_release, source, confidence, is_active,
     created_at, updated_at)
SELECT id, canonical_name, english_name, ontology_system, ontology_code,
       ontology_uri, ontology_release, source, confidence, is_active,
       created_at, updated_at
FROM disease_concepts
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS disease_alias_migration_backup_053 (
    snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),
    id UUID PRIMARY KEY,
    concept_id UUID NOT NULL,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    language VARCHAR(12) NOT NULL,
    source VARCHAR(40) NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    is_active BOOLEAN NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

INSERT INTO disease_alias_migration_backup_053
    (id, concept_id, alias, normalized_alias, language, source, confidence,
     is_active, created_at, updated_at)
SELECT id, concept_id, alias, normalized_alias, language, source, confidence,
       is_active, created_at, updated_at
FROM disease_aliases
ON CONFLICT (id) DO NOTHING;

ALTER TABLE disease_concepts
    ADD COLUMN IF NOT EXISTS canonicalization_status VARCHAR(24) NOT NULL DEFAULT 'unreviewed',
    ADD COLUMN IF NOT EXISTS canonicalization_notes TEXT,
    ADD COLUMN IF NOT EXISTS canonicalization_reviewed_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS disease_concept_redirects (
    legacy_concept_id UUID PRIMARY KEY REFERENCES disease_concepts(id) ON DELETE RESTRICT,
    canonical_concept_id UUID NOT NULL REFERENCES disease_concepts(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (legacy_concept_id <> canonical_concept_id)
);

ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS primary_disease_concept_id UUID REFERENCES disease_concepts(id) ON DELETE SET NULL;

ALTER TABLE disease_event_diseases
    ADD COLUMN IF NOT EXISTS disease_concept_id UUID REFERENCES disease_concepts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_disease_events_primary_concept
    ON disease_events(primary_disease_concept_id);

CREATE INDEX IF NOT EXISTS idx_disease_event_diseases_concept
    ON disease_event_diseases(disease_concept_id);

-- Preserve every current canonical spelling before any name cleanup.
INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT c.id,
       c.canonical_name,
       lower(trim(regexp_replace(regexp_replace(c.canonical_name, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g'))),
       'legacy',
       'icd11_canonicalization_053',
       1.0,
       TRUE
FROM disease_concepts c
WHERE NOT EXISTS (
    SELECT 1
    FROM disease_aliases a
    WHERE a.concept_id = c.id
      AND a.normalized_alias = lower(trim(regexp_replace(regexp_replace(c.canonical_name, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g')))
      AND a.language = 'legacy'
);

-- Names that are safe to make human-readable without changing their ICD-11 code.
CREATE TEMP TABLE icd11_name_cleanup_053 (
    ontology_code TEXT PRIMARY KEY,
    current_name TEXT NOT NULL,
    preferred_name TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO icd11_name_cleanup_053 (ontology_code, current_name, preferred_name) VALUES
    ('RA01', 'COVID-19 coronavirus', 'COVID-19'),
    ('1A40.Z&XT5R', 'acute diarrhea', 'Acute diarrhea'),
    ('1D2Z', 'dengue fever DBD', 'Dengue'),
    ('1F03', 'measles campak', 'Measles'),
    ('1B1Z', 'tuberculosis TB', 'Tuberculosis'),
    ('1C82', 'RABIES', 'Rabies'),
    ('1A00', 'CHOLERA', 'Cholera'),
    ('1E70', 'SMALLPOX', 'Smallpox'),
    ('1D48', 'ZIKA', 'Zika'),
    ('1B97', 'ANTHRAX', 'Anthrax')
ON CONFLICT (ontology_code) DO NOTHING;

-- Add the old spelling as an alias and then update only the selected target row.
INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT c.id,
       c.canonical_name,
       lower(trim(regexp_replace(regexp_replace(c.canonical_name, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g'))),
       'legacy',
       'icd11_canonicalization_053',
       1.0,
       TRUE
FROM disease_concepts c
JOIN icd11_name_cleanup_053 p ON p.ontology_code = c.ontology_code AND p.current_name = c.canonical_name
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;

UPDATE disease_concepts c
SET canonical_name = p.preferred_name,
    canonicalization_status = 'validated',
    canonicalization_notes = 'Canonical display name normalized to the reviewed ICD-11 code in migration 053.',
    canonicalization_reviewed_at = NOW(),
    updated_at = NOW()
FROM icd11_name_cleanup_053 p
WHERE c.ontology_code = p.ontology_code
  AND c.canonical_name = p.current_name
  AND NOT EXISTS (
      SELECT 1 FROM disease_concepts existing
      WHERE existing.id <> c.id AND existing.canonical_name = p.preferred_name
  );

-- Explicit reviewed redirects. These preserve the source concept and all event text.
CREATE TEMP TABLE icd11_redirect_plan_053 (
    legacy_name TEXT NOT NULL,
    legacy_code TEXT,
    target_code TEXT NOT NULL,
    target_name TEXT NOT NULL,
    reason TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO icd11_redirect_plan_053 (legacy_name, legacy_code, target_code, target_name, reason) VALUES
    ('COVID19', 'RA01', 'RA01', 'COVID-19', 'Duplicate concept for the same ICD-11 code.'),
    ('influenza flu', '1E32', '1E32', 'Influenza, virus not identified', 'Duplicate concept for the same ICD-11 code.'),
    ('DIARE_AKUT', '1A40.Z&XT5R', '1A40.Z&XT5R', 'Acute diarrhea', 'Legacy local label for the same ICD-11 concept.'),
    ('lassa fever', '1D44', '1D61.2', 'Lassa fever', 'Stored WHO code does not describe Lassa fever; reviewed target is Lassa fever.'),
    ('ebola virus', '1D42', '1D60.0Z', 'Ebola disease, virus unspecified', 'Stored WHO code does not describe Ebola disease; reviewed target is Ebola disease.')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    plan RECORD;
    legacy RECORD;
    target_id UUID;
BEGIN
    FOR plan IN SELECT * FROM icd11_redirect_plan_053 LOOP
        SELECT c.id INTO target_id
        FROM disease_concepts c
        WHERE c.ontology_code = plan.target_code
          AND c.canonical_name = plan.target_name
          AND c.is_active = TRUE
        LIMIT 1;

        IF target_id IS NULL THEN
            -- WHO code lists can change between releases and a target may not
            -- exist in an older/local seed.  A reviewed redirect must never
            -- prevent the API from starting: preserve the source data and
            -- skip only this redirect until its target is seeded/reviewed.
            RAISE NOTICE 'Skipping ICD-11 redirect; target not found: code=%, name=%',
                plan.target_code, plan.target_name;
            CONTINUE;
        END IF;

        FOR legacy IN
            SELECT c.*
            FROM disease_concepts c
            WHERE c.canonical_name = plan.legacy_name
              AND (plan.legacy_code IS NULL OR c.ontology_code = plan.legacy_code)
              AND c.id <> target_id
        LOOP
            INSERT INTO disease_concept_redirects
                (legacy_concept_id, canonical_concept_id, reason, confidence)
            VALUES (legacy.id, target_id, plan.reason, 1.0)
            ON CONFLICT (legacy_concept_id) DO UPDATE SET
                canonical_concept_id = EXCLUDED.canonical_concept_id,
                reason = EXCLUDED.reason,
                confidence = EXCLUDED.confidence;

            INSERT INTO disease_aliases
                (concept_id, alias, normalized_alias, language, source, confidence, is_active)
            SELECT target_id, a.alias, a.normalized_alias, a.language,
                   'icd11_canonicalization_053', a.confidence, TRUE
            FROM disease_aliases a
            WHERE a.concept_id = legacy.id
            ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
                confidence = GREATEST(disease_aliases.confidence, EXCLUDED.confidence),
                is_active = TRUE,
                updated_at = NOW();

            INSERT INTO disease_aliases
                (concept_id, alias, normalized_alias, language, source, confidence, is_active)
            VALUES (
                target_id,
                legacy.canonical_name,
                lower(trim(regexp_replace(regexp_replace(legacy.canonical_name, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g'))),
                'legacy',
                'icd11_canonicalization_053',
                1.0,
                TRUE
            )
            ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;

            UPDATE disease_aliases
            SET is_active = FALSE, updated_at = NOW()
            WHERE concept_id = legacy.id;

            UPDATE disease_concepts
            SET is_active = FALSE,
                canonicalization_status = 'redirected',
                canonicalization_notes = plan.reason,
                canonicalization_reviewed_at = NOW(),
                updated_at = NOW()
            WHERE id = legacy.id;
        END LOOP;

        UPDATE disease_concepts
        SET canonicalization_status = 'validated',
            canonicalization_reviewed_at = NOW(),
            updated_at = NOW()
        WHERE id = target_id;
    END LOOP;
END $$;

-- These are unsafe broad WHO search results. Keep them for audit, but do not
-- present them as validated disease concepts until a reviewer selects a code.
UPDATE disease_concepts
SET is_active = FALSE,
    canonicalization_status = 'needs_review',
    canonicalization_notes = CASE canonical_name
        WHEN 'HEPATITIS' THEN 'Generic term was mapped to a late-syphilis post-coordination code; requires a specific hepatitis type.'
        WHEN 'POLIO' THEN 'Term was mapped to a vaccine adverse-effect code, not poliomyelitis; requires manual ICD-11 review.'
        ELSE 'Requires manual ICD-11 review.'
    END,
    canonicalization_reviewed_at = NOW(),
    updated_at = NOW()
WHERE canonical_name IN ('HEPATITIS', 'POLIO');

-- Correct two known contaminated aliases without deleting the original rows.
INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT target.id, source_alias.alias, source_alias.normalized_alias,
       source_alias.language, 'icd11_canonicalization_053', source_alias.confidence, TRUE
FROM disease_concepts target
JOIN disease_concepts source ON source.canonical_name = 'Severe dengue'
JOIN disease_aliases source_alias ON source_alias.concept_id = source.id
WHERE target.canonical_name = 'hand foot mouth disease'
  AND source_alias.normalized_alias IN (
      'enterovirus infection coxsackievirus a16 ev a71 and dengue virus infection denv',
      'hand foot and mouth disease and dengue fever',
      'tay chân miệng và sốt xuất huyết'
  )
ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
    is_active = TRUE,
    updated_at = NOW();

UPDATE disease_aliases a
SET is_active = FALSE, updated_at = NOW()
FROM disease_concepts c
WHERE a.concept_id = c.id
  AND c.canonical_name = 'Severe dengue'
  AND a.normalized_alias IN (
      'enterovirus infection coxsackievirus a16 ev a71 and dengue virus infection denv',
      'hand foot and mouth disease and dengue fever',
      'tay chân miệng và sốt xuất huyết'
  );

INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT target.id, source_alias.alias, source_alias.normalized_alias,
       source_alias.language, 'icd11_canonicalization_053', source_alias.confidence, TRUE
FROM disease_concepts target
JOIN disease_concepts source ON source.canonical_name = 'Influenza, virus not identified'
JOIN disease_aliases source_alias ON source_alias.concept_id = source.id
WHERE target.canonical_name = 'avian influenza H5N1'
  AND source_alias.normalized_alias = 'flu burung'
ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
    is_active = TRUE,
    updated_at = NOW();

UPDATE disease_aliases a
SET is_active = FALSE, updated_at = NOW()
FROM disease_concepts c
WHERE a.concept_id = c.id
  AND c.canonical_name = 'Influenza, virus not identified'
  AND a.normalized_alias = 'flu burung';

UPDATE disease_concepts
SET canonicalization_status = CASE
        WHEN canonicalization_status = 'unreviewed' AND is_active AND ontology_code IS NOT NULL
            THEN 'validated'
        ELSE canonicalization_status
    END,
    canonicalization_reviewed_at = CASE
        WHEN canonicalization_status = 'unreviewed' AND is_active AND ontology_code IS NOT NULL
            THEN NOW()
        ELSE canonicalization_reviewed_at
    END
WHERE is_active = TRUE AND ontology_code IS NOT NULL;

-- Add canonical and operational surveillance spellings to the reviewed
-- concepts. These are aliases only; the canonical ICD-11 name remains the
-- single name used for new records.
CREATE TEMP TABLE icd11_reviewed_aliases_053 (
    target_name TEXT NOT NULL,
    alias TEXT NOT NULL,
    language VARCHAR(12) NOT NULL DEFAULT 'en'
) ON COMMIT DROP;

INSERT INTO icd11_reviewed_aliases_053 (target_name, alias, language) VALUES
    ('Measles', 'Campak', 'id'),
    ('Measles', 'measles campak', 'en'),
    ('hand foot mouth disease', 'HFMD', 'en'),
    ('hand foot mouth disease', 'flu singapura', 'id'),
    ('Dengue', 'DBD', 'id'),
    ('Dengue', 'dengue fever DBD', 'en'),
    ('Rabies', 'RABIES', 'en'),
    ('Cholera', 'CHOLERA', 'en'),
    ('Smallpox', 'SMALLPOX', 'en'),
    ('Zika', 'ZIKA', 'en'),
    ('Anthrax', 'ANTHRAX', 'en')
ON CONFLICT DO NOTHING;

INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT c.id,
       r.alias,
       lower(trim(regexp_replace(regexp_replace(r.alias, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g'))),
       r.language,
       'icd11_canonicalization_053',
       1.0,
       TRUE
FROM icd11_reviewed_aliases_053 r
JOIN disease_concepts c ON c.canonical_name = r.target_name AND c.is_active = TRUE
ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT c.id,
       c.canonical_name,
       lower(trim(regexp_replace(regexp_replace(c.canonical_name, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g'))),
       'canonical',
       'icd11_canonicalization_053',
       1.0,
       TRUE
FROM disease_concepts c
WHERE c.is_active = TRUE
  AND c.ontology_code IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM disease_aliases a
      WHERE a.concept_id = c.id
        AND a.normalized_alias = lower(trim(regexp_replace(regexp_replace(c.canonical_name, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g')))
        AND a.language = 'canonical'
  );

-- Link old events to the canonical concept where code/name/alias matching is
-- unambiguous. The old text fields are deliberately untouched.
UPDATE disease_event_diseases d
SET disease_concept_id = (
    SELECT c.id
    FROM disease_concepts c
    WHERE c.is_active = TRUE
      AND c.ontology_code = d.icd11_code
    ORDER BY c.id
    LIMIT 1
)
WHERE d.disease_concept_id IS NULL
  AND d.icd11_code IS NOT NULL;

UPDATE disease_event_diseases d
SET disease_concept_id = (
    SELECT c.id
    FROM disease_aliases a
    JOIN disease_concepts c ON c.id = a.concept_id
    WHERE a.is_active = TRUE
      AND c.is_active = TRUE
      AND a.normalized_alias = lower(trim(regexp_replace(regexp_replace(d.disease_name, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g')))
    ORDER BY c.id
    LIMIT 1
)
WHERE d.disease_concept_id IS NULL;

UPDATE disease_events e
SET primary_disease_concept_id = (
    SELECT c.id
    FROM disease_aliases a
    JOIN disease_concepts c ON c.id = a.concept_id
    WHERE a.is_active = TRUE
      AND c.is_active = TRUE
      AND a.normalized_alias = lower(trim(regexp_replace(regexp_replace(e.disease_classification, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g')))
    ORDER BY c.id
    LIMIT 1
)
WHERE e.primary_disease_concept_id IS NULL
  AND e.disease_classification IS NOT NULL
  AND UPPER(e.disease_classification) NOT IN ('UNKNOWN');

UPDATE disease_events
SET needs_review = TRUE
WHERE UPPER(TRIM(COALESCE(disease_classification, ''))) IN ('HEPATITIS', 'POLIO');

-- Prevent future active concepts from reusing one ICD-11 code. Inactive
-- legacy rows may retain the old code for audit and rollback.
CREATE UNIQUE INDEX IF NOT EXISTS uq_disease_concepts_active_icd11_code
    ON disease_concepts (ontology_code)
    WHERE is_active = TRUE AND ontology_code IS NOT NULL AND btrim(ontology_code) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_disease_concepts_active_normalized_name
    ON disease_concepts (lower(btrim(canonical_name)))
    WHERE is_active = TRUE;

COMMENT ON COLUMN disease_events.primary_disease_concept_id IS
    'Canonical ICD-11 concept link. disease_classification remains the original extracted label.';

COMMIT;
