-- Additive one-to-many location evidence for a disease event.
-- Legacy disease_events.location_name/geom remain available for existing
-- consumers; this table preserves every explicit location and its role.
CREATE TABLE IF NOT EXISTS disease_event_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    disease_event_id UUID NOT NULL REFERENCES disease_events(id) ON DELETE CASCADE,
    location_ref TEXT NOT NULL,
    location_name TEXT NOT NULL,
    role VARCHAR(12) NOT NULL DEFAULT 'event'
        CHECK (role IN ('event', 'source', 'other')),
    country VARCHAR(100),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    case_count INT,
    death_count INT,
    evidence TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (disease_event_id, location_ref, role)
);

CREATE INDEX IF NOT EXISTS idx_disease_event_locations_event
    ON disease_event_locations(disease_event_id);

CREATE INDEX IF NOT EXISTS idx_disease_event_locations_name
    ON disease_event_locations(location_name);

CREATE INDEX IF NOT EXISTS idx_disease_event_locations_role
    ON disease_event_locations(role);

-- Backfill the legacy primary location once. Secondary locations are not
-- invented from publisher domains or free text at migration time.
INSERT INTO disease_event_locations
    (disease_event_id, location_ref, location_name, role, country,
     latitude, longitude, case_count, death_count, evidence)
SELECT e.id,
       e.location_name,
       e.location_name,
       'event',
       l.country,
       ST_Y(e.geom),
       ST_X(e.geom),
       e.case_count,
       e.death_count,
       NULL
FROM disease_events e
LEFT JOIN locations l ON LOWER(l.name) = LOWER(e.location_name)
WHERE e.location_name IS NOT NULL
ON CONFLICT (disease_event_id, location_ref, role) DO NOTHING;
