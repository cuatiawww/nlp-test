CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS raw_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(100) NOT NULL,
    source_name VARCHAR(150),
    published_at DATE,
    original_text TEXT NOT NULL,
    url TEXT,
    object_path TEXT,
    processing_status VARCHAR(30) DEFAULT 'NEW',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disease_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_report_id UUID REFERENCES raw_reports(id) ON DELETE SET NULL,
    source_type VARCHAR(100),
    source_name VARCHAR(150),
    published_at DATE,
    original_text TEXT,
    language VARCHAR(10),
    location_name VARCHAR(150),
    geom GEOMETRY(Point, 4326),
    symptoms JSONB DEFAULT '[]'::jsonb,
    disease_extracted JSONB DEFAULT '[]'::jsonb,
    disease_classification VARCHAR(100),
    case_count INT DEFAULT 1,
    death_count INT DEFAULT 0,
    confidence DOUBLE PRECISION,
    outbreak_alert BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_reports_status ON raw_reports(processing_status);
CREATE INDEX IF NOT EXISTS idx_disease_events_geom ON disease_events USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_disease_events_published_at ON disease_events(published_at);
CREATE INDEX IF NOT EXISTS idx_disease_events_disease ON disease_events(disease_classification);
CREATE INDEX IF NOT EXISTS idx_disease_events_location ON disease_events(location_name);

CREATE OR REPLACE VIEW vw_dashboard_location_summary AS
SELECT
    location_name,
    disease_classification,
    SUM(case_count) AS total_cases,
    SUM(death_count) AS total_deaths,
    MAX(confidence) AS max_confidence,
    BOOL_OR(outbreak_alert) AS has_alert,
    ST_AsGeoJSON(ST_Centroid(ST_Collect(geom)))::json AS centroid_geojson
FROM disease_events
WHERE location_name IS NOT NULL
GROUP BY location_name, disease_classification;
