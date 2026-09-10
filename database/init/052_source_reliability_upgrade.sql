-- Upgrade existing installations from generic source defaults to the
-- surveillance source baseline. Domain-level matching is handled in the NLP
-- service; this table remains the fallback for records without a URL/name.
UPDATE source_credibility
SET score = CASE LOWER(source_type)
    WHEN 'government' THEN 0.95
    WHEN 'who' THEN 0.98
    WHEN 'cdc' THEN 0.97
    WHEN 'hospital' THEN 0.90
    WHEN 'research' THEN 0.88
    WHEN 'news' THEN 0.84
    WHEN 'rss' THEN 0.78
    WHEN 'web' THEN 0.65
    WHEN 'social_media' THEN 0.35
    WHEN 'csv' THEN 0.60
    WHEN 'api' THEN 0.70
    ELSE score
END,
updated_at = NOW()
WHERE is_active = TRUE;
