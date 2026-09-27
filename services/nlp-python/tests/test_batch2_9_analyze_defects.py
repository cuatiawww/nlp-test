"""Staging URL Analyze batches 2–9: rules-path defects with AGENT off.

Snippets are synthetic stand-ins for the i-number fixtures in the combined
brief. They lock the binding rules, not a live staging re-run.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.multi_event_extractor import (
    _extract_who_country_section_events,
    who_bulletin_char_limit,
)


def _diseases(text: str) -> list[str]:
    return extractors.prefer_outbreak_diseases(
        extractors.filter_diseases_to_evidence(
            extractors.extract_diseases(text) + extractors.extract_alias_diseases(text),
            text,
        ),
        text,
    )


class Batch29MetricBindingTests(unittest.TestCase):
    def test_i37_historical_case_comparison_is_not_deaths(self):
        text = (
            "Kantha Bopha hospitals treated nearly 10,000 children with dengue in August. "
            "In 2025, the figure was 20,000. Deaths reached 16 by mid-June 2026 "
            "after 79 deaths in 2025."
        )
        self.assertNotEqual(extractors.extract_death_count(text), 20000)
        self.assertIn(extractors.extract_death_count(text), {16, 79})

    def test_i38_percent_is_not_a_death_toll(self):
        text = (
            "Dengue cases in Cambodia surged 232 percent. "
            "The country recorded 16 deaths in 2026, up from 79 deaths in 2025."
        )
        self.assertEqual(extractors.extract_death_count(text), 16)
        self.assertNotEqual(extractors.extract_death_count(text), 232)

    def test_i46_age_and_duration_are_not_the_case_total(self):
        text = (
            "Timor-Leste confirmed one diphtheria case. "
            "The patient was a five-year-old child under follow-up for five years. "
            "No deaths were reported."
        )
        self.assertEqual(extractors.extract_case_count(text), 1)
        self.assertNotEqual(extractors.extract_case_count(text), 5)
        self.assertEqual(extractors.extract_death_count(text), 0)

    def test_i59_percent_does_not_replace_the_case_total(self):
        text = (
            "Singapore reported more than 600 dengue cases this season. "
            "About 70 per cent of cases were in residential areas."
        )
        self.assertEqual(extractors.extract_case_count(text), 600)
        self.assertNotEqual(extractors.extract_case_count(text), 70)

    def test_i61_vaccinated_subgroup_does_not_replace_infections(self):
        text = (
            "Singapore reported 40 measles infections this year. "
            "Of those, 3 vaccinated cases were identified."
        )
        self.assertEqual(extractors.extract_case_count(text), 40)

    def test_i62_thai_case_death_roles(self):
        text = "ไทยพบผู้ป่วยไข้เลือดออก 21,620 ราย เสียชีวิต 31 ราย"
        facts = extractors.predict_surveillance_facts(text)
        self.assertEqual(facts["case_count"], 21620)
        self.assertEqual(facts["death_count"], 31)
        self.assertNotEqual(facts["death_count"], 21620)

    def test_i64_english_pair_is_not_inverted(self):
        text = "Thailand reported 25,948 dengue and measles cases and 39 deaths."
        self.assertEqual(extractors.extract_case_count(text), 25948)
        self.assertEqual(extractors.extract_death_count(text), 39)

    def test_i68_weeks_are_not_cases(self):
        text = (
            "China reported nearly 100,000 hand, foot and mouth disease cases "
            "over the past four weeks."
        )
        self.assertEqual(extractors.extract_case_count(text), 100000)
        self.assertNotEqual(extractors.extract_case_count(text), 4)

    def test_i57_cases_hit_binds_the_total(self):
        text = (
            "Malaysia's Health Ministry is assessing HFMD vaccine feasibility "
            "as cases hit 40,879 this year."
        )
        facts = extractors.predict_surveillance_facts(text)
        self.assertEqual(facts["country"], "Malaysia")
        self.assertEqual(facts["case_count"], 40879)

    def test_i44_nationwide_total_beats_locality_breakdown(self):
        text = (
            "Timor-Leste dengue outbreak: 3,501 cases and 22 deaths nationwide, "
            "including 12 deaths in Dili. Baucau reported 2 deaths and Bobonaro 1 death."
        )
        facts = extractors.predict_surveillance_facts(text)
        self.assertEqual(facts["country"], "Timor-Leste")
        self.assertEqual(facts["location"], "Timor-Leste")
        self.assertEqual(facts["case_count"], 3501)
        self.assertEqual(facts["death_count"], 22)

    def test_i11_current_year_deaths_not_zero(self):
        text = (
            "Malaysia recorded 65,979 dengue cases and 62 deaths this year, "
            "compared with 32 deaths in the previous year. "
            "Putrajaya saw the highest weekly increase."
        )
        facts = extractors.predict_surveillance_facts(text)
        self.assertEqual(facts["case_count"], 65979)
        self.assertEqual(facts["death_count"], 62)
        self.assertEqual(facts["country"], "Malaysia")
        self.assertNotEqual(facts["location"], "Putrajaya")

    def test_i72_disease_keeps_its_own_count(self):
        text = (
            "DOH expands the patient tracker as dengue and leptospirosis cases surge. "
            "Dengue reached 19,792 cases and leptospirosis 3,805 cases."
        )
        facts = extractors.predict_surveillance_facts(text)
        self.assertEqual(facts["disease"], "Dengue")
        self.assertEqual(facts["case_count"], 19792)
        self.assertIn("Leptospirosis", facts["diseases"])
        self.assertEqual(facts["country"], "Philippines")


class Batch29DiseaseAndLanguageTests(unittest.TestCase):
    def test_i34_negated_avian_does_not_join_rainy_season_advisory(self):
        text = (
            "Public warned against rainy season diseases. Officials cited dengue, "
            "influenza-like illness, and leptospirosis. "
            "Avian influenza was not part of the advisory."
        )
        diseases = _diseases(text)
        self.assertIn("Dengue", diseases)
        self.assertIn("Leptospirosis", diseases)
        self.assertNotIn("Avian influenza", diseases)

    def test_i65_seasonal_influenza_is_not_relabeled_avian(self):
        text = (
            "Thailand logged 171,731 seasonal influenza cases and 16 deaths. "
            "Doctors described flu-like symptoms. This is not avian influenza."
        )
        diseases = _diseases(text)
        facts = extractors.predict_surveillance_facts(text)
        self.assertIn("Influenza", diseases)
        self.assertNotIn("Avian influenza", diseases)
        self.assertEqual(facts["disease"], "Influenza")
        self.assertEqual(facts["case_count"], 171731)
        self.assertEqual(facts["death_count"], 16)

    def test_i38_differential_diagnoses_stay_out_of_the_event(self):
        text = (
            "Dengue claimed 16 lives in Cambodia in 2026. Doctors listed typhoid, "
            "malaria and avian influenza only as differential diagnoses."
        )
        diseases = _diseases(text)
        self.assertEqual(diseases, ["Dengue"])

    def test_i46_background_covid_does_not_join_diphtheria(self):
        text = (
            "Timor-Leste confirmed the only confirmed diphtheria case. "
            "Background text recalls the COVID-19 pandemic response. No deaths."
        )
        diseases = _diseases(text)
        self.assertIn("Diphtheria", diseases)
        self.assertNotIn("COVID-19", diseases)
        self.assertEqual(extractors.extract_case_count(text), 1)

    def test_i64_administrative_mentions_are_not_outbreaks(self):
        text = (
            "Thailand reported 25,948 dengue and measles cases and 39 deaths. "
            "The ministry also monitors polio, mpox, smallpox, COVID-19 and Ebola administratively."
        )
        diseases = _diseases(text)
        self.assertIn("Dengue", diseases)
        self.assertIn("Measles", diseases)
        for extra in ("Polio", "Mpox", "Smallpox", "COVID-19", "Ebola disease, virus unspecified"):
            self.assertNotIn(extra, diseases)

    def test_i13_zero_case_co_mentions_are_dropped(self):
        text = (
            "This week Singapore reported 74 dengue cases. "
            "Chikungunya and Zika surveillance continues with no cases."
        )
        diseases = _diseases(text)
        self.assertIn("Dengue", diseases)
        self.assertNotIn("Chikungunya", diseases)
        self.assertFalse(any("zika" in item.casefold() for item in diseases))
        self.assertEqual(extractors.extract_case_count(text), 74)

    def test_i45_tetum_is_not_portuguese_and_keeps_counts(self):
        text = (
            "Janeiru Jullu 2026 MS rejista dengue 4.000, 52 grave "
            "no 32 hakotu iis iha Timor-Leste."
        )
        profile = extractors.detect_language(text)
        facts = extractors.predict_surveillance_facts(text)
        self.assertEqual(profile, "tet")
        self.assertNotEqual(profile, "pt")
        self.assertEqual(facts["case_count"], 4000)
        self.assertEqual(facts["death_count"], 32)
        self.assertEqual(facts["disease"], "Dengue")
        self.assertEqual(facts["country"], "Timor-Leste")


class Batch29BulletinAndAccessTests(unittest.TestCase):
    def test_i49_searo_sections_keep_asean_diseases(self):
        text = """Weekly Epidemiological Bulletin SEARO
India
Measles: 273 cases and 7 deaths.
Bangladesh
Dengue: 1 case and 2 deaths.
Indonesia
Dengue: 12,400 cases and 40 deaths.
COVID-19: 80 cases and 1 death.
Myanmar
Dengue: 3,200 cases and 9 deaths.
Thailand
Dengue: 21,620 cases and 31 deaths.
"""
        events = _extract_who_country_section_events(text, "Measles")
        keyed = {(event["country"], event["disease"]): event for event in events}
        self.assertEqual(keyed[("Indonesia", "Dengue")]["case_count"], 12400)
        self.assertEqual(keyed[("Indonesia", "Dengue")]["death_count"], 40)
        self.assertEqual(keyed[("Indonesia", "COVID-19")]["case_count"], 80)
        self.assertIn(("Myanmar", "Dengue"), keyed)
        self.assertIn(("Thailand", "Dengue"), keyed)
        self.assertEqual(keyed[("India", "Measles")]["case_count"], 273)
        facts = extractors.predict_surveillance_facts(text)
        self.assertIn(facts["country"], config.ASEAN_COUNTRIES)
        self.assertNotEqual(facts["case_count"], 273)
        self.assertNotEqual(facts["country"], "Bangladesh")

    def test_i40_wpro_keeps_later_countries(self):
        text = """Dengue Situation Update 753
Western Pacific Region
Cambodia
As of 3 September 2026, a total of 18,400 dengue cases, including 26 deaths.
Lao People's Democratic Republic
As of 1 September 2026, a total of 4,100 dengue cases, including 5 deaths.
Malaysia
As of 2 September 2026, a total of 65,979 dengue cases, including 62 deaths.
"""
        events = {
            event["country"]: event
            for event in _extract_who_country_section_events(text, "Dengue")
        }
        self.assertEqual(set(events), {"Cambodia", "Laos", "Malaysia"})
        self.assertEqual(events["Malaysia"]["case_count"], 65979)
        self.assertEqual(events["Malaysia"]["death_count"], 62)
        self.assertEqual(events["Laos"]["case_count"], 4100)

    def test_searo_char_limit_reaches_a_later_asean_heading(self):
        pad = "Opening table for India measles weekly trend. " * 400
        text = (
            "SEARO epidemiological bulletin\n"
            + pad
            + "\nIndonesia\nDengue: 12,400 cases and 40 deaths.\n"
        )
        limit = who_bulletin_char_limit(text, 6000)
        self.assertGreater(limit, 6000)
        self.assertIn("Indonesia", text[:limit])

    def test_i47_publication_wrapper_is_not_a_case_count(self):
        text = (
            "Dengue Situation Update — 753 — 3 September 2026\n"
            "Download the report (PDF): dengue_situation_update_753.pdf\n"
            "Related items: 5 publications in this series.\n"
        )
        self.assertTrue(extractors.is_unresolved_publication_landing(text))
        self.assertNotEqual(extractors.extract_case_count(text), 5)
        self.assertEqual(extractors.extract_case_count(text), 0)

    def test_i70_waf_page_is_source_blocked_not_an_outbreak(self):
        text = (
            "Just a moment... Checking your browser before accessing www.pna.gov.ph. "
            "Cloudflare Ray ID: abc. Enable JavaScript and cookies to continue."
        )
        self.assertTrue(extractors.is_source_blocked_content(text))
        self.assertTrue(extractors.is_challenge_or_blocked_content(text))
        facts = extractors.predict_surveillance_facts(text)
        self.assertEqual(facts["case_count"], 0)
        self.assertFalse(facts["disease"])


if __name__ == "__main__":
    unittest.main()
