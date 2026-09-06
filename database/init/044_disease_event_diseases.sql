-- Additive one-to-many disease evidence for a disease event.
-- disease_events.disease_classification remains the legacy primary value.
CREATE TABLE IF NOT EXISTS disease_event_diseases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    disease_event_id UUID NOT NULL REFERENCES disease_events(id) ON DELETE CASCADE,
    surface_form TEXT NOT NULL,
    disease_name TEXT NOT NULL,
    role VARCHAR(12) NOT NULL DEFAULT 'mentioned'
        CHECK (role IN ('primary', 'mentioned')),
    icd11_code TEXT,
    confidence DOUBLE PRECISION,
    case_count INT,
    death_count INT,
    evidence TEXT,
    resolution_source VARCHAR(40),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (disease_event_id, disease_name, role)
);

CREATE INDEX IF NOT EXISTS idx_disease_event_diseases_event
    ON disease_event_diseases(disease_event_id);

CREATE INDEX IF NOT EXISTS idx_disease_event_diseases_name
    ON disease_event_diseases(disease_name);

CREATE INDEX IF NOT EXISTS idx_disease_event_diseases_role
    ON disease_event_diseases(role);

-- Backfill explainable mentions already present in the legacy JSONB column.
INSERT INTO disease_event_diseases
    (disease_event_id, surface_form, disease_name, role, icd11_code,
     confidence, case_count, death_count, evidence, resolution_source)
SELECT e.id,
       COALESCE(NULLIF(mention->>'surface_form', ''), mention->>'canonical_name'),
       COALESCE(NULLIF(mention->>'canonical_name', ''), mention->>'surface_form'),
       CASE
           WHEN LOWER(COALESCE(mention->>'role', '')) = 'primary'
             OR LOWER(COALESCE(mention->>'canonical_name', '')) =
                LOWER(COALESCE(e.disease_classification, ''))
             THEN 'primary'
           ELSE 'mentioned'
       END,
       NULLIF(mention->>'icd11_code', ''),
       NULL,
       CASE
           WHEN LOWER(COALESCE(mention->>'role', '')) = 'primary'
             OR LOWER(COALESCE(mention->>'canonical_name', '')) =
                LOWER(COALESCE(e.disease_classification, ''))
             THEN e.case_count
           ELSE NULL
       END,
       CASE
           WHEN LOWER(COALESCE(mention->>'role', '')) = 'primary'
             OR LOWER(COALESCE(mention->>'canonical_name', '')) =
                LOWER(COALESCE(e.disease_classification, ''))
             THEN e.death_count
           ELSE NULL
       END,
       NULLIF(mention->>'evidence', ''),
       NULLIF(mention->>'resolution_source', '')
FROM disease_events e
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(e.disease_mentions) = 'array'
         THEN e.disease_mentions ELSE '[]'::jsonb END
) AS expanded(mention)
WHERE COALESCE(NULLIF(mention->>'canonical_name', ''), mention->>'surface_form') IS NOT NULL
  AND UPPER(COALESCE(NULLIF(mention->>'canonical_name', ''), mention->>'surface_form'))
      NOT IN ('UNKNOWN')
  AND UPPER(COALESCE(NULLIF(mention->>'canonical_name', ''), mention->>'surface_form'))
      NOT LIKE 'NEGATIVE%'
ON CONFLICT (disease_event_id, disease_name, role) DO NOTHING;

-- Keep events created before disease_mentions was introduced representable.
INSERT INTO disease_event_diseases
    (disease_event_id, surface_form, disease_name, role, confidence,
     case_count, death_count, resolution_source)
SELECT e.id,
       e.disease_classification,
       e.disease_classification,
       'primary',
       e.confidence,
       e.case_count,
       e.death_count,
       'legacy_primary'
FROM disease_events e
WHERE e.disease_classification IS NOT NULL
  AND UPPER(e.disease_classification) <> 'UNKNOWN'
  AND UPPER(e.disease_classification) NOT LIKE 'NEGATIVE%'
  AND NOT EXISTS (
      SELECT 1 FROM disease_event_diseases rel
      WHERE rel.disease_event_id = e.id
  )
ON CONFLICT (disease_event_id, disease_name, role) DO NOTHING;
