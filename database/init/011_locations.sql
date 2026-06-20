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

INSERT INTO locations (name, latitude, longitude) VALUES
    ('Kabupaten Bogor', -6.5950, 106.8166),
    ('Bandung', -6.9175, 107.6191),
    ('Kota Depok', -6.4025, 106.7942),
    ('Bekasi', -6.2383, 106.9756),
    ('Jakarta', -6.2088, 106.8456)
ON CONFLICT (name) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);
