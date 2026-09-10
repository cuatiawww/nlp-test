-- Filtered article crawling and factual surveillance matrix.
-- This is intentionally separate from legacy alert/severity fields so the
-- new workflow can be reprocessed without changing historical events.
CREATE TABLE IF NOT EXISTS crawl_matrix_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','processing','completed','partial','failed')),
    disease_concept_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    disease_names JSONB NOT NULL DEFAULT '[]'::jsonb,
    region TEXT,
    country TEXT,
    province_city TEXT,
    date_from DATE,
    date_to DATE,
    max_articles INTEGER NOT NULL DEFAULT 20,
    query JSONB NOT NULL DEFAULT '{}'::jsonb,
    discovered_count INTEGER NOT NULL DEFAULT 0,
    processed_count INTEGER NOT NULL DEFAULT 0,
    row_count INTEGER NOT NULL DEFAULT 0,
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crawl_matrix_jobs_status
    ON crawl_matrix_jobs(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS crawl_matrix_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crawl_job_id UUID NOT NULL REFERENCES crawl_matrix_jobs(id) ON DELETE CASCADE,
    raw_report_id UUID REFERENCES raw_reports(id) ON DELETE SET NULL,
    disease_concept_id UUID REFERENCES disease_concepts(id) ON DELETE SET NULL,
    disease_name TEXT NOT NULL,
    icd11_code TEXT,
    crawling_date DATE NOT NULL DEFAULT CURRENT_DATE,
    region TEXT,
    country TEXT NOT NULL,
    province_city_case TEXT,
    article_date DATE,
    date_case TEXT,
    number_of_cases BIGINT NOT NULL DEFAULT 0,
    number_of_deaths BIGINT NOT NULL DEFAULT 0,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    source_type TEXT,
    source_name TEXT,
    source_url TEXT,
    article_title TEXT,
    evidence TEXT,
    confidence DOUBLE PRECISION,
    processing_status VARCHAR(20) NOT NULL DEFAULT 'processed'
        CHECK (processing_status IN ('processed','needs_review','failed')),
    reprocessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_matrix_rows_job
    ON crawl_matrix_rows(crawl_job_id, country, disease_name);
CREATE INDEX IF NOT EXISTS idx_crawl_matrix_rows_raw
    ON crawl_matrix_rows(raw_report_id);
