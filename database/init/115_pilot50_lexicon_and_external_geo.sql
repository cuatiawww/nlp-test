-- Pilot-50 residual lexicon + external country geography (idempotent).
-- Numbered 115: leave 114 reserved for fine-tuned label sync on local harden.
-- Seeds nlp_keywords / disease_aliases for meningococcus residuals and
-- registers Colombia / Panama / Jordan / Yemen / Sudan / Brazil (and peers)
-- in locations + location_aliases so COUNTRY_ALIASES can load them from DB.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Disease lexicon residuals (meningococcus family)
-- ---------------------------------------------------------------------------
INSERT INTO nlp_keywords (category, keyword, target_label, is_active, priority, updated_at)
VALUES
    ('disease', 'meningococcus', 'Meningococcal disease', TRUE, 20, NOW()),
    ('disease', 'meningococcal', 'Meningococcal disease', TRUE, 20, NOW()),
    ('disease', 'meningokokus', 'Meningococcal disease', TRUE, 20, NOW()),
    ('disease', 'neisseria meningitidis', 'Meningococcal disease', TRUE, 15, NOW()),
    ('disease', 'n. meningitidis', 'Meningococcal disease', TRUE, 25, NOW()),
    ('disease', 'meningitis meningokokus', 'Meningococcal disease', TRUE, 15, NOW()),
    ('disease', 'penyakit meningokokus', 'Meningococcal disease', TRUE, 15, NOW()),
    ('disease', 'bệnh viêm màng não mô cầu', 'Meningococcal disease', TRUE, 20, NOW()),
    ('disease', 'viêm màng não mô cầu', 'Meningococcal disease', TRUE, 20, NOW()),
    ('disease', 'não mô cầu', 'Meningococcal disease', TRUE, 30, NOW())
ON CONFLICT (category, keyword) DO UPDATE SET
    target_label = EXCLUDED.target_label,
    is_active = TRUE,
    priority = LEAST(nlp_keywords.priority, EXCLUDED.priority),
    updated_at = NOW();

INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT c.id, a.alias, lower(a.alias), a.lang, 'pilot50_residual', 1.0, TRUE
FROM disease_concepts c
JOIN (VALUES
    ('meningococcus', 'en'),
    ('meningococcal', 'en'),
    ('meningokokus', 'id'),
    ('neisseria meningitidis', 'en'),
    ('n. meningitidis', 'en'),
    ('viêm màng não mô cầu', 'vi'),
    ('não mô cầu', 'vi')
) AS a(alias, lang) ON TRUE
WHERE lower(c.canonical_name) IN ('meningitis', 'meningococcal disease')
ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
    alias = EXCLUDED.alias,
    source = EXCLUDED.source,
    confidence = EXCLUDED.confidence,
    is_active = TRUE,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 2) External country centroids (admin_level 0) for geo resolution
-- ---------------------------------------------------------------------------
INSERT INTO locations (name, latitude, longitude, country, country_iso3, admin_level)
VALUES
    ('Yemen', 15.5527, 48.5164, 'Yemen', 'YEM', 0),
    ('Colombia', 4.5709, -74.2973, 'Colombia', 'COL', 0),
    ('Panama', 8.5379, -80.7821, 'Panama', 'PAN', 0),
    ('Jordan', 30.5852, 36.2384, 'Jordan', 'JOR', 0),
    ('Sudan', 12.8628, 30.2176, 'Sudan', 'SDN', 0),
    ('Brazil', -14.2350, -51.9253, 'Brazil', 'BRA', 0),
    ('Burundi', -3.3731, 29.9189, 'Burundi', 'BDI', 0),
    ('Ethiopia', 9.1450, 40.4897, 'Ethiopia', 'ETH', 0),
    ('Kenya', -0.0236, 37.9062, 'Kenya', 'KEN', 0),
    ('Costa Rica', 9.7489, -83.7534, 'Costa Rica', 'CRI', 0)
ON CONFLICT (name, country) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Country aliases (including local-script / ID spellings)
-- ---------------------------------------------------------------------------
WITH aliases(alias_name, canonical_name, language) AS (
    VALUES
    ('yemen', 'Yemen', 'en'),
    ('yaman', 'Yemen', 'id'),
    ('colombia', 'Colombia', 'en'),
    ('kolombia', 'Colombia', 'id'),
    ('panama', 'Panama', 'en'),
    ('panamá', 'Panama', 'es'),
    ('jordan', 'Jordan', 'en'),
    ('yordania', 'Jordan', 'id'),
    ('sudan', 'Sudan', 'en'),
    ('brazil', 'Brazil', 'en'),
    ('brasil', 'Brazil', 'id'),
    ('burundi', 'Burundi', 'en'),
    ('ethiopia', 'Ethiopia', 'en'),
    ('etiopia', 'Ethiopia', 'id'),
    ('kenya', 'Kenya', 'en'),
    ('costa rica', 'Costa Rica', 'en')
)
INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, a.language, FALSE
FROM aliases a
JOIN locations l
  ON LOWER(l.name) = LOWER(a.canonical_name)
 AND LOWER(l.country) = LOWER(a.canonical_name)
ON CONFLICT (location_id, alias_name, language) DO NOTHING;

COMMIT;
