-- Normalize unsafe and legacy disease master labels without deleting audit data.
-- Generic terms such as "Viral" are classification categories, not diseases.
BEGIN;

-- Keep legacy spellings searchable, but expose one reviewed display name.
INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT c.id,
       c.canonical_name,
       lower(trim(regexp_replace(regexp_replace(c.canonical_name, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g'))),
       'legacy',
       'disease_master_cleanup_057',
       1.0,
       TRUE
FROM disease_concepts c
WHERE c.is_active = TRUE
  AND (c.ontology_code = '1D64' OR lower(trim(c.canonical_name)) = 'coronavirus mers')
ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
    is_active = TRUE,
    updated_at = NOW();

UPDATE disease_concepts
SET canonical_name = 'Middle East Respiratory Syndrome (MERS)',
    english_name = 'Middle East Respiratory Syndrome (MERS)',
    canonicalization_status = 'validated',
    canonicalization_notes = 'Reviewed display name for WHO ICD-11 code 1D64.',
    canonicalization_reviewed_at = NOW(),
    updated_at = NOW()
WHERE is_active = TRUE
  AND (ontology_code = '1D64' OR lower(trim(canonical_name)) = 'coronavirus mers');

-- Do not let broad taxonomy terms appear as active disease concepts.
UPDATE disease_concepts
SET is_active = FALSE,
    canonicalization_status = 'needs_review',
    canonicalization_notes = 'Generic taxonomy term; not a specific disease concept.',
    canonicalization_reviewed_at = NOW(),
    updated_at = NOW()
WHERE is_active = TRUE
  AND lower(trim(canonical_name)) IN (
      'viral', 'virus', 'bacterial', 'bacteria', 'infection',
      'infectious disease', 'penyakit menular', 'viral viral', 'virus virus'
  );

UPDATE disease_aliases a
SET is_active = FALSE,
    updated_at = NOW()
FROM disease_concepts c
WHERE a.concept_id = c.id
  AND c.is_active = FALSE
  AND lower(trim(c.canonical_name)) IN (
      'viral', 'virus', 'bacterial', 'bacteria', 'infection',
      'infectious disease', 'penyakit menular', 'viral viral', 'virus virus'
  );

-- Keep the classifier operational, but make its persisted labels agree with
-- the reviewed disease master. Existing rows are retained as inactive legacy
-- labels for auditability and old model checkpoints.
INSERT INTO nlp_labels (category, label, is_active, priority)
SELECT 'disease', c.canonical_name, TRUE,
       ROW_NUMBER() OVER (ORDER BY c.canonical_name)::int
FROM disease_concepts c
WHERE c.is_active = TRUE
  AND c.ontology_system = 'WHO ICD-11 MMS'
  AND NULLIF(BTRIM(c.canonical_name), '') IS NOT NULL
ON CONFLICT (category, label) DO UPDATE SET
    is_active = TRUE,
    priority = EXCLUDED.priority,
    updated_at = NOW();

UPDATE nlp_labels
SET is_active = FALSE,
    updated_at = NOW()
WHERE category = 'disease'
  AND label <> 'NEGATIVE - not health related'
  AND NOT EXISTS (
      SELECT 1 FROM disease_concepts c
      WHERE c.is_active = TRUE
        AND c.ontology_system = 'WHO ICD-11 MMS'
        AND c.canonical_name = nlp_labels.label
  );

INSERT INTO nlp_keywords (category, keyword, target_label, is_active, priority)
VALUES
    ('disease', 'covid', 'COVID-19', TRUE, 8),
    ('disease', 'covid-19', 'COVID-19', TRUE, 8),
    ('disease', 'corona', 'COVID-19', TRUE, 9),
    ('disease', 'mers', 'Middle East Respiratory Syndrome (MERS)', TRUE, 10),
    ('disease', 'coronavirus mers', 'Middle East Respiratory Syndrome (MERS)', TRUE, 10),
    ('disease', 'influenza', 'Influenza, virus not identified', TRUE, 11),
    ('disease', 'flu', 'Influenza, virus not identified', TRUE, 11),
    ('disease', 'campak', 'Measles', TRUE, 12),
    ('disease', 'measles', 'Measles', TRUE, 12),
    ('disease', 'dengue', 'Dengue', TRUE, 13),
    ('disease', 'demam berdarah', 'Dengue', TRUE, 13),
    ('disease', 'dbd', 'Dengue', TRUE, 13)
ON CONFLICT (category, keyword) DO UPDATE SET
    target_label = EXCLUDED.target_label,
    is_active = TRUE,
    priority = EXCLUDED.priority,
    updated_at = NOW();

-- Canonical name aliases make old event classifications resolve to the
-- reviewed display name in dashboard aggregation.
INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT c.id, v.alias,
       lower(trim(regexp_replace(regexp_replace(v.alias, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g'))),
       'en', 'disease_master_cleanup_057', 1.0, TRUE
FROM disease_concepts c
CROSS JOIN (VALUES
    ('MERS'),
    ('MERS-CoV'),
    ('coronavirus MERS'),
    ('Middle East Respiratory Syndrome'),
    ('Middle East Respiratory Syndrome (MERS)')
) AS v(alias)
WHERE c.is_active = TRUE AND c.ontology_code = '1D64'
ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
    is_active = TRUE,
    updated_at = NOW();

-- Keyword targets are also projections of the ICD-11 master. This prevents a
-- keyword such as "mers" from reintroducing a legacy label into new rows.
UPDATE nlp_keywords k
SET target_label = c.canonical_name,
    updated_at = NOW()
FROM disease_aliases a
JOIN disease_concepts c ON c.id = a.concept_id
WHERE k.category = 'disease'
  AND a.is_active = TRUE
  AND c.is_active = TRUE
  AND c.ontology_system = 'WHO ICD-11 MMS'
  AND a.normalized_alias = lower(trim(regexp_replace(regexp_replace(k.keyword, '[^[:alnum:]_ -]', ' ', 'g'), '\\s+', ' ', 'g')));

COMMIT;
