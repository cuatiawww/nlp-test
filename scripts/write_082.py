import os
sql = """-- Register external map layer APIs used by the Spatial Outbreak Map.
-- Status describes application integration, not a live provider health check.
BEGIN;

INSERT INTO interoperability_integrations
    (name, integration_type, provider, source_url, endpoint, status, integrated_in, description, enabled)
SELECT * FROM (VALUES
    (
        'iNaturalist Vector Sightings API', 'API', 'iNaturalist',
        'https://api.inaturalist.org/v1',
        '/api/v1/map-layers/vectors', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'Community Aedes mosquito observation data supporting local vector risk assessment across ASEAN.', TRUE
    ),
    (
        'OpenSky Network Live Flights API', 'API', 'OpenSky Network',
        'https://opensky-network.org/api',
        '/api/v1/map-layers/flights', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'Real-time air traffic state vectors in ASEAN airspace as imported case connectivity proxy.', TRUE
    ),
    (
        'NASA FIRMS Active Fire API', 'API', 'NASA LANCE FIRMS',
        'https://firms.modaps.eosdis.nasa.gov/api',
        '/api/v1/map-layers/fires', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'VIIRS/MODIS active fire and thermal anomaly hotspots for wildfire/peat smoke ISPA correlation.', TRUE
    ),
    (
        'Healthsites.io Facilities API', 'API', 'Healthsites / OpenStreetMap',
        'https://healthsites.io/api/v3',
        '/api/v1/map-layers/facilities', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'OSM-derived health facility locations for surge capacity and access analysis.', TRUE
    ),
    (
        'GDELT DOC 2.0 Disease News API', 'API', 'GDELT Project',
        'https://api.gdeltproject.org/api/v2/doc',
        '/api/v1/map-layers/news', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'Global news article search for dengue/cholera/influenza media volume and situational awareness.', TRUE
    ),
    (
        'WorldPop Population REST API', 'API', 'WorldPop / University of Southampton',
        'https://hub.worldpop.org/rest/data',
        '/api/v1/map-layers/population', 'ACTIVE',
        '["Regional Map", "Detail Region"]'::jsonb,
        'Population denominators and density metadata for incidence rate calculation per ASEAN country.', TRUE
    ),
    (
        'NASA GIBS VIIRS True Color WMTS', 'WMTS', 'NASA Earthdata GIBS',
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
        'WMTS tile layer (browser-direct)', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'VIIRS SNPP corrected reflectance true color satellite imagery overlay on the map.', TRUE
    ),
    (
        'NASA GIBS MODIS Terra True Color WMTS', 'WMTS', 'NASA Earthdata GIBS',
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
        'WMTS tile layer (browser-direct)', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'MODIS Terra corrected reflectance true color satellite imagery overlay on the map.', TRUE
    ),
    (
        'NASA GIBS Aerosol Optical Depth WMTS', 'WMTS', 'NASA Earthdata GIBS',
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
        'WMTS tile layer (browser-direct)', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'OMPS aerosol index overlay for smoke/haze situational awareness and ISPA correlation.', TRUE
    ),
    (
        'NASA GIBS NDVI Vegetation WMTS', 'WMTS', 'NASA Earthdata GIBS',
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
        'WMTS tile layer (browser-direct)', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'MODIS 8-day NDVI vegetation index overlay for breeding ground and environmental analysis.', TRUE
    ),
    (
        'NASA GIBS Night Lights WMTS', 'WMTS', 'NASA Earthdata GIBS',
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
        'WMTS tile layer (browser-direct)', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'VIIRS Black Marble nighttime lights overlay for urban/rural population context.', TRUE
    ),
    (
        'NASA GIBS Land Surface Temperature WMTS', 'WMTS', 'NASA Earthdata GIBS',
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
        'WMTS tile layer (browser-direct)', 'ACTIVE',
        '["Regional Map", "Spatial Surveillance"]'::jsonb,
        'MODIS daytime land surface temperature overlay for disease vector habitat correlation.', TRUE
    )
) AS seed(name, integration_type, provider, source_url, endpoint, status, integrated_in, description, enabled)
WHERE NOT EXISTS (
    SELECT 1 FROM interoperability_integrations existing WHERE existing.name = seed.name
);

COMMIT;
"""
target = '/home/aspire_5/app/NLP-PENYAKIT/database/init/082_external_layers_interoperability.sql'
with open(target, 'w') as f:
    f.write(sql)
print(f'Wrote {os.path.getsize(target)} bytes to {target}')
