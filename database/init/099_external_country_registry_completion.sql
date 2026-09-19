-- Complete the external country context needed by the existing country
-- classifier. These are country-level centroids, not locality coordinates.
INSERT INTO locations (
    name, latitude, longitude, country, country_iso3, admin_level
)
VALUES (
    'Democratic Republic of the Congo', -2.8770, 23.6560,
    'Democratic Republic of the Congo', 'COD', 0
)
ON CONFLICT (name, country) DO NOTHING;

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, 'en', FALSE
FROM locations l
JOIN (VALUES
    ('democratic republic of the congo'),
    ('dr congo'),
    ('rd congo'),
    ('rd kongo'),
    ('congo'),
    ('kongo')
) AS a(alias_name) ON TRUE
WHERE l.name = 'Democratic Republic of the Congo'
  AND l.country = 'Democratic Republic of the Congo'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;
