-- Versioned epidemiological sitrep issues for the reports CMS.
-- Numbers come from kpi_snapshots + the same ASEAN-11 event aggregates as the dashboard.
-- Prose fields (highlights, analyst notes) are human-edited; LLM is never the body.

CREATE TABLE IF NOT EXISTS report_issues (
    id              SERIAL PRIMARY KEY,
    slug            TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    epi_year        INTEGER NOT NULL,
    epi_week        INTEGER NOT NULL CHECK (epi_week BETWEEN 1 AND 53),
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN (
                        'draft',
                        'in_review',
                        'changes_requested',
                        'approved',
                        'published',
                        'superseded',
                        'archived'
                    )),
    template_id     TEXT NOT NULL DEFAULT 'weekly_sitrep_v1',
    template_version TEXT NOT NULL DEFAULT '1.0.0',
    cover_url       TEXT,
    highlights      JSONB NOT NULL DEFAULT '[]'::jsonb,
    sections        JSONB NOT NULL DEFAULT '[]'::jsonb,
    kpi_snapshot    JSONB,
    published_snapshot JSONB,
    map_meta        JSONB NOT NULL DEFAULT jsonb_build_object(
        'indicator', 'events',
        'classification', 'quantile',
        'geojson_ref', 'asean11_admin0_iso3',
        'missing_policy', 'no_data_not_zero'
    ),
    sources         JSONB NOT NULL DEFAULT '[]'::jsonb,
    limitations     TEXT,
    visibility      TEXT NOT NULL DEFAULT 'public'
                    CHECK (visibility IN ('public', 'internal')),
    created_by      TEXT,
    updated_by      TEXT,
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_issues_status_published
    ON report_issues (status, published_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_report_issues_epi
    ON report_issues (epi_year DESC, epi_week DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_issues_one_published_week
    ON report_issues (epi_year, epi_week)
    WHERE status = 'published';

CREATE TABLE IF NOT EXISTS report_issue_events (
    id          SERIAL PRIMARY KEY,
    issue_id    INTEGER NOT NULL REFERENCES report_issues(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status   TEXT NOT NULL,
    actor       TEXT,
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_issue_events_issue
    ON report_issue_events (issue_id, created_at DESC);

COMMENT ON TABLE report_issues IS
  'Editorial sitrep issues. KPI JSON is pulled from materialized_kpi_snapshot + ASEAN-11 aggregates. Highlights/notes are human-reviewed. published_snapshot is frozen on publish.';

COMMENT ON COLUMN report_issues.published_snapshot IS
  'Immutable KPI/event package copied from kpi_snapshot at publish time. Public pages read this, never live recomputation.';

COMMENT ON COLUMN report_issues.map_meta IS
  'Choropleth join is ISO 3166-1 alpha-3. Missing AMS must render as No data / Not reported, never as zero.';
