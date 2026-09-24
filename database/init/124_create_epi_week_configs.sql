-- Migration 124: Create table for epidemiological week configurations, notes, and surveillance alert levels
CREATE TABLE IF NOT EXISTS epi_week_configs (
    id SERIAL PRIMARY KEY,
    epi_year INTEGER NOT NULL,
    epi_week INTEGER NOT NULL CHECK (epi_week BETWEEN 1 AND 53),
    title VARCHAR(255),
    alert_level VARCHAR(50) DEFAULT 'normal', -- 'normal', 'watch', 'alert', 'epidemic'
    primary_disease VARCHAR(255),
    notes TEXT,
    surveillance_status VARCHAR(50) DEFAULT 'active', -- 'active', 'archived', 'planned'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_epi_year_week UNIQUE (epi_year, epi_week)
);

CREATE INDEX IF NOT EXISTS idx_epi_week_configs_year_week ON epi_week_configs(epi_year, epi_week);
