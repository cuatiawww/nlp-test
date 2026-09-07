-- Text fields in the legacy schema were declared with VARCHAR limits. NLP
-- output contains multilingual names, labels, and source metadata, so a
-- fixed character limit is not useful and can poison the RabbitMQ queue.
-- Convert every VARCHAR column in the application schema to TEXT while
-- preserving the existing values, indexes, and constraints.
-- The legacy dashboard view depends on two of these columns, so recreate it
-- around the type changes within the same transaction.
DROP VIEW IF EXISTS public.vw_dashboard_location_summary;

DO $$
DECLARE
    column_record RECORD;
BEGIN
    FOR column_record IN
        SELECT
            ns.nspname AS schema_name,
            cls.relname AS table_name,
            attr.attname AS column_name
        FROM pg_catalog.pg_attribute AS attr
        JOIN pg_catalog.pg_class AS cls
          ON cls.oid = attr.attrelid
        JOIN pg_catalog.pg_namespace AS ns
          ON ns.oid = cls.relnamespace
        JOIN pg_catalog.pg_type AS typ
          ON typ.oid = attr.atttypid
        WHERE ns.nspname = 'public'
          AND cls.relkind IN ('r', 'p')
          AND attr.attnum > 0
          AND NOT attr.attisdropped
          AND typ.typname = 'varchar'
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN %I TYPE TEXT',
            column_record.schema_name,
            column_record.table_name,
            column_record.column_name
        );
    END LOOP;
END $$;

CREATE VIEW public.vw_dashboard_location_summary AS
SELECT
    location_name,
    disease_classification,
    SUM(case_count) AS total_cases,
    SUM(death_count) AS total_deaths,
    MAX(confidence) AS max_confidence,
    BOOL_OR(outbreak_alert) AS has_alert,
    ST_AsGeoJSON(ST_Centroid(ST_Collect(geom)))::json AS centroid_geojson
FROM disease_events
WHERE location_name IS NOT NULL
GROUP BY location_name, disease_classification;
