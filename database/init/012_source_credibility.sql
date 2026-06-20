CREATE TABLE IF NOT EXISTS source_credibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT NOT NULL UNIQUE,
    score DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO source_credibility (source_type, score) VALUES
    ('government', 0.95),
    ('who', 0.95),
    ('hospital', 0.90),
    ('research', 0.85),
    ('news', 0.70),
    ('rss', 0.65),
    ('web', 0.50),
    ('social_media', 0.35),
    ('csv', 0.60),
    ('api', 0.55)
ON CONFLICT (source_type) DO NOTHING;
