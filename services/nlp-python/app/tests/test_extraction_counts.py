import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import extractors, config


class ExtractionCountsAndLocationTest(unittest.TestCase):
    def setUp(self):
        config.LOCATION_COORDS = {
            "Kuala Lumpur": (3.139, 101.6869),
            "Selangor": (3.0738, 101.5183),
            "Klang": (3.0333, 101.45),
            "Petaling": (3.1667, 101.65),
            "Singapore": (1.3521, 103.8198),
            "Jakarta": (-6.2088, 106.8456),
            "Semarang": (-6.9667, 110.4167),
            "Bima": (-8.4606, 118.7272),
            "Ho Chi Minh City": (10.8231, 106.6297),
        }
        config.LOCATION_COUNTRIES = {
            "Kuala Lumpur": "Malaysia",
            "Selangor": "Malaysia",
            "Klang": "Malaysia",
            "Petaling": "Malaysia",
            "Singapore": "Singapore",
            "Jakarta": "Indonesia",
            "Semarang": "Indonesia",
            "Bima": "Indonesia",
            "Ho Chi Minh City": "Vietnam",
        }
        config.build_location_patterns()

    def test_extract_infections_as_case_count(self):
        text = "Selangor still accounts for the most dengue cases, with 19,313 infections from January to July 9."
        self.assertEqual(extractors.extract_case_count(text), 19313)

    def test_extract_dengue_related_deaths(self):
        text = "The state also logged 21 dengue-related deaths, up from five fatalities during 2025."
        self.assertEqual(extractors.extract_death_count(text), 21)

    def test_extract_death_rose_from_x_to_y(self):
        text = "According to NST, deaths rose from 18 to 30 over the same period."
        self.assertEqual(extractors.extract_death_count(text), 30)

    def test_location_prefers_primary_over_comparison_singapore(self):
        text = (
            "Dengue cases in Malaysia rise nearly 30pc in H1 2026, MoH says outbreak remains under control.\n"
            "KUALA LUMPUR, July 6 — Dengue-related deaths in Malaysia have risen by 66.7 per cent this year. "
            "In contrast to regional trends observed in Singapore, Malaysia remains steady."
        )
        loc = extractors.extract_location(text)
        self.assertEqual(loc, "Kuala Lumpur")

    def test_location_prefers_headline_and_frequent_selangor(self):
        text = (
            "Petaling, Klang bear brunt of state's dengue surge.\n"
            "KUALA LUMPUR, Aug 4 — Petaling and Klang districts remain among Selangor's dengue hotspots. "
            "Selangor accounts for the most dengue cases with Selangor reporting highest burden."
        )
        loc = extractors.extract_location(text)
        self.assertEqual(loc, "Selangor")

    def test_asia_news_network_does_not_beat_malaysia(self):
        config.LOCATION_COORDS = {
            **config.LOCATION_COORDS,
            "Asia": (35.0, 105.0),
            "Malaysia": (4.2105, 101.9758),
            "Putrajaya": (2.9264, 101.6964),
        }
        config.LOCATION_COUNTRIES = {
            **config.LOCATION_COUNTRIES,
            "Asia": "Asia",
            "Malaysia": "Malaysia",
            "Putrajaya": "Malaysia",
        }
        config.build_location_patterns()
        text = (
            "Malaysia's dengue cases surge 66%, deaths nearly double – Asia News Network\n"
            "September 10, 2026 PUTRAJAYA – Dengue cases have surged 66% so far this year, "
            "with 65,979 infections recorded as of Epidemiological Week 35 compared with 39,616 "
            "during the same period last year."
        )
        self.assertEqual(extractors.extract_country_hint(text), "Malaysia")
        loc = extractors.extract_location(text)
        self.assertNotEqual(loc, "Asia")
        self.assertIn(loc, {"Malaysia", "Putrajaya"})
        self.assertFalse(extractors.is_usable_place_name("Asia", text, text.index("Asia")))

    def test_vietnamese_city_alias_resolves_to_gazetteer_city(self):
        text = "Hội nghị Đột quỵ TP.HCM 2026 diễn ra tại TP.HCM, Việt Nam."
        self.assertEqual(extractors.extract_location(text, country="Vietnam"), "Ho Chi Minh City")

    def test_mojibake_is_repaired_before_entity_matching(self):
        text = "Há»i nghá» Äá»t quá»µ TP.HCM 2026"
        repaired = extractors.repair_mojibake(text)
        self.assertIn("Đột quỵ", repaired)
        self.assertEqual(extractors.extract_location(text, country="Vietnam"), "Ho Chi Minh City")

    def test_stroke_alias_is_detected_without_rabies_false_positive(self):
        text = "Hội nghị Đột quỵ TP.HCM 2026 membahas pencegahan stroke."
        self.assertIn("Stroke", extractors.extract_alias_diseases(text))
        self.assertNotIn("rabies", [value.lower() for value in extractors.extract_alias_diseases(text)])

    def test_disease_display_aliases_use_canonical_names(self):
        self.assertEqual(
            extractors.normalize_disease_display("coronavirus MERS"),
            "Middle East Respiratory Syndrome (MERS)",
        )
        self.assertEqual(extractors.normalize_disease_display("COVID19"), "COVID-19")
        self.assertEqual(extractors.normalize_disease_display("dengue fever DBD"), "Dengue")
        self.assertEqual(extractors.normalize_disease_display("Viral Viral"), "UNKNOWN")


    def test_extract_decimal_case_count_with_multiplier_million(self):
        text = "Ditemukan 1.2 juta kasus terkonfirmasi di wilayah tersebut."
        self.assertEqual(extractors.extract_case_count(text), 1200000)

    def test_extract_decimal_case_count_with_multiplier_english(self):
        text = "There were 1.2 million cases recorded worldwide."
        self.assertEqual(extractors.extract_case_count(text), 1200000)

    def test_extract_decimal_case_count_with_comma_and_multiplier(self):
        text = "Mencatat 1,5 juta kasus demam berdarah selama periode tersebut."
        self.assertEqual(extractors.extract_case_count(text), 1500000)

    def test_extract_thousand_multiplier(self):
        text = "Kemenkes melaporkan 3.5 ribu pasien terinfeksi."
        self.assertEqual(extractors.extract_case_count(text), 3500)

    def test_hospitalized_patients_are_not_case_total(self):
        text = (
            "To date, 10 patients including 8 children were hospitalized, "
            "and all have returned home."
        )
        self.assertEqual(extractors.extract_case_count(text), 0)

    def test_thai_postfix_case_count_is_not_the_buddhist_year_or_death_count(self):
        text = (
            "ตั้งแต่วันที่ 1 มกราคม-31 สิงหาคม 2569 "
            "พบผู้ป่วยสะสม 99,691 ราย เสียชีวิต 15 ราย"
        )
        self.assertEqual(extractors.extract_case_count(text, disease="COVID-19"), 99691)
        self.assertEqual(extractors.extract_death_count(text, disease="COVID-19"), 15)

    def test_extract_decimal_case_count_pure(self):
        text = "Tercatat sebanyak 2.1 kasus per wilayah."
        # Should not throw ValueError: invalid literal for int() with base 10: '2.1'
        self.assertEqual(extractors.extract_case_count(text), 2)

    def test_extract_percentage_ignored_as_case_count(self):
        text = "Kasus demam berdarah naik 2.1 persen pada tahun ini."
        # Percentages must not crash with ValueError and must not be treated as absolute count
        self.assertEqual(extractors.extract_case_count(text), 0)

    def test_outbreak_count_is_not_a_case_count(self):
        self.assertEqual(
            extractors.extract_case_count(
                "The report identified 11 new dengue outbreaks in several provinces."
            ),
            0,
        )

    def test_extract_thousands_separator_both_formats(self):
        text_dot = "Sebanyak 10.000 kasus baru."
        self.assertEqual(extractors.extract_case_count(text_dot), 10000)
        text_comma = "Sebanyak 10,000 kasus baru."
        self.assertEqual(extractors.extract_case_count(text_comma), 10000)

    def test_extract_trailing_punctuation(self):
        text = "Sebanyak 15. kasus telah dilaporkan."
        self.assertEqual(extractors.extract_case_count(text), 15)

    def test_extract_death_count_decimal_and_multipliers(self):
        text_m = "Tercatat 1.2 ribu kematian akibat wabah tersebut."
        self.assertEqual(extractors.extract_death_count(text_m), 1200)

    def test_extract_count_never_crashes_on_malformed_inputs(self):
        # Arbitrary messy texts that previously could trigger ValueError in int()
        self.assertEqual(extractors.extract_case_count("Kasus: .."), 0)
        self.assertEqual(extractors.extract_death_count("Kematian: ..."), 0)

    def test_billion_and_over_cap_are_unknown(self):
        self.assertEqual(extractors.extract_case_count("Ditemukan 2 miliar kasus."), 0)
        self.assertEqual(extractors.extract_case_count("There were 2000000000 cases recorded."), 0)
        self.assertEqual(extractors.extract_case_count("Ditemukan 2.1 juta kasus terkonfirmasi."), 0)

    def test_who_spaced_thousands_are_case_totals(self):
        text = "Cumulatively, a total of 3 029 dengue cases have been reported in 2026."
        self.assertEqual(extractors.extract_case_count(text, disease="Dengue"), 3029)

    def test_percent_change_does_not_hide_following_case_total(self):
        text = (
            "The number of dengue fever cases in the country rose 66 per cent "
            "to 65,979 as of epidemiological week 35 this year, compared with "
            "39,616 cases recorded during the same period last year."
        )
        self.assertEqual(extractors.extract_case_count(text, disease="Dengue"), 65979)

    def test_focal_h5n1_case_is_one_not_prior_year_total(self):
        text = (
            "Cambodia confirms human H5N1 avian flu case as H5N1 hits more Utah egg farms\n"
            "Earlier this week Cambodian officials announced the country's fifth human "
            "H5N1 avian flu case this year, this one involving a 9-month-old girl. "
            "Cambodia reported 19 human cases of H5N1 in 2025, eight of which were fatal."
        )
        facts = extractors.predict_surveillance_facts(text)
        self.assertEqual(facts["country"], "Cambodia")
        self.assertEqual(facts["case_count"], 1)
        self.assertEqual(facts["death_count"], 0)
        self.assertNotEqual((facts.get("location") or "").casefold(), "were")

    def test_philippine_adjective_maps_to_philippines(self):
        self.assertEqual(
            extractors.extract_country_hint("Philstar / Philippine DOH notes measles"),
            "Philippines",
        )


if __name__ == "__main__":
    unittest.main()
