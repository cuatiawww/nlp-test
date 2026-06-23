INSERT INTO nlp_labels (category, label, priority, is_active) VALUES
    ('binary_health', 'health related disease medical', 1, TRUE),
    ('binary_health', 'general news other topic', 2, TRUE)
ON CONFLICT (category, label) DO NOTHING;
