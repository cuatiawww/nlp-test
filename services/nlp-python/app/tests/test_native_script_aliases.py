"""Unit tests for Native ASEAN Script Aliases & Zero-Translation Resolution.

Validates that non-Latin Southeast Asian scripts (Thai, Khmer, Burmese, Lao)
and Vietnamese diacritics resolve instantly to canonical cities, countries, ISO3,
and coordinates without machine translation.
"""

import unittest
from app import config
from app import extractors
from app.multi_event_extractor import compose_structured_events


class TestNativeScriptAliases(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Ensure database gazetteer & aliases are loaded
        config.load_locations_from_db()

    def test_thai_bangkok_hierarchy(self):
        # กรุงเทพฯ (Bangkok colloquial/official shorthand)
        hier = extractors.resolve_location_hierarchy("กรุงเทพฯ")
        self.assertEqual(hier["canonical_name"], "Bangkok")
        self.assertEqual(hier["country"], "Thailand")
        self.assertEqual(hier["country_iso3"], "THA")
        self.assertAlmostEqual(hier["latitude"], 13.7563, places=2)
        self.assertAlmostEqual(hier["longitude"], 100.5018, places=2)

    def test_thai_bangkok_full_name_hierarchy(self):
        # กรุงเทพมหานคร (Bangkok full formal name)
        hier = extractors.resolve_location_hierarchy("กรุงเทพมหานคร")
        self.assertEqual(hier["canonical_name"], "Bangkok")
        self.assertEqual(hier["country"], "Thailand")
        self.assertEqual(hier["country_iso3"], "THA")

    def test_thai_provincial_cities_hierarchy(self):
        # Chiang Mai & Phuket
        cm = extractors.resolve_location_hierarchy("เชียงใหม่")
        self.assertEqual(cm["canonical_name"], "Chiang Mai")
        self.assertEqual(cm["country"], "Thailand")
        self.assertEqual(cm["country_iso3"], "THA")

        phuket = extractors.resolve_location_hierarchy("ภูเก็ต")
        self.assertEqual(phuket["canonical_name"], "Phuket")
        self.assertEqual(phuket["country"], "Thailand")
        self.assertEqual(phuket["country_iso3"], "THA")

    def test_cambodia_khmer_script_hierarchy(self):
        # ភ្នំពេញ (Phnom Penh)
        pp = extractors.resolve_location_hierarchy("ភ្នំពេញ")
        self.assertEqual(pp["canonical_name"], "Phnom Penh")
        self.assertEqual(pp["country"], "Cambodia")
        self.assertEqual(pp["country_iso3"], "KHM")
        self.assertAlmostEqual(pp["latitude"], 11.5564, places=2)

        # សៀមរាប (Siem Reap)
        sr = extractors.resolve_location_hierarchy("សៀមរាប")
        self.assertEqual(sr["canonical_name"], "Siem Reap")
        self.assertEqual(sr["country"], "Cambodia")
        self.assertEqual(sr["country_iso3"], "KHM")

    def test_myanmar_burmese_script_hierarchy(self):
        # ရန်ကုန် (Yangon)
        yg = extractors.resolve_location_hierarchy("ရန်ကုန်")
        self.assertEqual(yg["canonical_name"], "Yangon")
        self.assertEqual(yg["country"], "Myanmar")
        self.assertEqual(yg["country_iso3"], "MMR")
        self.assertAlmostEqual(yg["latitude"], 16.8403, places=2)

        # မန္တလေး (Mandalay)
        md = extractors.resolve_location_hierarchy("မန္တလေး")
        self.assertEqual(md["canonical_name"], "Mandalay")
        self.assertEqual(md["country"], "Myanmar")
        self.assertEqual(md["country_iso3"], "MMR")

    def test_laos_lao_script_hierarchy(self):
        # ວຽງຈັນ (Vientiane)
        vt = extractors.resolve_location_hierarchy("ວຽງຈັນ")
        self.assertEqual(vt["canonical_name"], "Vientiane")
        self.assertEqual(vt["country"], "Laos")
        self.assertEqual(vt["country_iso3"], "LAO")
        self.assertAlmostEqual(vt["latitude"], 17.9757, places=2)

        # ຫລວງພະບາງ (Luang Prabang)
        lp = extractors.resolve_location_hierarchy("ຫລວງພະບາງ")
        self.assertEqual(lp["canonical_name"], "Luang Prabang")
        self.assertEqual(lp["country"], "Laos")
        self.assertEqual(lp["country_iso3"], "LAO")

    def test_vietnamese_diacritics_and_shorthand(self):
        # Hà Nội -> Hanoi
        hn = extractors.resolve_location_hierarchy("Hà Nội")
        self.assertEqual(hn["canonical_name"], "Hanoi")
        self.assertEqual(hn["country"], "Vietnam")
        self.assertEqual(hn["country_iso3"], "VNM")

        # TP.HCM -> Ho Chi Minh City
        hcm = extractors.resolve_location_hierarchy("TP.HCM")
        self.assertEqual(hcm["canonical_name"], "Ho Chi Minh City")
        self.assertEqual(hcm["country"], "Vietnam")
        self.assertEqual(hcm["country_iso3"], "VNM")

        # Sài Gòn -> Ho Chi Minh City
        sg = extractors.resolve_location_hierarchy("Sài Gòn")
        self.assertEqual(sg["canonical_name"], "Ho Chi Minh City")
        self.assertEqual(sg["country"], "Vietnam")

    def test_thai_unspaced_sentence_extraction(self):
        # Thai sentences do not separate words with spaces
        text = "พบผู้ป่วยไข้เลือดออก 25 รายในกรุงเทพฯวันนี้"
        loc = extractors.extract_location(text)
        self.assertEqual(loc, "Bangkok")

    def test_khmer_sentence_extraction(self):
        text = "ករណីជំងឺគ្រុនឈាមនៅភ្នំពេញកើនឡើង 12 ករណី"
        loc = extractors.extract_location(text)
        self.assertEqual(loc, "Phnom Penh")

    def test_burmese_sentence_extraction(self):
        text = "ရန်ကုန်မြို့တွင် သွေးလွန်တုပ်ကွေး ရောဂါဖြစ်ပွားမှု ၄၅ မှု တွေ့ရှိရသည်"
        loc = extractors.extract_location(text)
        self.assertEqual(loc, "Yangon")

    def test_lao_sentence_extraction(self):
        text = "ການລະບາດຂອງພະຍາດໄຂ້ເລືອດອອກຢູ່ວຽງຈັນ 30 ກໍລະນີ"
        loc = extractors.extract_location(text)
        self.assertEqual(loc, "Vientiane")

    def test_multi_event_with_native_scripts(self):
        text = "Laporan DBD di ASEAN: กรุงเทพฯ (45 kasus), ភ្នំពេញ (15 kasus)."
        locs = extractors.extract_all_locations(text)
        self.assertGreaterEqual(len(locs), 2)
        extracted_names = {l["name"] for l in locs}
        self.assertIn("Bangkok", extracted_names)
        self.assertIn("Phnom Penh", extracted_names)

        events = compose_structured_events(
            text=text,
            primary_disease="Dengue",
            primary_location="Bangkok",
            diseases_extracted=["Dengue"],
            locations=locs,
            case_count=60,
            death_count=0,
        )
        self.assertGreaterEqual(len(events), 2)
        event_locs = {e["location_name"] for e in events}
        self.assertIn("Bangkok", event_locs)
        self.assertIn("Phnom Penh", event_locs)
        for e in events:
            if e["location_name"] == "Bangkok":
                self.assertEqual(e["country"], "Thailand")
                self.assertEqual(e["country_iso3"], "THA")
                self.assertIsNotNone(e["latitude"])
            elif e["location_name"] == "Phnom Penh":
                self.assertEqual(e["country"], "Cambodia")
                self.assertEqual(e["country_iso3"], "KHM")
                self.assertIsNotNone(e["latitude"])


if __name__ == "__main__":
    unittest.main()
