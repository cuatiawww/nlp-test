-- Migration 034: Add missing NLP disease labels, HFMD outbreak rules, and aliases

-- 1. Insert missing disease labels into nlp_labels
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES
    ('disease', 'hand foot mouth disease HFMD', true, 10),
    ('disease', 'rabies', true, 10),
    ('disease', 'polio', true, 10),
    ('disease', 'anthrax', true, 10),
    ('disease', 'cholera', true, 10),
    ('disease', 'pertussis whooping cough', true, 10),
    ('disease', 'diphtheria', true, 10),
    ('disease', 'ebola virus', true, 10),
    ('disease', 'marburg virus', true, 10),
    ('disease', 'nipah virus', true, 10),
    ('disease', 'zika virus', true, 10),
    ('disease', 'mpox monkeypox', true, 10),
    ('disease', 'japanese encephalitis', true, 10),
    ('disease', 'rubella campak jerman', true, 10),
    ('disease', 'tetanus', true, 10),
    ('disease', 'yellow fever', true, 10),
    ('disease', 'meningitis', true, 10),
    ('disease', 'filariasis kaki gajah', true, 10),
    ('disease', 'schistosomiasis', true, 10),
    ('disease', 'leprosy kusta', true, 10),
    ('disease', 'avian influenza flu burung', true, 10)
ON CONFLICT (category, label) DO NOTHING;

-- 2. Insert HFMD and missing outbreak rules into disease_outbreak_rules
INSERT INTO disease_outbreak_rules (disease_name, display_label, min_case_count, is_active, priority)
VALUES
    ('HFMD', 'Hand, Foot, and Mouth Disease (HFMD)', 20, true, 10),
    ('HAND_FOOT_MOUTH_DISEASE', 'Hand, Foot, and Mouth Disease', 20, true, 10),
    ('RABIES', 'Rabies', 1, true, 10),
    ('POLIO', 'Polio', 1, true, 10),
    ('CHOLERA', 'Kolera', 5, true, 10),
    ('ANTHRAX', 'Antraks', 1, true, 10),
    ('DIPHTHERIA', 'Difteri', 1, true, 10),
    ('PERTUSSIS', 'Pertusis / Batuk Rejan', 5, true, 10),
    ('MPOX', 'Mpox / Cacar Monyet', 5, true, 10),
    ('AVIAN_INFLUENZA', 'Flu Burung', 1, true, 10)
ON CONFLICT (disease_name) DO UPDATE 
SET display_label = EXCLUDED.display_label,
    min_case_count = EXCLUDED.min_case_count,
    is_active = EXCLUDED.is_active;

-- 3. Ensure HFMD keywords in nlp_keywords
INSERT INTO nlp_keywords (category, keyword, target_label, is_active, priority)
VALUES
    ('disease', 'hfmd', 'HFMD', true, 10),
    ('disease', 'hand foot mouth', 'HFMD', true, 10),
    ('disease', 'hand, foot and mouth', 'HFMD', true, 10),
    ('disease', 'hand, foot, and mouth', 'HFMD', true, 10),
    ('disease', 'hand foot and mouth', 'HFMD', true, 10),
    ('disease', 'hand foot and mouth disease', 'HFMD', true, 10),
    ('disease', 'flu singapura', 'HFMD', true, 10),
    ('disease', 'penyakit tangan kaki dan mulut', 'HFMD', true, 10),
    ('disease', 'penyakit tangan, kaki dan mulut', 'HFMD', true, 10),
    ('disease', 'penyakit tangan kaki mulut', 'HFMD', true, 10),
    ('disease', 'ptkm', 'HFMD', true, 10),
    ('disease', 'bệnh tay chân miệng', 'HFMD', true, 10),
    ('disease', 'tay chân miệng', 'HFMD', true, 10),
    ('disease', 'โรคมือเท้าปาก', 'HFMD', true, 10),
    ('disease', 'มือเท้าปาก', 'HFMD', true, 10)
ON CONFLICT DO NOTHING;
