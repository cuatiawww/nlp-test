DO $$
BEGIN
  -- Drop old unique constraint (name only, auto-named by PostgreSQL)
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_name_key') THEN
    ALTER TABLE locations DROP CONSTRAINT locations_name_key;
  END IF;
  -- Drop any leftover index
  DROP INDEX IF EXISTS idx_locations_name;
END $$;

-- Add new composite unique index for (name, country) based upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_name_country ON locations(name, country);

-- ═══════════════════════════════════════════════════════════════
-- INDONESIA (38 provinces + major cities)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Aceh', 4.6951, 96.7494, 'Indonesia'),
('Banda Aceh', 5.5483, 95.3238, 'Indonesia'),
('Medan', 3.5952, 98.6722, 'Indonesia'),
('Sumatera Utara', 3.5853, 98.6746, 'Indonesia'),
('Sumatera Barat', -0.7399, 100.2400, 'Indonesia'),
('Padang', -0.9471, 100.4172, 'Indonesia'),
('Riau', 0.5075, 101.4471, 'Indonesia'),
('Pekanbaru', 0.5071, 101.4478, 'Indonesia'),
('Kepulauan Riau', 0.8691, 104.2777, 'Indonesia'),
('Batam', 1.0456, 103.8737, 'Indonesia'),
('Tanjung Pinang', 0.9224, 104.4839, 'Indonesia'),
('Jambi', -1.6101, 103.6131, 'Indonesia'),
('Bengkulu', -3.7928, 102.2608, 'Indonesia'),
('Sumatera Selatan', -2.9803, 104.7548, 'Indonesia'),
('Palembang', -2.9761, 104.7754, 'Indonesia'),
('Bangka Belitung', -2.4332, 106.1492, 'Indonesia'),
('Pangkal Pinang', -2.1312, 106.1177, 'Indonesia'),
('Lampung', -5.4505, 105.2600, 'Indonesia'),
('Bandar Lampung', -5.4297, 105.2618, 'Indonesia'),
('Banten', -6.1631, 106.2071, 'Indonesia'),
('Serang', -6.1200, 106.1503, 'Indonesia'),
('Tangerang', -6.1783, 106.6319, 'Indonesia'),
('South Tangerang', -6.2889, 106.7181, 'Indonesia'),
('Jawa Barat', -6.9175, 107.6191, 'Indonesia'),
('Bandung', -6.9175, 107.6191, 'Indonesia'),
('Bogor', -6.5950, 106.8166, 'Indonesia'),
('Depok', -6.4025, 106.7942, 'Indonesia'),
('Bekasi', -6.2383, 106.9756, 'Indonesia'),
('Cirebon', -6.7478, 108.5538, 'Indonesia'),
('Cimahi', -6.8722, 107.5425, 'Indonesia'),
('Sukabumi', -6.9221, 106.9340, 'Indonesia'),
('Tasikmalaya', -7.3274, 108.2231, 'Indonesia'),
('DKI Jakarta', -6.2088, 106.8456, 'Indonesia'),
('Jakarta', -6.2088, 106.8456, 'Indonesia'),
('Jawa Tengah', -6.9667, 110.4167, 'Indonesia'),
('Semarang', -6.9667, 110.4167, 'Indonesia'),
('Surakarta', -7.5567, 110.8317, 'Indonesia'),
('Purwokerto', -7.4211, 109.2344, 'Indonesia'),
('Pekalongan', -6.8889, 109.6753, 'Indonesia'),
('Tegal', -6.8690, 109.1386, 'Indonesia'),
('Magelang', -7.4704, 110.2181, 'Indonesia'),
('DI Yogyakarta', -7.8014, 110.3646, 'Indonesia'),
('Yogyakarta', -7.8014, 110.3646, 'Indonesia'),
('Jawa Timur', -7.5361, 112.2383, 'Indonesia'),
('Surabaya', -7.2575, 112.7521, 'Indonesia'),
('Malang', -7.9797, 112.6304, 'Indonesia'),
('Kediri', -7.8167, 112.0105, 'Indonesia'),
('Madiun', -7.6314, 111.5239, 'Indonesia'),
('Blitar', -8.0986, 112.1636, 'Indonesia'),
('Probolinggo', -7.7545, 113.2151, 'Indonesia'),
('Pasuruan', -7.6408, 112.9075, 'Indonesia'),
('Mojokerto', -7.4667, 112.4333, 'Indonesia'),
('Batu', -7.8700, 112.5283, 'Indonesia'),
('Bali', -8.3405, 115.0920, 'Indonesia'),
('Denpasar', -8.6529, 115.2194, 'Indonesia'),
('Nusa Tenggara Barat', -8.5833, 116.1167, 'Indonesia'),
('Mataram', -8.5833, 116.1167, 'Indonesia'),
('Nusa Tenggara Timur', -10.1667, 123.5833, 'Indonesia'),
('Kupang', -10.1667, 123.5833, 'Indonesia'),
('Kalimantan Barat', -0.0333, 109.3333, 'Indonesia'),
('Pontianak', -0.0333, 109.3333, 'Indonesia'),
('Kalimantan Tengah', -2.2167, 113.9167, 'Indonesia'),
('Palangka Raya', -2.2167, 113.9167, 'Indonesia'),
('Kalimantan Selatan', -3.3167, 114.5833, 'Indonesia'),
('Banjarmasin', -3.3167, 114.5833, 'Indonesia'),
('Banjarbaru', -3.4414, 114.8333, 'Indonesia'),
('Kalimantan Timur', 0.5387, 116.4194, 'Indonesia'),
('Samarinda', -0.5022, 117.1536, 'Indonesia'),
('Balikpapan', -1.2379, 116.8529, 'Indonesia'),
('Kalimantan Utara', 2.8395, 116.9127, 'Indonesia'),
('Tarakan', 3.2981, 117.5809, 'Indonesia'),
('Sulawesi Utara', 1.4930, 124.8413, 'Indonesia'),
('Manado', 1.4930, 124.8413, 'Indonesia'),
('Gorontalo', 0.5407, 123.0595, 'Indonesia'),
('Sulawesi Tengah', -1.4300, 120.4477, 'Indonesia'),
('Palu', -0.9083, 119.8583, 'Indonesia'),
('Sulawesi Barat', -2.6292, 119.1451, 'Indonesia'),
('Mamuju', -2.6800, 118.8861, 'Indonesia'),
('Sulawesi Selatan', -5.1477, 119.4327, 'Indonesia'),
('Makassar', -5.1477, 119.4327, 'Indonesia'),
('Parepare', -4.0167, 119.6236, 'Indonesia'),
('Palopo', -2.9928, 120.1984, 'Indonesia'),
('Sulawesi Tenggara', -3.9672, 122.5153, 'Indonesia'),
('Kendari', -3.9672, 122.5153, 'Indonesia'),
('Maluku', -3.7000, 128.1800, 'Indonesia'),
('Ambon', -3.6954, 128.1814, 'Indonesia'),
('Maluku Utara', 0.7833, 127.3833, 'Indonesia'),
('Ternate', 0.7906, 127.3845, 'Indonesia'),
('Tidore', 0.6833, 127.4000, 'Indonesia'),
('Papua', -2.5333, 140.7167, 'Indonesia'),
('Jayapura', -2.5333, 140.7167, 'Indonesia'),
('Papua Barat', -1.3369, 133.1740, 'Indonesia'),
('Manokwari', -0.8617, 134.0620, 'Indonesia'),
('Papua Selatan', -4.3667, 138.4667, 'Indonesia'),
('Merauke', -8.4932, 140.4011, 'Indonesia'),
('Papua Tengah', -3.1000, 136.3500, 'Indonesia'),
('Sorong', -0.8641, 131.2511, 'Indonesia'),
('Papua Barat Daya', -1.0000, 131.0000, 'Indonesia'),
('Papua Pegunungan', -4.0000, 139.0000, 'Indonesia')
ON CONFLICT (name, country) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- MALAYSIA
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Johor', 1.8720, 103.5010, 'Malaysia'),
('Johor Bahru', 1.4927, 103.7414, 'Malaysia'),
('Kedah', 6.1248, 100.3615, 'Malaysia'),
('Alor Setar', 6.1248, 100.3615, 'Malaysia'),
('Kelantan', 6.1254, 102.2403, 'Malaysia'),
('Kota Bharu', 6.1254, 102.2403, 'Malaysia'),
('Melaka', 2.1896, 102.2501, 'Malaysia'),
('Malacca City', 2.1896, 102.2501, 'Malaysia'),
('Negeri Sembilan', 2.7292, 101.9381, 'Malaysia'),
('Seremban', 2.7292, 101.9381, 'Malaysia'),
('Pahang', 3.8160, 103.3300, 'Malaysia'),
('Kuantan', 3.8160, 103.3300, 'Malaysia'),
('Perak', 4.5921, 101.0899, 'Malaysia'),
('Ipoh', 4.5921, 101.0899, 'Malaysia'),
('Perlis', 6.4475, 100.2050, 'Malaysia'),
('Penang', 5.4141, 100.3288, 'Malaysia'),
('George Town', 5.4141, 100.3288, 'Malaysia'),
('Sabah', 5.9788, 116.0753, 'Malaysia'),
('Kota Kinabalu', 5.9788, 116.0753, 'Malaysia'),
('Sandakan', 5.8402, 118.1179, 'Malaysia'),
('Tawau', 4.2448, 117.8916, 'Malaysia'),
('Sarawak', 1.5533, 110.3592, 'Malaysia'),
('Kuching', 1.5533, 110.3592, 'Malaysia'),
('Miri', 4.3921, 114.0089, 'Malaysia'),
('Sibu', 2.2867, 111.8324, 'Malaysia'),
('Selangor', 3.0738, 101.5183, 'Malaysia'),
('Shah Alam', 3.0738, 101.5183, 'Malaysia'),
('Petaling Jaya', 3.1073, 101.6087, 'Malaysia'),
('Klang', 3.0333, 101.4500, 'Malaysia'),
('Subang Jaya', 3.0568, 101.5851, 'Malaysia'),
('Terengganu', 5.3303, 103.1408, 'Malaysia'),
('Kuala Terengganu', 5.3303, 103.1408, 'Malaysia'),
('Kuala Lumpur', 3.1390, 101.6869, 'Malaysia'),
('Putrajaya', 2.9264, 101.6964, 'Malaysia'),
('Labuan', 5.2872, 115.2430, 'Malaysia')
ON CONFLICT (name, country) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- THAILAND
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Bangkok', 13.7563, 100.5018, 'Thailand'),
('Samut Prakan', 13.6016, 100.6111, 'Thailand'),
('Nonthaburi', 13.8616, 100.5143, 'Thailand'),
('Pathum Thani', 14.0198, 100.5253, 'Thailand'),
('Ayutthaya', 14.3532, 100.5686, 'Thailand'),
('Chon Buri', 13.3611, 100.9847, 'Thailand'),
('Pattaya', 12.9236, 100.8825, 'Thailand'),
('Rayong', 12.6814, 101.2813, 'Thailand'),
('Chanthaburi', 12.6096, 102.1040, 'Thailand'),
('Nakhon Pathom', 13.8211, 100.0630, 'Thailand'),
('Ratchaburi', 13.5363, 99.8171, 'Thailand'),
('Kanchanaburi', 14.0250, 99.5205, 'Thailand'),
('Chiang Mai', 18.7883, 98.9853, 'Thailand'),
('Chiang Rai', 19.9079, 99.8323, 'Thailand'),
('Lampang', 18.2933, 99.4895, 'Thailand'),
('Tak', 16.8828, 99.1260, 'Thailand'),
('Sukhothai', 17.0056, 99.8265, 'Thailand'),
('Phitsanulok', 16.8245, 100.2598, 'Thailand'),
('Nakhon Ratchasima', 14.9730, 102.0836, 'Thailand'),
('Khon Kaen', 16.4419, 102.8321, 'Thailand'),
('Udon Thani', 17.4140, 102.7923, 'Thailand'),
('Nong Khai', 17.8786, 102.7453, 'Thailand'),
('Ubon Ratchathani', 15.2441, 104.8491, 'Thailand'),
('Surin', 14.8752, 103.4945, 'Thailand'),
('Buriram', 14.9953, 103.1036, 'Thailand'),
('Chaiyaphum', 15.8100, 102.0299, 'Thailand'),
('Loei', 17.4904, 101.6598, 'Thailand'),
('Sakon Nakhon', 17.1661, 104.1487, 'Thailand'),
('Nakhon Phanom', 17.4023, 104.7816, 'Thailand'),
('Mukdahan', 16.5405, 104.7209, 'Thailand'),
('Nakhon Sawan', 15.6987, 100.1202, 'Thailand'),
('Phetchabun', 16.4186, 101.1595, 'Thailand'),
('Suphan Buri', 14.4746, 100.1175, 'Thailand'),
('Saraburi', 14.5279, 100.9108, 'Thailand'),
('Lopburi', 14.7990, 100.6480, 'Thailand'),
('Sing Buri', 14.8890, 100.4071, 'Thailand'),
('Ang Thong', 14.5578, 100.4392, 'Thailand'),
('Chai Nat', 15.1850, 100.1246, 'Thailand'),
('Uthai Thani', 15.3797, 100.0240, 'Thailand'),
('Kamphaeng Phet', 16.4825, 99.5215, 'Thailand'),
('Phrae', 18.1452, 100.1418, 'Thailand'),
('Nan', 18.7868, 100.7748, 'Thailand'),
('Phayao', 19.1670, 99.9134, 'Thailand'),
('Mae Hong Son', 19.3024, 97.9674, 'Thailand'),
('Lamphun', 18.5793, 99.0086, 'Thailand'),
('Nakhon Nayok', 14.2067, 101.2140, 'Thailand'),
('Prachin Buri', 14.0502, 101.3675, 'Thailand'),
('Sa Kaeo', 13.8241, 102.0645, 'Thailand'),
('Trat', 12.2425, 102.5148, 'Thailand'),
('Chachoengsao', 13.6879, 101.0680, 'Thailand'),
('Prachuap Khiri Khan', 11.8095, 99.7975, 'Thailand'),
('Hua Hin', 12.5682, 99.9582, 'Thailand'),
('Phetchaburi', 13.1113, 99.9400, 'Thailand'),
('Nakhon Si Thammarat', 8.4328, 99.9605, 'Thailand'),
('Surat Thani', 9.1401, 99.3311, 'Thailand'),
('Phuket', 7.8804, 98.3923, 'Thailand'),
('Krabi', 8.0863, 98.9063, 'Thailand'),
('Phang Nga', 8.4512, 98.5266, 'Thailand'),
('Ranong', 9.7690, 98.5822, 'Thailand'),
('Chumphon', 10.4930, 99.1798, 'Thailand'),
('Songkhla', 7.1891, 100.5951, 'Thailand'),
('Hat Yai', 7.0083, 100.4722, 'Thailand'),
('Pattani', 6.8690, 101.2503, 'Thailand'),
('Yala', 6.5424, 101.2806, 'Thailand'),
('Narathiwat', 6.4240, 101.8225, 'Thailand'),
('Satun', 6.6236, 100.0672, 'Thailand'),
('Trang', 7.5575, 99.6108, 'Thailand'),
('Phatthalung', 7.6196, 100.0774, 'Thailand')
ON CONFLICT (name, country) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- PHILIPPINES
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Manila', 14.5995, 120.9842, 'Philippines'),
('Metro Manila', 14.5995, 120.9842, 'Philippines'),
('Quezon City', 14.6760, 121.0437, 'Philippines'),
('Caloocan', 14.6496, 120.9810, 'Philippines'),
('Makati', 14.5547, 121.0244, 'Philippines'),
('Pasig', 14.5764, 121.0851, 'Philippines'),
('Taguig', 14.5176, 121.0509, 'Philippines'),
('Cebu', 10.3157, 123.8854, 'Philippines'),
('Cebu City', 10.3157, 123.8854, 'Philippines'),
('Davao City', 7.1907, 125.4553, 'Philippines'),
('Baguio', 16.4023, 120.5960, 'Philippines'),
('Angeles City', 15.1456, 120.5891, 'Philippines'),
('Batangas City', 13.7613, 121.0587, 'Philippines'),
('Iloilo City', 10.7202, 122.5621, 'Philippines'),
('Bacolod', 10.6670, 122.9499, 'Philippines'),
('Cagayan de Oro', 8.4822, 124.6472, 'Philippines'),
('Zamboanga City', 6.9214, 122.0790, 'Philippines'),
('General Santos', 6.1129, 125.1718, 'Philippines'),
('Tacloban', 11.2433, 125.0048, 'Philippines'),
('Cotabato City', 7.2167, 124.2500, 'Philippines'),
('Butuan', 8.9475, 125.5406, 'Philippines'),
('Tarlac', 15.4750, 120.5963, 'Philippines'),
('Olongapo', 14.8333, 120.2833, 'Philippines'),
('Malolos', 14.8436, 120.8122, 'Philippines'),
('Laoag', 18.1984, 120.5934, 'Philippines'),
('Vigan', 17.5748, 120.3869, 'Philippines'),
('Naga', 13.6170, 123.1850, 'Philippines'),
('Legazpi', 13.1391, 123.7438, 'Philippines'),
('Kalibo', 11.7085, 122.3639, 'Philippines'),
('Tagbilaran', 9.6558, 123.8532, 'Philippines'),
('Dumaguete', 9.3067, 123.3071, 'Philippines'),
('Ozamiz', 8.1464, 123.8439, 'Philippines'),
('Pagadian', 7.8270, 123.4367, 'Philippines'),
('Surigao City', 9.7833, 125.4950, 'Philippines'),
('Marawi', 8.0000, 124.2850, 'Philippines')
ON CONFLICT (name, country) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- VIETNAM
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Hanoi', 21.0278, 105.8342, 'Vietnam'),
('Ho Chi Minh City', 10.8231, 106.6297, 'Vietnam'),
('Da Nang', 16.0544, 108.2022, 'Vietnam'),
('Hai Phong', 20.8449, 106.6881, 'Vietnam'),
('Can Tho', 10.0367, 105.7842, 'Vietnam'),
('Hue', 16.4637, 107.5909, 'Vietnam'),
('Nha Trang', 12.2388, 109.1967, 'Vietnam'),
('Da Lat', 11.9465, 108.4419, 'Vietnam'),
('Vung Tau', 10.3460, 107.0843, 'Vietnam'),
('Bien Hoa', 10.9500, 106.8167, 'Vietnam'),
('Quy Nhon', 13.7696, 109.2120, 'Vietnam'),
('Hoi An', 15.8800, 108.3380, 'Vietnam'),
('Ha Long', 20.9511, 107.0806, 'Vietnam'),
('My Tho', 10.3633, 106.3597, 'Vietnam'),
('Rach Gia', 10.0152, 105.0833, 'Vietnam'),
('Phan Thiet', 10.9333, 108.1000, 'Vietnam'),
('Buon Ma Thuot', 12.6667, 108.0500, 'Vietnam'),
('Thanh Hoa', 19.8089, 105.7767, 'Vietnam'),
('Vinh', 18.6734, 105.6923, 'Vietnam'),
('Nam Dinh', 20.4203, 106.1683, 'Vietnam'),
('Thai Nguyen', 21.5941, 105.8462, 'Vietnam'),
('Hai Duong', 20.9411, 106.3333, 'Vietnam'),
('Bac Ninh', 21.1861, 106.0761, 'Vietnam'),
('Quang Ninh', 21.0000, 107.0000, 'Vietnam'),
('Binh Duong', 11.0000, 106.6500, 'Vietnam'),
('Dong Nai', 11.0000, 107.0000, 'Vietnam'),
('Ca Mau', 9.1833, 105.1500, 'Vietnam'),
('Bac Lieu', 9.2833, 105.7167, 'Vietnam'),
('Soc Trang', 9.6000, 105.9667, 'Vietnam'),
('Tra Vinh', 9.9333, 106.3500, 'Vietnam'),
('Ben Tre', 10.2333, 106.3833, 'Vietnam'),
('Tay Ninh', 11.3167, 106.1000, 'Vietnam'),
('Lam Dong', 11.9500, 108.4333, 'Vietnam'),
('Gia Lai', 13.7500, 108.2500, 'Vietnam'),
('Dak Lak', 12.6667, 108.0500, 'Vietnam'),
('Kon Tum', 14.3833, 108.0000, 'Vietnam'),
('Phu Yen', 13.1667, 109.1667, 'Vietnam'),
('Khanh Hoa', 12.2500, 109.1833, 'Vietnam'),
('Binh Dinh', 14.1667, 109.0000, 'Vietnam'),
('Quang Ngai', 15.1167, 108.8000, 'Vietnam'),
('Quang Nam', 15.5833, 108.4667, 'Vietnam'),
('Ha Tinh', 18.3333, 105.9000, 'Vietnam'),
('Nghe An', 18.6667, 105.6667, 'Vietnam'),
('Thai Binh', 20.4500, 106.3333, 'Vietnam'),
('Ninh Binh', 20.2500, 105.9833, 'Vietnam'),
('Bac Giang', 21.2667, 106.2000, 'Vietnam'),
('Cao Bang', 22.6667, 106.2500, 'Vietnam'),
('Ha Giang', 22.8333, 104.9833, 'Vietnam'),
('Lang Son', 21.8500, 106.7500, 'Vietnam'),
('Lao Cai', 22.4833, 103.9500, 'Vietnam'),
('Son La', 21.3333, 103.9167, 'Vietnam'),
('Dien Bien', 21.3833, 103.0333, 'Vietnam'),
('Hoa Binh', 20.8167, 105.3333, 'Vietnam'),
('Phu Tho', 21.3333, 105.2667, 'Vietnam'),
('Tuyen Quang', 21.8167, 105.2167, 'Vietnam'),
('Yen Bai', 21.7000, 104.8667, 'Vietnam')
ON CONFLICT (name, country) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- SINGAPORE
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Singapore', 1.3521, 103.8198, 'Singapore')
ON CONFLICT (name, country) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- BRUNEI
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Bandar Seri Begawan', 4.9031, 114.9398, 'Brunei'),
('Kuala Belait', 4.5833, 114.1833, 'Brunei'),
('Tutong', 4.8000, 114.6500, 'Brunei'),
('Bangar', 4.7167, 115.0667, 'Brunei')
ON CONFLICT (name, country) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- MYANMAR
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Yangon', 16.8403, 96.1735, 'Myanmar'),
('Mandalay', 21.9754, 96.0866, 'Myanmar'),
('Naypyidaw', 19.7633, 96.0785, 'Myanmar'),
('Bago', 17.3468, 96.5242, 'Myanmar'),
('Mawlamyine', 16.4904, 97.6281, 'Myanmar'),
('Taunggyi', 20.7833, 97.0333, 'Myanmar'),
('Sittwe', 20.1528, 92.8779, 'Myanmar'),
('Monywa', 22.1082, 95.1358, 'Myanmar'),
('Myitkyina', 25.3858, 97.3915, 'Myanmar'),
('Pathein', 16.7798, 94.7333, 'Myanmar'),
('Hpa-An', 16.8897, 97.6366, 'Myanmar'),
('Magway', 20.1443, 94.9204, 'Myanmar'),
('Hakha', 22.6502, 93.6072, 'Myanmar'),
('Loikaw', 19.6743, 97.2103, 'Myanmar'),
('Dawei', 14.0833, 98.1833, 'Myanmar'),
('Myeik', 12.4388, 98.5984, 'Myanmar')
ON CONFLICT (name, country) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- CAMBODIA
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Phnom Penh', 11.5564, 104.9282, 'Cambodia'),
('Siem Reap', 13.3622, 103.8594, 'Cambodia'),
('Battambang', 13.1022, 103.1873, 'Cambodia'),
('Sihanoukville', 10.6333, 103.5000, 'Cambodia'),
('Kampong Cham', 11.9912, 105.4615, 'Cambodia'),
('Kampong Thom', 12.6984, 104.8880, 'Cambodia'),
('Kep', 10.5333, 104.3167, 'Cambodia'),
('Pailin', 12.8500, 102.6167, 'Cambodia'),
('Pursat', 12.5399, 103.9158, 'Cambodia'),
('Koh Kong', 11.5333, 103.0333, 'Cambodia'),
('Kratie', 12.4833, 106.0167, 'Cambodia'),
('Stung Treng', 13.5264, 105.9727, 'Cambodia'),
('Preah Vihear', 13.8167, 104.9667, 'Cambodia'),
('Poipet', 13.6572, 102.5619, 'Cambodia'),
('Banlung', 13.7398, 107.0089, 'Cambodia'),
('Senmonorom', 12.4511, 107.1859, 'Cambodia')
ON CONFLICT (name, country) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- LAOS
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Vientiane', 17.9757, 102.6331, 'Laos'),
('Luang Prabang', 19.8833, 102.1333, 'Laos'),
('Savannakhet', 16.5612, 104.7474, 'Laos'),
('Pakse', 15.1167, 105.7833, 'Laos'),
('Luang Namtha', 20.9500, 101.4000, 'Laos'),
('Xieng Khouang', 19.3333, 103.3667, 'Laos'),
('Phongsaly', 21.6833, 102.1000, 'Laos'),
('Oudomxay', 20.6833, 101.9833, 'Laos'),
('Thakhek', 17.4000, 104.8000, 'Laos'),
('Attapeu', 14.8000, 106.8000, 'Laos')
ON CONFLICT (name, country) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- TIMOR-LESTE
-- ═══════════════════════════════════════════════════════════════
INSERT INTO locations (name, latitude, longitude, country) VALUES
('Dili', -8.5586, 125.5736, 'Timor-Leste'),
('Baucau', -8.4667, 126.4500, 'Timor-Leste'),
('Maliana', -8.9833, 125.2167, 'Timor-Leste'),
('Suai', -9.3167, 125.2500, 'Timor-Leste')
ON CONFLICT (name, country) DO NOTHING;
