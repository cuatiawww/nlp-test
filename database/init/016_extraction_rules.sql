CREATE TABLE IF NOT EXISTS extraction_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_name VARCHAR(50) NOT NULL,
    regex_pattern TEXT NOT NULL,
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_extraction_field_pattern ON extraction_rules(field_name, regex_pattern);

INSERT INTO extraction_rules (field_name, regex_pattern, priority) VALUES
    ('case_count', '\b(\d+)\s+(?:warga|pasien|kasus|residents|patients|cases)\b', 1),
    ('case_count', '\b(\d+)\s+(?:orang|people|person)\b', 10),
    ('death_count', '\b(\d+)\s+(?:meninggal|death|deaths|killed|died)\b', 1),
    ('death_count', '\b(\d+)\s+(?:tewas|korban\s+meninggal)\b', 2)
ON CONFLICT (field_name, regex_pattern) DO NOTHING;