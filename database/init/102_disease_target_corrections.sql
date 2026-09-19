-- Keep reviewed surface forms on the canonical surveillance concept used by
-- event intelligence, instead of the legacy display abbreviation DBD.
UPDATE nlp_keywords
SET target_label = 'Dengue',
    is_active = TRUE,
    updated_at = NOW()
WHERE category = 'disease'
  AND keyword IN ('dengue', 'dengue fever');
