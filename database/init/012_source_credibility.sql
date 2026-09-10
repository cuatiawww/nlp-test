CREATE TABLE IF NOT EXISTS source_credibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type TEXT NOT NULL UNIQUE,
    score DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabel dari instalasi lama dapat belum memiliki UNIQUE(source_type).
-- Seed dengan anti-join supaya migration tetap idempotent tanpa bergantung
-- pada constraint yang hanya dibuat saat CREATE TABLE pertama kali.
INSERT INTO source_credibility (source_type, score)
SELECT seed.source_type, seed.score
FROM (VALUES
    ('government'::TEXT, 0.95::DOUBLE PRECISION),
    ('who', 0.95::DOUBLE PRECISION),
    ('hospital', 0.90::DOUBLE PRECISION),
    ('research', 0.85::DOUBLE PRECISION),
    ('news', 0.70::DOUBLE PRECISION),
    ('rss', 0.65::DOUBLE PRECISION),
    ('web', 0.50::DOUBLE PRECISION),
    ('social_media', 0.35::DOUBLE PRECISION),
    ('csv', 0.60::DOUBLE PRECISION),
    ('api', 0.70::DOUBLE PRECISION)
) AS seed(source_type, score)
WHERE NOT EXISTS (
    SELECT 1 FROM source_credibility existing
    WHERE LOWER(existing.source_type) = LOWER(seed.source_type)
);
