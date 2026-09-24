-- =====================================================================
-- Migration 120: Master Data Purge & ASEAN 31 Disease Database Injection
-- Cleans legacy master disease concepts, redirects, and old aliases.
-- Injects 31 official ASEAN CDC diseases with complete 11 ASEAN country aliases.
-- Completely decouples dependency on external WHO ICD-11 API.
-- =====================================================================

BEGIN;

-- 1. Disconnect referencing records and clear old master tables
DELETE FROM disease_concept_redirects;
DELETE FROM disease_discovery_candidates;
DELETE FROM disease_label_migration_conflicts_059;
UPDATE crawl_matrix_rows SET disease_concept_id = NULL WHERE disease_concept_id IS NOT NULL;
UPDATE disease_events SET primary_disease_concept_id = NULL WHERE primary_disease_concept_id IS NOT NULL;
UPDATE disease_event_diseases SET disease_concept_id = NULL WHERE disease_concept_id IS NOT NULL;
DELETE FROM disease_aliases;
DELETE FROM disease_concepts;
DELETE FROM nlp_keywords WHERE category = 'disease';

-- 2. Ensure schema allows decoupled ontology codes
ALTER TABLE disease_concepts ALTER COLUMN ontology_system SET DEFAULT 'ASEAN Master Catalog';
ALTER TABLE disease_concepts ALTER COLUMN confidence SET DEFAULT 1.0;
ALTER TABLE disease_concepts ALTER COLUMN is_active SET DEFAULT TRUE;

-- 3. Insert official 31 ASEAN diseases
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Zika', 'Zika virus disease', 'ZIKA', 'Viral / Mosquito-borne', TRUE,
    'Zika virus disease transmitted primarily by Aedes mosquitoes.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'West Nile', 'West Nile virus infection', 'WEST_NILE', 'Viral / Mosquito-borne', TRUE,
    'West Nile virus infection transmitted by mosquitoes.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Typhoid', 'Typhoid fever', 'TYPHOID', 'Bacterial / Food-borne', FALSE,
    'Typhoid fever caused by Salmonella Typhi bacteria.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Tuberculosis', 'Tuberculosis', 'TUBERCULOSIS', 'Bacterial / Airborne', FALSE,
    'Infectious bacterial disease mainly affecting lungs caused by Mycobacterium tuberculosis.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Rift Valley Fever', 'Rift Valley fever', 'RIFT_VALLEY_FEVER', 'Viral / Zoonotic', TRUE,
    'Viral zoonosis affecting domestic animals and humans via mosquitoes.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Rabies', 'Rabies', 'RABIES', 'Viral / Zoonotic', TRUE,
    'Preventable viral disease transmitted through the bite of a rabid animal.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Polio (Paralysis)', 'Poliomyelitis', 'POLIO', 'Viral / Enteric', FALSE,
    'Poliomyelitis causing acute flaccid paralysis transmitted person-to-person.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Pertussis (Whooping Cough)', 'Pertussis', 'PERTUSSIS', 'Bacterial / Respiratory', FALSE,
    'Highly contagious respiratory tract infection caused by Bordetella pertussis.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Nipah', 'Nipah virus disease', 'NIPAH', 'Viral / Zoonotic', TRUE,
    'Zoonotic virus causing severe encephalitis and respiratory illness.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Mpox (Monkeypox)', 'Mpox', 'MPOX', 'Viral / Zoonotic', TRUE,
    'Zoonotic orthopoxvirus causing fever, rash, and lesions.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'MERS', 'Middle East respiratory syndrome', 'MERS', 'Viral / Respiratory', TRUE,
    'Middle East Respiratory Syndrome caused by MERS-CoV coronavirus.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Melioidosis', 'Melioidosis', 'MELIOIDOSIS', 'Bacterial / Environmental', TRUE,
    'Infectious disease caused by Burkholderia pseudomallei in soil and water.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Measles', 'Measles', 'MEASLES', 'Viral / Airborne', FALSE,
    'Highly contagious viral disease marked by fever and rash.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Marburg', 'Marburg virus disease', 'MARBURG', 'Viral / Hemorrhagic', TRUE,
    'Severe hemorrhagic fever caused by Marburg filovirus.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Malaria', 'Malaria', 'MALARIA', 'Parasitic / Vector-borne', TRUE,
    'Life-threatening disease caused by Plasmodium parasites transmitted by Anopheles mosquitoes.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Lymphatic Filariasis', 'Lymphatic filariasis', 'LYMPHATIC_FILARIASIS', 'Parasitic / Vector-borne', FALSE,
    'Parasitic infection causing elephantiasis transmitted by mosquitoes.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Leptospirosis', 'Leptospirosis', 'LEPTOSPIROSIS', 'Bacterial / Zoonotic', TRUE,
    'Bacterial disease spread through contact with water or soil contaminated by animal urine.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Lassa fever', 'Lassa fever', 'LASSA_FEVER', 'Viral / Hemorrhagic', TRUE,
    'Acute viral hemorrhagic illness caused by Lassa virus.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'HIV/AIDS', 'HIV disease', 'HIV_AIDS', 'Viral / Immunodeficiency', FALSE,
    'Human immunodeficiency virus infection and acquired immunodeficiency syndrome.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Henipaviral disease', 'Henipavirus infection', 'HENIPAVIRAL', 'Viral / Zoonotic', TRUE,
    'Emerging zoonotic disease caused by Henipaviruses (Hendra, Nipah, Langya).', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Hantavirus', 'Hantavirus disease', 'HANTAVIRUS', 'Viral / Zoonotic', TRUE,
    'Virus transmitted by rodents causing hemorrhagic fever with renal syndrome or HPS.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Hand, Foot, and Mouth Disease (HFMD)', 'Hand, foot and mouth disease', 'HFMD', 'Viral / Enteric', FALSE,
    'Common contagious childhood illness caused by enteroviruses (EV-A71, Coxsackie).', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Ebola', 'Ebola disease', 'EBOLA', 'Viral / Hemorrhagic', TRUE,
    'Severe, often fatal viral hemorrhagic disease caused by Ebola virus.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Diphtheria', 'Diphtheria', 'DIPHTHERIA', 'Bacterial / Respiratory', FALSE,
    'Serious infection caused by strains of Corynebacterium diphtheriae making toxin.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Dengue', 'Dengue', 'DENGUE', 'Viral / Mosquito-borne', FALSE,
    'Mosquito-borne viral infection widespread throughout ASEAN tropical regions.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Crimean-Congo Hemorrhagic Fever', 'Crimean-Congo hemorrhagic fever', 'CRIMEAN_CONGO_HF', 'Viral / Hemorrhagic', TRUE,
    'Tick-borne viral disease causing severe hemorrhagic fever outbreaks.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'COVID-19', 'Coronavirus disease 2019', 'COVID19', 'Viral / Respiratory', TRUE,
    'Infectious respiratory disease caused by SARS-CoV-2 coronavirus.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Chikungunya', 'Chikungunya disease', 'CHIKUNGUNYA', 'Viral / Mosquito-borne', FALSE,
    'Viral disease transmitted by mosquitoes causing fever and debilitating joint pain.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Avian Influenza (Bird Flu)', 'Avian influenza', 'AVIAN_INFLUENZA', 'Viral / Respiratory', TRUE,
    'Infection caused by avian influenza viruses (H5N1, H7N9) adapted to birds.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Anthrax', 'Anthrax', 'ANTHRAX', 'Bacterial / Zoonotic', TRUE,
    'Serious infectious disease caused by Bacillus anthracis bacteria.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);
INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), 'Unknown Disease', 'Unknown or unclassified disease', 'UNKNOWN_DISEASE', 'Unclassified / Outbreak', FALSE,
    'Unidentified or novel disease outbreak requiring epidemiological investigation.', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);

-- 4. Insert Comprehensive ASEAN Multilingual Aliases
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Zika', 'zika', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Zika virus', 'zika virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Zika fever', 'zika fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ZIKV', 'zikv', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Zika', 'zika', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Zika', 'virus zika', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Zika', 'demam zika', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Zika', 'zika', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Zika', 'virus zika', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Zika', 'demam zika', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ซิกา', 'ซ กา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้ซิกา', 'ไข ซ กา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไวรัสซิกา', 'ไวร สซ กา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Zika', 'zika', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt Zika', 'sốt zika', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vi rút Zika', 'vi rút zika', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus Zika', 'virus zika', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Zika', 'zika', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus na Zika', 'virus na zika', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'trangkasong Zika', 'trangkasong zika', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဇီကာ', 'ဇ က', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဇီကာဗိုင်းရပ်စ်', 'ဇ က ဗ င ရပ စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဇီကာဖျားနာ', 'ဇ က ဖ န', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ហ្ស៊ីកា', 'ហ ស ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺហ្ស៊ីកា', 'ជ ង ហ ស ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'វីរុសហ្ស៊ីកា', 'វ រ សហ ស ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ຊິກາ', 'ຊ ກາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ຊິກາ', 'ໄຂ ຊ ກາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄວຣັສຊິກາ', 'ໄວຣ ສຊ ກາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Zika', 'zika', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras Zika', 'moras zika', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus Zika', 'virus zika', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Zika', 'zika', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vírus Zika', 'vírus zika', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'febre Zika', 'febre zika', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '寨卡', '寨卡', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '寨卡病毒', '寨卡病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '寨卡热', '寨卡热', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ஜிகா', 'ஜ க', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ஜிகா வைரஸ்', 'ஜ க வ ரஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Zika'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'West Nile', 'west nile', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'West Nile virus', 'west nile virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'West Nile fever', 'west nile fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'WNV', 'wnv', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'West Nile', 'west nile', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus West Nile', 'virus west nile', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam West Nile', 'demam west nile', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nil Barat', 'nil barat', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'West Nile', 'west nile', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus West Nile', 'virus west nile', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nil Barat', 'nil barat', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เวสต์ไนล์', 'เวสต ไนล', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไวรัสเวสต์ไนล์', 'ไวร สเวสต ไนล', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้เวสต์ไนล์', 'ไข เวสต ไนล', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'West Nile', 'west nile', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus West Nile', 'virus west nile', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt West Nile', 'sốt west nile', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'West Nile', 'west nile', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus ng West Nile', 'virus ng west nile', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဝက်စ်နိုင်း', 'ဝက စ န င', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဝက်စ်နိုင်းဗိုင်းရပ်စ်', 'ဝက စ န င ဗ င ရပ စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'នីលខាងលិច', 'ន លខ ងល ច', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'វីរុសនីលខាងលិច', 'វ រ សន លខ ងល ច', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ເວສໄນລ໌', 'ເວສໄນລ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄວຣັສເວສໄນລ໌', 'ໄວຣ ສເວສໄນລ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'West Nile', 'west nile', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras West Nile', 'moras west nile', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nilo Ocidental', 'nilo ocidental', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vírus do Nilo Ocidental', 'vírus do nilo ocidental', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '西尼罗河病毒', '西尼罗河病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '西尼罗病毒', '西尼罗病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'மேற்கு நைல் வைரஸ்', 'ம ற க ந ல வ ரஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'West Nile'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Typhoid', 'typhoid', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Typhoid fever', 'typhoid fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Enteric fever', 'enteric fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Tifus', 'tifus', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Tipus', 'tipus', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Tipes', 'tipes', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Tifoid', 'demam tifoid', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Typhoid', 'typhoid', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam kepialu', 'demam kepialu', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Kepialu', 'kepialu', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Tifoid', 'tifoid', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้รากสาดน้อย', 'ไข รากสาดน อย', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้ไทฟอยด์', 'ไข ไทฟอยด', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไทฟอยด์', 'ไทฟอยด', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'thương hàn', 'thương hàn', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt thương hàn', 'sốt thương hàn', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh thương hàn', 'bệnh thương hàn', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tipus', 'tipus', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'lagnat na tipus', 'lagnat na tipus', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'typhoid', 'typhoid', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'တိုက်ဖွိုက်', 'တ က ဖ က', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'အူရောင်ငန်းဖျား', 'အ ရ င ငန ဖ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'အူရောင်ငန်းဖျားရောဂါ', 'အ ရ င ငန ဖ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'គ្រុនពោះវៀន', 'គ រ នព វ ន', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺគ្រុនពោះវៀន', 'ជ ង គ រ នព វ ន', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ໄທຟອຍ', 'ໄຂ ໄທຟອຍ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ຮາກສາດ', 'ໄຂ ຮາກສາດ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄທຟອຍ', 'ໄທຟອຍ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tifóide', 'tifóide', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras tifóide', 'moras tifóide', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tifu', 'tifu', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'febre tifóide', 'febre tifóide', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tifoide', 'tifoide', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '伤寒', '伤寒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '副伤寒', '副伤寒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'டைபாய்டு', 'ட ப ய ட', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'டைபாய்டு காய்ச்சல்', 'ட ப ய ட க ய ச சல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Typhoid'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Tuberculosis', 'tuberculosis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'TB', 'tb', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'consumption', 'consumption', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Tuberkulosis', 'tuberkulosis', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'TBC', 'tbc', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'TB paru', 'tb paru', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'flek paru', 'flek paru', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Batuk kering', 'batuk kering', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Tibi', 'tibi', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Tuberkulosis', 'tuberkulosis', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Sakit tibi', 'sakit tibi', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'วัณโรค', 'ว ณโรค', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรควัณโรค', 'โรคว ณโรค', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ทีบี', 'ท บ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh lao', 'bệnh lao', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'lao phổi', 'lao phổi', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vi trùng lao', 'vi trùng lao', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'lao', 'lao', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tuberkulosis', 'tuberkulosis', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tisis', 'tisis', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sakit sa baga', 'sakit sa baga', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'တီဘီ', 'တ ဘ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'တီဘီရောဂါ', 'တ ဘ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'အဆုတ်တီဘီ', 'အဆ တ တ ဘ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'របេង', 'រប ង', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺរបេង', 'ជ ង រប ង', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'របេងសួត', 'រប ងស ត', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ວັນນະໂຣກ', 'ວ ນນະໂຣກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດວັນນະໂຣກ', 'ພະຍາດວ ນນະໂຣກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ທີບີ', 'ທ ບ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tuberkulóze', 'tuberkulóze', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras TBC', 'moras tbc', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tisis', 'tisis', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tuberculose', 'tuberculose', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tísica', 'tísica', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '结核病', '结核病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '肺结核', '肺结核', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '痨病', '痨病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'காசநோய்', 'க சந ய', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'டிபி', 'ட ப', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Tuberculosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Rift Valley Fever', 'rift valley fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Rift Valley fever virus', 'rift valley fever virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'RVF', 'rvf', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Lembah Rift', 'demam lembah rift', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Rift Valley Fever', 'rift valley fever', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'RVF', 'rvf', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Lembah Rift', 'demam lembah rift', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Rift Valley', 'demam rift valley', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้ริฟต์แวลลีย์', 'ไข ร ฟต แวลล ย', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคไข้ริฟต์แวลลีย์', 'โรคไข ร ฟต แวลล ย', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt thung lũng Rift', 'sốt thung lũng rift', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh sốt thung lũng Rift', 'bệnh sốt thung lũng rift', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Rift Valley fever', 'rift valley fever', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ရစ်ဖ်တောင်ကြားဖျားနာ', 'ရစ ဖ တ င က ဖ န', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'គ្រុនរីហ្វវ៉ាលី', 'គ រ នរ ហ វវ ល', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ຮິບວາເລ', 'ໄຂ ຮ ບວາເລ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'febre do Vale do Rift', 'febre do vale do rift', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Rift Valley fever', 'rift valley fever', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '裂谷热', '裂谷热', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '裂谷热病毒', '裂谷热病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ரிப்ட் பள்ளத்தாக்கு காய்ச்சல்', 'ர ப ட பள ளத த க க க ய ச சல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rift Valley Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Rabies', 'rabies', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'hydrophobia', 'hydrophobia', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'rabies virus', 'rabies virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Rabies', 'rabies', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Anjing gila', 'anjing gila', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit anjing gila', 'penyakit anjing gila', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Rabies', 'rabies', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit anjing gila', 'penyakit anjing gila', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคพิษสุนัขบ้า', 'โรคพ ษส น ขบ า', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคกลัวน้ำ', 'โรคกล วน ำ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'พิษสุนัขบ้า', 'พ ษส น ขบ า', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh dại', 'bệnh dại', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'dại', 'dại', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vi rút dại', 'vi rút dại', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'rabies', 'rabies', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'rabis', 'rabis', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ခွေးရူးရောဂါ', 'ခ ရ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ခွေးရူးပြန်ရောဂါ', 'ခ ရ ပ န ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ခွေးရူး', 'ခ ရ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺឆ្កែឆ្កួត', 'ជ ង ឆ ក ឆ ក ត', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ឆ្កែឆ្កួត', 'ឆ ក ឆ ក ត', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດວໍ້', 'ພະຍາດວ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດໝາບ້າ', 'ພະຍາດໝາບ າ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໝາບ້າ', 'ໝາບ າ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras rabies', 'moras rabies', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'asu bulak', 'asu bulak', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'rabies', 'rabies', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'raiva', 'raiva', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'hidrofobia', 'hidrofobia', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '狂犬病', '狂犬病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '疯狗症', '疯狗症', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'வெறிநாய் கடி', 'வ ற ந ய கட', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ரேபிஸ்', 'ர ப ஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Rabies'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Polio (Paralysis)', 'polio paralysis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Polio', 'polio', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Poliomyelitis', 'poliomyelitis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Infantile paralysis', 'infantile paralysis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Acute flaccid paralysis', 'acute flaccid paralysis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'AFP', 'afp', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Polio', 'polio', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Poliomielitis', 'poliomielitis', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Kelumpuhan layu akut', 'kelumpuhan layu akut', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Lumpuh layu', 'lumpuh layu', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Polio', 'polio', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Poliomielitis', 'poliomielitis', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Lumpuh kanak-kanak', 'lumpuh kanak-kanak', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โปลิโอ', 'โปล โอ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคโปลิโอ', 'โรคโปล โอ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'อัมพาตโปลิโอ', 'อ มพาตโปล โอ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bại liệt', 'bại liệt', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh bại liệt', 'bệnh bại liệt', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'liệt mềm cấp', 'liệt mềm cấp', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'polio', 'polio', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'paralisis', 'paralisis', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'poliyomiyelitis', 'poliyomiyelitis', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ပိုလီယို', 'ပ လ ယ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ပိုလီယိုရောဂါ', 'ပ လ ယ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ကလေးသူငယ်အကြောသေရောဂါ', 'ကလ သ ငယ အက သ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ស្វិតដៃជើង', 'ស វ តដ ជ ង', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺស្វិតដៃជើង', 'ជ ង ស វ តដ ជ ង', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ប៉ូលីយ៉ូ', 'ប ល យ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໂປລີໂອ', 'ໂປລ ໂອ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດໂປລີໂອ', 'ພະຍາດໂປລ ໂອ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'polio', 'polio', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras polio', 'moras polio', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'paralizia', 'paralizia', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'poliomielite', 'poliomielite', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'paralisia infantil', 'paralisia infantil', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '脊髓灰质炎', '脊髓灰质炎', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '小儿麻痹症', '小儿麻痹症', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '小儿麻痹', '小儿麻痹', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'இளம்பிள்ளை வாதம்', 'இளம ப ள ள வ தம', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'போலியோ', 'ப ல ய', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Polio (Paralysis)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Pertussis (Whooping Cough)', 'pertussis whooping cough', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Pertussis', 'pertussis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Whooping cough', 'whooping cough', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '100-day cough', '100-day cough', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Pertusis', 'pertusis', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Batuk rejan', 'batuk rejan', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Batuk seratus hari', 'batuk seratus hari', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Batuk 100 hari', 'batuk 100 hari', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Batuk kokol', 'batuk kokol', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Pertussis', 'pertussis', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคไอกรน', 'โรคไอกรน', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไอกรน', 'ไอกรน', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ho gà', 'ho gà', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh ho gà', 'bệnh ho gà', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tusperina', 'tusperina', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'dalahit na ubo', 'dalahit na ubo', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'whooping cough', 'whooping cough', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ကြက်ညှာ', 'က က ည', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ကြက်ညှာချောင်းဆိုး', 'က က ည ခ င ဆ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ကြက်ညှာချောင်းဆိုးရောဂါ', 'က က ည ခ င ဆ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ក្អកមាន់', 'ក អកម ន', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺក្អកមាន់', 'ជ ង ក អកម ន', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄອໄກ່', 'ໄອໄກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດໄອໄກ່', 'ພະຍາດໄອໄກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tos ferina', 'tos ferina', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras mear', 'moras mear', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tosse convulsa', 'tosse convulsa', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'coqueluche', 'coqueluche', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '百日咳', '百日咳', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'கக்குவான் இருமல்', 'கக க வ ன இர மல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'பெர்டுசிஸ்', 'ப ர ட ச ஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Pertussis (Whooping Cough)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nipah', 'nipah', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nipah virus', 'nipah virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nipah virus disease', 'nipah virus disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'NiV', 'niv', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nipah', 'nipah', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Nipah', 'virus nipah', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit virus Nipah', 'penyakit virus nipah', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nipah', 'nipah', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Nipah', 'virus nipah', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Wabak Nipah', 'wabak nipah', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'นิปาห์', 'น ปาห', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไวรัสนิปาห์', 'ไวร สน ปาห', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคนิปาห์', 'โรคน ปาห', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nipah', 'nipah', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus Nipah', 'virus nipah', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vi rút Nipah', 'vi rút nipah', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nipah', 'nipah', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus na Nipah', 'virus na nipah', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'နီပါ', 'န ပ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'နီပါဗိုင်းရပ်စ်', 'န ပ ဗ င ရပ စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'នីប៉ា', 'ន ប', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'វីរុសនីប៉ា', 'វ រ សន ប', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ນິປາ', 'ນ ປາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄວຣັສນິປາ', 'ໄວຣ ສນ ປາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nipah', 'nipah', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus Nipah', 'virus nipah', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Nipah', 'nipah', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vírus Nipah', 'vírus nipah', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '尼帕病毒', '尼帕病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '立百病毒', '立百病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'நிபா', 'ந ப', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'நிபா வைரஸ்', 'ந ப வ ரஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Nipah'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Mpox (Monkeypox)', 'mpox monkeypox', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Mpox', 'mpox', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Monkeypox', 'monkeypox', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Monkey pox', 'monkey pox', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Cacar monyet', 'cacar monyet', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Mpox', 'mpox', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Monkeypox', 'monkeypox', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Cacar monyet', 'cacar monyet', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Mpox', 'mpox', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ฝีดาษลิง', 'ฝ ดาษล ง', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ฝีดาษวานร', 'ฝ ดาษวานร', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เอ็มพ็อกซ์', 'เอ มพ อกซ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เอ็มพอกซ์', 'เอ มพอกซ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'đậu mùa khỉ', 'đậu mùa khỉ', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh đậu mùa khỉ', 'bệnh đậu mùa khỉ', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'mpox', 'mpox', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bulutong-unggoy', 'bulutong-unggoy', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'mpox', 'mpox', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'monkeypox', 'monkeypox', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'မျောက်ကျောက်', 'မ က က က', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'မျောက်ကျောက်ရောဂါ', 'မ က က က ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'အမ်ပေါက်စ်', 'အမ ပ က စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'អុតស្វា', 'អ តស វ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺអុតស្វា', 'ជ ង អ តស វ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'អឹមផក', 'អ មផក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໝາກໝອກລີງ', 'ໝາກໝອກລ ງ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ໝາກໝອກລີງ', 'ໄຂ ໝາກໝອກລ ງ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ເອັມພັອກ', 'ເອ ມພ ອກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'cacar makaku', 'cacar makaku', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'mpox', 'mpox', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'varíola dos macacos', 'varíola dos macacos', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'mpox', 'mpox', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '猴痘', '猴痘', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '猴痘病毒', '猴痘病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'குரங்கம்மை', 'க ரங கம ம', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'எம்பாக்ஸ்', 'எம ப க ஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Mpox (Monkeypox)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS', 'mers', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS-CoV', 'mers-cov', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Middle East Respiratory Syndrome', 'middle east respiratory syndrome', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS', 'mers', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS-CoV', 'mers-cov', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Sindrom Pernapasan Timur Tengah', 'sindrom pernapasan timur tengah', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS', 'mers', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS-CoV', 'mers-cov', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Sindrom Pernafasan Timur Tengah', 'sindrom pernafasan timur tengah', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เมอร์ส', 'เมอร ส', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคเมอร์ส', 'โรคเมอร ส', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคทางเดินหายใจตะวันออกกลาง', 'โรคทางเด นหายใจตะว นออกกลาง', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS', 'mers', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS-CoV', 'mers-cov', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'hội chứng hô hấp Trung Đông', 'hội chứng hô hấp trung đông', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS', 'mers', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS-CoV', 'mers-cov', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'မားစ်', 'မ စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'မားစ်ရောဂါ', 'မ စ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'មជ្ឈិមបូព៌ា', 'មជ ឈ មប ព', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺផ្លូវដង្ហើមមជ្ឈិមបូព៌ា', 'ជ ង ផ ល វដង ហ មមជ ឈ មប ព', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ເມິສ', 'ເມ ສ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດເມິສ', 'ພະຍາດເມ ສ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS', 'mers', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sindroma MERS', 'sindroma mers', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MERS', 'mers', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Síndrome Respiratória do Médio Oriente', 'síndrome respiratória do médio oriente', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '中东呼吸综合征', '中东呼吸综合征', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '中东呼吸道症候群', '中东呼吸道症候群', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'மெர்ஸ்', 'ம ர ஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'மெர்ஸ் காய்ச்சல்', 'ம ர ஸ க ய ச சல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'MERS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Melioidosis', 'melioidosis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Whitmore disease', 'whitmore disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Burkholderia pseudomallei', 'burkholderia pseudomallei', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Melioidosis', 'melioidosis', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit Whitmore', 'penyakit whitmore', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Melioidosis', 'melioidosis', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit Whitmore', 'penyakit whitmore', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคเมลิออยด์', 'โรคเมล ออยด', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เมลิออยโดสิส', 'เมล ออยโดส ส', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคไข้ดิน', 'โรคไข ด น', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'melioidosis', 'melioidosis', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh Whitmore', 'bệnh whitmore', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vi khuẩn whitmore', 'vi khuẩn whitmore', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'melioidosis', 'melioidosis', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'မယ်လီအွိုက်ဒိုးဆစ်', 'မယ လ အ က ဒ ဆစ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'မြေဆီလွှာဘက်တီးရီးယား', 'မ ဆ လ ဘက တ ရ ယ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'មេលីអូអ៊ីដូស', 'ម ល អ អ ដ ស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺមេលីអូអ៊ីដូស', 'ជ ង ម ល អ អ ដ ស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ເມລິອອຍ', 'ເມລ ອອຍ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດເມລິອອຍ', 'ພະຍາດເມລ ອອຍ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'melioidose', 'melioidose', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'melioidose', 'melioidose', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'doença de Whitmore', 'doença de whitmore', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '类鼻疽', '类鼻疽', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '类鼻疽杆菌', '类鼻疽杆菌', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'மெலியோய்டோசிஸ்', 'ம ல ய ய ட ச ஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Melioidosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Measles', 'measles', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Rubeola', 'rubeola', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Morbilli', 'morbilli', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Campak', 'campak', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Morbili', 'morbili', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Gabagen', 'gabagen', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Campak', 'campak', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam campak', 'demam campak', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคหัด', 'โรคห ด', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้หัด', 'ไข ห ด', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'หัด', 'ห ด', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh sởi', 'bệnh sởi', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sởi', 'sởi', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tigdas', 'tigdas', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဝက်သက်', 'ဝက သက', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဝက်သက်ရောဂါ', 'ဝက သက ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'កញ្ជ្រឹល', 'កញ ជ រ ល', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺកញ្ជ្រឹល', 'ជ ង កញ ជ រ ល', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໝາກແດງ', 'ໝາກແດງ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດໝາກແດງ', 'ພະຍາດໝາກແດງ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sarampu', 'sarampu', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras sarampu', 'moras sarampu', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sarampo', 'sarampo', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '麻疹', '麻疹', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '出疹', '出疹', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'தட்டம்மை', 'தட டம ம', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'மணல்வாரி', 'மணல வ ர', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Measles'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Marburg', 'marburg', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Marburg virus', 'marburg virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Marburg virus disease', 'marburg virus disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'MVD', 'mvd', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Marburg', 'marburg', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Marburg', 'virus marburg', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam berdarah Marburg', 'demam berdarah marburg', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Marburg', 'marburg', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Marburg', 'virus marburg', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'มาร์บวร์ก', 'มาร บวร ก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไวรัสมาร์บวร์ก', 'ไวร สมาร บวร ก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้มาร์บวร์ก', 'ไข มาร บวร ก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Marburg', 'marburg', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vi rút Marburg', 'vi rút marburg', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh sốt Marburg', 'bệnh sốt marburg', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Marburg', 'marburg', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus na Marburg', 'virus na marburg', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'မာဘတ်', 'မ ဘတ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'မာဘတ်ဗိုင်းရပ်စ်', 'မ ဘတ ဗ င ရပ စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ម៉ាប៊ើក', 'ម ប ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'វីរុសម៉ាប៊ើក', 'វ រ សម ប ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ມາເບີກ', 'ມາເບ ກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄວຣັສມາເບີກ', 'ໄວຣ ສມາເບ ກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Marburg', 'marburg', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus Marburg', 'virus marburg', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Marburgo', 'marburgo', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vírus de Marburgo', 'vírus de marburgo', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '马尔堡', '马尔堡', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '马尔堡病毒', '马尔堡病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '马尔堡出血热', '马尔堡出血热', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'மார்बर्ग', 'ம ர बर ग', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'மார்பர்க் வைரஸ்', 'ம ர பர க வ ரஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Marburg'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Malaria', 'malaria', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Plasmodium', 'plasmodium', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Paludism', 'paludism', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Malaria', 'malaria', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam malaria', 'demam malaria', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Malaria', 'malaria', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'มาลาเรีย', 'มาลาเร ย', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้จับสั่น', 'ไข จ บส น', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้ป่า', 'ไข ป า', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt rét', 'sốt rét', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh sốt rét', 'bệnh sốt rét', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'malaria', 'malaria', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ငှက်ဖျား', 'င က ဖ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ငှက်ဖျားရောဂါ', 'င က ဖ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'គ្រុនចាញ់', 'គ រ នច ញ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺគ្រុនចាញ់', 'ជ ង គ រ នច ញ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ຍຸງ', 'ໄຂ ຍ ງ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ມາລາເຣຍ', 'ໄຂ ມາລາເຣຍ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ປ່າ', 'ໄຂ ປ າ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'malária', 'malária', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras malaria', 'moras malaria', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'malária', 'malária', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'paludismo', 'paludismo', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '疟疾', '疟疾', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '打摆子', '打摆子', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'மலேரியா', 'மல ர ய', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'மலேரியா காய்ச்சல்', 'மல ர ய க ய ச சல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Malaria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Lymphatic Filariasis', 'lymphatic filariasis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Filariasis', 'filariasis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Elephantiasis', 'elephantiasis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Filariasis', 'filariasis', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Kaki gajah', 'kaki gajah', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit kaki gajah', 'penyakit kaki gajah', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Untut', 'untut', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit untut', 'penyakit untut', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Filariasis', 'filariasis', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคเท้าช้าง', 'โรคเท าช าง', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เท้าช้าง', 'เท าช าง', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'phù voi', 'phù voi', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh phù voi', 'bệnh phù voi', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'giun chỉ bạch huyết', 'giun chỉ bạch huyết', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'filariasis', 'filariasis', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'elepantiasis', 'elepantiasis', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဆင်ခြေထောက်ရောဂါ', 'ဆင ခ ထ က ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဆင်ခြေထောက်', 'ဆင ခ ထ က', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជើងដំរី', 'ជ ងដ រ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺជើងដំរី', 'ជ ង ជ ងដ រ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດຕີນຊ້າງ', 'ພະຍາດຕ ນຊ າງ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ຕີນຊ້າງ', 'ຕ ນຊ າງ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'elefantíase', 'elefantíase', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras ain boot', 'moras ain boot', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'filariose linfática', 'filariose linfática', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'elefantíase', 'elefantíase', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '丝虫病', '丝虫病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '淋巴丝虫病', '淋巴丝虫病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '象皮病', '象皮病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'யானைக்கால் நோய்', 'ய ன க க ல ந ய', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'பைலேரியாசிஸ்', 'ப ல ர ய ச ஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lymphatic Filariasis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Leptospirosis', 'leptospirosis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Weil disease', 'weil disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'rat fever', 'rat fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Leptospirosis', 'leptospirosis', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Kencing tikus', 'kencing tikus', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam kencing tikus', 'demam kencing tikus', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Kencing tikus', 'kencing tikus', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit kencing tikus', 'penyakit kencing tikus', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Leptospirosis', 'leptospirosis', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคฉี่หนู', 'โรคฉ หน', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ฉี่หนู', 'ฉ หน', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เลปโตสไปโรซิส', 'เลปโตสไปโรซ ส', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'leptospira', 'leptospira', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh xoắn khuẩn vàng da', 'bệnh xoắn khuẩn vàng da', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt xoắn khuẩn', 'sốt xoắn khuẩn', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'leptospirosis', 'leptospirosis', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ihi ng daga', 'ihi ng daga', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ကြွက်ဆီးရောဂါ', 'က က ဆ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'လက်ပတိုစပိုင်ရိုဆစ်', 'လက ပတ စပ င ရ ဆစ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ឡិបតូស្ពីរ៉ូស', 'ឡ បត ស ព រ ស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺឡិបតូស្ពីរ៉ូស', 'ជ ង ឡ បត ស ព រ ស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດຍ່ຽວໜູ', 'ພະຍາດຍ ຽວໜ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ຍ່ຽວໜູ', 'ຍ ຽວໜ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'leptospirose', 'leptospirose', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras lixu-lao', 'moras lixu-lao', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'leptospirose', 'leptospirose', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'doença de Weil', 'doença de weil', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '钩端螺旋体病', '钩端螺旋体病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '钩体病', '钩体病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'எலி காய்ச்சல்', 'எல க ய ச சல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'லெப்டோஸ்பிரோசிஸ்', 'ல ப ட ஸ ப ர ச ஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Leptospirosis'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Lassa fever', 'lassa fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Lassa virus', 'lassa virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'LASSA_FEVER', 'lassa_fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Lassa', 'demam lassa', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Lassa', 'lassa', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Lassa', 'virus lassa', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Lassa', 'demam lassa', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Lassa', 'lassa', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้ลัสซา', 'ไข ล สซา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคไข้ลัสซา', 'โรคไข ล สซา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt Lassa', 'sốt lassa', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus Lassa', 'virus lassa', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Lassa fever', 'lassa fever', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'လာဆာဖျားနာ', 'လ ဆ ဖ န', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'လာဆာဗိုင်းရပ်စ်', 'လ ဆ ဗ င ရပ စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'គ្រុនឡាសា', 'គ រ នឡ ស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ລັດຊາ', 'ໄຂ ລ ດຊາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'febre de Lassa', 'febre de lassa', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Lassa', 'lassa', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '拉沙热', '拉沙热', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '拉沙病毒', '拉沙病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'லாசா காய்ச்சல்', 'ல ச க ய ச சல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Lassa fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV/AIDS', 'hiv aids', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV', 'hiv', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'AIDS', 'aids', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV/AIDS', 'hiv aids', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV', 'hiv', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'AIDS', 'aids', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Odha', 'odha', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV/AIDS', 'hiv aids', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV', 'hiv', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'AIDS', 'aids', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เอชไอวี', 'เอชไอว', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคเอดส์', 'โรคเอดส', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เอดส์', 'เอดส', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV/AIDS', 'hiv aids', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'nhiễm HIV', 'nhiễm hiv', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh AIDS', 'bệnh aids', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV/AIDS', 'hiv aids', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV', 'hiv', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'AIDS', 'aids', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'အိတ်ခ်ျအိုင်ဗွီ', 'အ တ ခ အ င ဗ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'အေအိုင်ဒီအက်စ်', 'အ အ င ဒ အက စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'အေဒီအက်စ်', 'အ ဒ အက စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'មេរោគអេដស៍', 'ម រ គអ ដស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺអេដស៍', 'ជ ង អ ដស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'អេដស៍', 'អ ដស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ເອດສ໌', 'ເອດສ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດເອດສ໌', 'ພະຍາດເອດສ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ເອສໄອວີ', 'ເອສໄອວ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV/SIDA', 'hiv sida', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras SIDA', 'moras sida', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV', 'hiv', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'VIH/SIDA', 'vih sida', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'SIDA', 'sida', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV', 'hiv', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '艾滋病', '艾滋病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '艾滋', '艾滋', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '爱滋病', '爱滋病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HIV', 'hiv', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'எச்.ஐ.வி', 'எச ஐ வ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'எய்ட்ஸ்', 'எய ட ஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'HIV/AIDS'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Henipaviral disease', 'henipaviral disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Henipavirus', 'henipavirus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Hendra virus', 'hendra virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Langya virus', 'langya virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Henipavirus', 'henipavirus', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit Henipavirus', 'penyakit henipavirus', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Hendra', 'virus hendra', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Henipavirus', 'henipavirus', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Hendra', 'virus hendra', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคเฮนิปาไวรัส', 'โรคเฮน ปาไวร ส', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เฮนิปาไวรัส', 'เฮน ปาไวร ส', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'henipavirus', 'henipavirus', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh do virus henipavirus', 'bệnh do virus henipavirus', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'henipavirus', 'henipavirus', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဟနီပါဗိုင်းရပ်စ်', 'ဟန ပ ဗ င ရပ စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'វីរុសហេនីប៉ា', 'វ រ សហ ន ប', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺវីរុសហេនីប៉ា', 'ជ ង វ រ សហ ន ប', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດເຮນິພາໄວຣັສ', 'ພະຍາດເຮນ ພາໄວຣ ສ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'henipavírus', 'henipavírus', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Henipavirus', 'henipavirus', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '亨尼帕病毒', '亨尼帕病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '琅琊病毒', '琅琊病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ஹெனிபாவைரஸ்', 'ஹ ன ப வ ரஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Henipaviral disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Hantavirus', 'hantavirus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Hantavirus pulmonary syndrome', 'hantavirus pulmonary syndrome', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HPS', 'hps', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HFRS', 'hfrs', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Hantavirus', 'hantavirus', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam berdarah sindrom ginjal', 'demam berdarah sindrom ginjal', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Hantavirus', 'hantavirus', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ฮันตาไวรัส', 'ฮ นตาไวร ส', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไวรัสฮันตา', 'ไวร สฮ นตา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคฮันตาไวรัส', 'โรคฮ นตาไวร ส', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'hantavirus', 'hantavirus', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'hội chứng phổi hantavirus', 'hội chứng phổi hantavirus', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'hantavirus', 'hantavirus', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဟန်တာဗိုင်းရပ်စ်', 'ဟန တ ဗ င ရပ စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'វីរុសហាន់តា', 'វ រ សហ ន ត', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄວຣັສຮານຕາ', 'ໄວຣ ສຮານຕາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'hantavírus', 'hantavírus', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Hantavirus', 'hantavirus', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '汉坦病毒', '汉坦病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '汉他病毒', '汉他病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ஹந்தாவைரஸ்', 'ஹந த வ ரஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hantavirus'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Hand, Foot, and Mouth Disease (HFMD)', 'hand foot and mouth disease hfmd', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Hand, Foot, and Mouth Disease', 'hand foot and mouth disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HFMD', 'hfmd', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Hand foot mouth disease', 'hand foot mouth disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Flu Singapura', 'flu singapura', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit tangan kaki dan mulut', 'penyakit tangan kaki dan mulut', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'PTKM', 'ptkm', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HFMD', 'hfmd', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit tangan, kaki dan mulut', 'penyakit tangan kaki dan mulut', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HFMD', 'hfmd', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคมือเท้าปาก', 'โรคม อเท าปาก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'มือเท้าปาก', 'ม อเท าปาก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคเอชเอฟเอ็มดี', 'โรคเอชเอฟเอ มด', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'tay chân miệng', 'tay chân miệng', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh tay chân miệng', 'bệnh tay chân miệng', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'TCM', 'tcm', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'hfmd', 'hfmd', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sakit sa kamay, paa, at bibig', 'sakit sa kamay paa at bibig', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HFMD', 'hfmd', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'လက်၊ ခြေ၊ ခံတွင်းရောဂါ', 'လက ခ ခ တ င ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'လက်ခြေခံတွင်း', 'လက ခ ခ တ င', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HFMD', 'hfmd', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺពងបែកដៃជើងនិងក្នុងមាត់', 'ជ ង ពងប កដ ជ ងន ងក ន ងម ត', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺដៃជើងមាត់', 'ជ ង ដ ជ ងម ត', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HFMD', 'hfmd', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດມືຕີນປາກ', 'ພະຍາດມ ຕ ນປາກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ມືຕີນປາກ', 'ມ ຕ ນປາກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HFMD', 'hfmd', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras liman ain no ibun', 'moras liman ain no ibun', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HFMD', 'hfmd', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'doença mão-pé-boca', 'doença mão-pé-boca', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'HFMD', 'hfmd', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '手足口病', '手足口病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '手足口症', '手足口症', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '肠病毒71型', '肠病毒71型', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'கை, கால் மற்றும் வாய் நோய்', 'க க ல மற ற ம வ ய ந ய', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'எச்.எஃப்.எம்.டி', 'எச எஃப எம ட', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Hand, Foot, and Mouth Disease (HFMD)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Ebola', 'ebola', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Ebola virus', 'ebola virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Ebola disease', 'ebola disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Ebola virus disease', 'ebola virus disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'EVD', 'evd', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Ebola', 'ebola', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Ebola', 'virus ebola', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit virus Ebola', 'penyakit virus ebola', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Ebola', 'ebola', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus Ebola', 'virus ebola', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'อีโบลา', 'อ โบลา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคไวรัสอีโบลา', 'โรคไวร สอ โบลา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไวรัสอีโบลา', 'ไวร สอ โบลา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Ebola', 'ebola', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh Ebola', 'bệnh ebola', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt xuất huyết Ebola', 'sốt xuất huyết ebola', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Ebola', 'ebola', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus na Ebola', 'virus na ebola', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'အီဘိုလာ', 'အ ဘ လ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'အီဘိုလာဗိုင်းရပ်စ်', 'အ ဘ လ ဗ င ရပ စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'អេបូឡា', 'អ ប ឡ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺអេបូឡា', 'ជ ង អ ប ឡ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ອີໂບລາ', 'ອ ໂບລາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດອີໂບລາ', 'ພະຍາດອ ໂບລາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras Ebola', 'moras ebola', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'virus Ebola', 'virus ebola', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Ébola', 'ébola', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vírus do Ébola', 'vírus do ébola', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'doença do vírus Ébola', 'doença do vírus ébola', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '埃博拉', '埃博拉', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '伊波拉', '伊波拉', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '埃博拉病毒', '埃博拉病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'எபோலா', 'எப ல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'எபோலா வைரஸ்', 'எப ல வ ரஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Ebola'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Diphtheria', 'diphtheria', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Corynebacterium diphtheriae', 'corynebacterium diphtheriae', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Difteri', 'difteri', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Difteria', 'difteria', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Diffteria', 'diffteria', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Difteri', 'difteri', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคคอตีบ', 'โรคคอต บ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'คอตีบ', 'คอต บ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bạch hầu', 'bạch hầu', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh bạch hầu', 'bệnh bạch hầu', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'dipterya', 'dipterya', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဆုံဆို့နာ', 'ဆ ဆ န', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဆုံဆို့နာရောဂါ', 'ဆ ဆ န ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ខាន់ស្លាក់', 'ខ ន ស ល ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺខាន់ស្លាក់', 'ជ ង ខ ន ស ល ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດຄໍຕີບ', 'ພະຍາດຄ ຕ ບ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ຄໍຕີບ', 'ຄ ຕ ບ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'difteria', 'difteria', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras kakorok metin', 'moras kakorok metin', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'difteria', 'difteria', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '白喉', '白喉', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '白喉杆菌', '白喉杆菌', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'தொண்டை அடைப்பான்', 'த ண ட அட ப ப ன', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'டிப்தீரியா', 'ட ப த ர ய', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Diphtheria'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Dengue', 'dengue', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Dengue fever', 'dengue fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Dengue virus', 'dengue virus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Breakbone fever', 'breakbone fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'DHF', 'dhf', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'DSS', 'dss', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'DBD', 'dbd', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam berdarah', 'demam berdarah', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam berdarah dengue', 'demam berdarah dengue', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Infeksi dengue', 'infeksi dengue', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Dengue', 'dengue', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam denggi', 'demam denggi', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Denggi', 'denggi', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Wabak denggi', 'wabak denggi', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้เลือดออก', 'ไข เล อดออก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคไข้เลือดออก', 'โรคไข เล อดออก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เดงกี', 'เดงก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้เดงกี', 'ไข เดงก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt xuất huyết', 'sốt xuất huyết', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sot xuat huyet', 'sot xuat huyet', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt xuất huyết dengue', 'sốt xuất huyết dengue', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh sốt xuất huyết', 'bệnh sốt xuất huyết', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'dengue', 'dengue', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'trangkaso ng dengue', 'trangkaso ng dengue', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'lagnat ng dengue', 'lagnat ng dengue', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'သွေးလွန်တုပ်ကွေး', 'သ လ န တ ပ က', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'သွေးလွန်တုပ်ကွေးရောဂါ', 'သ လ န တ ပ က ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဒင်းဂီး', 'ဒင ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'គ្រុនឈាម', 'គ រ នឈ ម', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺគ្រុនឈាម', 'ជ ង គ រ នឈ ម', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'គ្រុនឈាមដេងហ្គី', 'គ រ នឈ មដ ងហ គ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ເລືອດອອກ', 'ໄຂ ເລ ອດອອກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດໄຂ້ເລືອດອອກ', 'ພະຍາດໄຂ ເລ ອດອອກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ເດັງກີ', 'ໄຂ ເດ ງກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'dengue', 'dengue', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras dengue', 'moras dengue', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'isin manas dengue', 'isin manas dengue', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'dengue', 'dengue', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'febre de dengue', 'febre de dengue', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '登革热', '登革热', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '登革病毒', '登革病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '骨痛热症', '骨痛热症', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'டெங்கு', 'ட ங க', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'டெங்கு காய்ச்சல்', 'ட ங க க ய ச சல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Dengue'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Crimean-Congo Hemorrhagic Fever', 'crimean-congo hemorrhagic fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'CCHF', 'cchf', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Crimean-Congo fever', 'crimean-congo fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Berdarah Krimea-Kongo', 'demam berdarah krimea-kongo', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Krimea-Kongo', 'demam krimea-kongo', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'CCHF', 'cchf', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Berdarah Crimean-Congo', 'demam berdarah crimean-congo', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Crimean-Congo', 'demam crimean-congo', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้เลือดออกไครเมียนคองโก', 'ไข เล อดออกไครเม ยนคองโก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคไข้เลือดออกไครเมีย-คองโก', 'โรคไข เล อดออกไครเม ย-คองโก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt xuất huyết Crimean-Congo', 'sốt xuất huyết crimean-congo', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh sốt Crimean-Congo', 'bệnh sốt crimean-congo', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Crimean-Congo hemorrhagic fever', 'crimean-congo hemorrhagic fever', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ခရိုင်းမီးယား-ကွန်ဂို သွေးလွန်တုပ်ကွေး', 'ခရ င မ ယ -က န ဂ သ လ န တ ပ က', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'គ្រុនឈាមគ្រីមៀកុងហ្គោ', 'គ រ នឈ មគ រ ម ក ងហ គ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ເລືອດອອກຄຣີເມຍຄອງໂກ', 'ໄຂ ເລ ອດອອກຄຣ ເມຍຄອງໂກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'febre hemorrágica da Crimeia-Congo', 'febre hemorrágica da crimeia-congo', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'CCHF', 'cchf', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '克里米亚-刚果出血热', '克里米亚-刚果出血热', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '新疆出血热', '新疆出血热', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'கிரிமியன்-காங்கோ ரத்தக்கசிவு காய்ச்சல்', 'க ர ம யன -க ங க ரத தக கச வ க ய ச சல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Crimean-Congo Hemorrhagic Fever'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'COVID-19', 'covid-19', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'COVID19', 'covid19', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Coronavirus', 'coronavirus', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'SARS-CoV-2', 'sars-cov-2', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '2019-nCoV', '2019-ncov', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'COVID-19', 'covid-19', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Korona', 'korona', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Corona', 'corona', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus korona', 'virus korona', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'COVID-19', 'covid-19', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Koronavirus', 'koronavirus', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Wabak COVID-19', 'wabak covid-19', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โควิด-19', 'โคว ด-19', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โควิด', 'โคว ด', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไวรัสโคโรนา', 'ไวร สโคโรนา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'COVID-19', 'covid-19', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'covid', 'covid', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'vi rút SARS-CoV-2', 'vi rút sars-cov-2', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'COVID-19', 'covid-19', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'koronabirus', 'koronabirus', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ကိုဗစ်-၁၉', 'က ဗစ -၁၉', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ကိုဗစ်', 'က ဗစ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ကိုရိုနာဗိုင်းရပ်စ်', 'က ရ န ဗ င ရပ စ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'កូវីដ-១៩', 'ក វ ដ-១៩', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'កូវីដ', 'ក វ ដ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'កូរ៉ូណាវីរុស', 'ក រ ណ វ រ ស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໂຄວິດ-19', 'ໂຄວ ດ-19', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໂຄວິດ', 'ໂຄວ ດ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄວຣັສໂຄໂຣນາ', 'ໄວຣ ສໂຄໂຣນາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'COVID-19', 'covid-19', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras koronavírus', 'moras koronavírus', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'COVID-19', 'covid-19', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'coronavírus', 'coronavírus', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '新冠肺炎', '新冠肺炎', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '新型冠状病毒', '新型冠状病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '新冠', '新冠', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '冠状病毒', '冠状病毒', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'கோவிட்-19', 'க வ ட -19', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'கொரோனா', 'க ர ன', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'கொரோனா வைரஸ்', 'க ர ன வ ரஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'COVID-19'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Chikungunya', 'chikungunya', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Chikungunya fever', 'chikungunya fever', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'CHIKV', 'chikv', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Chikungunya', 'chikungunya', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Cikungunya', 'cikungunya', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Flu tulang', 'flu tulang', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Chikungunya', 'chikungunya', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Demam Chikungunya', 'demam chikungunya', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ชิคุนกุนยา', 'ช ค นก นยา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้ปวดข้อยุงลาย', 'ไข ปวดข อย งลาย', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคชิคุนกุนยา', 'โรคช ค นก นยา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'chikungunya', 'chikungunya', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt chikungunya', 'sốt chikungunya', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh chikungunya', 'bệnh chikungunya', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'chikungunya', 'chikungunya', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ချီကွန်ဂุนယာ', 'ခ က န ဂ นယ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ချီကွန်ဂန်းယား', 'ခ က န ဂန ယ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ឈីកគុនហ្គុនយ៉ា', 'ឈ កគ នហ គ នយ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺគ្រុនឈីក', 'ជ ង គ រ នឈ ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ຊິຄຸນກຸນຍາ', 'ຊ ຄ ນກ ນຍາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ຊິຄຸນກຸນຍາ', 'ໄຂ ຊ ຄ ນກ ນຍາ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'chikungunya', 'chikungunya', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras chikungunya', 'moras chikungunya', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'chikungunya', 'chikungunya', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'febre chikungunya', 'febre chikungunya', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '基孔肯雅热', '基孔肯雅热', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '基孔肯雅', '基孔肯雅', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'சிக்குன்குனியா', 'ச க க ன க ன ய', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Chikungunya'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Avian Influenza (Bird Flu)', 'avian influenza bird flu', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Avian Influenza', 'avian influenza', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Bird flu', 'bird flu', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Avian flu', 'avian flu', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'H5N1', 'h5n1', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'H7N9', 'h7n9', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'H5N6', 'h5n6', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Flu Burung', 'flu burung', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Avian Influenza', 'avian influenza', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Virus H5N1', 'virus h5n1', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Selsema burung', 'selsema burung', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Flu burung', 'flu burung', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Avian influenza', 'avian influenza', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้หวัดนก', 'ไข หว ดนก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคไข้หวัดนก', 'โรคไข หว ดนก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไวรัสหวัดนก', 'ไวร สหว ดนก', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'เอช5เอ็น1', 'เอช5เอ น1', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'cúm gia cầm', 'cúm gia cầm', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'cúm A/H5N1', 'cúm a h5n1', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'cúm h5n1', 'cúm h5n1', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh cúm gia cầm', 'bệnh cúm gia cầm', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'trangkaso ng ibon', 'trangkaso ng ibon', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bird flu', 'bird flu', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'avian flu', 'avian flu', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ကြက်ငှက်တုပ်ကွေး', 'က က င က တ ပ က', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ကြက်ငှက်တုပ်ကွေးရောဂါ', 'က က င က တ ပ က ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ផ្តាសាយបក្សី', 'ផ ត ស យបក ស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺផ្តាសាយបក្សី', 'ជ ង ផ ត ស យបក ស', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ຫວັດສັດປີກ', 'ໄຂ ຫວ ດສ ດປ ກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ໄຂ້ຫວັດນົກ', 'ໄຂ ຫວ ດນ ກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'gripu manu', 'gripu manu', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras gripu manu', 'moras gripu manu', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'gripe aviária', 'gripe aviária', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'gripe das aves', 'gripe das aves', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '禽流感', '禽流感', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '鸟流感', '鸟流感', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'H5N1禽流感', 'h5n1禽流感', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'பறவை காய்ச்சல்', 'பறவ க ய ச சல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ஏவியன் காய்ச்சல்', 'ஏவ யன க ய ச சல', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Avian Influenza (Bird Flu)'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Anthrax', 'anthrax', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Bacillus anthracis', 'bacillus anthracis', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Woolsorter disease', 'woolsorter disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Antraks', 'antraks', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Radang limpa', 'radang limpa', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Bacillus anthracis', 'bacillus anthracis', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Antraks', 'antraks', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'แอนแทรกซ์', 'แอนแทรกซ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคแอนแทรกซ์', 'โรคแอนแทรกซ', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh than', 'bệnh than', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh nhiệt thán', 'bệnh nhiệt thán', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'antraks', 'antraks', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဒေါင့်သန်း', 'ဒ င သန', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ဒေါင့်သန်းရောဂါ', 'ဒ င သန ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'អង់ត្រាក់', 'អង ត រ ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺអង់ត្រាក់', 'ជ ង អង ត រ ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດແອນແທຣັກ', 'ພະຍາດແອນແທຣ ກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ແອນແທຣັກ', 'ແອນແທຣ ກ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ántrax', 'ántrax', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras antraz', 'moras antraz', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'antraz', 'antraz', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'carbúnculo', 'carbúnculo', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '炭疽', '炭疽', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '炭疽热', '炭疽热', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '炭疽杆菌', '炭疽杆菌', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ஆந்த்ராக்ஸ்', 'ஆந த ர க ஸ', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'கரிநோய்', 'கர ந ய', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Anthrax'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Unknown Disease', 'unknown disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Disease X', 'disease x', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Undiagnosed illness', 'undiagnosed illness', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Mystery disease', 'mystery disease', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Unexplained illness', 'unexplained illness', 'en', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit Tidak Dikenal', 'penyakit tidak dikenal', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit misterius', 'penyakit misterius', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Sindrom misterius', 'sindrom misterius', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Wabah misterius', 'wabah misterius', 'id', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit misteri', 'penyakit misteri', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'Penyakit tidak diketahui', 'penyakit tidak diketahui', 'ms', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคไม่ทราบสาเหตุ', 'โรคไม ทราบสาเหต', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคปริศนา', 'โรคปร ศนา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'โรคระบาดปริศนา', 'โรคระบาดปร ศนา', 'th', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh lạ', 'bệnh lạ', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh chưa rõ nguyên nhân', 'bệnh chưa rõ nguyên nhân', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'bệnh bí ẩn', 'bệnh bí ẩn', 'vi', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'misteryosong sakit', 'misteryosong sakit', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'di-kilalang sakit', 'di-kilalang sakit', 'tl', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'အမည်မသိရောဂါ', 'အမည မသ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ထူးဆန်းသောရောဂါ', 'ထ ဆန သ ရ ဂ', 'my', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺចម្លែក', 'ជ ង ចម ល ក', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ជំងឺមិនស្គាល់អត្តសញ្ញាណ', 'ជ ង ម នស គ ល អត តសញ ញ ណ', 'km', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດແປກປະຫຼາດ', 'ພະຍາດແປກປະຫ າດ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ພະຍາດບໍ່ຮູ້ສາເຫດ', 'ພະຍາດບ ຮ ສາເຫດ', 'lo', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras misteriozu', 'moras misteriozu', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'moras la konhesidu', 'moras la konhesidu', 'tet', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'doença desconhecida', 'doença desconhecida', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'doença misteriosa', 'doença misteriosa', 'pt', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '不明疾病', '不明疾病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '神秘疾病', '神秘疾病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '未知疾病', '未知疾病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'X疾病', 'x疾病', 'zh', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'விவரிக்க முடியாத நோய்', 'வ வர க க ம ட ய த ந ய', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'தெரியாத நோய்', 'த ர ய த ந ய', 'ta', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'Unknown Disease'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;

-- 5. Insert NLP Disease Keywords mapped to canonical labels
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Zika', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Zika virus', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Zika fever', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ZIKV', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Virus Zika', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam Zika', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ซิกา', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้ซิกา', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไวรัสซิกา', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt Zika', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vi rút Zika', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'virus na Zika', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'trangkasong Zika', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဇီကာ', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဇီကာဗိုင်းရပ်စ်', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဇီကာဖျားနာ', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ហ្ស៊ីកា', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺហ្ស៊ីកា', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'វីរុសហ្ស៊ីកា', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ຊິກາ', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ຊິກາ', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄວຣັສຊິກາ', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras Zika', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vírus Zika', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'febre Zika', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '寨卡', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '寨卡病毒', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '寨卡热', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ஜிகா', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ஜிகா வைரஸ்', 'Zika', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'West Nile', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'West Nile virus', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'West Nile fever', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'WNV', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Virus West Nile', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam West Nile', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Nil Barat', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เวสต์ไนล์', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไวรัสเวสต์ไนล์', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้เวสต์ไนล์', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt West Nile', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'virus ng West Nile', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဝက်စ်နိုင်း', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဝက်စ်နိုင်းဗိုင်းရပ်စ်', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'នីលខាងលិច', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'វីរុសនីលខាងលិច', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ເວສໄນລ໌', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄວຣັສເວສໄນລ໌', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras West Nile', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Nilo Ocidental', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vírus do Nilo Ocidental', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '西尼罗河病毒', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '西尼罗病毒', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'மேற்கு நைல் வைரஸ்', 'West Nile', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Typhoid', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Typhoid fever', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Enteric fever', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Tifus', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Tipus', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Tipes', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam Tifoid', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam kepialu', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Kepialu', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Tifoid', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้รากสาดน้อย', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้ไทฟอยด์', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไทฟอยด์', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'thương hàn', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt thương hàn', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh thương hàn', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'lagnat na tipus', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'တိုက်ဖွိုက်', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'အူရောင်ငန်းဖျား', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'အူရောင်ငန်းဖျားရောဂါ', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'គ្រុនពោះវៀន', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺគ្រុនពោះវៀន', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ໄທຟອຍ', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ຮາກສາດ', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄທຟອຍ', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tifóide', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras tifóide', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tifu', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'febre tifóide', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tifoide', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '伤寒', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '副伤寒', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'டைபாய்டு', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'டைபாய்டு காய்ச்சல்', 'Typhoid', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Tuberculosis', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'TB', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'consumption', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Tuberkulosis', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'TBC', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'TB paru', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'flek paru', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Batuk kering', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Tibi', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Sakit tibi', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'วัณโรค', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรควัณโรค', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ทีบี', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh lao', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'lao phổi', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vi trùng lao', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'lao', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tisis', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sakit sa baga', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'တီဘီ', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'တီဘီရောဂါ', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'အဆုတ်တီဘီ', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'របេង', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺរបេង', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'របេងសួត', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ວັນນະໂຣກ', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດວັນນະໂຣກ', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ທີບີ', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tuberkulóze', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras TBC', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tuberculose', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tísica', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '结核病', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '肺结核', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '痨病', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'காசநோய்', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'டிபி', 'Tuberculosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Rift Valley Fever', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Rift Valley fever virus', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'RVF', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam Lembah Rift', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam Rift Valley', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้ริฟต์แวลลีย์', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคไข้ริฟต์แวลลีย์', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt thung lũng Rift', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh sốt thung lũng Rift', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ရစ်ဖ်တောင်ကြားဖျားနာ', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'គ្រុនរីហ្វវ៉ាលី', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ຮິບວາເລ', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'febre do Vale do Rift', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '裂谷热', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '裂谷热病毒', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ரிப்ட் பள்ளத்தாக்கு காய்ச்சல்', 'Rift Valley Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Rabies', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'hydrophobia', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'rabies virus', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Anjing gila', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit anjing gila', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคพิษสุนัขบ้า', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคกลัวน้ำ', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'พิษสุนัขบ้า', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh dại', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'dại', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vi rút dại', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'rabis', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ခွေးရူးရောဂါ', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ခွေးရူးပြန်ရောဂါ', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ခွေးရူး', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺឆ្កែឆ្កួត', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ឆ្កែឆ្កួត', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດວໍ້', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດໝາບ້າ', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໝາບ້າ', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras rabies', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'asu bulak', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'raiva', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'hidrofobia', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '狂犬病', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '疯狗症', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'வெறிநாய் கடி', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ரேபிஸ்', 'Rabies', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Polio (Paralysis)', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Polio', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Poliomyelitis', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Infantile paralysis', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Acute flaccid paralysis', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'AFP', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Poliomielitis', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Kelumpuhan layu akut', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Lumpuh layu', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Lumpuh kanak-kanak', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โปลิโอ', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคโปลิโอ', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'อัมพาตโปลิโอ', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bại liệt', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh bại liệt', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'liệt mềm cấp', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'paralisis', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'poliyomiyelitis', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ပိုလီယို', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ပိုလီယိုရောဂါ', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ကလေးသူငယ်အကြောသေရောဂါ', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ស្វិតដៃជើង', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺស្វិតដៃជើង', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ប៉ូលីយ៉ូ', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໂປລີໂອ', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດໂປລີໂອ', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras polio', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'paralizia', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'poliomielite', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'paralisia infantil', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '脊髓灰质炎', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '小儿麻痹症', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '小儿麻痹', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'இளம்பிள்ளை வாதம்', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'போலியோ', 'Polio (Paralysis)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Pertussis (Whooping Cough)', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Pertussis', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Whooping cough', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '100-day cough', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Pertusis', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Batuk rejan', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Batuk seratus hari', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Batuk 100 hari', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Batuk kokol', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคไอกรน', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไอกรน', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ho gà', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh ho gà', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tusperina', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'dalahit na ubo', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ကြက်ညှာ', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ကြက်ညှာချောင်းဆိုး', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ကြက်ညှာချောင်းဆိုးရောဂါ', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ក្អកមាន់', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺក្អកមាន់', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄອໄກ່', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດໄອໄກ່', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tos ferina', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras mear', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tosse convulsa', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'coqueluche', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '百日咳', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'கக்குவான் இருமல்', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'பெர்டுசிஸ்', 'Pertussis (Whooping Cough)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Nipah', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Nipah virus', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Nipah virus disease', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'NiV', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Virus Nipah', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit virus Nipah', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Wabak Nipah', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'นิปาห์', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไวรัสนิปาห์', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคนิปาห์', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vi rút Nipah', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'virus na Nipah', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'နီပါ', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'နီပါဗိုင်းရပ်စ်', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'នីប៉ា', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'វីរុសនីប៉ា', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ນິປາ', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄວຣັສນິປາ', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vírus Nipah', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '尼帕病毒', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '立百病毒', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'நிபா', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'நிபா வைரஸ்', 'Nipah', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Mpox (Monkeypox)', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Mpox', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Monkeypox', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Monkey pox', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Cacar monyet', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ฝีดาษลิง', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ฝีดาษวานร', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เอ็มพ็อกซ์', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เอ็มพอกซ์', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'đậu mùa khỉ', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh đậu mùa khỉ', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bulutong-unggoy', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'မျောက်ကျောက်', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'မျောက်ကျောက်ရောဂါ', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'အမ်ပေါက်စ်', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'អុតស្វា', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺអុតស្វា', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'អឹមផក', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໝາກໝອກລີງ', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ໝາກໝອກລີງ', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ເອັມພັອກ', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'cacar makaku', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'varíola dos macacos', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '猴痘', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '猴痘病毒', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'குரங்கம்மை', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'எம்பாக்ஸ்', 'Mpox (Monkeypox)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'MERS', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'MERS-CoV', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Middle East Respiratory Syndrome', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Sindrom Pernapasan Timur Tengah', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Sindrom Pernafasan Timur Tengah', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เมอร์ส', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคเมอร์ส', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคทางเดินหายใจตะวันออกกลาง', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'hội chứng hô hấp Trung Đông', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'မားစ်', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'မားစ်ရောဂါ', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'មជ្ឈិមបូព៌ា', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺផ្លូវដង្ហើមមជ្ឈិមបូព៌ា', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ເມິສ', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດເມິສ', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sindroma MERS', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Síndrome Respiratória do Médio Oriente', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '中东呼吸综合征', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '中东呼吸道症候群', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'மெர்ஸ்', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'மெர்ஸ் காய்ச்சல்', 'MERS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Melioidosis', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Whitmore disease', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Burkholderia pseudomallei', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit Whitmore', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคเมลิออยด์', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เมลิออยโดสิส', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคไข้ดิน', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh Whitmore', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vi khuẩn whitmore', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'မယ်လီအွိုက်ဒိုးဆစ်', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'မြေဆီလွှာဘက်တီးရီးယား', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'មេលីអូអ៊ីដូស', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺមេលីអូអ៊ីដូស', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ເມລິອອຍ', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດເມລິອອຍ', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'melioidose', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'doença de Whitmore', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '类鼻疽', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '类鼻疽杆菌', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'மெலியோய்டோசிஸ்', 'Melioidosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Measles', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Rubeola', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Morbilli', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Campak', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Morbili', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Gabagen', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam campak', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคหัด', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้หัด', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'หัด', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh sởi', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sởi', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tigdas', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဝက်သက်', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဝက်သက်ရောဂါ', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'កញ្ជ្រឹល', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺកញ្ជ្រឹល', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໝາກແດງ', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດໝາກແດງ', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sarampu', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras sarampu', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sarampo', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '麻疹', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '出疹', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'தட்டம்மை', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'மணல்வாரி', 'Measles', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Marburg', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Marburg virus', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Marburg virus disease', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'MVD', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Virus Marburg', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam berdarah Marburg', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'มาร์บวร์ก', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไวรัสมาร์บวร์ก', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้มาร์บวร์ก', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vi rút Marburg', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh sốt Marburg', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'virus na Marburg', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'မာဘတ်', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'မာဘတ်ဗိုင်းရပ်စ်', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ម៉ាប៊ើក', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'វីរុសម៉ាប៊ើក', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ມາເບີກ', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄວຣັສມາເບີກ', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Marburgo', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vírus de Marburgo', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '马尔堡', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '马尔堡病毒', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '马尔堡出血热', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'மார்बर्ग', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'மார்பர்க் வைரஸ்', 'Marburg', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Malaria', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Plasmodium', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Paludism', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam malaria', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'มาลาเรีย', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้จับสั่น', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้ป่า', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt rét', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh sốt rét', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ငှက်ဖျား', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ငှက်ဖျားရောဂါ', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'គ្រុនចាញ់', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺគ្រុនចាញ់', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ຍຸງ', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ມາລາເຣຍ', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ປ່າ', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'malária', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras malaria', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'paludismo', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '疟疾', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '打摆子', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'மலேரியா', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'மலேரியா காய்ச்சல்', 'Malaria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Lymphatic Filariasis', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Filariasis', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Elephantiasis', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Kaki gajah', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit kaki gajah', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Untut', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit untut', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคเท้าช้าง', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เท้าช้าง', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'phù voi', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh phù voi', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'giun chỉ bạch huyết', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'elepantiasis', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဆင်ခြေထောက်ရောဂါ', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဆင်ခြေထောက်', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជើងដំរី', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺជើងដំរី', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດຕີນຊ້າງ', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ຕີນຊ້າງ', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'elefantíase', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras ain boot', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'filariose linfática', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '丝虫病', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '淋巴丝虫病', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '象皮病', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'யானைக்கால் நோய்', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'பைலேரியாசிஸ்', 'Lymphatic Filariasis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Leptospirosis', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Weil disease', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'rat fever', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Kencing tikus', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam kencing tikus', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit kencing tikus', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคฉี่หนู', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ฉี่หนู', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เลปโตสไปโรซิส', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'leptospira', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh xoắn khuẩn vàng da', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt xoắn khuẩn', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ihi ng daga', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ကြွက်ဆီးရောဂါ', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'လက်ပတိုစပိုင်ရိုဆစ်', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ឡិបតូស្ពីរ៉ូស', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺឡិបតូស្ពីរ៉ូស', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດຍ່ຽວໜູ', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ຍ່ຽວໜູ', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'leptospirose', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras lixu-lao', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'doença de Weil', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '钩端螺旋体病', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '钩体病', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'எலி காய்ச்சல்', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'லெப்டோஸ்பிரோசிஸ்', 'Leptospirosis', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Lassa fever', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Lassa virus', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'LASSA_FEVER', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam Lassa', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Lassa', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Virus Lassa', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้ลัสซา', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคไข้ลัสซา', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt Lassa', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'လာဆာဖျားနာ', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'လာဆာဗိုင်းရပ်စ်', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'គ្រុនឡាសា', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ລັດຊາ', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'febre de Lassa', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '拉沙热', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '拉沙病毒', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'லாசா காய்ச்சல்', 'Lassa fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'HIV/AIDS', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'HIV', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'AIDS', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Odha', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เอชไอวี', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคเอดส์', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เอดส์', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'nhiễm HIV', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh AIDS', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'အိတ်ခ်ျအိုင်ဗွီ', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'အေအိုင်ဒီအက်စ်', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'အေဒီအက်စ်', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'មេរោគអេដស៍', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺអេដស៍', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'អេដស៍', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ເອດສ໌', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດເອດສ໌', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ເອສໄອວີ', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'HIV/SIDA', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras SIDA', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'VIH/SIDA', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'SIDA', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '艾滋病', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '艾滋', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '爱滋病', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'எச்.ஐ.வி', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'எய்ட்ஸ்', 'HIV/AIDS', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Henipaviral disease', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Henipavirus', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Hendra virus', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Langya virus', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit Henipavirus', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Virus Hendra', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคเฮนิปาไวรัส', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เฮนิปาไวรัส', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh do virus henipavirus', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဟနီပါဗိုင်းရပ်စ်', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'វីរុសហេនីប៉ា', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺវីរុសហេនីប៉ា', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດເຮນິພາໄວຣັສ', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'henipavírus', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '亨尼帕病毒', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '琅琊病毒', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ஹெனிபாவைரஸ்', 'Henipaviral disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Hantavirus', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Hantavirus pulmonary syndrome', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'HPS', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'HFRS', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam berdarah sindrom ginjal', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ฮันตาไวรัส', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไวรัสฮันตา', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคฮันตาไวรัส', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'hội chứng phổi hantavirus', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဟန်တာဗိုင်းရပ်စ်', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'វីរុសហាន់តា', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄວຣັສຮານຕາ', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'hantavírus', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '汉坦病毒', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '汉他病毒', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ஹந்தாவைரஸ்', 'Hantavirus', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Hand, Foot, and Mouth Disease (HFMD)', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Hand, Foot, and Mouth Disease', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'HFMD', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Hand foot mouth disease', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Flu Singapura', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit tangan kaki dan mulut', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'PTKM', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit tangan, kaki dan mulut', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคมือเท้าปาก', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'มือเท้าปาก', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคเอชเอฟเอ็มดี', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'tay chân miệng', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh tay chân miệng', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'TCM', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sakit sa kamay, paa, at bibig', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'လက်၊ ခြေ၊ ခံတွင်းရောဂါ', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'လက်ခြေခံတွင်း', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺពងបែកដៃជើងនិងក្នុងមាត់', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺដៃជើងមាត់', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດມືຕີນປາກ', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ມືຕີນປາກ', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras liman ain no ibun', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'doença mão-pé-boca', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '手足口病', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '手足口症', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '肠病毒71型', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'கை, கால் மற்றும் வாய் நோய்', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'எச்.எஃப்.எம்.டி', 'Hand, Foot, and Mouth Disease (HFMD)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Ebola', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Ebola virus', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Ebola disease', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Ebola virus disease', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'EVD', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Virus Ebola', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit virus Ebola', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'อีโบลา', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคไวรัสอีโบลา', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไวรัสอีโบลา', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh Ebola', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt xuất huyết Ebola', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'virus na Ebola', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'အီဘိုလာ', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'အီဘိုလာဗိုင်းရပ်စ်', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'អេបូឡា', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺអេបូឡា', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ອີໂບລາ', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດອີໂບລາ', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras Ebola', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Ébola', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vírus do Ébola', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'doença do vírus Ébola', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '埃博拉', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '伊波拉', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '埃博拉病毒', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'எபோலா', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'எபோலா வைரஸ்', 'Ebola', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Diphtheria', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Corynebacterium diphtheriae', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Difteri', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Difteria', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Diffteria', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคคอตีบ', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'คอตีบ', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bạch hầu', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh bạch hầu', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'dipterya', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဆုံဆို့နာ', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဆုံဆို့နာရောဂါ', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ខាន់ស្លាក់', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺខាន់ស្លាក់', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດຄໍຕີບ', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ຄໍຕີບ', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras kakorok metin', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '白喉', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '白喉杆菌', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'தொண்டை அடைப்பான்', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'டிப்தீரியா', 'Diphtheria', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Dengue', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Dengue fever', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Dengue virus', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Breakbone fever', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'DHF', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'DSS', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'DBD', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam berdarah', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam berdarah dengue', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Infeksi dengue', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam denggi', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Denggi', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Wabak denggi', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้เลือดออก', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคไข้เลือดออก', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เดงกี', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้เดงกี', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt xuất huyết', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sot xuat huyet', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt xuất huyết dengue', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh sốt xuất huyết', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'trangkaso ng dengue', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'lagnat ng dengue', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'သွေးလွန်တုပ်ကွေး', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'သွေးလွန်တုပ်ကွေးရောဂါ', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဒင်းဂီး', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'គ្រុនឈាម', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺគ្រុនឈាម', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'គ្រុនឈាមដេងហ្គី', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ເລືອດອອກ', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດໄຂ້ເລືອດອອກ', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ເດັງກີ', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras dengue', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'isin manas dengue', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'febre de dengue', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '登革热', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '登革病毒', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '骨痛热症', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'டெங்கு', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'டெங்கு காய்ச்சல்', 'Dengue', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Crimean-Congo Hemorrhagic Fever', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'CCHF', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Crimean-Congo fever', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam Berdarah Krimea-Kongo', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam Krimea-Kongo', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam Berdarah Crimean-Congo', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam Crimean-Congo', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้เลือดออกไครเมียนคองโก', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคไข้เลือดออกไครเมีย-คองโก', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt xuất huyết Crimean-Congo', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh sốt Crimean-Congo', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ခရိုင်းမီးယား-ကွန်ဂို သွေးလွန်တုပ်ကွေး', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'គ្រុនឈាមគ្រីមៀកុងហ្គោ', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ເລືອດອອກຄຣີເມຍຄອງໂກ', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'febre hemorrágica da Crimeia-Congo', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '克里米亚-刚果出血热', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '新疆出血热', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'கிரிமியன்-காங்கோ ரத்தக்கசிவு காய்ச்சல்', 'Crimean-Congo Hemorrhagic Fever', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'COVID-19', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'COVID19', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Coronavirus', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'SARS-CoV-2', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '2019-nCoV', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Korona', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Corona', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Virus korona', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Koronavirus', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Wabak COVID-19', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โควิด-19', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โควิด', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไวรัสโคโรนา', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'covid', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'vi rút SARS-CoV-2', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'koronabirus', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ကိုဗစ်-၁၉', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ကိုဗစ်', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ကိုရိုနာဗိုင်းရပ်စ်', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'កូវីដ-១៩', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'កូវីដ', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'កូរ៉ូណាវីរុស', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໂຄວິດ-19', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໂຄວິດ', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄວຣັສໂຄໂຣນາ', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras koronavírus', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'coronavírus', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '新冠肺炎', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '新型冠状病毒', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '新冠', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '冠状病毒', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'கோவிட்-19', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'கொரோனா', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'கொரோனா வைரஸ்', 'COVID-19', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Chikungunya', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Chikungunya fever', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'CHIKV', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Cikungunya', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Flu tulang', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Demam Chikungunya', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ชิคุนกุนยา', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้ปวดข้อยุงลาย', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคชิคุนกุนยา', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'sốt chikungunya', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh chikungunya', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ချီကွန်ဂุนယာ', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ချီကွန်ဂန်းယား', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ឈីកគុនហ្គុនយ៉ា', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺគ្រុនឈីក', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ຊິຄຸນກຸນຍາ', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ຊິຄຸນກຸນຍາ', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras chikungunya', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'febre chikungunya', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '基孔肯雅热', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '基孔肯雅', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'சிக்குன்குனியா', 'Chikungunya', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Avian Influenza (Bird Flu)', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Avian Influenza', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Bird flu', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Avian flu', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'H5N1', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'H7N9', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'H5N6', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Flu Burung', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Virus H5N1', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Selsema burung', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไข้หวัดนก', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคไข้หวัดนก', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ไวรัสหวัดนก', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'เอช5เอ็น1', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'cúm gia cầm', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'cúm A/H5N1', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'cúm h5n1', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh cúm gia cầm', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'trangkaso ng ibon', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ကြက်ငှက်တုပ်ကွေး', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ကြက်ငှက်တုပ်ကွေးရောဂါ', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ផ្តាសាយបក្សី', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺផ្តាសាយបក្សី', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ຫວັດສັດປີກ', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ໄຂ້ຫວັດນົກ', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'gripu manu', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras gripu manu', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'gripe aviária', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'gripe das aves', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '禽流感', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '鸟流感', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'H5N1禽流感', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'பறவை காய்ச்சல்', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ஏவியன் காய்ச்சல்', 'Avian Influenza (Bird Flu)', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Anthrax', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Bacillus anthracis', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Woolsorter disease', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Antraks', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Radang limpa', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'แอนแทรกซ์', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคแอนแทรกซ์', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh than', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh nhiệt thán', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဒေါင့်သန်း', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ဒေါင့်သန်းရောဂါ', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'អង់ត្រាក់', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺអង់ត្រាក់', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດແອນແທຣັກ', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ແອນແທຣັກ', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ántrax', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras antraz', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'antraz', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'carbúnculo', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '炭疽', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '炭疽热', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '炭疽杆菌', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ஆந்த்ராக்ஸ்', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'கரிநோய்', 'Anthrax', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Unknown Disease', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Disease X', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Undiagnosed illness', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Mystery disease', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Unexplained illness', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit Tidak Dikenal', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit misterius', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Sindrom misterius', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Wabah misterius', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit misteri', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'Penyakit tidak diketahui', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคไม่ทราบสาเหตุ', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคปริศนา', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'โรคระบาดปริศนา', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh lạ', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh chưa rõ nguyên nhân', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'bệnh bí ẩn', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'misteryosong sakit', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'di-kilalang sakit', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'အမည်မသိရောဂါ', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ထူးဆန်းသောရောဂါ', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺចម្លែក', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ជំងឺមិនស្គាល់អត្តសញ្ញាណ', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດແປກປະຫຼາດ', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'ພະຍາດບໍ່ຮູ້ສາເຫດ', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras misteriozu', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'moras la konhesidu', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'doença desconhecida', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'doença misteriosa', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '不明疾病', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '神秘疾病', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '未知疾病', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'X疾病', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'விவரிக்க முடியாத நோய்', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;
INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', 'தெரியாத நோய்', 'Unknown Disease', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;

-- 6. Ensure NLP labels contain all 31 canonical disease names
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Zika', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'West Nile', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Typhoid', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Tuberculosis', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Rift Valley Fever', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Rabies', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Polio (Paralysis)', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Pertussis (Whooping Cough)', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Nipah', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Mpox (Monkeypox)', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'MERS', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Melioidosis', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Measles', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Marburg', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Malaria', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Lymphatic Filariasis', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Leptospirosis', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Lassa fever', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'HIV/AIDS', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Henipaviral disease', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Hantavirus', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Hand, Foot, and Mouth Disease (HFMD)', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Ebola', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Diphtheria', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Dengue', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Crimean-Congo Hemorrhagic Fever', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'COVID-19', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Chikungunya', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Avian Influenza (Bird Flu)', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Anthrax', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;
INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', 'Unknown Disease', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;

-- 7. Re-link existing disease events and event diseases where names match

UPDATE disease_events de
SET primary_disease_concept_id = dc.id
FROM disease_concepts dc
WHERE de.disease_classification = dc.canonical_name
   OR lower(de.disease_classification) = lower(dc.canonical_name);

UPDATE disease_event_diseases ded
SET disease_concept_id = dc.id
FROM disease_concepts dc
WHERE ded.disease_name = dc.canonical_name
   OR lower(ded.disease_name) = lower(dc.canonical_name);

COMMIT;
