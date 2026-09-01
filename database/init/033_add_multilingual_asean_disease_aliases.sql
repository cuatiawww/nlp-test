-- Migration 033: Multilingual ASEAN Disease Aliases & Keywords (Vietnamese, Thai, Khmer, Burmese)

-- 1. nlp_keywords
INSERT INTO nlp_keywords (category, keyword, target_label, is_active, priority)
VALUES
  -- Vietnamese
  ('disease', 'sốt xuất huyết', 'DBD', TRUE, 3),
  ('disease', 'sot xuat huyet', 'DBD', TRUE, 3),
  ('disease', 'sốt rét', 'malaria', TRUE, 3),
  ('disease', 'sot ret', 'malaria', TRUE, 3),
  ('disease', 'bệnh sởi', 'campak', TRUE, 3),
  ('disease', 'benh soi', 'campak', TRUE, 3),
  ('disease', 'sởi', 'campak', TRUE, 3),
  ('disease', 'bệnh dại', 'rabies', TRUE, 3),
  ('disease', 'benh dai', 'rabies', TRUE, 3),
  ('disease', 'dại', 'rabies', TRUE, 3),
  ('disease', 'lao phổi', 'TBC', TRUE, 3),
  ('disease', 'benh lao', 'TBC', TRUE, 3),
  ('disease', 'bạch hầu', 'diphtheria', TRUE, 3),
  ('disease', 'bach hau', 'diphtheria', TRUE, 3),
  ('disease', 'ho gà', 'pertussis', TRUE, 3),
  ('disease', 'uốn ván', 'tetanus', TRUE, 3),
  ('disease', 'cúm', 'flu', TRUE, 3),
  ('disease', 'tiêu chảy', 'diare akut', TRUE, 3),
  ('disease', 'đậu mùa khỉ', 'mpox', TRUE, 3),
  -- Thai
  ('disease', 'ไข้เลือดออก', 'DBD', TRUE, 3),
  ('disease', 'ไข้มาลาเรีย', 'malaria', TRUE, 3),
  ('disease', 'มาลาเรีย', 'malaria', TRUE, 3),
  ('disease', 'โรคหัด', 'campak', TRUE, 3),
  ('disease', 'โรคพิษสุนัขบ้า', 'rabies', TRUE, 3),
  ('disease', 'วัณโรค', 'TBC', TRUE, 3),
  ('disease', 'โรคชิคุนกุนยา', 'chikungunya', TRUE, 3),
  ('disease', 'อหิวาตกโรค', 'kolera', TRUE, 3),
  -- Khmer
  ('disease', 'គ្រុនឈាម', 'DBD', TRUE, 3),
  ('disease', 'គ្រុនចាញ់', 'malaria', TRUE, 3),
  ('disease', 'កញ្ជ្រឹល', 'campak', TRUE, 3),
  ('disease', 'ឆ្កែឆ្កួត', 'rabies', TRUE, 3),
  ('disease', 'របេង', 'TBC', TRUE, 3),
  -- Burmese
  ('disease', 'သွေးလွန်တုပ်ကွေး', 'DBD', TRUE, 3),
  ('disease', 'ငှက်ဖျား', 'malaria', TRUE, 3),
  ('disease', 'ဝက်သက်', 'campak', TRUE, 3),
  ('disease', 'တီဘီ', 'TBC', TRUE, 3),
  ('disease', 'ခွေးရူးပြန်', 'rabies', TRUE, 3)
ON CONFLICT (category, keyword) DO NOTHING;

-- 2. disease_aliases linked to WHO ICD-11 concepts
INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sốt xuất huyết', 'sot xuat huyet', 'vi', 'who_multilingual', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'dengue fever DBD'
ON CONFLICT DO NOTHING;

INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'sot xuat huyet', 'sot xuat huyet', 'vi', 'who_multilingual', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'dengue fever DBD'
ON CONFLICT DO NOTHING;

INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'ไข้เลือดออก', 'ไข้เลือดออก', 'th', 'who_multilingual', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'dengue fever DBD'
ON CONFLICT DO NOTHING;

INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'គ្រុនឈាម', 'គ្រុនឈាម', 'km', 'who_multilingual', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'dengue fever DBD'
ON CONFLICT DO NOTHING;

INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, 'သွေးလွန်တုပ်ကွေး', 'သွေးလွန်တုပ်ကွေး', 'my', 'who_multilingual', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = 'dengue fever DBD'
ON CONFLICT DO NOTHING;
