-- Keep non-case surveillance nouns in the shared lexicon.  These terms may
-- be quantified, but the quantity is not a patient/case metric by itself.
INSERT INTO language_markers
    (word, language, marker_type, canonical_value, script, priority, source)
VALUES
    ('outbreak', 'en', 'metric_non_case', 'non_case', 'Latin', 10, 'reviewed_context'),
    ('outbreaks', 'en', 'metric_non_case', 'non_case', 'Latin', 10, 'reviewed_context'),
    ('cluster', 'en', 'metric_non_case', 'non_case', 'Latin', 20, 'reviewed_context'),
    ('clusters', 'en', 'metric_non_case', 'non_case', 'Latin', 20, 'reviewed_context'),
    ('kesihatan', 'ms', 'language_marker', 'language', 'Latin', 20, 'reviewed_context'),
    ('menular', 'ms', 'language_marker', 'language', 'Latin', 20, 'reviewed_context'),
    ('wabah', 'id', 'metric_non_case', 'non_case', 'Latin', 10, 'reviewed_context'),
    ('klaster', 'id', 'metric_non_case', 'non_case', 'Latin', 20, 'reviewed_context'),
    ('klasters', 'id', 'metric_non_case', 'non_case', 'Latin', 20, 'reviewed_context'),
    ('bùng phát', 'vi', 'metric_non_case', 'non_case', 'Latin', 10, 'reviewed_context'),
    ('cụm', 'vi', 'metric_non_case', 'non_case', 'Latin', 20, 'reviewed_context'),
    ('การระบาด', 'th', 'metric_non_case', 'non_case', 'Thai', 10, 'reviewed_context'),
    ('ក្រុម', 'km', 'metric_non_case', 'non_case', 'Khmer', 10, 'reviewed_context'),
    ('ກຸ່ມ', 'lo', 'metric_non_case', 'non_case', 'Lao', 10, 'reviewed_context'),
    ('ပျံ့နှံ့', 'my', 'metric_non_case', 'non_case', 'Myanmar', 10, 'reviewed_context')
ON CONFLICT (word, language, marker_type) DO UPDATE SET
    canonical_value = EXCLUDED.canonical_value,
    is_active = TRUE,
    updated_at = NOW();
