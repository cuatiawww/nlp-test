-- Register free environmental APIs used by /nlp/detail-region.
-- Status describes application integration, not a live provider health check.
BEGIN;

UPDATE interoperability_integrations
SET
    status = 'ACTIVE',
    enabled = TRUE,
    endpoint = '/api/v1/region-context',
    integrated_in = '["Detail Region", "Incident / Disaster Detail"]'::jsonb,
    description = 'Live weather, humidity, and precipitation for ASEAN country capitals via the region-context proxy.',
    updated_at = NOW()
WHERE name = 'Open-Meteo Weather API';

UPDATE interoperability_integrations
SET
    status = 'ACTIVE',
    enabled = TRUE,
    endpoint = '/api/v1/region-context',
    integrated_in = '["Detail Region", "Incident / Disaster Detail", "Regional Map"]'::jsonb,
    description = 'CAMS-based PM2.5 / AQI / SO2 for country profiles and environmental map context.',
    updated_at = NOW()
WHERE name = 'Open-Meteo Air Quality API';

UPDATE interoperability_integrations
SET
    status = 'ACTIVE',
    enabled = TRUE,
    integrated_in = '["Detail Region", "Regional Map", "Incident Map"]'::jsonb,
    description = 'Indonesia hazard, hillshade, and population rasters toggled on the OpenLayers regional map.',
    updated_at = NOW()
WHERE name IN ('BNPB InaRISK GIS Layers', 'BNPB InaRISK ArcGIS REST');

INSERT INTO interoperability_integrations
    (name, integration_type, provider, source_url, endpoint, status, integrated_in, description, enabled)
SELECT * FROM (VALUES
    (
        'Open-Meteo Precipitation Forecast', 'API', 'Open-Meteo',
        'https://api.open-meteo.com',
        '/api/v1/region-context', 'ACTIVE',
        '["Detail Region"]'::jsonb,
        'Hourly and daily precipitation for dengue breeding and flood-linked outbreak context.', TRUE
    ),
    (
        'NASA POWER Daily API', 'API', 'NASA Langley (POWER)',
        'https://power.larc.nasa.gov/api',
        '/api/v1/region-context', 'ACTIVE',
        '["Detail Region"]'::jsonb,
        'Satellite-assimilated T2M, RH2M, and PRECTOTCORR climate covariates for the selected capital.', TRUE
    ),
    (
        'USGS Earthquake FDSN Event API', 'API', 'USGS',
        'https://earthquake.usgs.gov/fdsnws/event/1',
        '/api/v1/region-context', 'ACTIVE',
        '["Detail Region", "Regional Map"]'::jsonb,
        'Recent M4.5+ earthquakes inside the country bounding box, drawn as map hazard pins.', TRUE
    ),
    (
        'GDACS Multi-hazard API', 'API', 'UN OCHA / EC JRC GDACS',
        'https://www.gdacs.org/gdacsapi',
        '/api/v1/region-context', 'ACTIVE',
        '["Detail Region", "Regional Map"]'::jsonb,
        'Earthquake, flood, cyclone, and volcano alerts filtered to the selected ASEAN country.', TRUE
    ),
    (
        'BNPB InaRISK ArcGIS REST', 'GIS API', 'BNPB',
        'https://gis.bnpb.go.id/server/rest/services',
        'ArcGIS ImageServer layers on the regional map', 'ACTIVE',
        '["Detail Region", "Regional Map"]'::jsonb,
        'Indonesia-only flood, earthquake, landslide, and forest-fire hazard rasters.', TRUE
    )
) AS seed(name, integration_type, provider, source_url, endpoint, status, integrated_in, description, enabled)
WHERE NOT EXISTS (
    SELECT 1 FROM interoperability_integrations existing WHERE existing.name = seed.name
);

COMMIT;
