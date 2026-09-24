-- ==============================================================================
-- 121_expand_master_countries_outside_asean_and_global.sql
-- Expansion of Master Countries and Regions (61 Strategic Outside ASEAN Countries)
-- Links all countries to OUTSIDE_ASEAN, GLOBAL, and Granular Sub-Regions.
-- Also synchronizes country centroids into locations and location_aliases.
-- ==============================================================================

-- 1. Insert Granular Sub-Regions into master_regions
INSERT INTO master_regions (name, code, description)
VALUES
    ('East Asia & Pacific', 'EAST_ASIA_PACIFIC', 'East Asia and Pacific regional partners'),
    ('South Asia', 'SOUTH_ASIA', 'South Asian regional neighbors'),
    ('Middle East & North Africa', 'MIDDLE_EAST_NORTH_AFRICA', 'MENA travel, trade, and pilgrimage corridors'),
    ('Europe', 'EUROPE', 'European health intelligence and dialogue partners'),
    ('North America', 'NORTH_AMERICA', 'North American partners'),
    ('Latin America', 'LATIN_AMERICA', 'Latin American arbovirus and tropical surveillance'),
    ('Sub-Saharan Africa', 'SUB_SAHARAN_AFRICA', 'African epidemic intelligence and priority viral disease hotspots'),
    ('Central Asia', 'CENTRAL_ASIA', 'Central Asian surveillance and transit corridor')
ON CONFLICT (code) DO NOTHING;

-- 2. Insert 61 Outside ASEAN Countries into master_countries
INSERT INTO master_countries (name, iso2, iso3, flag_code, display_order)
VALUES
    ('New Zealand', 'NZ', 'NZL', 'nz', 18),
    ('Papua New Guinea', 'PG', 'PNG', 'pg', 19),
    ('Taiwan', 'TW', 'TWN', 'tw', 20),
    ('Hong Kong', 'HK', 'HKG', 'hk', 21),
    ('Mongolia', 'MN', 'MNG', 'mn', 22),
    ('Fiji', 'FJ', 'FJI', 'fj', 23),
    ('Bangladesh', 'BD', 'BGD', 'bd', 24),
    ('Pakistan', 'PK', 'PAK', 'pk', 25),
    ('Sri Lanka', 'LK', 'LKA', 'lk', 26),
    ('Nepal', 'NP', 'NPL', 'np', 27),
    ('Maldives', 'MV', 'MDV', 'mv', 28),
    ('Saudi Arabia', 'SA', 'SAU', 'sa', 29),
    ('United Arab Emirates', 'AE', 'ARE', 'ae', 30),
    ('Qatar', 'QA', 'QAT', 'qa', 31),
    ('Turkey', 'TR', 'TUR', 'tr', 32),
    ('Kuwait', 'KW', 'KWT', 'kw', 33),
    ('Oman', 'OM', 'OMN', 'om', 34),
    ('Jordan', 'JO', 'JOR', 'jo', 35),
    ('Egypt', 'EG', 'EGY', 'eg', 36),
    ('Iran', 'IR', 'IRN', 'ir', 37),
    ('Israel', 'IL', 'ISR', 'il', 38),
    ('Yemen', 'YE', 'YEM', 'ye', 39),
    ('Morocco', 'MA', 'MAR', 'ma', 40),
    ('Algeria', 'DZ', 'DZA', 'dz', 41),
    ('United Kingdom', 'GB', 'GBR', 'gb', 42),
    ('Germany', 'DE', 'DEU', 'de', 43),
    ('France', 'FR', 'FRA', 'fr', 44),
    ('Netherlands', 'NL', 'NLD', 'nl', 45),
    ('Switzerland', 'CH', 'CHE', 'ch', 46),
    ('Russia', 'RU', 'RUS', 'ru', 47),
    ('Italy', 'IT', 'ITA', 'it', 48),
    ('Spain', 'ES', 'ESP', 'es', 49),
    ('Belgium', 'BE', 'BEL', 'be', 50),
    ('Sweden', 'SE', 'SWE', 'se', 51),
    ('Norway', 'NO', 'NOR', 'no', 52),
    ('Denmark', 'DK', 'DNK', 'dk', 53),
    ('Canada', 'CA', 'CAN', 'ca', 54),
    ('Mexico', 'MX', 'MEX', 'mx', 55),
    ('Brazil', 'BR', 'BRA', 'br', 56),
    ('Colombia', 'CO', 'COL', 'co', 57),
    ('Argentina', 'AR', 'ARG', 'ar', 58),
    ('Peru', 'PE', 'PER', 'pe', 59),
    ('Chile', 'CL', 'CHL', 'cl', 60),
    ('Costa Rica', 'CR', 'CRI', 'cr', 61),
    ('Panama', 'PA', 'PAN', 'pa', 62),
    ('Democratic Republic of the Congo', 'CD', 'COD', 'cd', 63),
    ('Uganda', 'UG', 'UGA', 'ug', 64),
    ('Rwanda', 'RW', 'RWA', 'rw', 65),
    ('Nigeria', 'NG', 'NGA', 'ng', 66),
    ('Kenya', 'KE', 'KEN', 'ke', 67),
    ('South Africa', 'ZA', 'ZAF', 'za', 68),
    ('Tanzania', 'TZ', 'TZA', 'tz', 69),
    ('Ethiopia', 'ET', 'ETH', 'et', 70),
    ('Ghana', 'GH', 'GHA', 'gh', 71),
    ('Sudan', 'SD', 'SDN', 'sd', 72),
    ('South Sudan', 'SS', 'SSD', 'ss', 73),
    ('Burundi', 'BI', 'BDI', 'bi', 74),
    ('Guinea', 'GN', 'GIN', 'gn', 75),
    ('Sierra Leone', 'SL', 'SLE', 'sl', 76),
    ('Kazakhstan', 'KZ', 'KAZ', 'kz', 77),
    ('Uzbekistan', 'UZ', 'UZB', 'uz', 78)
ON CONFLICT (iso3) DO UPDATE SET
    name = EXCLUDED.name,
    iso2 = EXCLUDED.iso2,
    flag_code = EXCLUDED.flag_code,
    display_order = EXCLUDED.display_order,
    is_active = TRUE,
    updated_at = NOW();

-- 3. Map all non-ASEAN countries into OUTSIDE_ASEAN region
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id
FROM master_regions r, master_countries c
WHERE r.code = 'OUTSIDE_ASEAN'
  AND c.iso3 NOT IN ('BRN', 'KHM', 'IDN', 'LAO', 'MYS', 'MMR', 'PHL', 'SGP', 'THA', 'TLS', 'VNM')
ON CONFLICT DO NOTHING;

-- 4. Map all countries into GLOBAL region
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id
FROM master_regions r, master_countries c
WHERE r.code = 'GLOBAL'
ON CONFLICT DO NOTHING;

-- 5. Map countries to Sub-Regions
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EAST_ASIA_PACIFIC' AND c.iso3 = 'NZL'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EAST_ASIA_PACIFIC' AND c.iso3 = 'PNG'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EAST_ASIA_PACIFIC' AND c.iso3 = 'TWN'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EAST_ASIA_PACIFIC' AND c.iso3 = 'HKG'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EAST_ASIA_PACIFIC' AND c.iso3 = 'MNG'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EAST_ASIA_PACIFIC' AND c.iso3 = 'FJI'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SOUTH_ASIA' AND c.iso3 = 'BGD'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SOUTH_ASIA' AND c.iso3 = 'PAK'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SOUTH_ASIA' AND c.iso3 = 'LKA'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SOUTH_ASIA' AND c.iso3 = 'NPL'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SOUTH_ASIA' AND c.iso3 = 'MDV'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'SAU'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'ARE'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'QAT'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'TUR'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'KWT'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'OMN'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'JOR'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'EGY'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'IRN'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'ISR'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'YEM'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'MAR'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'MIDDLE_EAST_NORTH_AFRICA' AND c.iso3 = 'DZA'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'GBR'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'DEU'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'FRA'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'NLD'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'CHE'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'RUS'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'ITA'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'ESP'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'BEL'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'SWE'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'NOR'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EUROPE' AND c.iso3 = 'DNK'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'NORTH_AMERICA' AND c.iso3 = 'CAN'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'LATIN_AMERICA' AND c.iso3 = 'MEX'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'LATIN_AMERICA' AND c.iso3 = 'BRA'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'LATIN_AMERICA' AND c.iso3 = 'COL'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'LATIN_AMERICA' AND c.iso3 = 'ARG'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'LATIN_AMERICA' AND c.iso3 = 'PER'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'LATIN_AMERICA' AND c.iso3 = 'CHL'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'LATIN_AMERICA' AND c.iso3 = 'CRI'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'LATIN_AMERICA' AND c.iso3 = 'PAN'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'COD'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'UGA'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'RWA'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'NGA'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'KEN'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'ZAF'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'TZA'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'ETH'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'GHA'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'SDN'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'SSD'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'BDI'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'GIN'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SUB_SAHARAN_AFRICA' AND c.iso3 = 'SLE'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'CENTRAL_ASIA' AND c.iso3 = 'KAZ'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'CENTRAL_ASIA' AND c.iso3 = 'UZB'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EAST_ASIA_PACIFIC' AND c.iso3 = 'CHN'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EAST_ASIA_PACIFIC' AND c.iso3 = 'JPN'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EAST_ASIA_PACIFIC' AND c.iso3 = 'KOR'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'EAST_ASIA_PACIFIC' AND c.iso3 = 'AUS'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'SOUTH_ASIA' AND c.iso3 = 'IND'
ON CONFLICT DO NOTHING;
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id FROM master_regions r, master_countries c WHERE r.code = 'NORTH_AMERICA' AND c.iso3 = 'USA'
ON CONFLICT DO NOTHING;

-- 6. Synchronize Country Centroids into locations table (admin_level = 0)
INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('New Zealand', -40.9006, 174.886, 'New Zealand', 'NZL', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'new zealand')
FROM locations l
JOIN (VALUES ('new zealand'), ('selandia baru')) AS a(alias_name) ON TRUE
WHERE l.name = 'New Zealand' AND l.country = 'New Zealand'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Papua New Guinea', -6.315, 143.9555, 'Papua New Guinea', 'PNG', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'papua new guinea')
FROM locations l
JOIN (VALUES ('papua new guinea'), ('png'), ('papua nugini')) AS a(alias_name) ON TRUE
WHERE l.name = 'Papua New Guinea' AND l.country = 'Papua New Guinea'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Taiwan', 23.6978, 120.9605, 'Taiwan', 'TWN', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'taiwan')
FROM locations l
JOIN (VALUES ('republic of china'), ('taiwan')) AS a(alias_name) ON TRUE
WHERE l.name = 'Taiwan' AND l.country = 'Taiwan'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Hong Kong', 22.3193, 114.1694, 'Hong Kong', 'HKG', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'hong kong')
FROM locations l
JOIN (VALUES ('hong kong'), ('hongkong')) AS a(alias_name) ON TRUE
WHERE l.name = 'Hong Kong' AND l.country = 'Hong Kong'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Mongolia', 46.8625, 103.8467, 'Mongolia', 'MNG', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'mongolia')
FROM locations l
JOIN (VALUES ('mongolia')) AS a(alias_name) ON TRUE
WHERE l.name = 'Mongolia' AND l.country = 'Mongolia'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Fiji', -17.7134, 178.065, 'Fiji', 'FJI', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'fiji')
FROM locations l
JOIN (VALUES ('fiji')) AS a(alias_name) ON TRUE
WHERE l.name = 'Fiji' AND l.country = 'Fiji'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Bangladesh', 23.685, 90.3563, 'Bangladesh', 'BGD', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'bangladesh')
FROM locations l
JOIN (VALUES ('bangladesh')) AS a(alias_name) ON TRUE
WHERE l.name = 'Bangladesh' AND l.country = 'Bangladesh'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Pakistan', 30.3753, 69.3451, 'Pakistan', 'PAK', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'pakistan')
FROM locations l
JOIN (VALUES ('pakistan')) AS a(alias_name) ON TRUE
WHERE l.name = 'Pakistan' AND l.country = 'Pakistan'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Sri Lanka', 7.8731, 80.7718, 'Sri Lanka', 'LKA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'sri lanka')
FROM locations l
JOIN (VALUES ('sri lanka'), ('srilanka')) AS a(alias_name) ON TRUE
WHERE l.name = 'Sri Lanka' AND l.country = 'Sri Lanka'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Nepal', 28.3949, 84.124, 'Nepal', 'NPL', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'nepal')
FROM locations l
JOIN (VALUES ('nepal')) AS a(alias_name) ON TRUE
WHERE l.name = 'Nepal' AND l.country = 'Nepal'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Maldives', 3.2028, 73.2207, 'Maldives', 'MDV', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'maldives')
FROM locations l
JOIN (VALUES ('maldives'), ('maladewa')) AS a(alias_name) ON TRUE
WHERE l.name = 'Maldives' AND l.country = 'Maldives'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Saudi Arabia', 23.8859, 45.0792, 'Saudi Arabia', 'SAU', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'saudi arabia')
FROM locations l
JOIN (VALUES ('arab saudi'), ('saudi arabia'), ('ksa')) AS a(alias_name) ON TRUE
WHERE l.name = 'Saudi Arabia' AND l.country = 'Saudi Arabia'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('United Arab Emirates', 23.4241, 53.8478, 'United Arab Emirates', 'ARE', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'united arab emirates')
FROM locations l
JOIN (VALUES ('united arab emirates'), ('abu dhabi'), ('uae'), ('uni emirat arab'), ('uea'), ('dubai')) AS a(alias_name) ON TRUE
WHERE l.name = 'United Arab Emirates' AND l.country = 'United Arab Emirates'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Qatar', 25.3548, 51.1839, 'Qatar', 'QAT', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'qatar')
FROM locations l
JOIN (VALUES ('qatar')) AS a(alias_name) ON TRUE
WHERE l.name = 'Qatar' AND l.country = 'Qatar'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Turkey', 38.9637, 35.2433, 'Turkey', 'TUR', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'turkey')
FROM locations l
JOIN (VALUES ('turkiye'), ('turkey'), ('turki')) AS a(alias_name) ON TRUE
WHERE l.name = 'Turkey' AND l.country = 'Turkey'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Kuwait', 29.3117, 47.4818, 'Kuwait', 'KWT', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'kuwait')
FROM locations l
JOIN (VALUES ('kuwait')) AS a(alias_name) ON TRUE
WHERE l.name = 'Kuwait' AND l.country = 'Kuwait'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Oman', 21.4735, 55.9754, 'Oman', 'OMN', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'oman')
FROM locations l
JOIN (VALUES ('oman')) AS a(alias_name) ON TRUE
WHERE l.name = 'Oman' AND l.country = 'Oman'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Jordan', 30.5852, 36.2384, 'Jordan', 'JOR', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'jordan')
FROM locations l
JOIN (VALUES ('jordan'), ('yordania')) AS a(alias_name) ON TRUE
WHERE l.name = 'Jordan' AND l.country = 'Jordan'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Egypt', 26.8206, 30.8025, 'Egypt', 'EGY', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'egypt')
FROM locations l
JOIN (VALUES ('egypt'), ('mesir')) AS a(alias_name) ON TRUE
WHERE l.name = 'Egypt' AND l.country = 'Egypt'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Iran', 32.4279, 53.688, 'Iran', 'IRN', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'iran')
FROM locations l
JOIN (VALUES ('iran')) AS a(alias_name) ON TRUE
WHERE l.name = 'Iran' AND l.country = 'Iran'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Israel', 31.0461, 34.8516, 'Israel', 'ISR', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'israel')
FROM locations l
JOIN (VALUES ('israel')) AS a(alias_name) ON TRUE
WHERE l.name = 'Israel' AND l.country = 'Israel'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Yemen', 15.5527, 48.5164, 'Yemen', 'YEM', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'yemen')
FROM locations l
JOIN (VALUES ('yaman'), ('yemen')) AS a(alias_name) ON TRUE
WHERE l.name = 'Yemen' AND l.country = 'Yemen'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Morocco', 31.7917, -7.0926, 'Morocco', 'MAR', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'morocco')
FROM locations l
JOIN (VALUES ('maroko'), ('morocco')) AS a(alias_name) ON TRUE
WHERE l.name = 'Morocco' AND l.country = 'Morocco'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Algeria', 28.0339, 1.6596, 'Algeria', 'DZA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'algeria')
FROM locations l
JOIN (VALUES ('aljazair'), ('algeria')) AS a(alias_name) ON TRUE
WHERE l.name = 'Algeria' AND l.country = 'Algeria'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('United Kingdom', 55.3781, -3.436, 'United Kingdom', 'GBR', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'united kingdom')
FROM locations l
JOIN (VALUES ('britania raya'), ('uk'), ('inggris'), ('great britain'), ('united kingdom')) AS a(alias_name) ON TRUE
WHERE l.name = 'United Kingdom' AND l.country = 'United Kingdom'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Germany', 51.1657, 10.4515, 'Germany', 'DEU', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'germany')
FROM locations l
JOIN (VALUES ('germany'), ('jerman'), ('deutschland')) AS a(alias_name) ON TRUE
WHERE l.name = 'Germany' AND l.country = 'Germany'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('France', 46.2276, 2.2137, 'France', 'FRA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'france')
FROM locations l
JOIN (VALUES ('prancis'), ('france')) AS a(alias_name) ON TRUE
WHERE l.name = 'France' AND l.country = 'France'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Netherlands', 52.1326, 5.2913, 'Netherlands', 'NLD', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'netherlands')
FROM locations l
JOIN (VALUES ('netherlands'), ('belanda'), ('holland')) AS a(alias_name) ON TRUE
WHERE l.name = 'Netherlands' AND l.country = 'Netherlands'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Switzerland', 46.8182, 8.2275, 'Switzerland', 'CHE', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'switzerland')
FROM locations l
JOIN (VALUES ('swiss'), ('switzerland')) AS a(alias_name) ON TRUE
WHERE l.name = 'Switzerland' AND l.country = 'Switzerland'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Russia', 61.524, 105.3188, 'Russia', 'RUS', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'russia')
FROM locations l
JOIN (VALUES ('russia'), ('rusia')) AS a(alias_name) ON TRUE
WHERE l.name = 'Russia' AND l.country = 'Russia'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Italy', 41.8719, 12.5674, 'Italy', 'ITA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'italy')
FROM locations l
JOIN (VALUES ('italy'), ('italia')) AS a(alias_name) ON TRUE
WHERE l.name = 'Italy' AND l.country = 'Italy'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Spain', 40.4637, -3.7492, 'Spain', 'ESP', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'spain')
FROM locations l
JOIN (VALUES ('spain'), ('spanyol')) AS a(alias_name) ON TRUE
WHERE l.name = 'Spain' AND l.country = 'Spain'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Belgium', 50.5039, 4.4699, 'Belgium', 'BEL', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'belgium')
FROM locations l
JOIN (VALUES ('belgium'), ('belgia')) AS a(alias_name) ON TRUE
WHERE l.name = 'Belgium' AND l.country = 'Belgium'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Sweden', 60.1282, 18.6435, 'Sweden', 'SWE', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'sweden')
FROM locations l
JOIN (VALUES ('sweden'), ('swedia')) AS a(alias_name) ON TRUE
WHERE l.name = 'Sweden' AND l.country = 'Sweden'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Norway', 60.472, 8.4689, 'Norway', 'NOR', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'norway')
FROM locations l
JOIN (VALUES ('norway'), ('norwegia')) AS a(alias_name) ON TRUE
WHERE l.name = 'Norway' AND l.country = 'Norway'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Denmark', 56.2639, 9.5018, 'Denmark', 'DNK', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'denmark')
FROM locations l
JOIN (VALUES ('denmark')) AS a(alias_name) ON TRUE
WHERE l.name = 'Denmark' AND l.country = 'Denmark'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Canada', 56.1304, -106.3468, 'Canada', 'CAN', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'canada')
FROM locations l
JOIN (VALUES ('canada'), ('kanada')) AS a(alias_name) ON TRUE
WHERE l.name = 'Canada' AND l.country = 'Canada'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Mexico', 23.6345, -102.5528, 'Mexico', 'MEX', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'mexico')
FROM locations l
JOIN (VALUES ('meksiko'), ('mexico')) AS a(alias_name) ON TRUE
WHERE l.name = 'Mexico' AND l.country = 'Mexico'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Brazil', -14.235, -51.9253, 'Brazil', 'BRA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'brazil')
FROM locations l
JOIN (VALUES ('brasil'), ('brazil')) AS a(alias_name) ON TRUE
WHERE l.name = 'Brazil' AND l.country = 'Brazil'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Colombia', 4.5709, -74.2973, 'Colombia', 'COL', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'colombia')
FROM locations l
JOIN (VALUES ('kolombia'), ('colombia')) AS a(alias_name) ON TRUE
WHERE l.name = 'Colombia' AND l.country = 'Colombia'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Argentina', -38.4161, -63.6167, 'Argentina', 'ARG', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'argentina')
FROM locations l
JOIN (VALUES ('argentina')) AS a(alias_name) ON TRUE
WHERE l.name = 'Argentina' AND l.country = 'Argentina'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Peru', -9.19, -75.0152, 'Peru', 'PER', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'peru')
FROM locations l
JOIN (VALUES ('peru')) AS a(alias_name) ON TRUE
WHERE l.name = 'Peru' AND l.country = 'Peru'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Chile', -35.6751, -71.543, 'Chile', 'CHL', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'chile')
FROM locations l
JOIN (VALUES ('chile')) AS a(alias_name) ON TRUE
WHERE l.name = 'Chile' AND l.country = 'Chile'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Costa Rica', 9.7489, -83.7534, 'Costa Rica', 'CRI', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'costa rica')
FROM locations l
JOIN (VALUES ('kosta rika'), ('costa rica')) AS a(alias_name) ON TRUE
WHERE l.name = 'Costa Rica' AND l.country = 'Costa Rica'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Panama', 8.5379, -80.7821, 'Panama', 'PAN', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'panama')
FROM locations l
JOIN (VALUES ('panama')) AS a(alias_name) ON TRUE
WHERE l.name = 'Panama' AND l.country = 'Panama'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Democratic Republic of the Congo', -2.877, 23.656, 'Democratic Republic of the Congo', 'COD', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'democratic republic of the congo')
FROM locations l
JOIN (VALUES ('rd congo'), ('kongo'), ('dr congo'), ('democratic republic of the congo')) AS a(alias_name) ON TRUE
WHERE l.name = 'Democratic Republic of the Congo' AND l.country = 'Democratic Republic of the Congo'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Uganda', 1.3733, 32.2903, 'Uganda', 'UGA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'uganda')
FROM locations l
JOIN (VALUES ('uganda')) AS a(alias_name) ON TRUE
WHERE l.name = 'Uganda' AND l.country = 'Uganda'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Rwanda', -1.9403, 29.8739, 'Rwanda', 'RWA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'rwanda')
FROM locations l
JOIN (VALUES ('rwanda')) AS a(alias_name) ON TRUE
WHERE l.name = 'Rwanda' AND l.country = 'Rwanda'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Nigeria', 9.082, 8.6753, 'Nigeria', 'NGA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'nigeria')
FROM locations l
JOIN (VALUES ('nigeria')) AS a(alias_name) ON TRUE
WHERE l.name = 'Nigeria' AND l.country = 'Nigeria'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Kenya', -0.0236, 37.9062, 'Kenya', 'KEN', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'kenya')
FROM locations l
JOIN (VALUES ('kenya')) AS a(alias_name) ON TRUE
WHERE l.name = 'Kenya' AND l.country = 'Kenya'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('South Africa', -30.5595, 22.9375, 'South Africa', 'ZAF', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'south africa')
FROM locations l
JOIN (VALUES ('afrika selatan'), ('south africa')) AS a(alias_name) ON TRUE
WHERE l.name = 'South Africa' AND l.country = 'South Africa'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Tanzania', -6.369, 34.8888, 'Tanzania', 'TZA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'tanzania')
FROM locations l
JOIN (VALUES ('tanzania')) AS a(alias_name) ON TRUE
WHERE l.name = 'Tanzania' AND l.country = 'Tanzania'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Ethiopia', 9.145, 40.4897, 'Ethiopia', 'ETH', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'ethiopia')
FROM locations l
JOIN (VALUES ('ethiopia')) AS a(alias_name) ON TRUE
WHERE l.name = 'Ethiopia' AND l.country = 'Ethiopia'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Ghana', 7.9465, -1.0232, 'Ghana', 'GHA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'ghana')
FROM locations l
JOIN (VALUES ('ghana')) AS a(alias_name) ON TRUE
WHERE l.name = 'Ghana' AND l.country = 'Ghana'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Sudan', 12.8628, 30.2176, 'Sudan', 'SDN', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'sudan')
FROM locations l
JOIN (VALUES ('sudan')) AS a(alias_name) ON TRUE
WHERE l.name = 'Sudan' AND l.country = 'Sudan'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('South Sudan', 6.877, 31.307, 'South Sudan', 'SSD', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'south sudan')
FROM locations l
JOIN (VALUES ('sudan selatan'), ('south sudan')) AS a(alias_name) ON TRUE
WHERE l.name = 'South Sudan' AND l.country = 'South Sudan'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Burundi', -3.3731, 29.9189, 'Burundi', 'BDI', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'burundi')
FROM locations l
JOIN (VALUES ('burundi')) AS a(alias_name) ON TRUE
WHERE l.name = 'Burundi' AND l.country = 'Burundi'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Guinea', 9.9456, -9.6966, 'Guinea', 'GIN', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'guinea')
FROM locations l
JOIN (VALUES ('guinea')) AS a(alias_name) ON TRUE
WHERE l.name = 'Guinea' AND l.country = 'Guinea'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Sierra Leone', 8.4606, -11.7799, 'Sierra Leone', 'SLE', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'sierra leone')
FROM locations l
JOIN (VALUES ('sierra leone')) AS a(alias_name) ON TRUE
WHERE l.name = 'Sierra Leone' AND l.country = 'Sierra Leone'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Kazakhstan', 48.0196, 66.9237, 'Kazakhstan', 'KAZ', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'kazakhstan')
FROM locations l
JOIN (VALUES ('kazakhstan')) AS a(alias_name) ON TRUE
WHERE l.name = 'Kazakhstan' AND l.country = 'Kazakhstan'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Uzbekistan', 41.3775, 64.5853, 'Uzbekistan', 'UZB', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'uzbekistan')
FROM locations l
JOIN (VALUES ('uzbekistan')) AS a(alias_name) ON TRUE
WHERE l.name = 'Uzbekistan' AND l.country = 'Uzbekistan'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

-- 7. Ensure Existing Partners have centroids in locations
INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('China', 35.8617, 104.1954, 'China', 'CHN', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'china')
FROM locations l
JOIN (VALUES ('china'), ('tiongkok'), ('prc')) AS a(alias_name) ON TRUE
WHERE l.name = 'China' AND l.country = 'China'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Japan', 36.2048, 138.2529, 'Japan', 'JPN', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'japan')
FROM locations l
JOIN (VALUES ('japan'), ('jepang')) AS a(alias_name) ON TRUE
WHERE l.name = 'Japan' AND l.country = 'Japan'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('South Korea', 35.9078, 127.7669, 'South Korea', 'KOR', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'south korea')
FROM locations l
JOIN (VALUES ('korea'), ('korea selatan'), ('south korea')) AS a(alias_name) ON TRUE
WHERE l.name = 'South Korea' AND l.country = 'South Korea'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('Australia', -25.2744, 133.7751, 'Australia', 'AUS', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'australia')
FROM locations l
JOIN (VALUES ('australia')) AS a(alias_name) ON TRUE
WHERE l.name = 'Australia' AND l.country = 'Australia'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('India', 20.5937, 78.9629, 'India', 'IND', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'india')
FROM locations l
JOIN (VALUES ('india')) AS a(alias_name) ON TRUE
WHERE l.name = 'India' AND l.country = 'India'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES ('United States', 37.0902, -95.7129, 'United States', 'USA', 0)
ON CONFLICT (name, country) DO UPDATE SET
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    country_iso3 = EXCLUDED.country_iso3,
    admin_level = 0,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', (a.alias_name = 'united states')
FROM locations l
JOIN (VALUES ('united states'), ('as'), ('usa'), ('amerika serikat')) AS a(alias_name) ON TRUE
WHERE l.name = 'United States' AND l.country = 'United States'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;