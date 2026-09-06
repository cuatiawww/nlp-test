-- Accelerate the direct IBS/EBS summary endpoints.
-- Keep payload out of INCLUDE columns: JSONB payloads are relatively large and
-- would make this index unnecessarily expensive to maintain.

CREATE INDEX IF NOT EXISTS idx_skdr_reports_endpoint_year_week
    ON skdr_reports (endpoint_name, report_year, epidemiological_week);

CREATE INDEX IF NOT EXISTS idx_skdr_reports_endpoint_year_date
    ON skdr_reports (endpoint_name, report_year, report_date);

-- Supports province-filtered summaries without requiring a scan of every JSON
-- payload. IBS uses "provinsi" while EBS currently uses "propinsi".
CREATE INDEX IF NOT EXISTS idx_skdr_reports_endpoint_year_province
    ON skdr_reports (
        endpoint_name,
        report_year,
        LOWER(COALESCE(
            NULLIF(payload->>'provinsi', ''),
            NULLIF(payload->>'propinsi', ''),
            NULLIF(payload->>'nama_provinsi', ''),
            NULLIF(payload->>'province', '')
        ))
    );

ANALYZE skdr_reports;
