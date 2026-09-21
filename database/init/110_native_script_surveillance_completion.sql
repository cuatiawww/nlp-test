-- Complete native-script surveillance vocabulary without adding aliases to
-- the extractor.  These are reviewed master-data entries: disease and place
-- identity stay in their existing registries, while metric patterns remain
-- editable through extraction_rules.

INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active, updated_at)
VALUES
    ('disease', 'อีโบลา', 'Ebola disease, virus unspecified', 350, TRUE, NOW()),
    ('disease', 'โรคอีโบลา', 'Ebola disease, virus unspecified', 350, TRUE, NOW()),
    ('disease', 'អេបូឡា', 'Ebola disease, virus unspecified', 350, TRUE, NOW()),
    ('disease', 'ជំងឺអេបូឡា', 'Ebola disease, virus unspecified', 350, TRUE, NOW()),
    ('disease', 'ອີໂບລາ', 'Ebola disease, virus unspecified', 350, TRUE, NOW()),
    ('disease', 'ໂລກອີໂບລາ', 'Ebola disease, virus unspecified', 350, TRUE, NOW()),
    ('disease', 'အီဘိုလာ', 'Ebola disease, virus unspecified', 350, TRUE, NOW()),
    ('disease', 'အီဘိုလာရောဂါ', 'Ebola disease, virus unspecified', 350, TRUE, NOW())
ON CONFLICT (category, keyword) DO UPDATE SET
    target_label = EXCLUDED.target_label,
    is_active = TRUE,
    priority = LEAST(nlp_keywords.priority, EXCLUDED.priority),
    updated_at = NOW();

INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT c.id, a.alias, a.normalized_alias, a.language, 'reviewed_native_script', 1.0, TRUE
FROM disease_concepts c
JOIN (
    VALUES
        ('อีโบลา', 'อีโบลา', 'th'),
        ('โรคอีโบลา', 'โรคอีโบลา', 'th'),
        ('អេបូឡា', 'អេបូឡា', 'km'),
        ('ជំងឺអេបូឡា', 'ជំងឺអេបូឡា', 'km'),
        ('ອີໂບລາ', 'ອີໂບລາ', 'lo'),
        ('ໂລກອີໂບລາ', 'ໂລກອີໂບລາ', 'lo'),
        ('အီဘိုလာ', 'အီဘိုလာ', 'my'),
        ('အီဘိုလာရောဂါ', 'အီဘိုလာရောဂါ', 'my')
) AS a(alias, normalized_alias, language) ON TRUE
WHERE c.canonical_name = 'Ebola disease, virus unspecified'
ON CONFLICT (concept_id, normalized_alias, language) DO UPDATE SET
    alias = EXCLUDED.alias,
    source = EXCLUDED.source,
    confidence = EXCLUDED.confidence,
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT l.id, a.alias_name, a.language, FALSE
FROM locations l
JOIN (
    VALUES
        ('ดีอาร์คองโก', 'th'),
        ('สาธารณรัฐประชาธิปไตยคองโก', 'th'),
        ('កុងហ្គោ', 'km'),
        ('សាធារណរដ្ឋប្រជាធិបតេយ្យកុងហ្គោ', 'km'),
        ('ຄອງໂກ', 'lo'),
        ('ສາທາລະນະລັດຄອງໂກ', 'lo'),
        ('ဒီအာရ်ကွန်ဂို', 'my'),
        ('ကွန်ဂိုဒီမိုကရက်တစ်သမ္မတနိုင်ငံ', 'my')
) AS a(alias_name, language) ON TRUE
WHERE l.name = 'Democratic Republic of the Congo'
  AND l.country = 'Democratic Republic of the Congo'
ON CONFLICT (location_id, alias_name, language) DO UPDATE SET
    is_preferred = EXCLUDED.is_preferred;

INSERT INTO extraction_rules (field_name, regex_pattern, priority)
VALUES
    ('case_count', '(?:ผู้ป่วย|ผู้ติดเชื้อ)(?:สะสม|ใหม่|ทั้งหมด)?\s*(?:แล้ว\s*)?(?:กว่า|ประมาณ|ราว|เกือบ)?\s*([0-9][0-9,.]*)\s*(?:ราย|คน)', 5),
    ('death_count', '(?:ผู้เสียชีวิต|เสียชีวิต)(?:แล้ว\s*)?(?:กว่า|ประมาณ|ราว|เกือบ)?\s*([0-9][0-9,.]*)\s*(?:ราย|คน)', 5),
    ('case_count', '(?:ករណីឆ្លង|ករណី|អ្នកឆ្លង)(?:សរុប|ថ្មី)?\s*(?:ជាង|ប្រមាណ|ប្រហែល)?\s*([0-9][0-9,.]*)\s*(?:នាក់|ករណី)', 5),
    ('death_count', '(?:អ្នកស្លាប់|ស្លាប់)\s*(?:ជាង|ប្រមាណ|ប្រហែល)?\s*([0-9][0-9,.]*)\s*(?:នាក់|ករណី)?', 5),
    ('case_count', '(?:ຜູ້ປ່ວຍ|ຜູ້ຕິດເຊື້ອ|ກໍລະນີ)(?:ສະສົມ|ໃໝ່)?\s*(?:ແລ້ວ\s*)?(?:ຫຼາຍກວ່າ|ປະມານ|ເກືອບ)?\s*([0-9][0-9,.]*)\s*(?:ຄົນ|ກໍລະນີ)', 5),
    ('death_count', '(?:ຜູ້ເສຍຊີວິດ|ເສຍຊີວິດ)\s*(?:ຫຼາຍກວ່າ|ປະມານ|ເກືອບ)?\s*([0-9][0-9,.]*)\s*(?:ຄົນ|ກໍລະນີ)?', 5),
    ('case_count', '(?:လူနာ|ကူးစက်သူ)(?:စုစုပေါင်း|အသစ်)?\s*(?:ကျော်|ခန့်|နီးပါး)?\s*([0-9][0-9,.]*)\s*(?:ဦး|ယောက်|ကိစ္စ)', 5),
    ('death_count', '(?:သေဆုံးသူ|သေဆုံး)\s*(?:ကျော်|ခန့်|နီးပါး)?\s*([0-9][0-9,.]*)\s*(?:ဦး|ယောက်|ကိစ္စ)?', 5)
ON CONFLICT (field_name, regex_pattern) DO UPDATE SET
    priority = LEAST(extraction_rules.priority, EXCLUDED.priority),
    is_active = TRUE,
    updated_at = NOW();
