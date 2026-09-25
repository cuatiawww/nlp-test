-- 126_seed_non_health_and_academic_extraction_rules.sql
-- Seed extraction rules for non-health topics, academic thesis/papers, plant diseases, metaphors, and metric exclusions.
-- Enables dynamic, database-driven surveillance noise filtering without code redeployments.

BEGIN;

-- 1. Academic & Student Research Patterns (Skripsi, Tesis, Disertasi, Jurnal, KTI)
-- These prevent university research papers and thesis abstracts from being counted as active outbreak events.
INSERT INTO extraction_rules (field_name, regex_pattern, priority, is_active) VALUES
('academic_study', '\b(?:skripsi|tesis|disertasi|tugas\s+akhir|karya\s+tulis\s+ilmiah|\bkti\b)\b', 10, true),
('academic_study', '\b(?:abstrak\s+penelitian|latar\s+belakang\s+masalah|rumusan\s+masalah|tujuan\s+penelitian|tinjauan\s+pustaka|metode\s+penelitian)\b', 10, true),
('academic_study', '\b(?:populasi\s+dan\s+sampel|teknik\s+sampling|kuesioner|koefisien\s+korelasi|uji\s+validitas|uji\s+reliabilitas|total\s+sampling|purposive\s+sampling)\b', 10, true),
('academic_study', '\b(?:cross[- ]sectional|case[- ]control|cohort\s+study|descriptive\s+study|uji\s+chi[- ]square|regresi\s+logistik)\b', 10, true),
('academic_study', '\b(?:fakultas\s+kedokteran|program\s+studi|prodi\s+kesehatan|dosen\s+pembimbing|penguji\s+skripsi|sidang\s+skripsi|wisuda|yudisium)\b', 10, true),
('academic_study', '\b(?:jurnal\s+kesehatan|journal\s+of|volume\s+\d+\s+nomor\s+\d+|\bissn\b|prosiding\s+seminar|call\s+for\s+papers|best\s+paper)\b', 10, true),
('academic_study', '\b(?:mahasiswa\s+kkn|kuliah\s+kerja\s+nyata|pengabdian\s+masyarakat|pengabdian\s+kepada\s+masyarakat)\b', 10, true)
ON CONFLICT (field_name, regex_pattern) DO NOTHING;

-- 2. Non-Health Topics (Olahraga, Pemilu, Politik, Pasar Modal, Militer, Hiburan)
-- Migrated from hardcoded _NON_HEALTH_TOPIC in extractors.py to database.
INSERT INTO extraction_rules (field_name, regex_pattern, priority, is_active) VALUES
('non_health_topic', '\b(?:asian\s+games|sea\s+games|premier\s+league|world\s+cup|grand\s+slam|olympic|olympics|surfing|cricket|football|soccer|basketball|volleyball|sepak\s+bola|badminton)\b', 10, true),
('non_health_topic', '\b(?:messi|ronaldo|fifa|uefa|liga\s+champions|champions\s+league|transfer\s+window|hat-?trick|soccer\s+match|football\s+match)\b', 10, true),
('non_health_topic', '\b(?:spectrum\s+auctions?|money\s+laundering|stock\s+market|oil\s+price|harga\s+minyak)\b', 10, true),
('non_health_topic', '\b(?:parlemen|pemilu|election|elections|far[- ]right|voting\s+under\s+way|ambang\s+batas\s+parlemen|ruu\s+pemilu|budget\s+approaches)\b', 10, true),
('non_health_topic', '\b(?:super-luxe\s+condos|properties\s+seized|korupsi|corruption|gratifikasi|pungli|politik\s+uang|dinasti\s+politik)\b', 10, true),
('non_health_topic', '\b(?:violence|violent|conflict|war|unrest|political\s+unrest|armed\s+conflict|konflik\s+bersenjata|border\s+tension|ketegangan|ceasefire|gencatan\s+senjata)\b', 10, true),
('non_health_topic', '\b(?:refugees?|displaced\s+people|idps?|humanitarian\s+crisis|casualt(?:y|ies)|airstrike|military\s+operation|rudal\s+balistik|rudal|kapal\s+perang)\b', 10, true),
('non_health_topic', '\b(?:food\s+security|ketahanan\s+pangan|drought|kekeringan|crop\s+failure|gagal\s+panen|famine|kelaparan)\b', 10, true)
ON CONFLICT (field_name, regex_pattern) DO NOTHING;

-- 3. Agricultural & Botanical Diseases (Penyakit Tanaman / Pertanian)
-- Prevents crop/plant pests (e.g. ubi kayu, wereng, padi) from triggering human disease surveillance.
INSERT INTO extraction_rules (field_name, regex_pattern, priority, is_active) VALUES
('agricultural_disease', '\b(?:tanaman|tumbuhan|ubi\s+kayu|singkong|padi|kelapa\s+sawit|jagung|kakao|karet|hortikultura)\b', 10, true),
('agricultural_disease', '\b(?:hama\s+tanaman|wereng|fusarium|daun\s+menguning|perkebunan|gagal\s+panen\s+tanaman)\b', 10, true),
('agricultural_disease', '\b(?:aquaculture|akuakultur|perikanan\s+budidaya|tambak\s+udang|budidaya\s+ikan)\b', 10, true)
ON CONFLICT (field_name, regex_pattern) DO NOTHING;

-- 4. Metaphorical Disease Usage (Penggunaan Kiasan / Metafora)
-- Prevents metaphoric disease mentions (e.g. "korupsi adalah kanker", "demam panggung", "wabah judi online").
INSERT INTO extraction_rules (field_name, regex_pattern, priority, is_active) VALUES
('metaphorical_phrase', '\b(?:judi\s+online|judol|pinjaman\s+online|pinjol)\b', 10, true),
('metaphorical_phrase', '\b(?:demam\s+panggung|demam\s+piala\s+dunia|demam\s+pilkada|demam\s+pesta\s+demokrasi)\b', 10, true),
('metaphorical_phrase', '\b(?:kanker\s+korupsi|virus\s+hoax|wabah\s+kemiskinan|wabah\s+kejahatan)\b', 10, true)
ON CONFLICT (field_name, regex_pattern) DO NOTHING;

-- 5. Metric Exclusions (Pencegahan Angka Non-Kasus)
-- Prevents respondent counts, survey participants, and sample sizes from being extracted as case_count.
INSERT INTO extraction_rules (field_name, regex_pattern, priority, is_active) VALUES
('metric_exclusion', '\b(?P<count>\d+)\s+(?:responden|sampel|subjek|kuesioner|kuisioner)\b', 10, true),
('metric_exclusion', '\b(?P<count>\d+)\s+(?:mahasiswa|siswa|murid|peserta\s+penyuluhan|peserta\s+seminar)\b', 10, true),
('metric_exclusion', '\b(?:sampel|responden|subjek)\s+(?:penelitian|sebanyak)?\s*(?P<count>\d+)\b', 10, true),
('metric_exclusion', '\b(?P<count>\d+)\s+(?:tips|cara|langkah|strategi|upaya|tahapan|indikator|butir|item)\b', 10, true),
('metric_exclusion', '\b(?:tips|cara|langkah|ke-)\s*(?P<count>\d+)\b', 10, true),
('metric_exclusion', '\b(?:skripsi|tesis|disertasi|penelitian)\s+ini\s+melibatkan\s+(?P<count>\d+)\b', 10, true),
('metric_exclusion', '\b(?:sebanyak|total)\s+(?P<count>\d+)\s+(?:kuesioner|angket|lembar)\b', 10, true)
ON CONFLICT (field_name, regex_pattern) DO NOTHING;

-- 6. General Prevention & Health Promotion (Tips / Edukasi Murni Tanpa Kasus)
INSERT INTO extraction_rules (field_name, regex_pattern, priority, is_active) VALUES
('general_prevention_tips', '\b(?:tips\s+mencegah|cara\s+mencegah|langkah\s+pencegahan|kenali\s+gejala)\b', 10, true),
('general_prevention_tips', '\b(?:pola\s+hidup\s+bersih\s+dan\s+sehat|\bphbs\b|jangan\s+panik|mitos\s+dan\s+fakta)\b', 10, true)
ON CONFLICT (field_name, regex_pattern) DO NOTHING;

COMMIT;
