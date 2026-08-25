CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    country TEXT DEFAULT 'Indonesia',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Database lama dapat sudah memiliki tabel `locations` tanpa UNIQUE(name).
-- Jangan memakai ON CONFLICT(name), karena conflict target hanya valid jika
-- constraint/index unik tersebut memang sudah ada. Seed secara idempotent
-- dengan pemeriksaan nama case-insensitive agar migration aman untuk skema lama.
INSERT INTO locations (name, latitude, longitude)
SELECT seed.name, seed.latitude, seed.longitude
FROM (VALUES
    ('Kabupaten Bogor', -6.5950::DOUBLE PRECISION, 106.8166::DOUBLE PRECISION),
    ('Bandung', -6.9175::DOUBLE PRECISION, 107.6191::DOUBLE PRECISION),
    ('Kota Depok', -6.4025::DOUBLE PRECISION, 106.7942::DOUBLE PRECISION),
    ('Bekasi', -6.2383::DOUBLE PRECISION, 106.9756::DOUBLE PRECISION),
    ('Jakarta', -6.2088::DOUBLE PRECISION, 106.8456::DOUBLE PRECISION)
) AS seed(name, latitude, longitude)
WHERE NOT EXISTS (
    SELECT 1 FROM locations existing
    WHERE LOWER(existing.name) = LOWER(seed.name)
);

CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);
