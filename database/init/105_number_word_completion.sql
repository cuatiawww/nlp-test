INSERT INTO language_markers
    (word, language, marker_type, canonical_value, script, priority, source)
VALUES
    ('dua puluh satu','id','number_word','21','Latin',20,'legacy_migrated'),
    ('dua puluh dua','id','number_word','22','Latin',20,'legacy_migrated'),
    ('dua puluh tiga','id','number_word','23','Latin',20,'legacy_migrated'),
    ('dua puluh empat','id','number_word','24','Latin',20,'legacy_migrated'),
    ('dua puluh lima','id','number_word','25','Latin',20,'legacy_migrated')
ON CONFLICT (word, language, marker_type) DO UPDATE SET
    canonical_value = EXCLUDED.canonical_value,
    is_active = TRUE,
    updated_at = NOW();
