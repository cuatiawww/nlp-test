-- Disable SKDR collector sources and clean up SKDR data
-- 1. Disable SKDR in collector_sources so background scheduler will not pick it up
UPDATE collector_sources SET enabled = FALSE WHERE source_type = 'skdr_api';

-- 2. Clear skdr_reports table
DELETE FROM skdr_reports;

-- 3. Delete all SKDR records from disease_events and raw_reports
DELETE FROM disease_events WHERE source_type = 'skdr_api';
DELETE FROM raw_reports WHERE source_type = 'skdr_api';
