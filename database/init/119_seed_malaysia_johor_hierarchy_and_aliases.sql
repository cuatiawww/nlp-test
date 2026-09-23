-- ==============================================================================
-- 119_seed_malaysia_johor_hierarchy_and_aliases.sql
-- Enrich Malaysian State (Admin1) and District (Admin2) Administrative Hierarchy
-- and Local Aliases, with primary focus on Johor and major ASEAN disease hotspots.
-- ==============================================================================

-- 1. Ensure helper exists
CREATE OR REPLACE FUNCTION _seed_location_alias_119(
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

-- 2. Update Malaysian States (Admin Level 1: Province/State)
UPDATE locations
SET admin_level = 1, admin1_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia'
  AND name IN (
    'Johor', 'Selangor', 'Penang', 'Perak', 'Pahang', 'Kedah',
    'Kelantan', 'Terengganu', 'Negeri Sembilan', 'Melaka', 'Perlis',
    'Sabah', 'Sarawak', 'Putrajaya', 'Labuan'
  );

-- Kuala Lumpur as Capital Locality (Admin Level 3)
UPDATE locations
SET admin_level = 3, admin1_name = NULL, country_iso3 = 'MYS'
WHERE country = 'Malaysia' AND name = 'Kuala Lumpur';

-- 3. Update Johor Districts / Cities (Admin Level 2: District / City under Johor)
UPDATE locations
SET admin_level = 2, admin1_name = 'Johor', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia'
  AND name IN (
    'Johor Bahru', 'Batu Pahat', 'Kluang', 'Kulai', 'Muar',
    'Kota Tinggi', 'Segamat', 'Pontian', 'Tangkak', 'Mersing'
  );

-- Update Johor Jaya as Locality (Admin Level 3) under Johor / Johor Bahru
UPDATE locations
SET admin_level = 3, admin1_name = 'Johor', admin2_name = 'Johor Bahru', country_iso3 = 'MYS'
WHERE country = 'Malaysia' AND name = 'Johor Jaya';

-- 4. Update Other Key Malaysian Districts / Cities
UPDATE locations
SET admin_level = 2, admin1_name = 'Selangor', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia'
  AND name IN ('Shah Alam', 'Petaling Jaya', 'Klang', 'Subang Jaya', 'Kajang', 'Sepang', 'Gombak', 'Hulu Langat', 'Kuala Selangor');

UPDATE locations
SET admin_level = 2, admin1_name = 'Penang', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia'
  AND name IN ('George Town', 'Butterworth', 'Seberang Perai');

UPDATE locations
SET admin_level = 2, admin1_name = 'Perak', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia'
  AND name IN ('Ipoh', 'Taiping', 'Teluk Intan');

UPDATE locations
SET admin_level = 2, admin1_name = 'Pahang', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia'
  AND name IN ('Kuantan', 'Temerloh', 'Bentong');

UPDATE locations
SET admin_level = 2, admin1_name = 'Kedah', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia'
  AND name IN ('Alor Setar', 'Sungai Petani', 'Kulim', 'Langkawi');

UPDATE locations
SET admin_level = 2, admin1_name = 'Kelantan', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia' AND name = 'Kota Bharu';

UPDATE locations
SET admin_level = 2, admin1_name = 'Melaka', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia' AND name IN ('Melaka', 'Malacca City');

UPDATE locations
SET admin_level = 2, admin1_name = 'Negeri Sembilan', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia' AND name IN ('Seremban', 'Port Dickson');

UPDATE locations
SET admin_level = 2, admin1_name = 'Sabah', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia' AND name IN ('Kota Kinabalu', 'Sandakan', 'Tawau');

UPDATE locations
SET admin_level = 2, admin1_name = 'Sarawak', admin2_name = name, country_iso3 = 'MYS'
WHERE country = 'Malaysia' AND name IN ('Kuching', 'Miri', 'Sibu', 'Bintulu');

-- 5. Seed Aliases for Johor and its districts
SELECT _seed_location_alias_119('Johor', 'Malaysia', 'Negeri Johor', 'ms', true);
SELECT _seed_location_alias_119('Johor', 'Malaysia', 'Johor Darul Ta''zim', 'ms', false);
SELECT _seed_location_alias_119('Johor', 'Malaysia', 'Johor Darul Takzim', 'ms', false);
SELECT _seed_location_alias_119('Johor', 'Malaysia', 'JDT', 'ms', false);

SELECT _seed_location_alias_119('Johor Bahru', 'Malaysia', 'Bandaraya Johor Bahru', 'ms', true);
SELECT _seed_location_alias_119('Johor Bahru', 'Malaysia', 'Bandar Johor Bahru', 'ms', false);
SELECT _seed_location_alias_119('Johor Bahru', 'Malaysia', 'daerah Johor Bahru', 'ms', false);
SELECT _seed_location_alias_119('Johor Bahru', 'Malaysia', 'JB', 'ms', false);

SELECT _seed_location_alias_119('Kulai', 'Malaysia', 'Bandar Kulai', 'ms', true);
SELECT _seed_location_alias_119('Kulai', 'Malaysia', 'daerah Kulai', 'ms', false);
SELECT _seed_location_alias_119('Kulai', 'Malaysia', 'Kulaijaya', 'ms', false);

SELECT _seed_location_alias_119('Batu Pahat', 'Malaysia', 'daerah Batu Pahat', 'ms', true);
SELECT _seed_location_alias_119('Batu Pahat', 'Malaysia', 'Bandar Penggaram', 'ms', false);

SELECT _seed_location_alias_119('Kluang', 'Malaysia', 'daerah Kluang', 'ms', true);
SELECT _seed_location_alias_119('Muar', 'Malaysia', 'daerah Muar', 'ms', true);
SELECT _seed_location_alias_119('Muar', 'Malaysia', 'Bandar Maharani', 'ms', false);

SELECT _seed_location_alias_119('Kota Tinggi', 'Malaysia', 'daerah Kota Tinggi', 'ms', true);
SELECT _seed_location_alias_119('Segamat', 'Malaysia', 'daerah Segamat', 'ms', true);
SELECT _seed_location_alias_119('Pontian', 'Malaysia', 'daerah Pontian', 'ms', true);
SELECT _seed_location_alias_119('Tangkak', 'Malaysia', 'daerah Tangkak', 'ms', true);
SELECT _seed_location_alias_119('Tangkak', 'Malaysia', 'Ledang', 'ms', false);
SELECT _seed_location_alias_119('Mersing', 'Malaysia', 'daerah Mersing', 'ms', true);

-- Cleanup temp function
DROP FUNCTION IF EXISTS _seed_location_alias_119;
