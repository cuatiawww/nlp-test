-- Multi-disease SitRep / MMWR drafts: selected diseases, section order, cover/pages.
-- Numbers still come from kpi_snapshots + ASEAN-11 event aggregates; these columns
-- only store analyst choices and uploaded assets.

ALTER TABLE report_issues
    ADD COLUMN IF NOT EXISTS selected_diseases JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE report_issues
    ADD COLUMN IF NOT EXISTS section_order JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE report_issues
    ADD COLUMN IF NOT EXISTS assets JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN report_issues.selected_diseases IS
  'Analyst multi-select [{disease_code, name}]. Empty means fallback to top diseases by cases in the window.';

COMMENT ON COLUMN report_issues.section_order IS
  'Ordered [{id, label}] including cover, toc, glance, matrix, map, chapter:<code>, sources, extra:<id>.';

COMMENT ON COLUMN report_issues.assets IS
  'Uploaded cover and optional interstitial pages: {cover_url, pages:[{id,url,caption}]}.';
