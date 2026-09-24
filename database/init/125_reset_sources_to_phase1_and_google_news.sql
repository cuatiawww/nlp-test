-- Keep only the Phase 1 master catalog and Google News collector sources.
-- The Phase 1 URL set is the catalog seeded by 065_seed_abvc_master_sources.sql
-- and matches docs/abvc-master-source-catalog-deduped.csv.
-- This migration intentionally removes source rows outside that whitelist.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM collector_sources
        WHERE config->>'source_catalog' = 'ABVC Master Source'
    ) THEN
        RAISE EXCEPTION
            'Phase 1 source catalog is missing; refusing to delete collector sources';
    END IF;
END
$$;

DELETE FROM collector_sources
WHERE config->>'source_catalog' IS DISTINCT FROM 'ABVC Master Source'
  AND COALESCE(config->>'url', '') !~* '^https?://(www\.)?news\.google\.com(/|$)';

COMMIT;
