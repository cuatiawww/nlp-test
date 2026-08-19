-- Flores is an explicit geographic reference in Indonesian disaster reports.
-- Keep it as a canonical map location so "kawasan Flores" is not reduced to
-- a generic source dateline such as Jakarta.
INSERT INTO locations (name, latitude, longitude, country)
VALUES ('Flores', -8.5500, 120.6500, 'Indonesia')
ON CONFLICT (name, country) DO NOTHING;
