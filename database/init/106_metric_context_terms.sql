-- Context nouns used by typed whole-article extraction are metric evidence,
-- not disease-specific aliases.
INSERT INTO language_markers
    (word, language, marker_type, canonical_value, script, priority, source)
VALUES
    ('warga', 'id', 'metric_case', 'cases', 'Latin', 30, 'legacy_migrated'),
    ('residents', 'en', 'metric_case', 'cases', 'Latin', 30, 'legacy_migrated'),
    ('people', 'en', 'metric_case', 'cases', 'Latin', 30, 'legacy_migrated'),
    ('persons', 'en', 'metric_case', 'cases', 'Latin', 30, 'legacy_migrated')
ON CONFLICT (word, language, marker_type) DO UPDATE SET
    canonical_value = EXCLUDED.canonical_value,
    is_active = TRUE,
    updated_at = NOW();
