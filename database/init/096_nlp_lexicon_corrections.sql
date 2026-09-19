-- Corrected aliases discovered during regression validation.
-- Keep metric vocabulary in the shared language_markers registry.
INSERT INTO language_markers
    (word, language, marker_type, canonical_value, script, priority, source)
VALUES
    ('ผู้เสียชีวิต', 'th', 'metric_death', 'deaths', 'Thai', 10, 'reviewed_regression')
ON CONFLICT (word, language, marker_type) DO UPDATE
SET canonical_value = EXCLUDED.canonical_value,
    script = EXCLUDED.script,
    priority = EXCLUDED.priority,
    is_active = TRUE,
    source = EXCLUDED.source,
    updated_at = NOW();
