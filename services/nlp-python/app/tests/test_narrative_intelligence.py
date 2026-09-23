import unittest
from unittest.mock import patch


class NarrativeIntelligenceTest(unittest.TestCase):
    def setUp(self):
        from app import config

        self.coords = {
            "Indonesia": (-6.2, 106.8),
            "Thailand": (13.7, 100.5),
            "Vietnam": (14.1, 108.3),
            "Bangkok": (13.7563, 100.5018),
            "Ho Chi Minh City": (10.8231, 106.6297),
        }
        self.countries = {
            **{name: name for name in ("Indonesia", "Thailand", "Vietnam")},
            "Bangkok": "Thailand",
            "Ho Chi Minh City": "Vietnam",
        }
        self.coords_patch = patch.object(config, "LOCATION_COORDS", self.coords)
        self.countries_patch = patch.object(config, "LOCATION_COUNTRIES", self.countries)
        self.agent_patch = patch.object(config, "AGENT_ENABLED", False)
        self.coords_patch.start()
        self.countries_patch.start()
        self.agent_patch.start()

    def tearDown(self):
        self.agent_patch.stop()
        self.countries_patch.stop()
        self.coords_patch.stop()

    def test_indonesian_period_variants(self):
        from app.surveillance_extraction import extract_time_frame

        self.assertEqual(
            extract_time_frame("1 Januari-31 Agustus 2026"),
            "2026-01-01 to 2026-08-31",
        )
        self.assertEqual(
            extract_time_frame("1 Jan s/d 31 Ags 2026"),
            "2026-01-01 to 2026-08-31",
        )
        self.assertEqual(
            extract_time_frame("Januari hingga Maret 2026"),
            "2026-01-01 to 2026-03-31",
        )
        self.assertEqual(extract_time_frame("semester I 2026"), "2026-01-01 to 2026-06-30")
        self.assertEqual(extract_time_frame("triwulan IV 2026"), "2026-10-01 to 2026-12-31")

    def test_newest_year_is_primary_and_history_is_retained(self):
        from app.surveillance_extraction import GazetteerLinker, build_surveillance_output

        text = (
            "Thailand reported 99.691 cases and 15 deaths in 2026 "
            "(1 Januari-31 Agustus 2026), compared with 614.601 cases "
            "and 274 deaths in 2025 and 777.730 cases in 2024."
        )
        output = build_surveillance_output(
            text,
            published_at="2026-09-10T10:00:00Z",
            diseases=["Dengue"],
            linker=GazetteerLinker(allow_remote=False),
            include_llm=False,
        ).model_dump(exclude_none=True)

        thailand = next(item for item in output["locations"] if item["country"] == "Thailand")
        self.assertEqual(thailand["reported_cases"], 99691)
        self.assertEqual(thailand["deaths"], 15)
        self.assertEqual(thailand["time_frame"], "2026-01-01 to 2026-08-31")
        history = {(item.get("year"), item["reported_cases"]): item for item in output["historical_comparisons"]}
        self.assertEqual(history[(2025, 614601)]["deaths"], 274)
        self.assertIsNone(history[(2024, 777730)].get("deaths"))

    def test_non_case_numbers_are_not_promoted_to_cases(self):
        from app.surveillance_extraction import GazetteerLinker, build_surveillance_output

        text = (
            "The positivity rate was 0,02 persen, hospital capacity was 150 tempat tidur, "
            "and 5.000 doses vaksin were distributed. Thailand reported 12 cases in 2026."
        )
        output = build_surveillance_output(
            text,
            published_at="2026-09-10T10:00:00Z",
            diseases=["COVID-19"],
            linker=GazetteerLinker(allow_remote=False),
            include_llm=False,
        )
        thailand = next(item for item in output.locations if item.country == "Thailand")
        self.assertEqual(thailand.reported_cases, 12)

    def test_metrics_for_multiple_countries_are_kept_separate(self):
        from app.surveillance_extraction import GazetteerLinker, build_surveillance_output

        output = build_surveillance_output(
            "Thailand reported 99.691 cases in 2026; Vietnam reported 3.000 cases in 2026.",
            published_at="2026-09-10T10:00:00Z",
            diseases=["Dengue"],
            linker=GazetteerLinker(allow_remote=False),
            include_llm=False,
        )
        by_country = {item.country: item.reported_cases for item in output.locations}
        self.assertEqual(by_country, {"Thailand": 99691, "Vietnam": 3000})

    def test_city_metrics_are_projected_under_their_country(self):
        from app.surveillance_extraction import GazetteerLinker, build_surveillance_output

        output = build_surveillance_output(
            "Bangkok reported 20 cases in 2026. Ho Chi Minh City reported 30 cases in 2026.",
            published_at="2026-09-10T10:00:00Z",
            diseases=["Dengue"],
            linker=GazetteerLinker(allow_remote=False),
            include_llm=False,
        )
        by_country = {item.country: item for item in output.locations}
        self.assertEqual(by_country["Thailand"].reported_cases, 20)
        self.assertEqual(by_country["Thailand"].provinces, [])
        self.assertEqual(by_country["Thailand"].cities, ["Bangkok"])
        self.assertEqual(by_country["Vietnam"].reported_cases, 30)
        self.assertEqual(by_country["Vietnam"].provinces, [])
        self.assertEqual(by_country["Vietnam"].cities, ["Ho Chi Minh City"])

    def test_new_and_cumulative_metrics_remain_country_scoped(self):
        from app.surveillance_extraction import GazetteerLinker, extract_metric_relations

        text = (
            "Singapore recorded 12,700 COVID-19 cases during 10-16 May 2026. "
            "Indonesia reported 2 new COVID-19 cases and 121 cumulative cases, "
            "with no deaths. Two cases were from Jakarta and Sulawesi."
        )
        relations = extract_metric_relations(text, linker=GazetteerLinker(allow_remote=False))
        indonesia = [
            item for item in relations
            if item.location.country == "Indonesia" and item.cases
        ]
        self.assertEqual(
            {(item.cases, item.qualifier) for item in indonesia},
            {(2, "new"), (121, "cumulative")},
        )
        self.assertNotIn("Jakarta", {item.location.name for item in relations})


if __name__ == "__main__":
    unittest.main()
