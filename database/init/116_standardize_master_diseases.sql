
-- 1. Ensure columns exist on disease_concepts
ALTER TABLE disease_concepts
  ADD COLUMN IF NOT EXISTS disease_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'General Infectious',
  ADD COLUMN IF NOT EXISTS is_zoonotic BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_engine BOOLEAN DEFAULT TRUE;

ALTER TABLE disease_concepts ALTER COLUMN disease_id TYPE VARCHAR(100);

-- 2. Ensure country_code on disease_aliases
ALTER TABLE disease_aliases
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_disease_aliases_country ON disease_aliases(country_code);

-- 3. Deactivate & redirect duplicate concepts
DO $$
DECLARE
  covid_id UUID;
  diarrhea_id UUID;
  ebola_id UUID;
  influenza_id UUID;
BEGIN
  SELECT id INTO covid_id FROM disease_concepts WHERE canonical_name = 'COVID-19' LIMIT 1;
  IF covid_id IS NOT NULL THEN
    UPDATE disease_concepts SET 
      is_active = FALSE, is_public = FALSE, allow_engine = FALSE, disease_id = 'COVID19_DUP'
    WHERE canonical_name = 'COVID19' AND id <> covid_id;

    INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, confidence, is_active, source)
    VALUES (covid_id, 'COVID19', 'covid19', 'en', 1.0, TRUE, 'standardization')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO diarrhea_id FROM disease_concepts WHERE canonical_name = 'Acute diarrhea' LIMIT 1;
  IF diarrhea_id IS NOT NULL THEN
    UPDATE disease_concepts SET 
      is_active = FALSE, is_public = FALSE, allow_engine = FALSE, disease_id = 'DIARE_AKUT_DUP'
    WHERE canonical_name = 'DIARE_AKUT' AND id <> diarrhea_id;

    UPDATE disease_concepts SET 
      is_active = FALSE, is_public = FALSE, allow_engine = FALSE, disease_id = 'DIARRHOEA_DUP'
    WHERE canonical_name = 'Diarrhoea' AND id <> diarrhea_id;

    INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, confidence, is_active, source)
    VALUES 
      (diarrhea_id, 'DIARE_AKUT', 'diare akut', 'id', 1.0, TRUE, 'standardization'),
      (diarrhea_id, 'Diarrhoea', 'diarrhoea', 'en', 1.0, TRUE, 'standardization')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO ebola_id FROM disease_concepts WHERE canonical_name IN ('Ebola disease, virus unspecified', 'Ebola') LIMIT 1;
  IF ebola_id IS NOT NULL THEN
    UPDATE disease_concepts SET canonical_name = 'Ebola' WHERE id = ebola_id;
    UPDATE disease_concepts SET 
      is_active = FALSE, is_public = FALSE, allow_engine = FALSE, disease_id = 'EBOLA_VIRUS_DUP'
    WHERE canonical_name = 'ebola virus' AND id <> ebola_id;

    INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, confidence, is_active, source)
    VALUES (ebola_id, 'ebola virus', 'ebola virus', 'en', 1.0, TRUE, 'standardization')
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO influenza_id FROM disease_concepts WHERE canonical_name = 'Influenza' LIMIT 1;
  IF influenza_id IS NOT NULL THEN
    UPDATE disease_concepts SET 
      is_active = FALSE, is_public = FALSE, allow_engine = FALSE, disease_id = 'INFLUENZA_FLU_DUP'
    WHERE canonical_name = 'influenza flu' AND id <> influenza_id;

    INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, confidence, is_active, source)
    VALUES (influenza_id, 'influenza flu', 'influenza flu', 'en', 1.0, TRUE, 'standardization')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Fix proper display casing for clean canonical names
  UPDATE disease_concepts SET canonical_name = 'Typhoid' WHERE canonical_name = 'typhoid fever';
  UPDATE disease_concepts SET canonical_name = 'Hantavirus' WHERE canonical_name = 'hantavirus';
  UPDATE disease_concepts SET canonical_name = 'Hepatitis' WHERE canonical_name = 'HEPATITIS';
  UPDATE disease_concepts SET canonical_name = 'Polio' WHERE canonical_name = 'POLIO';
END $$;

-- 4. Assign clean disease_id and metadata for Core Diseases
UPDATE disease_concepts SET 
  disease_id = 'DENGUE',
  category = 'Vector-borne Infection',
  is_zoonotic = FALSE,
  description = 'Mosquito-borne viral infection caused by the dengue virus, causing high fever, rash, and severe joint pain.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Dengue' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'COVID-19',
  category = 'Respiratory Infection',
  is_zoonotic = TRUE,
  description = 'Contagious respiratory disease caused by severe acute respiratory syndrome coronavirus 2 (SARS-CoV-2).',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'COVID-19' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'RABIES',
  category = 'Viral / Neurological',
  is_zoonotic = TRUE,
  description = 'Fatal viral disease causing encephalomyelitis, transmitted through bites or saliva of infected mammals.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Rabies' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'MEASLES',
  category = 'Viral / Exanthematous',
  is_zoonotic = FALSE,
  description = 'Highly contagious viral disease marked by fever, cough, and maculopapular erythematous rash.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Measles' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'CHOLERA',
  category = 'Water-borne / Diarrheal',
  is_zoonotic = FALSE,
  description = 'Acute diarrheal disease caused by Vibrio cholerae bacteria leading to severe dehydration.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Cholera' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'MPOX',
  category = 'Viral Infection',
  is_zoonotic = TRUE,
  description = 'Zoonotic infection caused by monkeypox virus characterized by fever and characteristic rash.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Mpox' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'CHIKUNGUNYA',
  category = 'Vector-borne Infection',
  is_zoonotic = FALSE,
  description = 'Viral infection transmitted to humans by Aedes mosquitoes causing severe debilitating joint pain.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Chikungunya' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'MALARIA',
  category = 'Vector-borne / Parasitic',
  is_zoonotic = FALSE,
  description = 'Life-threatening disease caused by Plasmodium parasites transmitted through female Anopheles mosquitoes.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Malaria' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'TUBERCULOSIS',
  category = 'Bacterial / Respiratory',
  is_zoonotic = FALSE,
  description = 'Chronic bacterial infection caused by Mycobacterium tuberculosis primarily affecting the lungs.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Tuberculosis' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'ZIKA',
  category = 'Vector-borne Infection',
  is_zoonotic = FALSE,
  description = 'Mosquito-borne flavivirus infection causing mild fever, rash, and associated with congenital microcephaly.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Zika virus disease' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'INFLUENZA',
  category = 'Respiratory Infection',
  is_zoonotic = TRUE,
  description = 'Contagious viral infection of the respiratory tract caused by influenza viruses.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Influenza' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'AVIAN_INFLUENZA',
  category = 'Respiratory / Zoonotic',
  is_zoonotic = TRUE,
  description = 'Bird flu strains (such as H5N1 and H7N9) causing severe acute respiratory illness in humans.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Avian influenza' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'ANTHRAX',
  category = 'Bacterial / Zoonotic',
  is_zoonotic = TRUE,
  description = 'Serious infectious disease caused by Bacillus anthracis spore transmission from livestock or animal products.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Anthrax' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'POLIO',
  category = 'Viral / Enterovirus',
  is_zoonotic = FALSE,
  description = 'Poliovirus infection transmitted via the fecal-oral route that can invade the central nervous system causing paralysis.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Polio' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'DIPHTHERIA',
  category = 'Bacterial / Respiratory',
  is_zoonotic = FALSE,
  description = 'Acute toxic bacterial disease of the upper respiratory tract caused by Corynebacterium diphtheriae.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Diphtheria' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'PERTUSSIS',
  category = 'Bacterial / Respiratory',
  is_zoonotic = FALSE,
  description = 'Highly contagious bacterial respiratory disease (whooping cough) caused by Bordetella pertussis.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Pertussis' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'TETANUS',
  category = 'Bacterial / Wound',
  is_zoonotic = FALSE,
  description = 'Acute and fatal disease caused by the neurotoxin of Clostridium tetani entering through contaminated wounds.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Tetanus' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'LEPTOSPIROSIS',
  category = 'Bacterial / Zoonotic',
  is_zoonotic = TRUE,
  description = 'Bacterial zoonosis transmitted through contact with water or soil contaminated by the urine of infected rodents.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Leptospirosis' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'NIPAH',
  category = 'Viral / Zoonotic',
  is_zoonotic = TRUE,
  description = 'Zoonotic pathogen carried by fruit bats that causes encephalitis and acute respiratory distress with high fatality.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Nipah virus disease' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'TYPHOID',
  category = 'Food-borne diseases',
  is_zoonotic = FALSE,
  description = 'Systemic bacterial infection caused by Salmonella Typhi ingested through contaminated food or water.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Typhoid' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'EBOLA',
  category = 'Viral Hemorrhagic Fever',
  is_zoonotic = TRUE,
  description = 'Severe, often fatal filovirus infection causing hemorrhagic fever in humans and nonhuman primates.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Ebola' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'YELLOW_FEVER',
  category = 'Vector-borne Infection',
  is_zoonotic = TRUE,
  description = 'Acute viral hemorrhagic disease transmitted by infected mosquitoes with jaundice and liver failure.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Yellow fever' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'WEST_NILE',
  category = 'Vector-borne Infection',
  is_zoonotic = TRUE,
  description = 'Flavivirus infection transmitted by mosquitoes, can lead to neurological disease including encephalitis.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'West Nile virus infection' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'JAPANESE_ENCEPHALITIS',
  category = 'Vector-borne Infection',
  is_zoonotic = TRUE,
  description = 'Mosquito-borne flavivirus infection causing inflammation of the brain throughout Asia.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Japanese encephalitis' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'ACUTE_DIARRHEA',
  category = 'Water-borne / Diarrheal',
  is_zoonotic = FALSE,
  description = 'Acute gastroenteritis causing severe loose stools and dehydration.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Acute diarrhea' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'HEPATITIS',
  category = 'Viral Infection',
  is_zoonotic = FALSE,
  description = 'Inflammatory condition of the liver caused by viral hepatitis infection.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Hepatitis' AND is_active = TRUE;

UPDATE disease_concepts SET 
  disease_id = 'HANTAVIRUS',
  category = 'Viral / Zoonotic',
  is_zoonotic = TRUE,
  description = 'Rodent-borne hantavirus infection causing hemorrhagic fever with renal syndrome or cardiopulmonary syndrome.',
  is_public = TRUE,
  allow_engine = TRUE
WHERE canonical_name = 'Hantavirus' AND is_active = TRUE;

-- 5. Auto-assign clean disease_id for any remaining active concepts
UPDATE disease_concepts
SET disease_id = LEFT(UPPER(REGEXP_REPLACE(REGEXP_REPLACE(canonical_name, '[^a-zA-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g')), 60)
WHERE (disease_id IS NULL OR disease_id = '') AND is_active = TRUE;

-- Ensure disease_id is unique
DROP INDEX IF EXISTS idx_disease_concepts_disease_id;
CREATE UNIQUE INDEX idx_disease_concepts_disease_id ON disease_concepts(disease_id);

-- 6. Clean and Deduplicate Historical disease_events
UPDATE disease_events SET disease_classification = 'Dengue' 
WHERE disease_classification IN ('dengue fever DBD', 'DBD', 'DENGUE', 'dengue');

UPDATE disease_events SET disease_classification = 'COVID-19' 
WHERE disease_classification IN ('COVID-19 coronavirus', 'COVID19', 'covid-19', 'COVID-19');

UPDATE disease_events SET disease_classification = 'Measles' 
WHERE disease_classification IN ('measles campak', 'campak', 'MEASLES', 'measles');

UPDATE disease_events SET disease_classification = 'Influenza' 
WHERE disease_classification IN ('influenza flu', 'flu', 'INFLUENZA', 'influenza');

UPDATE disease_events SET disease_classification = 'Rabies' 
WHERE disease_classification IN ('RABIES', 'rabies');

UPDATE disease_events SET disease_classification = 'Cholera' 
WHERE disease_classification IN ('CHOLERA', 'cholera', 'kolera');

UPDATE disease_events SET disease_classification = 'Typhoid' 
WHERE disease_classification IN ('typhoid fever', 'tifus');

UPDATE disease_events SET disease_classification = 'Ebola' 
WHERE disease_classification IN ('Ebola disease, virus unspecified', 'ebola virus');

UPDATE disease_events SET disease_classification = 'Chikungunya' 
WHERE disease_classification IN ('CHIKUNGUNYA', 'chikungunya');

-- 7. Seed Official ASEAN Country Aliases into disease_aliases
DO $$
DECLARE
  v_concept UUID;
BEGIN
  -- Dengue aliases
  SELECT id INTO v_concept FROM disease_concepts WHERE disease_id = 'DENGUE' LIMIT 1;
  IF v_concept IS NOT NULL THEN
    INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, country_code, confidence, is_active, source)
    VALUES
      (v_concept, 'DBD', 'dbd', 'id', 'ID', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'demam berdarah', 'demam berdarah', 'id', 'ID', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'demam berdarah dengue', 'demam berdarah dengue', 'id', 'ID', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'denggi', 'denggi', 'ms', 'MY', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'demam denggi', 'demam denggi', 'ms', 'MY', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'sốt xuất huyết', 'sot xuat huyet', 'vi', 'VN', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'ไข้เลือดออก', 'ไข้เลือดออก', 'th', 'TH', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'dengue fever', 'dengue fever', 'en', 'PH', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'dengue', 'dengue', 'en', 'SG', 1.0, TRUE, 'abvc_seed')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Rabies aliases
  SELECT id INTO v_concept FROM disease_concepts WHERE disease_id = 'RABIES' LIMIT 1;
  IF v_concept IS NOT NULL THEN
    INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, country_code, confidence, is_active, source)
    VALUES
      (v_concept, 'anjing gila', 'anjing gila', 'id', 'ID', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'penyakit anjing gila', 'penyakit anjing gila', 'id', 'ID', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'bệnh dại', 'benh dai', 'vi', 'VN', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'โรคพิษสุนัขบ้า', 'โรคพิษสุนัขบ้า', 'th', 'TH', 1.0, TRUE, 'abvc_seed')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Measles aliases
  SELECT id INTO v_concept FROM disease_concepts WHERE disease_id = 'MEASLES' LIMIT 1;
  IF v_concept IS NOT NULL THEN
    INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, country_code, confidence, is_active, source)
    VALUES
      (v_concept, 'campak', 'campak', 'id', 'ID', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'gabag', 'gabag', 'id', 'ID', 0.9, TRUE, 'abvc_seed'),
      (v_concept, 'bệnh sởi', 'benh soi', 'vi', 'VN', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'โรคหัด', 'โรคหัด', 'th', 'TH', 1.0, TRUE, 'abvc_seed')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Cholera aliases
  SELECT id INTO v_concept FROM disease_concepts WHERE disease_id = 'CHOLERA' LIMIT 1;
  IF v_concept IS NOT NULL THEN
    INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, country_code, confidence, is_active, source)
    VALUES
      (v_concept, 'kolera', 'kolera', 'id', 'ID', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'bệnh tả', 'benh ta', 'vi', 'VN', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'อหิวาตกโรค', 'อหิวาตกโรค', 'th', 'TH', 1.0, TRUE, 'abvc_seed')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Tuberculosis aliases
  SELECT id INTO v_concept FROM disease_concepts WHERE disease_id = 'TUBERCULOSIS' LIMIT 1;
  IF v_concept IS NOT NULL THEN
    INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, country_code, confidence, is_active, source)
    VALUES
      (v_concept, 'tbc', 'tbc', 'id', 'ID', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'tb paru', 'tb paru', 'id', 'ID', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'bệnh lao', 'benh lao', 'vi', 'VN', 1.0, TRUE, 'abvc_seed'),
      (v_concept, 'วัณโรค', 'วัณโรค', 'th', 'TH', 1.0, TRUE, 'abvc_seed')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
