-- Migration 130: provinces missing from the gazetteer (crawl audit 2026-09-26).
-- An Giang and Quang Tri were omitted, so Vietnam events fell through to the
-- country pin. Yogyakarta / DI Yogyakarta already exist in 019; do not move them.
-- Existing databases do not re-run init scripts. The NLP and worker curated
-- fallbacks cover those rows until this seed is applied.

INSERT INTO locations (name, country, admin_level, latitude, longitude, admin1_name, country_iso3, is_active)
VALUES
    ('An Giang', 'Vietnam', 1, 10.5216, 105.1259, 'An Giang', 'VNM', true),
    ('Quang Tri', 'Vietnam', 1, 16.7943, 107.0027, 'Quang Tri', 'VNM', true)
ON CONFLICT (name, country) DO UPDATE
SET latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    admin_level = EXCLUDED.admin_level,
    admin1_name = EXCLUDED.admin1_name,
    country_iso3 = EXCLUDED.country_iso3,
    is_active = TRUE;

INSERT INTO locations (name, country, admin_level, latitude, longitude, admin1_name, country_iso3, is_active)
VALUES
    ('Yogyakarta', 'Indonesia', 1, -7.7956, 110.3695, 'DI Yogyakarta', 'IDN', true),
    ('DI Yogyakarta', 'Indonesia', 1, -7.7956, 110.3695, 'DI Yogyakarta', 'IDN', true)
ON CONFLICT (name, country) DO NOTHING;
