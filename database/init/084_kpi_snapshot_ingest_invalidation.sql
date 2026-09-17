-- Mark KPI snapshots stale whenever disease_events change.
-- Continuous crawl and async analyze-url write events from worker-python and
-- never hit the Rust ingest/analyze-url handlers that previously called
-- mark_kpi_snapshots_stale. Readers then kept serving a days-old row with
-- is_stale=false (Mapped Locations stuck, cases/deaths frozen) while the
-- live crawl card kept rising.
--
-- Statement-level trigger covers bulk ingest, URL analysis, manual crawl
-- dashboard persistence, re-analysis, and deletes. Workers may also UPDATE
-- kpi_snapshots directly; that is idempotent.

CREATE OR REPLACE FUNCTION abvc_mark_kpi_snapshots_stale() RETURNS trigger AS $$
BEGIN
  UPDATE kpi_snapshots SET is_stale = TRUE WHERE is_stale = FALSE;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION abvc_mark_kpi_snapshots_stale() IS
  'Marks every kpi_snapshots row stale so the next dashboard reader recomputes under the advisory lock.';

DROP TRIGGER IF EXISTS trg_disease_events_mark_kpi_stale ON disease_events;
CREATE TRIGGER trg_disease_events_mark_kpi_stale
  AFTER INSERT OR UPDATE OR DELETE ON disease_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION abvc_mark_kpi_snapshots_stale();

COMMENT ON TRIGGER trg_disease_events_mark_kpi_stale ON disease_events IS
  'Invalidate materialized KPI snapshots on ingest so Mapped Locations / cases / deaths cannot freeze while crawl totals keep moving.';
