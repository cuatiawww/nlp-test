-- Prose terms that collide with locality names belong in the shared
-- lexicon, not in the extractor implementation.
INSERT INTO language_markers
    (word, language, marker_type, canonical_value, script, priority, source)
VALUES
    ('rate', 'en', 'location_stopword', 'non_geographic', 'Latin', 10, 'slice7_reviewed')
ON CONFLICT (word, language, marker_type) DO UPDATE SET
    canonical_value = EXCLUDED.canonical_value,
    is_active = TRUE,
    updated_at = NOW();
