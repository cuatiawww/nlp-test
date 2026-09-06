-- Non-destructive rollback: disable ANALYZE_URL_ASYNC_ENABLED on backend and
-- stop analysis-job worker. Keep jobs/results for audit; do not delete old data.
BEGIN;
UPDATE analysis_jobs SET status='failed', error='Async analysis disabled by operator',
 updated_at=NOW() WHERE status='queued';
COMMIT;
