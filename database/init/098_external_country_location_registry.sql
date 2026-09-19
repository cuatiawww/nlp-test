-- Keep non-ASEAN country context in the same location master used by the
-- surveillance pipeline.  The coordinates are country centroids for
-- country-level fallback only; they are not presented as a locality.
INSERT INTO locations (
    name, latitude, longitude, country, country_iso3, admin_level
)
VALUES (
    'South Sudan', 6.8770, 31.3070, 'South Sudan', 'SSD', 0
)
ON CONFLICT (name, country) DO NOTHING;

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, 'south sudan', 'en', TRUE
FROM locations l
WHERE l.name = 'South Sudan' AND l.country = 'South Sudan'
ON CONFLICT (location_id, alias_name, language) DO NOTHING;
