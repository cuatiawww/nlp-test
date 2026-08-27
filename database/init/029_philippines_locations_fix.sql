-- 029_philippines_locations_fix.sql
-- Menambahkan lokasi provinsi/wilayah penting di Filipina dan menonaktifkan entri ambigu

INSERT INTO locations (name, latitude, longitude, country, is_active) VALUES
('Davao de Oro', 7.6000, 126.0000, 'Philippines', true),
('Central Luzon', 15.4828, 120.7120, 'Philippines', true),
('Calabarzon', 14.1008, 121.0794, 'Philippines', true),
('National Capital Region', 14.6091, 120.9896, 'Philippines', true),
('Lapu-Lapu', 10.3157, 123.9494, 'Philippines', true),
('Mandaue', 10.3333, 123.9333, 'Philippines', true)
ON CONFLICT (name, country) DO UPDATE SET
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  is_active = true;

-- Nonaktifkan nama lokasi 3 huruf yang ambigu dan bukan kota utama
UPDATE locations SET is_active = false WHERE name = 'Oro' AND country = 'Indonesia';
