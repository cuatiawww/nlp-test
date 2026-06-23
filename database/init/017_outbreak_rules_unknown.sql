INSERT INTO disease_outbreak_rules (disease_name, display_label, min_case_count, priority, is_active)
VALUES ('UNKNOWN', 'Unknown Disease (fallback)', 100, 0, TRUE)
ON CONFLICT (disease_name) DO UPDATE SET min_case_count = 100, display_label = 'Unknown Disease (fallback)', is_active = TRUE
WHERE disease_outbreak_rules.disease_name = 'UNKNOWN';
