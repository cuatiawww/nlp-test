CREATE TABLE IF NOT EXISTS nlp_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    label TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nlp_labels_category ON nlp_labels(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nlp_labels_cat_label ON nlp_labels(category, label);

INSERT INTO nlp_labels (category, label, is_active, priority) VALUES
    ('disease', 'dengue fever DBD', TRUE, 1),
    ('disease', 'acute diarrhea', TRUE, 2),
    ('disease', 'leptospirosis', TRUE, 3),
    ('disease', 'influenza flu', TRUE, 4),
    ('disease', 'COVID-19 coronavirus', TRUE, 5),
    ('disease', 'malaria', TRUE, 6),
    ('disease', 'tuberculosis TB', TRUE, 7),
    ('disease', 'chikungunya', TRUE, 8),
    ('disease', 'pneumonia', TRUE, 9),
    ('disease', 'typhoid fever', TRUE, 10),
    ('disease', 'measles campak', TRUE, 30),
    ('disease', 'hantavirus', TRUE, 31),
    ('disease', 'coronavirus MERS', TRUE, 32),
    ('disease', 'NEGATIVE - not health related', TRUE, 99),
    ('event_type', 'flood banjir flash flood', TRUE, 1),
    ('event_type', 'earthquake gempa', TRUE, 2),
    ('event_type', 'landslide tanah longsor', TRUE, 3),
    ('event_type', 'disease outbreak wabah', TRUE, 4),
    ('event_type', 'fire kebakaran', TRUE, 5),
    ('event_type', 'conflict konflik kerusuhan', TRUE, 6),
    ('event_type', 'other', TRUE, 99),
    ('relevance', 'high', TRUE, 1),
    ('relevance', 'medium', TRUE, 2),
    ('relevance', 'low', TRUE, 3),
    ('sentiment', 'positive', TRUE, 1),
    ('sentiment', 'negative', TRUE, 2),
    ('sentiment', 'neutral', TRUE, 3)
ON CONFLICT (category, label) DO NOTHING;
