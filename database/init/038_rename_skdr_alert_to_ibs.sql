-- IBS is the application/database label for the technical /api/Alert endpoint.
-- The API path itself remains /api/Alert.

ALTER TABLE skdr_reports
DROP CONSTRAINT IF EXISTS skdr_reports_endpoint_name_check;

UPDATE skdr_reports
SET endpoint_name='ibs', updated_at=NOW()
WHERE endpoint_name='alert';

ALTER TABLE skdr_reports
ADD CONSTRAINT skdr_reports_endpoint_name_check
CHECK (endpoint_name IN ('ebs', 'ibs'));
