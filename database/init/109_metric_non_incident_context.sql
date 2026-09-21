-- Context terms whose counts are not disease incidence totals.
-- Keep these in the shared language_markers registry so new phrases can be
-- reviewed and extended without changing extraction code.
INSERT INTO language_markers
    (word, language, marker_type, canonical_value, script, priority, source)
VALUES
    ('animal bite', 'en', 'metric_non_incident', 'non_incident', 'Latin', 20, 'reviewed_context'),
    ('animal bites', 'en', 'metric_non_incident', 'non_incident', 'Latin', 20, 'reviewed_context'),
    ('dog bite', 'en', 'metric_non_incident', 'non_incident', 'Latin', 20, 'reviewed_context'),
    ('dog bites', 'en', 'metric_non_incident', 'non_incident', 'Latin', 20, 'reviewed_context'),
    ('gigitan hewan', 'id', 'metric_non_incident', 'non_incident', 'Latin', 20, 'reviewed_context'),
    ('gigitan binatang', 'id', 'metric_non_incident', 'non_incident', 'Latin', 20, 'reviewed_context'),
    ('gigitan haiwan', 'ms', 'metric_non_incident', 'non_incident', 'Latin', 20, 'reviewed_context'),
    ('vết cắn động vật', 'vi', 'metric_non_incident', 'non_incident', 'Latin', 20, 'reviewed_context'),
    ('ถูกสัตว์กัด', 'th', 'metric_non_incident', 'non_incident', 'Thai', 20, 'reviewed_context'),
    ('ខាំសត្វ', 'km', 'metric_non_incident', 'non_incident', 'Khmer', 20, 'reviewed_context'),
    ('ສັດກັດ', 'lo', 'metric_non_incident', 'non_incident', 'Lao', 20, 'reviewed_context'),
    ('တိရစ္ဆာန်ကိုက်', 'my', 'metric_non_incident', 'non_incident', 'Myanmar', 20, 'reviewed_context'),
    ('kagat ng hayop', 'tl', 'metric_non_incident', 'non_incident', 'Latin', 20, 'reviewed_context')
ON CONFLICT (word, language, marker_type) DO UPDATE SET
    canonical_value = EXCLUDED.canonical_value,
    is_active = TRUE,
    updated_at = NOW();
