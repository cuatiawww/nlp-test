-- Locations needed to resolve current ASEAN outbreak reports whose source
-- dictionaries use regional names not present in the original city seed.
INSERT INTO locations (name, latitude, longitude, country)
VALUES
  ('Mondulkiri', 12.4511, 107.1859, 'Cambodia'),
  ('មណ្ឌលគិរី', 12.4511, 107.1859, 'Cambodia'),
  ('Rakhine State', 20.1528, 92.8779, 'Myanmar'),
  ('Rakhine', 20.1528, 92.8779, 'Myanmar')
ON CONFLICT (name, country) DO NOTHING;
