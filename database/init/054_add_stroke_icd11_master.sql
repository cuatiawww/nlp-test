-- Add the reviewed stroke master concept used by URL/news surveillance.
-- This is additive and idempotent; no historical disease/event row is deleted.
BEGIN;

INSERT INTO disease_concepts (
    canonical_name, english_name, ontology_system, ontology_code,
    ontology_uri, ontology_release, source, confidence, is_active,
    canonicalization_status, canonicalization_notes, canonicalization_reviewed_at
)
VALUES (
    'Stroke',
    'Stroke not known if ischaemic or haemorrhagic',
    'WHO ICD-11 MMS',
    '8B20',
    'https://id.who.int/icd/release/11/2026-01/mms/8B20',
    '11/2026-01/mms',
    'icd11_reviewed_master',
    1.0,
    TRUE,
    'validated',
    'Reviewed master concept for stroke / cerebrovascular accident when subtype is not specified.',
    NOW()
)
ON CONFLICT (canonical_name) DO UPDATE SET
    english_name = EXCLUDED.english_name,
    ontology_system = EXCLUDED.ontology_system,
    ontology_code = EXCLUDED.ontology_code,
    ontology_uri = EXCLUDED.ontology_uri,
    ontology_release = EXCLUDED.ontology_release,
    source = EXCLUDED.source,
    confidence = GREATEST(disease_concepts.confidence, EXCLUDED.confidence),
    is_active = TRUE,
    canonicalization_status = 'validated',
    canonicalization_notes = EXCLUDED.canonicalization_notes,
    canonicalization_reviewed_at = NOW(),
    updated_at = NOW();

WITH concept AS (
    SELECT id FROM disease_concepts WHERE canonical_name = 'Stroke' AND is_active = TRUE LIMIT 1
), aliases(alias, normalized_alias, language) AS (
    VALUES
        ('stroke', 'stroke', 'en'),
        ('cerebrovascular accident', 'cerebrovascular accident', 'en'),
        ('cerebrovascular disease', 'cerebrovascular disease', 'en'),
        ('penyakit stroke', 'penyakit stroke', 'id'),
        ('penyakit serebrovaskular', 'penyakit serebrovaskular', 'id'),
        ('đột quỵ', 'đột quỵ', 'vi'),
        ('dot quy', 'dot quy', 'vi'),
        ('đột quị', 'đột quị', 'vi')
)
INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT concept.id, aliases.alias, aliases.normalized_alias, aliases.language,
       'icd11_reviewed_master', 1.0, TRUE
FROM concept CROSS JOIN aliases
ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
    alias = EXCLUDED.alias,
    source = EXCLUDED.source,
    confidence = EXCLUDED.confidence,
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO nlp_keywords (category, keyword, target_label, is_active, priority)
VALUES
    ('disease', 'stroke', 'Stroke', TRUE, 5),
    ('disease', 'cerebrovascular accident', 'Stroke', TRUE, 5),
    ('disease', 'cerebrovascular disease', 'Stroke', TRUE, 5),
    ('disease', 'penyakit stroke', 'Stroke', TRUE, 5),
    ('disease', 'penyakit serebrovaskular', 'Stroke', TRUE, 5),
    ('disease', 'đột quỵ', 'Stroke', TRUE, 5),
    ('disease', 'dot quy', 'Stroke', TRUE, 5),
    ('disease', 'đột quị', 'Stroke', TRUE, 5)
ON CONFLICT (category, keyword) DO UPDATE SET
    target_label = EXCLUDED.target_label,
    is_active = TRUE,
    priority = EXCLUDED.priority,
    updated_at = NOW();

COMMIT;
