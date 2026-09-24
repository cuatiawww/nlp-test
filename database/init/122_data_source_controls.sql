-- New data sources stay paused until an operator explicitly enables them.
ALTER TABLE collector_sources
    ALTER COLUMN enabled SET DEFAULT FALSE;

-- Start continuous crawling in an operator-controlled state. Existing source
-- rows can be enabled individually from the Sources UI when testing resumes.
UPDATE collector_sources
   SET enabled = FALSE,
       updated_at = NOW()
 WHERE enabled IS DISTINCT FROM FALSE;
