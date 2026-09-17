-- Crawl History / Matriks Hasil Crawl
-- Grants the dedicated module to the same roles as Manual Crawler and adds
-- indexes for paginated history reads. Does not invent seed/dummy rows.

UPDATE user_roles
SET permissions = permissions || '["crawl_history"]'::jsonb,
    updated_at = NOW()
WHERE id IN ('data_analyst', 'epidemiologi', 'skk')
  AND NOT (permissions ? 'crawl_history')
  AND NOT (permissions ? '*');

UPDATE users
SET permissions = permissions || '["crawl_history"]'::jsonb
WHERE LOWER(role) IN ('data_analyst', 'epidemiologi', 'skk', 'operator')
  AND NOT (permissions ? 'crawl_history')
  AND NOT (permissions ? '*');

CREATE INDEX IF NOT EXISTS idx_crawl_matrix_jobs_created
    ON crawl_matrix_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_matrix_jobs_country
    ON crawl_matrix_jobs (country);

CREATE INDEX IF NOT EXISTS idx_crawl_matrix_rows_created
    ON crawl_matrix_rows (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_matrix_rows_country_disease
    ON crawl_matrix_rows (country, disease_name);

CREATE INDEX IF NOT EXISTS idx_crawl_matrix_rows_status
    ON crawl_matrix_rows (processing_status);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_event
    ON analysis_jobs (event_id)
    WHERE event_id IS NOT NULL;
