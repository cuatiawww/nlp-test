import unittest

from app.epidemiology import (
    event_category,
    evidence_sentences,
    extract_event_date,
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


if __name__ == "__main__":
    unittest.main()
