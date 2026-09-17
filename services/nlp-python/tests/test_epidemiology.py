import unittest

from app.epidemiology import (
    event_category,
    evidence_sentences,
    extract_event_date,
    extract_event_period,
    extract_labeled_counts,
    normalize_publication_date,
)


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


if __name__ == "__main__":
    unittest.main()
