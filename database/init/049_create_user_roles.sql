-- Create user_roles table for dynamic level and role management with module permissions
CREATE TABLE IF NOT EXISTS user_roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial 5 standard roles if not already present
INSERT INTO user_roles (id, name, description, permissions, is_system)
VALUES
(
    'admin',
    'ADMIN',
    'Akses Penuh Seluruh Modul & Konfigurasi Sistem',
    '["*"]'::jsonb,
    TRUE
),
(
    'data_analyst',
    'DATA ANALYST',
    'Akses Analisis Data, Kejadian & Laporan Matriks',
    '["dashboard", "events", "sources", "analyze", "processing", "reports", "locations"]'::jsonb,
    TRUE
),
(
    'epidemiologi',
    'EPIDEMIOLOGI',
    'Surveilans Penyakit, Aturan KLB & Geospasial',
    '["dashboard", "events", "analyze", "reports", "locations", "outbreak_rules", "nlp_config"]'::jsonb,
    TRUE
),
(
    'executive',
    'EXECUTIVE',
    'Ringkasan Eksekutif, TV Center & Matriks Laporan',
    '["dashboard", "events", "reports", "tv"]'::jsonb,
    TRUE
),
(
    'skk',
    'SKK',
    'Monitoring Feed Sumber Data & Pemrosesan Queue',
    '["dashboard", "sources", "reports", "processing"]'::jsonb,
    TRUE
)
ON CONFLICT (id) DO NOTHING;
