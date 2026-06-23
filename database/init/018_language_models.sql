CREATE TABLE IF NOT EXISTS language_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language VARCHAR(10) NOT NULL,
    model_key VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lang_models_lang ON language_models(language);

INSERT INTO language_models (language, model_key) VALUES
    ('id', 'indobert'),
    ('en', 'xlm-roberta'),
    ('th', 'xlm-roberta'),
    ('vi', 'xlm-roberta'),
    ('tl', 'xlm-roberta'),
    ('ms', 'xlm-roberta'),
    ('my', 'xlm-roberta')
ON CONFLICT (language) DO NOTHING;