ALTER TABLE disease_events ADD COLUMN IF NOT EXISTS is_health_related BOOLEAN DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_disease_events_health ON disease_events(is_health_related);
