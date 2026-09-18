-- ==============================================================================
-- 090_hierarchical_locations.sql
-- Intelligence Engine Phase 2: Hierarchical ASEAN Location Intelligence
--
-- 1. Extend `locations` table with administrative hierarchy columns.
-- 2. Create `location_aliases` table for multilingual & abbreviation resolution.
-- 3. Extend `disease_events` with admin1_name, admin2_name, country_iso3.
-- 4. Populate country_iso3 for all 11 ASEAN nations.
-- 5. Enrich Indonesian locations via PostGIS Point-in-Polygon spatial join
--    with peta_kab2023 and peta_provinsi2023.
-- 6. Seed essential multilingual, abbreviation, and transliterated location aliases.
-- ==============================================================================

-- 1. Extend `locations` table
ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS country_iso3 VARCHAR(3),
    ADD COLUMN IF NOT EXISTS admin1_name TEXT,
    ADD COLUMN IF NOT EXISTS admin1_code TEXT,
    ADD COLUMN IF NOT EXISTS admin2_name TEXT,
    ADD COLUMN IF NOT EXISTS admin2_code TEXT,
    ADD COLUMN IF NOT EXISTS admin_level SMALLINT DEFAULT 3, -- 0: country, 1: admin1 (prov/state), 2: admin2 (regency/city/district), 3: locality
    ADD COLUMN IF NOT EXISTS geoname_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_locations_country_iso3 ON locations(country_iso3);
CREATE INDEX IF NOT EXISTS idx_locations_admin1 ON locations(country, admin1_name) WHERE admin1_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locations_admin2 ON locations(country, admin2_name) WHERE admin2_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_locations_admin_level ON locations(admin_level);

-- 2. Create `location_aliases` table
CREATE TABLE IF NOT EXISTS location_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    language VARCHAR(12) NOT NULL DEFAULT 'id',
    is_preferred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    UNIQUE(location_id, alias_name, language)
);

CREATE INDEX IF NOT EXISTS idx_location_aliases_lower_name ON location_aliases(LOWER(alias_name));
CREATE INDEX IF NOT EXISTS idx_location_aliases_location_id ON location_aliases(location_id);

-- 3. Extend `disease_events` table
ALTER TABLE disease_events
    ADD COLUMN IF NOT EXISTS country_iso3 VARCHAR(3),
    ADD COLUMN IF NOT EXISTS admin1_name TEXT,
    ADD COLUMN IF NOT EXISTS admin2_name TEXT;

CREATE INDEX IF NOT EXISTS idx_disease_events_country_iso3 ON disease_events(country_iso3) WHERE country_iso3 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disease_events_admin1_name ON disease_events(admin1_name) WHERE admin1_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disease_events_admin2_name ON disease_events(admin2_name) WHERE admin2_name IS NOT NULL;

-- 4. Populate country_iso3 for all 11 ASEAN nations
UPDATE locations SET country_iso3 = 'IDN' WHERE country = 'Indonesia';
UPDATE locations SET country_iso3 = 'PHL' WHERE country = 'Philippines';
UPDATE locations SET country_iso3 = 'VNM' WHERE country = 'Vietnam';
UPDATE locations SET country_iso3 = 'THA' WHERE country = 'Thailand';
UPDATE locations SET country_iso3 = 'MYS' WHERE country = 'Malaysia';
UPDATE locations SET country_iso3 = 'MMR' WHERE country = 'Myanmar';
UPDATE locations SET country_iso3 = 'KHM' WHERE country = 'Cambodia';
UPDATE locations SET country_iso3 = 'LAO' WHERE country = 'Laos';
UPDATE locations SET country_iso3 = 'SGP' WHERE country = 'Singapore';
UPDATE locations SET country_iso3 = 'BRN' WHERE country = 'Brunei';
UPDATE locations SET country_iso3 = 'TLS' WHERE country = 'Timor-Leste';

-- Mark country records with admin_level = 0
UPDATE locations
SET admin_level = 0
WHERE LOWER(name) = LOWER(country);

-- 5. PostGIS Point-in-Polygon spatial enrichment for Indonesia
-- Step 5A: Direct polygon containment match against peta_kab2023
UPDATE locations l
SET admin1_name = k.provinsi,
    admin2_name = k.nama_kab,
    admin1_code = k.kode_prov,
    admin2_code = k.kode_kab,
    admin_level = CASE
        WHEN LOWER(l.name) = 'indonesia' THEN 0
        WHEN LOWER(l.name) = LOWER(k.provinsi) THEN 1
        WHEN LOWER(l.name) = LOWER(k.nama_kab) OR LOWER(l.name) = LOWER(REPLACE(REPLACE(k.nama_kab, 'Kota ', ''), 'Kabupaten ', '')) THEN 2
        ELSE 3
    END
FROM peta_kab2023 k
WHERE l.country = 'Indonesia'
  AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL
  AND ST_Contains(k.shape, ST_MakePoint(l.longitude, l.latitude));

-- Step 5B: Nearest polygon fallback for coastal/island points (within 0.2 deg ~22 km)
UPDATE locations l
SET admin1_name = k.provinsi,
    admin2_name = k.nama_kab,
    admin1_code = k.kode_prov,
    admin2_code = k.kode_kab,
    admin_level = CASE
        WHEN LOWER(l.name) = 'indonesia' THEN 0
        WHEN LOWER(l.name) = LOWER(k.provinsi) THEN 1
        WHEN LOWER(l.name) = LOWER(k.nama_kab) OR LOWER(l.name) = LOWER(REPLACE(REPLACE(k.nama_kab, 'Kota ', ''), 'Kabupaten ', '')) THEN 2
        ELSE 3
    END
FROM (
  SELECT DISTINCT ON (l2.id) l2.id, pk.provinsi, pk.nama_kab, pk.kode_prov, pk.kode_kab
  FROM locations l2
  CROSS JOIN LATERAL (
    SELECT provinsi, nama_kab, kode_prov, kode_kab, shape
    FROM peta_kab2023
    ORDER BY shape <-> ST_MakePoint(l2.longitude, l2.latitude)
    LIMIT 1
  ) pk
  WHERE l2.country = 'Indonesia'
    AND l2.admin1_name IS NULL
    AND l2.latitude IS NOT NULL AND l2.longitude IS NOT NULL
    AND ST_Distance(pk.shape, ST_MakePoint(l2.longitude, l2.latitude)) < 0.2
) k
WHERE l.id = k.id;

-- Step 5C: Ensure the 38 provinces in peta_provinsi2023 are explicitly flagged as admin_level = 1
UPDATE locations l
SET admin_level = 1,
    admin1_name = p.provinsi,
    admin1_code = p.id_provinsi
FROM peta_provinsi2023 p
WHERE l.country = 'Indonesia'
  AND LOWER(l.name) = LOWER(p.provinsi)
  AND l.admin_level != 0;

-- Step 5D: Clean up sub-admin values for country and province level entities
UPDATE locations
SET admin1_name = NULL,
    admin2_name = NULL,
    admin1_code = NULL,
    admin2_code = NULL
WHERE admin_level = 0 OR LOWER(name) = LOWER(country);

UPDATE locations
SET admin2_name = NULL,
    admin2_code = NULL
WHERE admin_level = 1 OR LOWER(name) = LOWER(admin1_name);

-- 6. Seed Essential Multilingual & Contextual Aliases
CREATE OR REPLACE FUNCTION _seed_location_alias(
    p_canonical_name TEXT,
    p_country TEXT,
    p_alias TEXT,
    p_lang VARCHAR(12),
    p_preferred BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $$
DECLARE
    v_loc_id UUID;
BEGIN
    SELECT id INTO v_loc_id
    FROM locations
    WHERE LOWER(name) = LOWER(p_canonical_name)
      AND LOWER(country) = LOWER(p_country)
    LIMIT 1;

    IF v_loc_id IS NOT NULL THEN
        INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
        VALUES (v_loc_id, p_alias, p_lang, p_preferred)
        ON CONFLICT (location_id, alias_name, language)
        DO UPDATE SET alias_name = EXCLUDED.alias_name, is_preferred = EXCLUDED.is_preferred;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Countries aliases
SELECT _seed_location_alias('Indonesia', 'Indonesia', 'RI', 'id', false);
SELECT _seed_location_alias('Indonesia', 'Indonesia', 'Republik Indonesia', 'id', false);
SELECT _seed_location_alias('Singapore', 'Singapore', 'Singapura', 'id', true);
SELECT _seed_location_alias('Singapore', 'Singapore', 'Singapour', 'fr', false);
SELECT _seed_location_alias('Singapore', 'Singapore', 'SG', 'en', false);
SELECT _seed_location_alias('Philippines', 'Philippines', 'Filipina', 'id', true);
SELECT _seed_location_alias('Philippines', 'Philippines', 'Pilipinas', 'tl', true);
SELECT _seed_location_alias('Philippines', 'Philippines', 'PH', 'en', false);
SELECT _seed_location_alias('Vietnam', 'Vietnam', 'Việt Nam', 'vi', true);
SELECT _seed_location_alias('Vietnam', 'Vietnam', 'Viet Nam', 'en', false);
SELECT _seed_location_alias('Vietnam', 'Vietnam', 'VN', 'en', false);
SELECT _seed_location_alias('Thailand', 'Thailand', 'Muang Thai', 'id', false);
SELECT _seed_location_alias('Thailand', 'Thailand', 'Siam', 'en', false);
SELECT _seed_location_alias('Thailand', 'Thailand', 'TH', 'en', false);
SELECT _seed_location_alias('Malaysia', 'Malaysia', 'MY', 'en', false);
SELECT _seed_location_alias('Cambodia', 'Cambodia', 'Kamboja', 'id', true);
SELECT _seed_location_alias('Cambodia', 'Cambodia', 'Cambodge', 'fr', false);
SELECT _seed_location_alias('Cambodia', 'Cambodia', 'KH', 'en', false);
SELECT _seed_location_alias('Myanmar', 'Myanmar', 'Burma', 'en', false);
SELECT _seed_location_alias('Myanmar', 'Myanmar', 'MM', 'en', false);
SELECT _seed_location_alias('Laos', 'Laos', 'Laotian', 'en', false);
SELECT _seed_location_alias('Laos', 'Laos', 'LA', 'en', false);
SELECT _seed_location_alias('Brunei', 'Brunei', 'Brunei Darussalam', 'ms', true);
SELECT _seed_location_alias('Brunei', 'Brunei', 'BN', 'en', false);
SELECT _seed_location_alias('Timor-Leste', 'Timor-Leste', 'Timor Leste', 'id', true);
SELECT _seed_location_alias('Timor-Leste', 'Timor-Leste', 'East Timor', 'en', true);
SELECT _seed_location_alias('Timor-Leste', 'Timor-Leste', 'TL', 'en', false);

-- Indonesian Province Abbreviations & English Names
SELECT _seed_location_alias('Jawa Barat', 'Indonesia', 'Jabar', 'id', false);
SELECT _seed_location_alias('Jawa Barat', 'Indonesia', 'West Java', 'en', true);
SELECT _seed_location_alias('Jawa Tengah', 'Indonesia', 'Jateng', 'id', false);
SELECT _seed_location_alias('Jawa Tengah', 'Indonesia', 'Central Java', 'en', true);
SELECT _seed_location_alias('Jawa Timur', 'Indonesia', 'Jatim', 'id', false);
SELECT _seed_location_alias('Jawa Timur', 'Indonesia', 'East Java', 'en', true);
SELECT _seed_location_alias('DKI Jakarta', 'Indonesia', 'DKI', 'id', false);
SELECT _seed_location_alias('DI Yogyakarta', 'Indonesia', 'Yogyakarta', 'id', true);
SELECT _seed_location_alias('DI Yogyakarta', 'Indonesia', 'Jogja', 'id', false);
SELECT _seed_location_alias('DI Yogyakarta', 'Indonesia', 'Jogjakarta', 'id', false);
SELECT _seed_location_alias('Sumatera Utara', 'Indonesia', 'Sumut', 'id', false);
SELECT _seed_location_alias('Sumatera Utara', 'Indonesia', 'North Sumatra', 'en', true);
SELECT _seed_location_alias('Sumatera Barat', 'Indonesia', 'Sumbar', 'id', false);
SELECT _seed_location_alias('Sumatera Barat', 'Indonesia', 'West Sumatra', 'en', true);
SELECT _seed_location_alias('Sumatera Selatan', 'Indonesia', 'Sumsel', 'id', false);
SELECT _seed_location_alias('Sumatera Selatan', 'Indonesia', 'South Sumatra', 'en', true);
SELECT _seed_location_alias('Sulawesi Selatan', 'Indonesia', 'Sulsel', 'id', false);
SELECT _seed_location_alias('Sulawesi Selatan', 'Indonesia', 'South Sulawesi', 'en', true);
SELECT _seed_location_alias('Sulawesi Utara', 'Indonesia', 'Sulut', 'id', false);
SELECT _seed_location_alias('Sulawesi Utara', 'Indonesia', 'North Sulawesi', 'en', true);
SELECT _seed_location_alias('Kalimantan Barat', 'Indonesia', 'Kalbar', 'id', false);
SELECT _seed_location_alias('Kalimantan Barat', 'Indonesia', 'West Kalimantan', 'en', true);
SELECT _seed_location_alias('Kalimantan Timur', 'Indonesia', 'Kaltim', 'id', false);
SELECT _seed_location_alias('Kalimantan Timur', 'Indonesia', 'East Kalimantan', 'en', true);
SELECT _seed_location_alias('Nusa Tenggara Barat', 'Indonesia', 'NTB', 'id', true);
SELECT _seed_location_alias('Nusa Tenggara Timur', 'Indonesia', 'NTT', 'id', true);
SELECT _seed_location_alias('Kepulauan Riau', 'Indonesia', 'Kepri', 'id', true);
SELECT _seed_location_alias('Kepulauan Bangka Belitung', 'Indonesia', 'Babel', 'id', true);
SELECT _seed_location_alias('Kepulauan Bangka Belitung', 'Indonesia', 'Bangka Belitung', 'id', false);

-- ASEAN Major Cities & Multilingual Transliterations
SELECT _seed_location_alias('Bangkok', 'Thailand', 'Krung Thep', 'th', true);
SELECT _seed_location_alias('Bangkok', 'Thailand', 'Krung Thep Maha Nakhon', 'th', false);
SELECT _seed_location_alias('Hanoi', 'Vietnam', 'Hà Nội', 'vi', true);
SELECT _seed_location_alias('Hanoi', 'Vietnam', 'Ha Noi', 'vi', false);
SELECT _seed_location_alias('Ho Chi Minh City', 'Vietnam', 'Thành phố Hồ Chí Minh', 'vi', true);
SELECT _seed_location_alias('Ho Chi Minh City', 'Vietnam', 'TP.HCM', 'vi', false);
SELECT _seed_location_alias('Ho Chi Minh City', 'Vietnam', 'Saigon', 'vi', false);
SELECT _seed_location_alias('Ho Chi Minh City', 'Vietnam', 'Sài Gòn', 'vi', false);
SELECT _seed_location_alias('Da Nang', 'Vietnam', 'Đà Nẵng', 'vi', true);
SELECT _seed_location_alias('Yangon', 'Myanmar', 'Rangoon', 'en', false);
SELECT _seed_location_alias('Naypyidaw', 'Myanmar', 'Nay Pyi Taw', 'en', true);

-- Cleanup helper function
DROP FUNCTION IF EXISTS _seed_location_alias;

-- 7. Backfill existing disease_events administrative columns where available
UPDATE disease_events de
SET country_iso3 = l.country_iso3,
    admin1_name = COALESCE(de.admin1_name, de.province, l.admin1_name),
    admin2_name = COALESCE(de.admin2_name, de.city, l.admin2_name)
FROM locations l
WHERE de.location_name = l.name
  AND de.country_iso3 IS NULL;
