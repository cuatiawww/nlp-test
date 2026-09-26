"""The case country is the country named in the text, never the news portal."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import extractors


class CaseCountryScopeTests(unittest.TestCase):
    def _facts(self, text: str, publisher: str = "Indonesia"):
        return extractors.predict_surveillance_facts(text, publisher)

    def test_national_and_international_without_a_country_are_global(self):
        samples = (
            "Kasus demam berdarah tercatat 100 kasus di seluruh tanah air.",
            "Wabah demam berdarah secara nasional mencatat 80 kasus.",
            "Wabah Salmonella internasional mencatat 40 kasus.",
            "Dengue cases nationwide reached 12 cases.",
            "Ca sốt xuất huyết trên toàn quốc là 15 ca.",
            "Antara News melaporkan wabah secara nasional dengan 10 kasus.",
            "The outbreak is international and counts 22 cases.",
        )
        for text in samples:
            facts = self._facts(text)
            self.assertEqual(facts["country"], "Global", text)
            self.assertEqual(facts["location"], "Global", text)
            self.assertIsNone(facts["locations"][0]["latitude"], text)
            self.assertIsNone(facts["locations"][0]["longitude"], text)
            self.assertNotEqual(facts["country"], "Indonesia", text)

    def test_a_named_country_stays_even_when_the_scope_is_national(self):
        samples = (
            ("Kasus DBD di Indonesia secara nasional mencapai 100 kasus.", "Indonesia"),
            ("Thailand records 53362 cases nationwide this year.", "Thailand"),
            ("Dengue cases nationwide in Malaysia declined to 51046 cases.", "Malaysia"),
            ("JAKARTA — Wabah kolera di Nigeria mencatat 80 kasus.", "Nigeria"),
            ("Vietnam ghi nhận 10 ca trên toàn quốc.", "Vietnam"),
            ("Kasus DBD di Indonesia mencapai 100 kasus, lebih tinggi dibandingkan Thailand.", "Indonesia"),
        )
        for text, expected in samples:
            facts = self._facts(text, "Indonesia")
            self.assertEqual(facts["country"], expected, text)
            self.assertNotEqual(facts["country"], "Global", text)

    def test_an_airport_is_not_an_international_outbreak(self):
        text = "Pemeriksaan di bandara internasional mencatat 20 kasus DBD di Jakarta."
        facts = self._facts(text)
        self.assertNotEqual(facts["country"], "Global")

    def test_publisher_dateline_plus_national_scope_has_no_coordinates(self):
        text = "JAKARTA — Kasus demam berdarah tercatat 100 kasus secara nasional."
        facts = self._facts(text, "Indonesia")
        self.assertEqual(facts["country"], "Global")
        self.assertIsNone(facts["locations"][0]["latitude"])
        self.assertNotEqual(facts["location"], "Jakarta")
        self.assertNotEqual(facts["location"], "Indonesia")

    def test_global_scope_never_keeps_a_pin(self):
        lat, lon = extractors.sanitize_event_coordinates(
            -2.5489, 118.0149, "Global", "Global"
        )
        self.assertIsNone(lat)
        self.assertIsNone(lon)
        lat, lon = extractors.sanitize_event_coordinates(
            -2.5489, 118.0149, "internasional", "internasional"
        )
        self.assertIsNone(lat)
        self.assertIsNone(lon)
        geo = extractors.geocode_place("Global", "Global", "wabah internasional")
        self.assertIsNone(geo[0])
        self.assertIsNone(geo[1])

    def test_named_country_is_not_relabeled_and_scope_stays_separate(self):
        self.assertEqual(extractors.event_country_name("United Kingdom"), "United Kingdom")
        self.assertEqual(extractors.event_country_name("nasional"), "Global")
        self.assertEqual(extractors.event_country_name("internasional"), "Global")
        self.assertEqual(extractors.surveillance_scope_label("Indonesia"), "ASEAN")
        self.assertEqual(extractors.surveillance_scope_label("United Kingdom"), "Outside ASEAN")
        self.assertEqual(extractors.surveillance_scope_label("Global"), "Global")
        self.assertEqual(extractors.surveillance_scope_label("MULTI_COUNTRY"), "MULTI_COUNTRY")
        self.assertEqual(extractors.country_scope("Global"), "Global")
        self.assertEqual(extractors.country_scope("Indonesia"), "Indonesia")

    def test_a_named_country_can_keep_its_own_centroid(self):
        facts = self._facts("Kasus DBD di Indonesia secara nasional mencapai 100 kasus.")
        self.assertEqual(facts["country"], "Indonesia")
        self.assertEqual(facts["case_count"], 100)
        place = facts["locations"][0]
        self.assertIsNotNone(place["latitude"])
        self.assertIsNotNone(place["longitude"])
        self.assertAlmostEqual(place["latitude"], -2.5489, places=3)


if __name__ == "__main__":
    unittest.main()
