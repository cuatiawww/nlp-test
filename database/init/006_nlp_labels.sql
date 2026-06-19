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

INSERT INTO nlp_labels (category, label, priority) VALUES
    ('disease', 'dengue fever DBD', 1),
    ('disease', 'acute diarrhea', 2),
    ('disease', 'leptospirosis', 3),
    ('disease', 'influenza flu', 4),
    ('disease', 'COVID-19 coronavirus', 5),
    ('disease', 'malaria', 6),
    ('disease', 'tuberculosis TB', 7),
    ('disease', 'chikungunya', 8),
    ('disease', 'pneumonia', 9),
    ('disease', 'typhoid fever', 10),
    ('disease', 'NEGATIVE - not health related', 99),
    ('event_type', 'flood banjir flash flood', 1),
    ('event_type', 'earthquake gempa', 2),
    ('event_type', 'landslide tanah longsor', 3),
    ('event_type', 'disease outbreak wabah', 4),
    ('event_type', 'fire kebakaran', 5),
    ('event_type', 'conflict konflik kerusuhan', 6),
    ('event_type', 'other', 99),
    ('sentiment', 'positive', 1),
    ('sentiment', 'negative', 2),
    ('sentiment', 'neutral', 3),
    ('relevance', 'high', 1),
    ('relevance', 'medium', 2),
    ('relevance', 'low', 3)
ON CONFLICT (category, label) DO NOTHING;
