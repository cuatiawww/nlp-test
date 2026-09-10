-- Align disease display labels with the reviewed ICD-11 naming convention.
--
-- This migration is deliberately label-only:
--   * ontology_code and concept IDs are never changed;
--   * raw article/event labels are never rewritten or deleted;
--   * the previous labels are retained as searchable aliases;
--   * legacy classifier labels are projected to the new display label.
--
-- Some older seed rows have an ontology code that still needs a separate
-- clinical/code review. That review is intentionally out of scope here. The
-- existing code is preserved so this migration cannot relink historical data.
BEGIN;

CREATE TABLE IF NOT EXISTS disease_label_migration_backup_059 (
    id UUID PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    english_name TEXT,
    ontology_system VARCHAR(40),
    ontology_code TEXT,
    is_active BOOLEAN NOT NULL,
    captured_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO disease_label_migration_backup_059
    (id, canonical_name, english_name, ontology_system, ontology_code, is_active)
SELECT id, canonical_name, english_name, ontology_system, ontology_code, is_active
FROM disease_concepts
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS nlp_label_migration_backup_059 (
    id UUID PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    label TEXT NOT NULL,
    is_active BOOLEAN,
    priority INT,
    captured_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO nlp_label_migration_backup_059 (id, category, label, is_active, priority)
SELECT id, category, label, is_active, priority
FROM nlp_labels
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS nlp_keyword_migration_backup_059 (
    id UUID PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    keyword TEXT NOT NULL,
    target_label TEXT NOT NULL,
    is_active BOOLEAN,
    priority INT,
    captured_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO nlp_keyword_migration_backup_059
    (id, category, keyword, target_label, is_active, priority)
SELECT id, category, keyword, target_label, is_active, priority
FROM nlp_keywords
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS disease_label_migration_conflicts_059 (
    ontology_code TEXT NOT NULL,
    concept_id UUID NOT NULL REFERENCES disease_concepts(id) ON DELETE RESTRICT,
    current_name TEXT NOT NULL,
    preferred_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    captured_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ontology_code, concept_id)
);

CREATE TEMP TABLE icd11_display_labels_059 (
    ontology_code TEXT PRIMARY KEY,
    preferred_name TEXT NOT NULL,
    preferred_english_name TEXT NOT NULL
) ON COMMIT DROP;

-- Names are the public ICD-11-style labels used by the directory and NLP
-- output. Existing codes are intentionally kept unchanged in this migration.
INSERT INTO icd11_display_labels_059
    (ontology_code, preferred_name, preferred_english_name)
VALUES
    ('RA01', 'COVID-19', 'COVID-19'),
    ('1A00', 'Cholera', 'Cholera'),
    ('1A07', 'Typhoid fever', 'Typhoid fever'),
    ('1A40.Z&XT5R', 'Acute diarrhea', 'Acute diarrhea'),
    ('1B1Z', 'Tuberculosis', 'Tuberculosis'),
    ('1B20', 'Leprosy', 'Leprosy'),
    ('1B91', 'Leptospirosis', 'Leptospirosis'),
    ('1B93', 'Plague', 'Plague'),
    ('1B97', 'Anthrax', 'Anthrax'),
    ('1C10', 'Tetanus', 'Tetanus'),
    ('1C11', 'Diphtheria', 'Diphtheria'),
    ('1C12', 'Pertussis', 'Pertussis'),
    ('1C13', 'Tetanus', 'Tetanus'),
    ('1C17', 'Diphtheria', 'Diphtheria'),
    ('1C80', 'Japanese encephalitis', 'Japanese encephalitis'),
    ('1C82', 'Rabies', 'Rabies'),
    ('1D00', 'Meningitis', 'Meningitis'),
    ('1D2Z', 'Dengue', 'Dengue'),
    ('1D40', 'Chikungunya', 'Chikungunya'),
    ('1D42', 'Ebola disease', 'Ebola disease'),
    ('1D43', 'Marburg disease', 'Marburg disease'),
    ('1D44', 'Lassa fever', 'Lassa fever'),
    ('1D47', 'Yellow fever', 'Yellow fever'),
    ('1D48', 'Zika virus disease', 'Zika virus disease'),
    ('1D63', 'Nipah virus disease', 'Nipah virus disease'),
    ('1D64', 'Middle East respiratory syndrome', 'Middle East respiratory syndrome'),
    ('1D82', 'Hand, foot and mouth disease', 'Hand, foot and mouth disease'),
    ('1E30', 'Avian influenza', 'Avian influenza'),
    ('1E32', 'Influenza', 'Influenza'),
    ('1E70', 'Smallpox', 'Smallpox'),
    ('1E71', 'Mpox', 'Mpox'),
    ('1F02', 'Rubella', 'Rubella'),
    ('1F03', 'Measles', 'Measles'),
    ('1F4Z', 'Malaria', 'Malaria'),
    ('1F64', 'Schistosomiasis', 'Schistosomiasis'),
    ('1F66', 'Filariasis', 'Filariasis'),
    ('CA40.Z', 'Pneumonia', 'Pneumonia'),
    ('8B20', 'Stroke', 'Stroke')
ON CONFLICT (ontology_code) DO UPDATE SET
    preferred_name = EXCLUDED.preferred_name,
    preferred_english_name = EXCLUDED.preferred_english_name;

-- Preserve every spelling that was visible before the rename. This keeps old
-- event classifications searchable and lets dashboard aggregation resolve
-- them to the new display label through disease_aliases.
INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT b.id,
       b.canonical_name,
       lower(trim(regexp_replace(regexp_replace(b.canonical_name, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g'))),
       'legacy',
       'icd11_label_alignment_059',
       1.0,
       TRUE
FROM disease_label_migration_backup_059 b
WHERE NULLIF(BTRIM(b.canonical_name), '') IS NOT NULL
ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT b.id,
       b.english_name,
       lower(trim(regexp_replace(regexp_replace(b.english_name, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g'))),
       'en',
       'icd11_label_alignment_059',
       1.0,
       TRUE
FROM disease_label_migration_backup_059 b
WHERE NULLIF(BTRIM(b.english_name), '') IS NOT NULL
  AND lower(trim(b.english_name)) <> lower(trim(b.canonical_name))
ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
    is_active = TRUE,
    updated_at = NOW();

-- Rename only when the preferred label is not already owned by another
-- concept. A conflict is recorded instead of forcing a merge or changing IDs.
DO $$
DECLARE
    label_row RECORD;
    concept_row RECORD;
BEGIN
    FOR label_row IN SELECT * FROM icd11_display_labels_059 LOOP
        FOR concept_row IN
            SELECT c.id, c.canonical_name
            FROM disease_concepts c
            WHERE c.ontology_code = label_row.ontology_code
              AND c.is_active = TRUE
            ORDER BY c.id
        LOOP
            IF EXISTS (
                SELECT 1
                FROM disease_concepts existing
                WHERE existing.id <> concept_row.id
                  AND lower(existing.canonical_name) = lower(label_row.preferred_name)
            ) THEN
                INSERT INTO disease_label_migration_conflicts_059
                    (ontology_code, concept_id, current_name, preferred_name, reason)
                VALUES (
                    label_row.ontology_code,
                    concept_row.id,
                    concept_row.canonical_name,
                    label_row.preferred_name,
                    'Preferred display label is already owned by another concept; no merge performed.'
                )
                ON CONFLICT (ontology_code, concept_id) DO NOTHING;
                CONTINUE;
            END IF;

            UPDATE disease_concepts
            SET canonical_name = label_row.preferred_name,
                english_name = label_row.preferred_english_name,
                canonicalization_notes = 'Display label aligned to ICD-11 naming convention in migration 059; ontology code intentionally preserved.',
                canonicalization_reviewed_at = NOW(),
                updated_at = NOW()
            WHERE id = concept_row.id;
        END LOOP;
    END LOOP;
END $$;

-- Canonical labels are the only active disease labels exposed to new NLP
-- configuration. Old rows remain available as inactive audit records.
INSERT INTO nlp_labels (category, label, is_active, priority)
SELECT 'disease', c.canonical_name, TRUE,
       ROW_NUMBER() OVER (ORDER BY c.canonical_name)::INT
FROM disease_concepts c
WHERE c.is_active = TRUE
  AND c.ontology_system = 'WHO ICD-11 MMS'
  AND NULLIF(BTRIM(c.canonical_name), '') IS NOT NULL
ON CONFLICT (category, label) DO UPDATE SET
    is_active = TRUE,
    priority = EXCLUDED.priority,
    updated_at = NOW();

UPDATE nlp_labels l
SET is_active = FALSE,
    updated_at = NOW()
WHERE l.category = 'disease'
  AND l.label <> 'NEGATIVE - not health related'
  AND NOT EXISTS (
      SELECT 1
      FROM disease_concepts c
      WHERE c.is_active = TRUE
        AND c.ontology_system = 'WHO ICD-11 MMS'
        AND c.canonical_name = l.label
  );

CREATE TEMP TABLE legacy_disease_targets_059 (
    legacy_label TEXT PRIMARY KEY,
    preferred_name TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO legacy_disease_targets_059 (legacy_label, preferred_name) VALUES
    ('DBD', 'Dengue'),
    ('DIARE_AKUT', 'Acute diarrhea'),
    ('LEPTOSPIROSIS', 'Leptospirosis'),
    ('INFLUENZA', 'Influenza'),
    ('COVID19', 'COVID-19'),
    ('MALARIA', 'Malaria'),
    ('TUBERCULOSIS', 'Tuberculosis'),
    ('CHIKUNGUNYA', 'Chikungunya'),
    ('PNEUMONIA', 'Pneumonia'),
    ('TYPHOID', 'Typhoid fever'),
    ('MEASLES', 'Measles'),
    ('HANTAVIRUS', 'Hantavirus infection'),
    ('MERS', 'Middle East respiratory syndrome'),
    ('CHOLERA', 'Cholera'),
    ('POLIO', 'Poliomyelitis'),
    ('RABIES', 'Rabies'),
    ('HEPATITIS', 'Hepatitis'),
    ('ANTHRAX', 'Anthrax'),
    ('SMALLPOX', 'Smallpox'),
    ('ZIKA', 'Zika virus disease'),
    ('PERTUSSIS', 'Pertussis'),
    ('AVIAN_INFLUENZA', 'Avian influenza'),
    ('FILARIASIS', 'Filariasis'),
    ('SCHISTOSOMIASIS', 'Schistosomiasis'),
    ('NIPAH', 'Nipah virus disease'),
    ('EBOLA', 'Ebola disease'),
    ('MARBURG', 'Marburg disease'),
    ('YELLOW_FEVER', 'Yellow fever'),
    ('MENINGITIS', 'Meningitis'),
    ('RUBELLA', 'Rubella'),
    ('HFMD', 'Hand, foot and mouth disease'),
    ('HAND_FOOT_MOUTH_DISEASE', 'Hand, foot and mouth disease'),
    ('LASSA_FEVER', 'Lassa fever'),
    ('JAPANESE_ENCEPHALITIS', 'Japanese encephalitis'),
    ('DIPHTHERIA', 'Diphtheria'),
    ('TETANUS', 'Tetanus'),
    ('PLAGUE', 'Plague'),
    ('MPOX', 'Mpox'),
    ('LEPROSY', 'Leprosy')
ON CONFLICT (legacy_label) DO UPDATE SET
    preferred_name = EXCLUDED.preferred_name;

-- Keyword targets are classifier projections, so update only their label
-- value. Keyword text, priorities, IDs, and historical article data remain.
UPDATE nlp_keywords k
SET target_label = t.preferred_name,
    updated_at = NOW()
FROM legacy_disease_targets_059 t
WHERE k.category = 'disease'
  AND k.target_label = t.legacy_label
  AND EXISTS (
      SELECT 1
      FROM disease_concepts c
      WHERE c.is_active = TRUE
        AND c.canonical_name = t.preferred_name
  );

-- Keep outbreak rule keys stable for backend matching; only the human-facing
-- label is standardized.
UPDATE disease_outbreak_rules r
SET display_label = t.preferred_name,
    updated_at = NOW()
FROM legacy_disease_targets_059 t
WHERE upper(trim(r.disease_name)) = t.legacy_label;

COMMIT;
