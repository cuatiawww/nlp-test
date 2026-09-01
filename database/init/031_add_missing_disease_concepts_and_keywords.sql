-- Migration: Add missing WHO disease concepts and NLP keywords
-- Date: 2026-09-01

-- 1. Insert missing WHO ICD-11 Disease Concepts into disease_concepts table
INSERT INTO disease_concepts (id, canonical_name, english_name, ontology_system, ontology_code, is_active)
VALUES
  (gen_random_uuid(), 'pertussis', 'Pertussis / Whooping Cough', 'WHO ICD-11 MMS', '1C12', true),
  (gen_random_uuid(), 'avian influenza H5N1', 'Avian Influenza / Bird Flu', 'WHO ICD-11 MMS', '1E30', true),
  (gen_random_uuid(), 'filariasis', 'Lymphatic Filariasis', 'WHO ICD-11 MMS', '1F66', true),
  (gen_random_uuid(), 'schistosomiasis', 'Schistosomiasis', 'WHO ICD-11 MMS', '1F64', true),
  (gen_random_uuid(), 'nipah virus', 'Nipah Virus Disease', 'WHO ICD-11 MMS', '1D63', true),
  (gen_random_uuid(), 'ebola virus', 'Ebola Disease', 'WHO ICD-11 MMS', '1D42', true),
  (gen_random_uuid(), 'marburg virus', 'Marburg Virus Disease', 'WHO ICD-11 MMS', '1D43', true),
  (gen_random_uuid(), 'yellow fever', 'Yellow Fever', 'WHO ICD-11 MMS', '1D47', true),
  (gen_random_uuid(), 'meningitis', 'Bacterial / Viral Meningitis', 'WHO ICD-11 MMS', '1D00', true),
  (gen_random_uuid(), 'rubella', 'Rubella / German Measles', 'WHO ICD-11 MMS', '1F02', true),
  (gen_random_uuid(), 'hand foot mouth disease', 'Hand Foot and Mouth Disease', 'WHO ICD-11 MMS', '1D82', true),
  (gen_random_uuid(), 'lassa fever', 'Lassa Fever', 'WHO ICD-11 MMS', '1D44', true),
  (gen_random_uuid(), 'japanese encephalitis', 'Japanese Encephalitis', 'WHO ICD-11 MMS', '1C80', true),
  (gen_random_uuid(), 'diphtheria', 'Diphtheria', 'WHO ICD-11 MMS', '1C11', true),
  (gen_random_uuid(), 'tetanus', 'Tetanus', 'WHO ICD-11 MMS', '1C10', true),
  (gen_random_uuid(), 'plague', 'Plague', 'WHO ICD-11 MMS', '1B93', true),
  (gen_random_uuid(), 'mpox', 'Mpox / Monkeypox', 'WHO ICD-11 MMS', '1E71', true),
  (gen_random_uuid(), 'leprosy', 'Leprosy / Kusta', 'WHO ICD-11 MMS', '1B20', true)
ON CONFLICT (canonical_name) DO UPDATE SET
  english_name = EXCLUDED.english_name,
  ontology_code = EXCLUDED.ontology_code,
  is_active = EXCLUDED.is_active;

-- 2. Insert corresponding keywords into nlp_keywords
INSERT INTO nlp_keywords (id, category, keyword, target_label, is_active, priority)
VALUES
  (gen_random_uuid(), 'disease', 'pertussis', 'PERTUSSIS', true, 10),
  (gen_random_uuid(), 'disease', 'batuk rejan', 'PERTUSSIS', true, 10),
  (gen_random_uuid(), 'disease', 'whooping cough', 'PERTUSSIS', true, 10),

  (gen_random_uuid(), 'disease', 'h5n1', 'AVIAN_INFLUENZA', true, 10),
  (gen_random_uuid(), 'disease', 'flu burung', 'AVIAN_INFLUENZA', true, 10),
  (gen_random_uuid(), 'disease', 'avian influenza', 'AVIAN_INFLUENZA', true, 10),
  (gen_random_uuid(), 'disease', 'bird flu', 'AVIAN_INFLUENZA', true, 10),

  (gen_random_uuid(), 'disease', 'filariasis', 'FILARIASIS', true, 10),
  (gen_random_uuid(), 'disease', 'kaki gajah', 'FILARIASIS', true, 10),
  (gen_random_uuid(), 'disease', 'lymphatic filariasis', 'FILARIASIS', true, 10),

  (gen_random_uuid(), 'disease', 'schistosomiasis', 'SCHISTOSOMIASIS', true, 10),
  (gen_random_uuid(), 'disease', 'schistosoma', 'SCHISTOSOMIASIS', true, 10),

  (gen_random_uuid(), 'disease', 'kusta', 'LEPROSY', true, 10),
  (gen_random_uuid(), 'disease', 'leprosy', 'LEPROSY', true, 10),
  (gen_random_uuid(), 'disease', 'morbus hansen', 'LEPROSY', true, 10),

  (gen_random_uuid(), 'disease', 'nipah', 'NIPAH', true, 10),
  (gen_random_uuid(), 'disease', 'virus nipah', 'NIPAH', true, 10),

  (gen_random_uuid(), 'disease', 'ebola', 'EBOLA', true, 10),
  (gen_random_uuid(), 'disease', 'marburg', 'MARBURG', true, 10),

  (gen_random_uuid(), 'disease', 'yellow fever', 'YELLOW_FEVER', true, 10),
  (gen_random_uuid(), 'disease', 'demam kuning', 'YELLOW_FEVER', true, 10),

  (gen_random_uuid(), 'disease', 'meningitis', 'MENINGITIS', true, 10),
  (gen_random_uuid(), 'disease', 'radang selaput otak', 'MENINGITIS', true, 10),

  (gen_random_uuid(), 'disease', 'rubella', 'RUBELLA', true, 10),
  (gen_random_uuid(), 'disease', 'campak jerman', 'RUBELLA', true, 10),

  (gen_random_uuid(), 'disease', 'hfmd', 'HFMD', true, 10),
  (gen_random_uuid(), 'disease', 'hand foot mouth', 'HFMD', true, 10),
  (gen_random_uuid(), 'disease', 'flu singapura', 'HFMD', true, 10),
  (gen_random_uuid(), 'disease', 'penyakit tangan kaki dan mulut', 'HFMD', true, 10),

  (gen_random_uuid(), 'disease', 'lassa', 'LASSA_FEVER', true, 10),
  (gen_random_uuid(), 'disease', 'demam lassa', 'LASSA_FEVER', true, 10),

  (gen_random_uuid(), 'disease', 'japanese encephalitis', 'JAPANESE_ENCEPHALITIS', true, 10),
  (gen_random_uuid(), 'disease', 'radang otak jepang', 'JAPANESE_ENCEPHALITIS', true, 10),
  (gen_random_uuid(), 'disease', 'radang otak', 'JAPANESE_ENCEPHALITIS', true, 10),
  (gen_random_uuid(), 'disease', 'viem nao nhat ban', 'JAPANESE_ENCEPHALITIS', true, 10),
  (gen_random_uuid(), 'disease', 'viêm não nhật bản', 'JAPANESE_ENCEPHALITIS', true, 10),

  (gen_random_uuid(), 'disease', 'difteri', 'DIPHTHERIA', true, 10),
  (gen_random_uuid(), 'disease', 'diphtheria', 'DIPHTHERIA', true, 10),
  (gen_random_uuid(), 'disease', 'tetanus', 'TETANUS', true, 10),

  (gen_random_uuid(), 'disease', 'plague', 'PLAGUE', true, 10),
  (gen_random_uuid(), 'disease', 'pes', 'PLAGUE', true, 10),

  (gen_random_uuid(), 'disease', 'mpox', 'MPOX', true, 10),
  (gen_random_uuid(), 'disease', 'monkeypox', 'MPOX', true, 10),
  (gen_random_uuid(), 'disease', 'cacar monyet', 'MPOX', true, 10),

  (gen_random_uuid(), 'disease', 'cikungunya', 'CHIKUNGUNYA', true, 10),
  (gen_random_uuid(), 'disease', 'chikv', 'CHIKUNGUNYA', true, 10)
ON CONFLICT DO NOTHING;
