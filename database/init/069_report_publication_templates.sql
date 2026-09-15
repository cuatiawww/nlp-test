-- Publication families (MMWR bulletin + SitRep primary) and human narrative slots.
-- Structure emulates ASEAN PHE PDF section order; branding is ABVC’s own.

ALTER TABLE report_issues
    ADD COLUMN IF NOT EXISTS narrative JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE report_issues
    ALTER COLUMN template_id SET DEFAULT 'situation_report_v1';

UPDATE report_issues
   SET template_id = 'situation_report_v1'
 WHERE template_id IN ('weekly_sitrep_v1', '');

COMMENT ON COLUMN report_issues.narrative IS
  'Human-reviewed prose slots by template (publisher, editorial, response, recommendations, abstract, methods, discussion, definitions). Never LLM-authored body.';

DROP INDEX IF EXISTS idx_report_issues_one_published_week;

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_issues_one_published_template_week
    ON report_issues (template_id, epi_year, epi_week)
    WHERE status = 'published';

COMMENT ON INDEX idx_report_issues_one_published_template_week IS
  'One live published edition per template family per epi week. A SitRep and an MMWR bulletin may both exist for the same week.';
