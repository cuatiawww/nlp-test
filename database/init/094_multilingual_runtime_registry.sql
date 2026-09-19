-- Runtime registry additions for the ASEAN language master data.
-- Native-script detection remains algorithmic; these rows are only lexical
-- hints and model routing metadata. They must never replace source evidence.

INSERT INTO language_models (language, model_key)
VALUES
    ('km', 'xlm-roberta'),
    ('lo', 'xlm-roberta')
ON CONFLICT (language) DO UPDATE
SET model_key = EXCLUDED.model_key,
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO language_markers (word, language)
VALUES
    ('kes', 'ms'),
    ('pesakit', 'ms'),
    ('kematian', 'ms'),
    ('ca mắc', 'vi'),
    ('ca nhiễm', 'vi'),
    ('tử vong', 'vi'),
    ('kaso', 'tl'),
    ('pasyente', 'tl'),
    ('kamatayan', 'tl'),
    ('ผู้ป่วย', 'th'),
    ('ผู้ติดเชื้อ', 'th'),
    ('เสียชีวิต', 'th'),
    ('ករណី', 'km'),
    ('អ្នកជំងឺ', 'km'),
    ('ស្លាប់', 'km'),
    ('ກໍລະນີ', 'lo'),
    ('ຄົນເຈັບ', 'lo'),
    ('ເສຍຊີວິດ', 'lo'),
    ('လူနာ', 'my'),
    ('ကူးစက်', 'my'),
    ('သေဆုံး', 'my')
ON CONFLICT (word, language) DO NOTHING;
