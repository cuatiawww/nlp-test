CREATE TABLE IF NOT EXISTS language_markers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    word TEXT NOT NULL,
    language VARCHAR(10) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lang_markers_word_lang ON language_markers(word, language);

INSERT INTO language_markers (word, language) VALUES
    ('many', 'en'),
    ('residents', 'en'),
    ('fever', 'en'),
    ('cough', 'en'),
    ('shortness', 'en'),
    ('this week', 'en'),
    ('diarrhea', 'en'),
    ('outbreak', 'en'),
    ('kasus', 'id'),
    ('warga', 'id'),
    ('demam', 'id'),
    ('batuk', 'id'),
    ('pasien', 'id'),
    ('meninggal', 'id'),
    ('wabah', 'id')
ON CONFLICT (word, language) DO NOTHING;