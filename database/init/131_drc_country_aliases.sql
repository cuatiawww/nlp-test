-- Local names for the Democratic Republic of the Congo so "RD Kongo" and "RDC"
-- resolve to the country already stored in locations / master_countries.
INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, a.language, FALSE
FROM locations l
JOIN (VALUES
    ('rd kongo', 'id'),
    ('r.d. kongo', 'id'),
    ('rd. kongo', 'id'),
    ('dr kongo', 'id'),
    ('republik demokratik kongo', 'id'),
    ('republik demokratik congo', 'id'),
    ('drc', 'en'),
    ('rdc', 'fr'),
    ('congo kinshasa', 'en'),
    ('congo-kinshasa', 'en'),
    ('republique democratique du congo', 'fr')
) AS a(alias_name, language) ON TRUE
WHERE l.name = 'Democratic Republic of the Congo'
  AND l.country = 'Democratic Republic of the Congo'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;
