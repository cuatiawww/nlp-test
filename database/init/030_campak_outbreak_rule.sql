-- Migration 030: Add Campak outbreak rule and normalize keyword mapping
INSERT INTO disease_outbreak_rules (disease_name, display_label, min_case_count, priority, is_active)
VALUES ('CAMPAK', 'Campak', 10, 15, TRUE)
ON CONFLICT (disease_name) DO UPDATE SET display_label = 'Campak', is_active = TRUE;

INSERT INTO nlp_keywords (category, keyword, target_label, priority)
VALUES 
    ('disease', 'campak', 'Campak', 17),
    ('disease', 'measles', 'Campak', 18)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = 'Campak';
