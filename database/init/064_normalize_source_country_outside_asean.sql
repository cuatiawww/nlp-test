-- Normalize non-ASEAN source scope labels without losing the original value.
-- Existing source configuration remains available under source_country_original.
BEGIN;

UPDATE collector_sources
SET config = jsonb_set(
        jsonb_set(
            COALESCE(config, '{}'::jsonb),
            '{source_country_original}',
            to_jsonb(country),
            true
        ),
        '{country}',
        '"Outside ASEAN"'::jsonb,
        true
    ),
    country = 'Outside ASEAN',
    updated_at = NOW()
WHERE country IS NOT NULL
  AND LOWER(BTRIM(country)) NOT IN (
      'brunei', 'brunei darussalam', 'cambodia', 'indonesia', 'laos',
      'malaysia', 'myanmar', 'philippines', 'singapore', 'thailand',
      'timor-leste', 'timor leste', 'east timor', 'vietnam',
      'asean / asia', 'asean', 'regional', 'outside asean'
  );

COMMIT;
