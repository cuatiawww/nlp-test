-- Migration 123: Seed missing curated localities into locations and location_aliases
-- Prevents hardcoding in config.py and ensures DB is the single source of truth.

DO $$
DECLARE
    loc_gunung uuid := gen_random_uuid();
    loc_gunung2 uuid := gen_random_uuid();
    loc_tuy uuid := gen_random_uuid();
    loc_tuy2 uuid := gen_random_uuid();
BEGIN
    INSERT INTO locations (id, name, country, admin_level, latitude, longitude, admin1_name, admin2_name, country_iso3, is_active)
    VALUES 
        (loc_gunung, 'Gunungkidul', 'Indonesia', 2, -7.9700, 110.6000, 'Daerah Istimewa Yogyakarta', 'Gunungkidul', 'IDN', true),
        (loc_gunung2, 'Gunung Kidul', 'Indonesia', 2, -7.9700, 110.6000, 'Daerah Istimewa Yogyakarta', 'Gunungkidul', 'IDN', true),
        (loc_tuy, 'Tuy Đức', 'Vietnam', 2, 12.1800, 107.5000, 'Đắk Nông', 'Tuy Đức', 'VNM', true),
        (loc_tuy2, 'Tuy Duc', 'Vietnam', 2, 12.1800, 107.5000, 'Đắk Nông', 'Tuy Đức', 'VNM', true)
    ON CONFLICT (name, country) DO UPDATE 
    SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, admin_level = EXCLUDED.admin_level;

    -- Add aliases
    INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
    SELECT l.id, a.alias, a.lang, true
    FROM locations l
    CROSS JOIN (VALUES 
        ('gunungkidul', 'id'), 
        ('gunung kidul', 'id'), 
        ('kabupaten gunungkidul', 'id')
    ) AS a(alias, lang)
    WHERE l.name = 'Gunungkidul' AND l.country = 'Indonesia'
    ON CONFLICT DO NOTHING;

    INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
    SELECT l.id, a.alias, a.lang, true
    FROM locations l
    CROSS JOIN (VALUES 
        ('tuy đức', 'vi'), 
        ('tuy duc', 'vi'), 
        ('huyện tuy đức', 'vi')
    ) AS a(alias, lang)
    WHERE l.name = 'Tuy Đức' AND l.country = 'Vietnam'
    ON CONFLICT DO NOTHING;
END $$;
