-- Jakarta Barat and its eight kecamatan. Namesakes exist abroad or in
-- other kabupaten (Kembangan/Singapore, Tamansari/Jember); (name, country)
-- lets the Indonesian rows sit beside them.

INSERT INTO locations (
    name, country, admin_level, latitude, longitude,
    admin1_name, admin2_name, country_iso3, is_active
)
VALUES
    ('Jakarta Barat', 'Indonesia', 2, -6.1683, 106.7589, 'DKI Jakarta', 'Jakarta Barat', 'IDN', true),
    ('Cengkareng', 'Indonesia', 3, -6.1490, 106.7350, 'DKI Jakarta', 'Jakarta Barat', 'IDN', true),
    ('Kalideres', 'Indonesia', 3, -6.1540, 106.7050, 'DKI Jakarta', 'Jakarta Barat', 'IDN', true),
    ('Grogol Petamburan', 'Indonesia', 3, -6.1660, 106.7880, 'DKI Jakarta', 'Jakarta Barat', 'IDN', true),
    ('Kebon Jeruk', 'Indonesia', 3, -6.1920, 106.7690, 'DKI Jakarta', 'Jakarta Barat', 'IDN', true),
    ('Tamansari', 'Indonesia', 3, -6.1460, 106.8180, 'DKI Jakarta', 'Jakarta Barat', 'IDN', true),
    ('Kembangan', 'Indonesia', 3, -6.1910, 106.7440, 'DKI Jakarta', 'Jakarta Barat', 'IDN', true),
    ('Palmerah', 'Indonesia', 3, -6.1910, 106.7930, 'DKI Jakarta', 'Jakarta Barat', 'IDN', true),
    ('Tambora', 'Indonesia', 3, -6.1460, 106.8080, 'DKI Jakarta', 'Jakarta Barat', 'IDN', true)
ON CONFLICT (name, country) DO UPDATE
SET latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    admin_level = EXCLUDED.admin_level,
    admin1_name = EXCLUDED.admin1_name,
    admin2_name = EXCLUDED.admin2_name,
    country_iso3 = EXCLUDED.country_iso3,
    is_active = TRUE;

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, alias.alias_name, alias.language, alias.is_preferred
FROM locations l
JOIN (
    VALUES
        ('Jakarta Barat', 'jakbar', 'id', true),
        ('Jakarta Barat', 'west jakarta', 'en', false),
        ('Tamansari', 'taman sari', 'id', false)
) AS alias(canonical_name, alias_name, language, is_preferred)
  ON l.name = alias.canonical_name AND l.country = 'Indonesia'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;
