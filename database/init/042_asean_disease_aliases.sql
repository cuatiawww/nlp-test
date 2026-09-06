-- Additive multilingual aliases for common ASEAN disease terms.
-- The insert is intentionally conditional: an alias is only attached when
-- the corresponding WHO concept already exists locally.
WITH seed(alias, normalized_alias, language, canonical_pattern) AS (
    VALUES
        ('DBD', 'dbd', 'id', 'dengue%'),
        ('demam berdarah', 'demam berdarah', 'id', 'dengue%'),
        ('demam berdarah dengue', 'demam berdarah dengue', 'id', 'dengue%'),
        ('dengue hemorrhagic fever', 'dengue hemorrhagic fever', 'en', 'dengue%'),
        ('sốt xuất huyết', 'sốt xuất huyết', 'vi', 'dengue%'),
        ('ไข้เลือดออก', 'ไข้เลือดออก', 'th', 'dengue%'),
        ('គ្រុនឈាម', 'គ្រុនឈាម', 'km', 'dengue%'),
        ('သွေးလွန်တုပ်ကွေး', 'သွေးလွန်တုပ်ကွေး', 'my', 'dengue%'),
        ('ໄຂ້ເລືອດອອກ', 'ໄຂ້ເລືອດອອກ', 'lo', 'dengue%'),
        ('demam denggi', 'demam denggi', 'ms', 'dengue%')
)
INSERT INTO disease_aliases
    (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT c.id, s.alias, s.normalized_alias, s.language, 'local_asean', 1.0, TRUE
FROM disease_concepts c
JOIN seed s ON LOWER(c.canonical_name) LIKE s.canonical_pattern
ON CONFLICT DO NOTHING;
