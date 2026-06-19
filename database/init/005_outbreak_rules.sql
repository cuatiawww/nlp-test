CREATE TABLE IF NOT EXISTS disease_outbreak_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    disease_name VARCHAR(200) NOT NULL,
    display_label VARCHAR(200) NOT NULL DEFAULT '',
    min_case_count INT NOT NULL DEFAULT 25,
    is_active BOOLEAN DEFAULT TRUE,
    priority INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbreak_rules_disease ON disease_outbreak_rules(disease_name);

-- Default rules matching the existing hardcoded logic
INSERT INTO disease_outbreak_rules (disease_name, display_label, min_case_count, priority, is_active) VALUES
    ('DBD', 'Demam Berdarah Dengue', 10, 1, TRUE),
    ('LEPTOSPIROSIS', 'Leptospirosis', 10, 2, TRUE),
    ('DIARE_AKUT', 'Diare Akut', 25, 3, TRUE),
    ('COVID19', 'COVID-19', 25, 4, TRUE),
    ('INFLUENZA', 'Influenza', 25, 5, TRUE),
    ('MALARIA', 'Malaria', 25, 6, TRUE),
    ('CHIKUNGUNYA', 'Chikungunya', 25, 7, TRUE),
    ('TUBERCULOSIS', 'Tuberkulosis', 25, 8, TRUE),
    ('PNEUMONIA', 'Pneumonia', 25, 9, TRUE),
    ('RESPIRATORY_ILI_COVID19', 'ILI / COVID-19 Respiratory', 25, 10, TRUE),
    ('ILI', 'Influenza-Like Illness', 25, 11, TRUE),
    ('FEBRILE_ILLNESS', 'Febrile Illness', 25, 12, TRUE),
    ('UNKNOWN', 'Unknown / Lainnya', 25, 999, FALSE)
ON CONFLICT (disease_name) DO NOTHING;
