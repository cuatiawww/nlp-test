-- Common-language tokens must not win against a gazetteer locality.
-- Keep these reviewed terms in the same lexicon master used by NLP so the
-- location linker can be updated without another code release.
INSERT INTO language_markers
    (word, language, marker_type, canonical_value, script, priority, source)
VALUES
    ('negara', 'ms', 'location_stopword', 'non_geographic', 'Latin', 10, 'slice6_reviewed'),
    ('negara', 'id', 'location_stopword', 'non_geographic', 'Latin', 10, 'slice6_reviewed')
ON CONFLICT (word, language, marker_type) DO UPDATE SET
    canonical_value = EXCLUDED.canonical_value,
    is_active = TRUE,
    updated_at = NOW();
