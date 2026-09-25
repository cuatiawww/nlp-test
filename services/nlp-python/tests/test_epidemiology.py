import copy
import unittest

from app import config
from app.epidemiology import (
    event_category,
    evidence_sentences,
    extract_event_date,
    extract_event_period,
    extract_labeled_counts,
    normalize_publication_date,
)
from app.extractors import extract_case_count
from app.surveillance_extraction import extract_time_frame


class EpidemiologyTests(unittest.TestCase):
    def test_publication_and_event_dates_are_separate(self):
        text = "Pada tanggal 14 Oktober 2026 tercatat penambahan sebanyak 1.053 kasus COVID-19."
        self.assertEqual(normalize_publication_date("2026-10-15T08:00:00+07:00"), "2026-10-15")
        self.assertEqual(extract_event_date(text), "2026-10-14")

    def test_extracts_only_labeled_counts(self):
        counts = extract_labeled_counts(
            "Officials recorded 1,362 confirmed cases, 41 suspected cases, and 18 hospitalized patients."
        )
        self.assertEqual(counts["confirmed_cases"], 1362)
        self.assertEqual(counts["suspected_cases"], 41)
        self.assertEqual(counts["hospitalizations"], 18)

    def test_unrelated_numbers_are_not_typed_as_cases(self):
        counts = extract_labeled_counts("The conference in 2026 involved 900 doctors from 34 provinces.")
        self.assertEqual(counts, {"confirmed_cases": None, "suspected_cases": None, "hospitalizations": None})

    def test_evidence_and_event_category(self):
        evidence = evidence_sentences("Officials reported 27 dengue cases in Jakarta. A meeting involved 200 people.")
        self.assertEqual(evidence, ["Officials reported 27 dengue cases in Jakarta."])
        self.assertEqual(event_category("disease outbreak wabah", True), "outbreak")

    def test_mpox_range_is_cumulative_and_needs_review(self):
        period = extract_event_period(
            "From 1 January to 23 August 2026, the DDC recorded 254 mpox cases."
        )
        self.assertEqual(period["event_date_start"], "2026-01-01")
        self.assertEqual(period["event_date_end"], "2026-08-23")
        self.assertEqual(period["period_type"], "cumulative")
        self.assertTrue(period["date_needs_review"])

    def test_cumulative_as_of_window(self):
        period = extract_event_period(
            "From September 2025, a cumulative 933 mpox cases and 13 deaths were reported as of January 2026."
        )
        self.assertEqual(period["period_type"], "cumulative")
        self.assertTrue(period["date_needs_review"])
        self.assertEqual(period["event_date_start"], "2025-09-01")


CHIKUNGUNYA_YEAR_SPAN = (
    "between 2002 and 2023, there were 26 cases of chikungunya notified in "
    "Australians who acquired their infection in Timor-Leste"
)
CHIKUNGUNYA_MONTH = (
    "In January 2024, an outbreak of chikungunya was recognized in Timor-Leste "
    "for the first time with 195 outbreak cases"
)
PUBLISHED_AT = "2026-04-15"


class RangedCaseDateTests(unittest.TestCase):
    """Case date comes from ranged article phrasing, not the publish date."""

    def setUp(self):
        self._months = dict(config.TEMPORAL_MONTH_MAP)
        self._attempted = config.LEXICON_LOAD_ATTEMPTED
        self._terms = copy.deepcopy(config.LEXICON_TERMS)
        config.LEXICON_LOAD_ATTEMPTED = True
        months = dict(config.TEMPORAL_MONTH_MAP)
        months.update({
            "january": 1,
            "march": 3,
            "august": 8,
            "october": 10,
            "oktober": 10,
        })
        config.TEMPORAL_MONTH_MAP = months
        english_cases = config.LEXICON_TERMS.setdefault("metric_case", {}).setdefault("en", [])
        if not any(str(term).casefold() == "cases" for term in english_cases):
            english_cases.append("cases")

    def tearDown(self):
        config.TEMPORAL_MONTH_MAP = self._months
        config.LEXICON_LOAD_ATTEMPTED = self._attempted
        config.LEXICON_TERMS = self._terms

    def test_between_years_keeps_the_case_window_and_count(self):
        period = extract_event_period(CHIKUNGUNYA_YEAR_SPAN, published_at=PUBLISHED_AT)
        frame = extract_time_frame(CHIKUNGUNYA_YEAR_SPAN)
        self.assertLessEqual(int(period["event_date_start"][:4]), 2002)
        self.assertEqual(period["event_date_end"][:4], "2023")
        self.assertLessEqual(period["event_date_start"], "2002-01-01")
        self.assertGreaterEqual(period["event_date_end"], "2023-01-01")
        self.assertLessEqual(period["event_date_end"], "2023-12-31")
        self.assertNotEqual(period["event_date"], PUBLISHED_AT)
        self.assertNotEqual(period["event_date_start"], PUBLISHED_AT)
        self.assertIn("2002", frame)
        self.assertIn("2023", frame)
        self.assertNotIn(PUBLISHED_AT, frame)
        self.assertEqual(extract_case_count(CHIKUNGUNYA_YEAR_SPAN), 26)

    def test_from_year_to_year_matches_between_year_and_year(self):
        period = extract_event_period(
            "from 2002 to 2023, 26 chikungunya cases were notified in Timor-Leste",
            published_at=PUBLISHED_AT,
        )
        self.assertEqual(period["event_date_start"], "2002-01-01")
        self.assertEqual(period["event_date_end"], "2023-12-31")
        self.assertEqual(extract_case_count(
            "from 2002 to 2023, 26 chikungunya cases were notified in Timor-Leste"
        ), 26)

    def test_january_2024_outbreak_month_and_cases(self):
        period = extract_event_period(CHIKUNGUNYA_MONTH, published_at=PUBLISHED_AT)
        frame = extract_time_frame(CHIKUNGUNYA_MONTH)
        self.assertEqual(period["event_date_start"], "2024-01-01")
        self.assertEqual(period["event_date_end"], "2024-01-31")
        self.assertNotEqual(period["event_date"], PUBLISHED_AT)
        self.assertNotEqual(period["event_date_start"], PUBLISHED_AT)
        self.assertTrue(frame.startswith("2024-01-"))
        self.assertIn("2024-01-31", frame)
        self.assertNotIn(PUBLISHED_AT, frame)
        self.assertEqual(extract_case_count(CHIKUNGUNYA_MONTH), 195)

    def test_in_month_year_uses_that_calendar_month(self):
        period = extract_event_period("in March 2024 there were 12 dengue cases in Timor-Leste")
        self.assertEqual(period["event_date_start"], "2024-03-01")
        self.assertEqual(period["event_date_end"], "2024-03-31")

    def test_leading_day_range_is_not_replaced_by_a_later_year_span(self):
        text = (
            "From 1 January to 23 August 2026, the DDC recorded 254 mpox cases. "
            "Between 2002 and 2023, 26 older notifications were also described."
        )
        period = extract_event_period(text, published_at=PUBLISHED_AT)
        self.assertEqual(period["event_date_start"], "2026-01-01")
        self.assertEqual(period["event_date_end"], "2026-08-23")
        self.assertNotEqual(period["event_date_start"], "2002-01-01")

    def test_single_point_date_stays_a_single_day(self):
        text = "On 14 October 2026, officials recorded 4 dengue cases in Timor-Leste."
        period = extract_event_period(text, published_at=PUBLISHED_AT)
        self.assertEqual(period["event_date"], "2026-10-14")
        self.assertEqual(period["event_date_start"], "2026-10-14")
        self.assertEqual(period["event_date_end"], "2026-10-14")
        self.assertEqual(extract_time_frame(text), "2026-10-14")
        self.assertNotEqual(period["event_date"], PUBLISHED_AT)


if __name__ == "__main__":
    unittest.main()
