-- Slice 6: reviewed multilingual vocabulary.
-- PostgreSQL Unicode escapes keep native-script data intact even when this
-- migration is transported through a non-Unicode terminal.

INSERT INTO language_markers
    (word, language, marker_type, canonical_value, script, priority, source)
VALUES
    ('kes', 'ms', 'language_marker', 'ms', 'Latin', 30, 'slice6_reviewed'),
    ('kesihatan', 'ms', 'language_marker', 'ms', 'Latin', 30, 'slice6_reviewed'),
    ('pesakit', 'ms', 'language_marker', 'ms', 'Latin', 30, 'slice6_reviewed'),
    ('wabak', 'ms', 'language_marker', 'ms', 'Latin', 30, 'slice6_reviewed'),
    ('jangkitan', 'ms', 'language_marker', 'ms', 'Latin', 30, 'slice6_reviewed'),
    ('demam denggi', 'ms', 'language_marker', 'ms', 'Latin', 40, 'slice6_reviewed'),
    ('kkm', 'ms', 'language_marker', 'ms', 'Latin', 40, 'slice6_reviewed'),
    (U&'\0E81\0ECD\0EA5\0EB0\0E99\0EB5', 'lo', 'language_marker', 'lo', 'Lao', 30, 'slice6_reviewed'),
    (U&'\0E84\0EBB\0E99\0EC0\0E88\0EB1\0E9A', 'lo', 'language_marker', 'lo', 'Lao', 30, 'slice6_reviewed'),
    (U&'\0EC0\0EAA\0E8D\0E8A\0EB5\0EA7\0EB4\0E94', 'lo', 'language_marker', 'lo', 'Lao', 30, 'slice6_reviewed'),
    (U&'\0E81\0EB0\0E8A\0EA7\0E87\0EAA\0EB2\0E97\0EB2\0EA5\0EB0\0E99\0EB0\0EAA\0EB8\0E81', 'lo', 'language_marker', 'lo', 'Lao', 40, 'slice6_reviewed'),
    (U&'\0E44\0E02\0E49\0E40\0E25\0E37\0E2D\0E14\0E2D\0E2D\0E01', 'th', 'language_marker', 'th', 'Thai', 40, 'slice6_reviewed'),
    (U&'\101E\103D\1031\1038\101C\103D\1014\103A\1010\102F\1015\103A\1000\103D\1031\1038', 'my', 'language_marker', 'my', 'Myanmar', 40, 'slice6_reviewed'),
    (U&'\1782\17D2\179A\17BB\1793\1788\17B6\1798', 'km', 'language_marker', 'km', 'Khmer', 40, 'slice6_reviewed'),
    ('kematian', 'ms', 'metric_death', 'deaths', 'Latin', 30, 'slice6_reviewed'),
    ('maut', 'ms', 'metric_death', 'deaths', 'Latin', 30, 'slice6_reviewed'),
    ('angka korban', 'ms', 'metric_death', 'deaths', 'Latin', 30, 'slice6_reviewed'),
    ('meragut nyawa', 'ms', 'metric_death', 'deaths', 'Latin', 30, 'slice6_reviewed'),
    ('kes', 'ms', 'metric_case', 'cases', 'Latin', 30, 'slice6_reviewed'),
    (U&'\0E1C\0E39\0E49\0E40\0EAA\0E35\0E22\0E8A\0E35\0E27\0E34\0E15', 'th', 'metric_death', 'deaths', 'Thai', 20, 'slice6_reviewed'),
    (U&'\0EC0\0EAA\0E35\0E22\0E8A\0E35\0E27\0E34\0E15', 'th', 'metric_death', 'deaths', 'Thai', 20, 'slice6_reviewed'),
    (U&'\179F\17D2\179B\17B6\1794', 'km', 'metric_death', 'deaths', 'Khmer', 20, 'slice6_reviewed'),
    ('kamatayan', 'tl', 'metric_death', 'deaths', 'Latin', 20, 'slice6_reviewed')
ON CONFLICT (word, language, marker_type) DO UPDATE
SET canonical_value = EXCLUDED.canonical_value,
    script = EXCLUDED.script,
    priority = EXCLUDED.priority,
    source = EXCLUDED.source,
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active, updated_at)
VALUES
    ('disease', 'demam denggi', 'Dengue', 360, TRUE, NOW()),
    ('disease', 'denggi', 'Dengue', 360, TRUE, NOW()),
    ('disease', 'demam campak', 'Measles', 360, TRUE, NOW()),
    ('disease', 'taun', 'Cholera', 360, TRUE, NOW()),
    ('disease', 'penyakit taun', 'Cholera', 360, TRUE, NOW()),
    ('disease', 'anjing gila', 'Rabies', 360, TRUE, NOW()),
    ('disease', 'tibi', 'Tuberculosis', 360, TRUE, NOW()),
    ('disease', 'penyakit tibi', 'Tuberculosis', 360, TRUE, NOW()),
    ('disease', 'kencing tikus', 'Leptospirosis', 360, TRUE, NOW()),
    ('disease', 'penyakit kencing tikus', 'Leptospirosis', 360, TRUE, NOW()),
    ('disease', 'penyakit tangan, kaki dan mulut', 'HFMD', 360, TRUE, NOW()),
    ('disease', U&'\101E\103D\1031\1038\101C\103D\1014\103A\1010\102F\1015\103A\1000\103D\1031\1038', 'Dengue', 360, TRUE, NOW()),
    ('disease', U&'\101D\1000\103A\101E\1000\103A', 'Measles', 360, TRUE, NOW()),
    ('disease', U&'\1000\1019\101C\101D\1019\1038\101B\1031\102C\1002\102B', 'Cholera', 360, TRUE, NOW()),
    ('disease', U&'\1001\103D\1031\1038\101B\1030\1038\101B\1031\102C\1002\102B', 'Rabies', 360, TRUE, NOW()),
    ('disease', U&'\1004\103E\1000\103A\1016\103B\102C\1038', 'Malaria', 360, TRUE, NOW()),
    ('disease', U&'\1010\102E\1018\102E', 'Tuberculosis', 360, TRUE, NOW()),
    ('disease', U&'\1782\17D2\179A\17BB\1793\1788\17B6\1798', 'Dengue', 360, TRUE, NOW()),
    ('disease', U&'\1780\1789\17D2\1787\17D2\179A\17B9\179B', 'Measles', 360, TRUE, NOW()),
    ('disease', U&'\17A2\17B6\179F\1793\17D2\1793\179A\17C4\1782', 'Cholera', 360, TRUE, NOW()),
    ('disease', U&'\1787\17C6\1784\17BA\1786\17D2\1780\17C2\1786\17D2\1780\17BD\178F', 'Rabies', 360, TRUE, NOW()),
    ('disease', U&'\1782\17D2\179A\17BB\1793\1785\17B6\1789\17CB', 'Malaria', 360, TRUE, NOW()),
    ('disease', U&'\179A\1794\17C1\1784', 'Tuberculosis', 360, TRUE, NOW()),
    ('disease', U&'\0EC4\0E82\0EC9\0E8D\0EB8\0E87\0EA5\0EB2\0E8D', 'Dengue', 360, TRUE, NOW()),
    ('disease', U&'\0EC4\0E82\0EC9\0E40\0EA5\0EB7\0EAD\0E94\0EAD\0EAD\0E81', 'Dengue', 360, TRUE, NOW()),
    ('disease', U&'\0EDD\0EB2\0E81\0EC1\0E94\0E87', 'Measles', 360, TRUE, NOW()),
    ('disease', U&'\0EAD\0EB0\0EAB\0EB4\0EA7\0EB2', 'Cholera', 360, TRUE, NOW()),
    ('disease', U&'\0E9E\0EB0\0E8D\0EB2\0E94\0EA7\0ECD\0EC9', 'Rabies', 360, TRUE, NOW()),
    ('disease', U&'\0EA7\0EB1\0E99\0E99\0EB0\0EC2\0EA5\0E81', 'Tuberculosis', 360, TRUE, NOW()),
    ('disease', U&'\0E42\0E23\0E81\0EA1\0EB7\0E95\0EB5\0E99\0E9B\0EB2\0E81', 'HFMD', 360, TRUE, NOW())
ON CONFLICT (category, keyword) DO UPDATE
SET target_label = EXCLUDED.target_label,
    priority = LEAST(nlp_keywords.priority, EXCLUDED.priority),
    is_active = TRUE,
    updated_at = NOW();
