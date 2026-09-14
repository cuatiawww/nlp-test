-- Baseline catalog derived from integrations currently present in the codebase.
-- Status describes application integration, not a live provider health check.
BEGIN;

INSERT INTO interoperability_integrations
    (name, integration_type, provider, source_url, endpoint, status, integrated_in, description, enabled)
SELECT * FROM (VALUES
    (
        'Google News RSS Discovery', 'RSS', 'Google News',
        'https://news.google.com/rss/search?q={query}&hl=en&gl=US&ceid=US:en',
        'Manual Crawler and Continuous Crawler discovery', 'ACTIVE',
        '["Manual Crawler", "Continuous Crawler"]'::jsonb,
        'Query-based RSS discovery used to find surveillance articles.', TRUE
    ),
    (
        'Configured RSS Feed Sources', 'RSS', 'Configured external news providers',
        NULL, '/api/v1/sources', 'ACTIVE',
        '["Data Sources", "Continuous Crawler"]'::jsonb,
        'RSS feeds registered by administrators in the data source catalog.', TRUE
    ),
    (
        'geoBoundaries Boundary API', 'API', 'geoBoundaries',
        'https://www.geoboundaries.org/api/current/gbOpen/{country}/{level}/',
        '/boundaries?country={ISO3}&level={level}', 'ACTIVE',
        '["Country Map", "Regional Map"]'::jsonb,
        'Country and administrative boundary geometry for non-Indonesia map views.', TRUE
    ),
    (
        'BNPB InaRISK GIS Layers', 'GIS API', 'BNPB',
        'https://gis.bnpb.go.id/server/rest/services',
        'ArcGIS MapServer and ImageServer layers', 'ACTIVE',
        '["Regional Map", "Incident Map"]'::jsonb,
        'Hazard, basemap, and population GIS layers used by map components.', TRUE
    ),
    (
        'GFS Wind Data API', 'API', 'SIPONGI Opsroom',
        'https://opsroom.sipongidata.my.id/api/gfs',
        '/api/gfs', 'ACTIVE',
        '["Regional Map", "Wind Layer"]'::jsonb,
        'Wind field data proxy used by the map wind visualization.', TRUE
    ),
    (
        'Open-Meteo Weather API', 'API', 'Open-Meteo',
        'https://api.open-meteo.com/v1/forecast',
        'Forecast and archive weather endpoints', 'IN_PROGRESS',
        '["Incident / Disaster Detail"]'::jsonb,
        'Implemented in the legacy incident detail flow; not used by the regional surveillance template.', TRUE
    ),
    (
        'Open-Meteo Air Quality API', 'API', 'Open-Meteo',
        'https://air-quality-api.open-meteo.com/v1/air-quality',
        '/v1/air-quality', 'IN_PROGRESS',
        '["Incident / Disaster Detail"]'::jsonb,
        'Implemented for incident environmental context; outside the regional surveillance data scope.', TRUE
    ),
    (
        'Nominatim Geocoder', 'API', 'OpenStreetMap',
        'https://nominatim.openstreetmap.org/search',
        '/search', 'IN_PROGRESS',
        '["NLP Location Resolution"]'::jsonb,
        'Optional geocoding fallback when the internal location gazetteer does not resolve a place.', TRUE
    ),
    (
        'WHO ICD-11 API', 'API', 'World Health Organization',
        'https://id.who.int',
        '/icd/release/{release}/search', 'IN_PROGRESS',
        '["NLP Disease Standardization", "Disease Master"]'::jsonb,
        'Used by ICD-11 synchronization and disease concept standardization; credentials are environment-managed.', TRUE
    ),
    (
        'SKDR Official API', 'API', 'Ministry of Health SKDR',
        'https://skdr.kemkes.go.id',
        'SKDR IBS and EBS endpoints', 'INACTIVE',
        '["IBS / EBS Dashboard", "SKDR Synchronization"]'::jsonb,
        'Integration code exists, but scheduled SKDR collection is currently disabled.', FALSE
    ),
    (
        'OpenAI API', 'API', 'OpenAI',
        'https://api.openai.com/v1',
        '/chat/completions', 'IN_PROGRESS',
        '["NLP Summary Agent", "NLP Pipeline"]'::jsonb,
        'Optional LLM provider selected only when the corresponding environment credentials are configured.', TRUE
    ),
    (
        'DeepSeek API', 'API', 'DeepSeek',
        'https://api.deepseek.com/v1',
        '/chat/completions', 'IN_PROGRESS',
        '["NLP Summary Agent", "ICD-11 Synchronization"]'::jsonb,
        'Optional LLM provider used for configured NLP agent or synchronization tasks.', TRUE
    ),
    (
        'OSRM Routing API', 'API', 'Project OSRM',
        'https://router.project-osrm.org',
        '/route/v1/driving', 'ACTIVE',
        '["Incident Map", "Route Planning"]'::jsonb,
        'Public routing service used for incident map route visualization.', TRUE
    )
) AS seed(name, integration_type, provider, source_url, endpoint, status, integrated_in, description, enabled)
WHERE NOT EXISTS (
    SELECT 1 FROM interoperability_integrations existing WHERE existing.name = seed.name
);

COMMIT;
