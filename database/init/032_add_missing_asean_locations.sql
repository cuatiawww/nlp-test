-- Migration: Add missing ASEAN locations and province aliases
-- Date: 2026-09-01

INSERT INTO locations (id, name, country, latitude, longitude, is_active)
VALUES
  -- Indonesia
  (gen_random_uuid(), 'Banyuasin', 'Indonesia', -2.8833, 104.3833, true),
  (gen_random_uuid(), 'Talang Kelapa', 'Indonesia', -2.9167, 104.6833, true),
  (gen_random_uuid(), 'Sulawesi Utara', 'Indonesia', 0.6274, 123.9750, true),
  (gen_random_uuid(), 'Sulawesi Tengah', 'Indonesia', -1.4300, 121.4456, true),

  -- Cambodia
  (gen_random_uuid(), 'Banteay Meanchey', 'Cambodia', 13.5859, 102.9737, true),
  (gen_random_uuid(), 'Oddar Meanchey', 'Cambodia', 14.1667, 103.5000, true),

  -- Vietnam
  (gen_random_uuid(), 'Ha Noi', 'Vietnam', 21.0285, 105.8542, true),
  (gen_random_uuid(), 'Hà Nội', 'Vietnam', 21.0285, 105.8542, true),
  (gen_random_uuid(), 'Nghệ An', 'Vietnam', 19.3054, 104.9160, true)
ON CONFLICT DO NOTHING;
