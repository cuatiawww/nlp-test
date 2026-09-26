-- Common ASEAN admin short forms used in local-language news.
-- Inserts the official place when missing, then attaches aliases to any
-- existing name variant (Sumatera Selatan / Sumatra Selatan / South Sumatra).

INSERT INTO locations (
    name, country, admin_level, latitude, longitude,
    admin1_name, admin2_name, country_iso3, is_active
)
SELECT v.name, v.country, v.admin_level, v.latitude, v.longitude,
       v.admin1_name, v.admin2_name, v.country_iso3, TRUE
FROM (VALUES
    ('Sumatera Selatan', 'Indonesia', 1, -2.9909, 104.7565, 'Sumatera Selatan', NULL, 'IDN'),
    ('Ogan Komering Ulu', 'Indonesia', 2, -4.0284, 104.0070, 'Sumatera Selatan', 'Ogan Komering Ulu', 'IDN'),
    ('Ogan Ilir', 'Indonesia', 2, -3.4310, 104.7040, 'Sumatera Selatan', 'Ogan Ilir', 'IDN'),
    ('Palembang', 'Indonesia', 2, -2.9761, 104.7754, 'Sumatera Selatan', 'Kota Palembang', 'IDN'),
    ('Lubuklinggau', 'Indonesia', 2, -3.2967, 102.8617, 'Sumatera Selatan', 'Kota Lubuk Linggau', 'IDN'),
    ('Muara Enim', 'Indonesia', 2, -3.6500, 103.7700, 'Sumatera Selatan', 'Muara Enim', 'IDN'),
    ('Banyuasin', 'Indonesia', 2, -2.8830, 104.3830, 'Sumatera Selatan', 'Banyuasin', 'IDN'),
    ('Ogan Komering Ilir', 'Indonesia', 2, -3.4550, 104.9230, 'Sumatera Selatan', 'Ogan Komering Ilir', 'IDN'),
    ('Musi Banyuasin', 'Indonesia', 2, -2.6440, 103.7480, 'Sumatera Selatan', 'Musi Banyuasin', 'IDN'),
    ('Kutai Timur', 'Indonesia', 2, 0.5220, 117.5480, 'Kalimantan Timur', 'Kutai Timur', 'IDN'),
    ('Johor Bahru', 'Malaysia', 2, 1.4927, 103.7414, 'Johor', 'Johor Bahru', 'MYS'),
    ('Petaling Jaya', 'Malaysia', 2, 3.1073, 101.6067, 'Selangor', 'Petaling Jaya', 'MYS'),
    ('Ho Chi Minh City', 'Vietnam', 1, 10.8231, 106.6297, 'Ho Chi Minh City', NULL, 'VNM'),
    ('Bangkok', 'Thailand', 1, 13.7563, 100.5018, 'Bangkok', NULL, 'THA'),
    ('Metro Manila', 'Philippines', 1, 14.5995, 120.9842, 'Metro Manila', NULL, 'PHL'),
    ('Yangon', 'Myanmar', 1, 16.8409, 96.1735, 'Yangon', NULL, 'MMR'),
    ('Naypyidaw', 'Myanmar', 1, 19.7633, 96.0785, 'Naypyidaw', NULL, 'MMR'),
    ('Vientiane', 'Laos', 1, 17.9757, 102.6331, 'Vientiane', NULL, 'LAO'),
    ('Bandar Seri Begawan', 'Brunei', 1, 4.9031, 114.9398, 'Brunei-Muara', NULL, 'BRN'),
    ('Dili', 'Timor-Leste', 1, -8.5569, 125.5603, 'Dili', NULL, 'TLS')
) AS v(name, country, admin_level, latitude, longitude, admin1_name, admin2_name, country_iso3)
WHERE NOT EXISTS (
    SELECT 1 FROM locations l
    WHERE LOWER(l.name) = LOWER(v.name)
);

INSERT INTO location_aliases (location_id, alias_name, language, is_preferred)
SELECT DISTINCT ON (a.alias_name, a.language, l.id) l.id, a.alias_name, a.language, FALSE
FROM (VALUES
    ('Sumsel', 'id', 'Indonesia', ARRAY['sumatera selatan', 'sumatra selatan', 'south sumatra']),
    ('South Sumatra', 'en', 'Indonesia', ARRAY['sumatera selatan', 'sumatra selatan', 'south sumatra']),
    ('Jabar', 'id', 'Indonesia', ARRAY['jawa barat', 'west java']),
    ('Jateng', 'id', 'Indonesia', ARRAY['jawa tengah', 'central java']),
    ('Jatim', 'id', 'Indonesia', ARRAY['jawa timur', 'east java']),
    ('Sumut', 'id', 'Indonesia', ARRAY['sumatera utara', 'sumatra utara', 'north sumatra']),
    ('Sumbar', 'id', 'Indonesia', ARRAY['sumatera barat', 'sumatra barat', 'west sumatra']),
    ('Sulsel', 'id', 'Indonesia', ARRAY['sulawesi selatan', 'south sulawesi']),
    ('Sulut', 'id', 'Indonesia', ARRAY['sulawesi utara', 'north sulawesi']),
    ('Sulteng', 'id', 'Indonesia', ARRAY['sulawesi tengah', 'central sulawesi']),
    ('Sultra', 'id', 'Indonesia', ARRAY['sulawesi tenggara', 'southeast sulawesi']),
    ('Sulbar', 'id', 'Indonesia', ARRAY['sulawesi barat', 'west sulawesi']),
    ('Kalbar', 'id', 'Indonesia', ARRAY['kalimantan barat', 'west kalimantan']),
    ('Kaltim', 'id', 'Indonesia', ARRAY['kalimantan timur', 'east kalimantan']),
    ('Kalsel', 'id', 'Indonesia', ARRAY['kalimantan selatan', 'south kalimantan']),
    ('Kalteng', 'id', 'Indonesia', ARRAY['kalimantan tengah', 'central kalimantan']),
    ('Kaltara', 'id', 'Indonesia', ARRAY['kalimantan utara', 'north kalimantan']),
    ('NTB', 'id', 'Indonesia', ARRAY['nusa tenggara barat', 'west nusa tenggara']),
    ('NTT', 'id', 'Indonesia', ARRAY['nusa tenggara timur', 'east nusa tenggara']),
    ('Kepri', 'id', 'Indonesia', ARRAY['kepulauan riau', 'riau islands']),
    ('Babel', 'id', 'Indonesia', ARRAY['kepulauan bangka belitung', 'bangka belitung']),
    ('Pabar', 'id', 'Indonesia', ARRAY['papua barat', 'west papua']),
    ('Malut', 'id', 'Indonesia', ARRAY['maluku utara', 'north maluku']),
    ('NAD', 'id', 'Indonesia', ARRAY['aceh', 'nanggroe aceh darussalam']),
    ('OKU', 'id', 'Indonesia', ARRAY['ogan komering ulu']),
    ('OKI', 'id', 'Indonesia', ARRAY['ogan komering ilir']),
    ('Muba', 'id', 'Indonesia', ARRAY['musi banyuasin']),
    ('Kutim', 'id', 'Indonesia', ARRAY['kutai timur']),
    ('KL', 'en', 'Malaysia', ARRAY['kuala lumpur']),
    ('WPKL', 'ms', 'Malaysia', ARRAY['kuala lumpur']),
    ('JB', 'ms', 'Malaysia', ARRAY['johor bahru']),
    ('JDT', 'ms', 'Malaysia', ARRAY['johor']),
    ('PJ', 'ms', 'Malaysia', ARRAY['petaling jaya']),
    ('TP.HCM', 'vi', 'Vietnam', ARRAY['ho chi minh city', 'thành phố hồ chí minh']),
    ('TPHCM', 'vi', 'Vietnam', ARRAY['ho chi minh city']),
    ('HCMC', 'en', 'Vietnam', ARRAY['ho chi minh city']),
    ('HCM', 'vi', 'Vietnam', ARRAY['ho chi minh city']),
    ('BKK', 'en', 'Thailand', ARRAY['bangkok']),
    ('Krung Thep', 'th', 'Thailand', ARRAY['bangkok']),
    ('NCR', 'en', 'Philippines', ARRAY['metro manila', 'national capital region', 'manila']),
    ('YGN', 'en', 'Myanmar', ARRAY['yangon', 'rangoon']),
    ('NPT', 'en', 'Myanmar', ARRAY['naypyidaw', 'nay pyi taw']),
    ('VTE', 'en', 'Laos', ARRAY['vientiane']),
    ('BSB', 'en', 'Brunei', ARRAY['bandar seri begawan']),
    ('DIL', 'en', 'Timor-Leste', ARRAY['dili'])
) AS a(alias_name, language, country, names)
JOIN locations l
  ON LOWER(l.country) = LOWER(a.country)
 AND LOWER(l.name) = ANY (a.names)
ON CONFLICT (location_id, alias_name, language) DO NOTHING;
