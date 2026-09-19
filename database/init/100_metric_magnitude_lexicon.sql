-- Numeric magnitude vocabulary belongs to the same reviewed lexicon as
-- metric labels. The parser uses canonical_value as the multiplier.
INSERT INTO language_markers
    (word, language, marker_type, canonical_value, script, priority, source)
VALUES
    ('ribu', 'id', 'metric_magnitude', '1000', 'Latin', 10, 'legacy_migrated'),
    ('juta', 'id', 'metric_magnitude', '1000000', 'Latin', 10, 'legacy_migrated'),
    ('miliar', 'id', 'metric_magnitude', '1000000000', 'Latin', 10, 'legacy_migrated'),
    ('milyar', 'id', 'metric_magnitude', '1000000000', 'Latin', 10, 'legacy_migrated'),
    ('ribu', 'ms', 'metric_magnitude', '1000', 'Latin', 10, 'legacy_migrated'),
    ('juta', 'ms', 'metric_magnitude', '1000000', 'Latin', 10, 'legacy_migrated'),
    ('thousand', 'en', 'metric_magnitude', '1000', 'Latin', 10, 'legacy_migrated'),
    ('million', 'en', 'metric_magnitude', '1000000', 'Latin', 10, 'legacy_migrated'),
    ('billion', 'en', 'metric_magnitude', '1000000000', 'Latin', 10, 'legacy_migrated'),
    ('nghìn', 'vi', 'metric_magnitude', '1000', 'Latin', 10, 'legacy_migrated'),
    ('ngàn', 'vi', 'metric_magnitude', '1000', 'Latin', 10, 'legacy_migrated'),
    ('triệu', 'vi', 'metric_magnitude', '1000000', 'Latin', 10, 'legacy_migrated'),
    ('tỷ', 'vi', 'metric_magnitude', '1000000000', 'Latin', 10, 'legacy_migrated'),
    ('พัน', 'th', 'metric_magnitude', '1000', 'Thai', 10, 'legacy_migrated'),
    ('ล้าน', 'th', 'metric_magnitude', '1000000', 'Thai', 10, 'legacy_migrated'),
    ('ពាន់', 'km', 'metric_magnitude', '1000', 'Khmer', 10, 'legacy_migrated'),
    ('លាន', 'km', 'metric_magnitude', '1000000', 'Khmer', 10, 'legacy_migrated'),
    ('သိန်း', 'my', 'metric_magnitude', '100000', 'Myanmar', 10, 'legacy_migrated'),
    ('သန်း', 'my', 'metric_magnitude', '1000000', 'Myanmar', 10, 'legacy_migrated'),
    ('လက်ခ', 'my', 'metric_magnitude', '100000', 'Myanmar', 20, 'legacy_migrated'),
    ('lakh', 'en', 'metric_magnitude', '100000', 'Latin', 20, 'legacy_migrated'),
    ('crore', 'en', 'metric_magnitude', '10000000', 'Latin', 20, 'legacy_migrated'),
    ('b', 'en', 'metric_magnitude', '1000000000', 'Latin', 30, 'legacy_migrated'),
    ('m', 'en', 'metric_magnitude', '1000000', 'Latin', 30, 'legacy_migrated'),
    ('k', 'en', 'metric_magnitude', '1000', 'Latin', 30, 'legacy_migrated'),
    ('mld', 'id', 'metric_magnitude', '1000000000', 'Latin', 30, 'legacy_migrated')
ON CONFLICT (word, language, marker_type) DO UPDATE SET
    canonical_value = EXCLUDED.canonical_value,
    is_active = TRUE,
    updated_at = NOW();
