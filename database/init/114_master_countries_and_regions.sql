-- ==============================================================================
-- 114_master_countries_and_regions.sql
-- Master Countries and Regions Management
-- Provides dynamic CRUD for countries and regions with many-to-many associations.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS master_regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master_countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    iso2 VARCHAR(2) NOT NULL,
    iso3 VARCHAR(3) NOT NULL UNIQUE,
    flag_code VARCHAR(10),
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master_region_countries (
    region_id UUID NOT NULL REFERENCES master_regions(id) ON DELETE CASCADE,
    country_id UUID NOT NULL REFERENCES master_countries(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (region_id, country_id)
);

CREATE INDEX IF NOT EXISTS idx_master_countries_iso3 ON master_countries(iso3);
CREATE INDEX IF NOT EXISTS idx_master_countries_is_active ON master_countries(is_active);
CREATE INDEX IF NOT EXISTS idx_master_regions_code ON master_regions(code);

-- Seed initial countries (11 ASEAN + ASEAN+3 partners + sample global)
INSERT INTO master_countries (name, iso2, iso3, flag_code, display_order)
VALUES
    ('Brunei', 'BN', 'BRN', 'bn', 1),
    ('Cambodia', 'KH', 'KHM', 'kh', 2),
    ('Indonesia', 'ID', 'IDN', 'id', 3),
    ('Laos', 'LA', 'LAO', 'la', 4),
    ('Malaysia', 'MY', 'MYS', 'my', 5),
    ('Myanmar', 'MM', 'MMR', 'mm', 6),
    ('Philippines', 'PH', 'PHL', 'ph', 7),
    ('Singapore', 'SG', 'SGP', 'sg', 8),
    ('Thailand', 'TH', 'THA', 'th', 9),
    ('Timor-Leste', 'TL', 'TLS', 'tl', 10),
    ('Vietnam', 'VN', 'VNM', 'vn', 11),
    ('China', 'CN', 'CHN', 'cn', 12),
    ('Japan', 'JP', 'JPN', 'jp', 13),
    ('South Korea', 'KR', 'KOR', 'kr', 14),
    ('Australia', 'AU', 'AUS', 'au', 15),
    ('India', 'IN', 'IND', 'in', 16),
    ('United States', 'US', 'USA', 'us', 17)
ON CONFLICT (iso3) DO NOTHING;

-- Seed initial regions
INSERT INTO master_regions (name, code, description)
VALUES
    ('ASEAN', 'ASEAN', 'Association of Southeast Asian Nations (11 Member States)'),
    ('ASEAN+3', 'ASEAN_PLUS_THREE', 'ASEAN plus China, Japan, and South Korea'),
    ('Outside ASEAN', 'OUTSIDE_ASEAN', 'Global epidemic intelligence outside the ASEAN boundary'),
    ('Global', 'GLOBAL', 'Worldwide disease surveillance scope')
ON CONFLICT (code) DO NOTHING;

-- Map ASEAN countries into ASEAN region
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id
FROM master_regions r, master_countries c
WHERE r.code = 'ASEAN'
  AND c.iso3 IN ('BRN', 'KHM', 'IDN', 'LAO', 'MYS', 'MMR', 'PHL', 'SGP', 'THA', 'TLS', 'VNM')
ON CONFLICT DO NOTHING;

-- Map ASEAN + 3 countries into ASEAN+3 region
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id
FROM master_regions r, master_countries c
WHERE r.code = 'ASEAN_PLUS_THREE'
  AND c.iso3 IN ('BRN', 'KHM', 'IDN', 'LAO', 'MYS', 'MMR', 'PHL', 'SGP', 'THA', 'TLS', 'VNM', 'CHN', 'JPN', 'KOR')
ON CONFLICT DO NOTHING;

-- Map non-ASEAN countries into Outside ASEAN region
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id
FROM master_regions r, master_countries c
WHERE r.code = 'OUTSIDE_ASEAN'
  AND c.iso3 NOT IN ('BRN', 'KHM', 'IDN', 'LAO', 'MYS', 'MMR', 'PHL', 'SGP', 'THA', 'TLS', 'VNM')
ON CONFLICT DO NOTHING;

-- Map all countries into Global region
INSERT INTO master_region_countries (region_id, country_id)
SELECT r.id, c.id
FROM master_regions r, master_countries c
WHERE r.code = 'GLOBAL'
ON CONFLICT DO NOTHING;
