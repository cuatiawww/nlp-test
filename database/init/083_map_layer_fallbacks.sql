-- Register dashboard-wide hazard and environment map-layer proxies.
-- Status describes application integration, not a live provider health check.
INSERT INTO interoperability_integrations
    (name, integration_type, provider, source_url, endpoint, status, integrated_in, description, enabled)
SELECT * FROM (VALUES
    (
        'USGS + GDACS ASEAN Map Hazards', 'API', 'USGS / GDACS',
        'https://earthquake.usgs.gov/fdsnws/event/1',
        '/api/v1/map-layers/hazards', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance", "Detail Region"]'::jsonb,
        'ASEAN-envelope M4.5+ earthquakes and GDACS EQ/flood/cyclone/volcano alerts for dashboard map pins.', TRUE
    ),
    (
        'Open-Meteo ASEAN Capital Environment', 'API', 'Open-Meteo / CAMS',
        'https://api.open-meteo.com',
        '/api/v1/map-layers/environment', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'Current weather and air quality at ASEAN capitals for map environment markers.', TRUE
    ),
    (
        'OSM Overpass Health Facilities Fallback', 'API', 'OpenStreetMap Overpass',
        'https://overpass-api.de/api',
        '/api/v1/map-layers/facilities', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'Keyless OSM hospital/clinic fallback when HEALTHSITES_API_KEY is not configured.', TRUE
    ),
    (
        'NASA FIRMS Public SE Asia CSV Fallback', 'API', 'NASA LANCE FIRMS',
        'https://firms.modaps.eosdis.nasa.gov/data/active_fire',
        '/api/v1/map-layers/fires', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'Public VIIRS Southeast Asia 24h CSV used when NASA_FIRMS_MAP_KEY is absent.', TRUE
    ),
    (
        'WHO News RSS Fallback', 'RSS', 'World Health Organization',
        'https://www.who.int/rss-feeds/news-english.xml',
        '/api/v1/map-layers/news', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'WHO English news RSS used when GDELT Doc 2.0 is throttled or returns non-JSON.', TRUE
    )
) AS seed(name, integration_type, provider, source_url, endpoint, status, integrated_in, description, enabled)
WHERE NOT EXISTS (
    SELECT 1 FROM interoperability_integrations existing WHERE existing.name = seed.name
);

UPDATE interoperability_integrations
SET
    description = 'VIIRS/MODIS active fire hotspots. Uses NASA_FIRMS_MAP_KEY when set, otherwise the public SE Asia 24h CSV.',
    updated_at = NOW()
WHERE name = 'NASA FIRMS Active Fire API';

UPDATE interoperability_integrations
SET
    description = 'OSM-derived health facility locations. Uses HEALTHSITES_API_KEY when set, otherwise Overpass hospital/clinic nodes.',
    updated_at = NOW()
WHERE name = 'Healthsites.io Facilities API';

UPDATE interoperability_integrations
SET
    description = 'Global disease media search via GDELT Doc 2.0 with WHO News RSS fallback when GDELT is unavailable.',
    updated_at = NOW()
WHERE name = 'GDELT DOC 2.0 Disease News API';
