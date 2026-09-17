-- Crawl History ledger: paginated newest-first reads for surveillance / review / noise.
-- Partial indexes match the quality predicates in services/backend-rust/src/crawl_history.rs.
-- Does not invent rows.

CREATE INDEX IF NOT EXISTS idx_disease_events_crawl_history_surveillance_created
    ON disease_events (created_at DESC)
    WHERE is_health_related = TRUE
      AND disease_classification IS NOT NULL
      AND UPPER(disease_classification) <> 'UNKNOWN'
      AND UPPER(disease_classification) NOT LIKE 'NEGATIVE%'
      AND COALESCE(confidence, 0) >= 0.15
      AND LOWER(COALESCE(source_type, '')) NOT IN ('test', 'skdr', 'skdr_api');

CREATE INDEX IF NOT EXISTS idx_disease_events_crawl_history_review_created
    ON disease_events (created_at DESC)
    WHERE is_health_related = TRUE
      AND UPPER(BTRIM(COALESCE(disease_classification, ''))) NOT LIKE 'NEGATIVE%'
      AND (
            disease_classification IS NULL
            OR UPPER(BTRIM(disease_classification)) IN ('UNKNOWN', '')
            OR COALESCE(confidence, 0) < 0.15
          );

CREATE INDEX IF NOT EXISTS idx_disease_events_crawl_history_noise_created
    ON disease_events (created_at DESC)
    WHERE COALESCE(is_health_related, FALSE) IS NOT TRUE
       OR UPPER(BTRIM(COALESCE(disease_classification, ''))) LIKE 'NEGATIVE%';

CREATE INDEX IF NOT EXISTS idx_crawl_matrix_rows_crawling_created
    ON crawl_matrix_rows (crawling_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_disease_events_source_name_lower
    ON disease_events (LOWER(source_name))
    WHERE source_name IS NOT NULL;
