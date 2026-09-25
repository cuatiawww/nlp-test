-- 127: close the ASEAN non-Latin location gaps used by surveillance extraction.
-- Idempotent: safe to replay on an existing database.

INSERT INTO locations (
    id, name, latitude, longitude, country, is_active, country_iso3,
    admin1_name, admin_level
)
SELECT gen_random_uuid(), 'Dong Thap', 10.4938, 105.6882, 'Vietnam', true, 'VNM',
       'Dong Thap', 1
WHERE NOT EXISTS (
    SELECT 1 FROM locations
    WHERE lower(name) = 'dong thap' AND lower(country) = 'vietnam'
);

DO $$
DECLARE
    v_dong_thap uuid;
    v_da_nang uuid;
BEGIN
    SELECT id INTO v_dong_thap
    FROM locations
    WHERE lower(name) = 'dong thap' AND lower(country) = 'vietnam'
    LIMIT 1;

    IF v_dong_thap IS NOT NULL THEN
        INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
        VALUES
            (v_dong_thap, 'Đồng Tháp', 'vi', true),
            (v_dong_thap, 'Dong Thap', 'en', true)
        ON CONFLICT (location_id, alias_name, language)
        DO UPDATE SET is_preferred = EXCLUDED.is_preferred;
    END IF;

    SELECT id INTO v_da_nang
    FROM locations
    WHERE lower(name) = 'da nang' AND lower(country) = 'vietnam'
    LIMIT 1;

    IF v_da_nang IS NOT NULL THEN
        INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
        VALUES (v_da_nang, 'ดานัง', 'th', true)
        ON CONFLICT (location_id, alias_name, language)
        DO UPDATE SET is_preferred = EXCLUDED.is_preferred;
    END IF;
END $$;
