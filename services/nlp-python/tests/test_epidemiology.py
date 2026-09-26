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
from app.extractors import extract_death_count


class EpidemiologyTests(unittest.TestCase):
    def setUp(self):
        # Named months live in the lexicon API. These tests name January,
        # August, September, and October, so they carry that slice themselves
        # when the registry is unreachable.
        self._months = dict(config.TEMPORAL_MONTH_MAP)
        self._attempted = config.LEXICON_LOAD_ATTEMPTED
        config.LEXICON_LOAD_ATTEMPTED = True
        config.TEMPORAL_MONTH_MAP = {
            **self._months,
            "january": 1,
            "januari": 1,
            "august": 8,
            "agustus": 8,
            "september": 9,
            "october": 10,
            "oktober": 10,
        }

    def tearDown(self):
        config.TEMPORAL_MONTH_MAP = self._months
        config.LEXICON_LOAD_ATTEMPTED = self._attempted

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

    def test_months_ago_is_publication_minus_the_offset(self):
        period = extract_event_period(
            "Lima orang meninggal 3 bulan yang lalu di wilayah itu.",
            published_at="2026-09-23",
        )
        self.assertEqual(period["event_date"], "2026-06-23")
        self.assertEqual(period["event_date_start"], "2026-06-23")
        self.assertTrue(period["date_needs_review"])

    def test_recent_month_window_ends_on_the_publication_date(self):
        period = extract_event_period(
            "Selama 3 bulan terakhir tercatat 4 kematian.",
            published_at="2026-09-23",
        )
        self.assertEqual(period["event_date_start"], "2026-06-23")
        self.assertEqual(period["event_date_end"], "2026-09-23")
        self.assertEqual(period["event_date"], "2026-09-23")

    def test_english_and_vietnamese_relative_death_dates(self):
        english = extract_event_period(
            "Two deaths were recorded 3 months ago.",
            published_at="2026-09-23",
        )
        vietnamese = extract_event_period(
            "Có 2 ca tử vong cách đây 3 tháng.",
            published_at="2026-09-23",
        )
        self.assertEqual(english["event_date"], "2026-06-23")
        self.assertEqual(vietnamese["event_date"], "2026-06-23")

    def test_age_in_months_is_not_a_case_date(self):
        period = extract_event_period(
            "Seorang bayi berusia 3 bulan meninggal.",
            published_at="2026-09-23",
        )
        self.assertIsNone(period["event_date"])
        english = extract_event_period(
            "An infant aged 3 months died.",
            published_at="2026-09-23",
        )
        self.assertIsNone(english["event_date"])

    def test_relative_phrases_across_languages_use_the_publication_date(self):
        published = "2026-09-23"
        points = {
            "3 bulan yg lalu": "2026-06-23",
            "tiga bulan yang lalu": "2026-06-23",
            "sebulan yang lalu": "2026-08-23",
            "2 minggu yang lalu": "2026-09-09",
            "3 hari lepas": "2026-09-20",
            "3 tháng trước": "2026-06-23",
            "3 เดือนที่แล้ว": "2026-06-23",
        }
        for phrase, expected in points.items():
            period = extract_event_period(
                f"Ada kematian {phrase}.",
                published_at=published,
            )
            self.assertEqual(period["event_date"], expected, phrase)
        window = extract_event_period(
            "Selama 3 bulan yang lalu tercatat 4 kematian.",
            published_at=published,
        )
        self.assertEqual(window["event_date_start"], "2026-06-23")
        self.assertEqual(window["event_date_end"], "2026-09-23")
        last_year = extract_event_period(
            "Kematian itu terjadi tahun lalu.",
            published_at=published,
        )
        self.assertEqual(last_year["event_date_start"], "2025-01-01")
        self.assertEqual(last_year["event_date_end"], "2025-12-31")
        clamped = extract_event_period(
            "Kasus itu 1 bulan yang lalu.",
            published_at="2026-03-31",
        )
        self.assertEqual(clamped["event_date"], "2026-02-28")
        unanchored = extract_event_period("Lima orang meninggal 3 bulan yang lalu.")
        self.assertIsNone(unanchored["event_date"])

    def test_relative_time_is_not_counted_as_deaths(self):
        self.assertEqual(extract_death_count("3 bulan yang lalu terjadi kematian."), 0)
        self.assertEqual(extract_death_count("Sebanyak 4 kematian 3 bulan yang lalu."), 4)

    def test_explicit_range_beats_a_relative_phrase(self):
        period = extract_event_period(
            "From 1 January to 23 August 2026, officials noted cases 3 months ago.",
            published_at="2026-09-23",
        )
        self.assertEqual(period["event_date_start"], "2026-01-01")
        self.assertEqual(period["event_date_end"], "2026-08-23")

    def test_cumulative_as_of_window(self):
        period = extract_event_period(
            "From September 2025, a cumulative 933 mpox cases and 13 deaths were reported as of January 2026."
        )
        self.assertEqual(period["period_type"], "cumulative")
        self.assertTrue(period["date_needs_review"])
        self.assertEqual(period["event_date_start"], "2025-09-01")

    def test_sitrep_sentence_windows(self):
        published = "2026-09-20"
        cases = [
            ("Indonesia recorded 5,431 cases from January to July 2026.", "2026-01-01", "2026-07-31"),
            ("Jan-Jul 2026 Indonesia logged 5,431 cases.", "2026-01-01", "2026-07-31"),
            ("West Java recorded 39,672 cases to May 2026.", "2026-01-01", "2026-05-31"),
            ("South Sumatra reported 1,426 cases through 21 May 2026.", "2026-01-01", "2026-05-21"),
            ("There were 10,453 suspected measles cases by EW8 2026.", "2026-02-16", "2026-02-22"),
            ("Weekly measles cases fell to 146 by EW12 2026.", "2026-03-16", "2026-03-22"),
            ("Minggu epidemiologi 36 tahun 2026 tercatat potensi KLB.", "2026-08-31", "2026-09-06"),
            ("Malaysia recorded 65,979 cases by EW35 2026.", "2026-08-24", "2026-08-30"),
            ("Cumulative 21,777 cases in the first 34 e-weeks 2026.", "2026-01-01", "2026-08-23"),
            ("The case pointed to early April 2026.", "2026-04-01", "2026-04-01"),
            ("Symptoms began in late March 2026.", "2026-03-31", "2026-03-31"),
            ("Nearly 100,000 cases in the first 8 months of 2026.", "2026-01-01", "2026-08-31"),
            ("8,000 cases in the first half of 2026.", "2026-01-01", "2026-06-30"),
            ("86,113 ILI cases to 30 August 2026.", "2026-01-01", "2026-08-30"),
            ("More than 130,000 influenza cases since January YTD.", "2026-01-01", "2026-09-20"),
            ("25,948 dengue cases and 39 deaths YTD.", "2026-01-01", "2026-09-20"),
            ("Nationally 33,886 cases to 12 weeks.", "2026-03-16", "2026-03-22"),
        ]
        for text, start, end in cases:
            period = extract_event_period(text, published_at=published)
            self.assertEqual(period["event_date_start"], start, text)
            self.assertEqual(period["event_date_end"], end, text)


if __name__ == "__main__":
    unittest.main()
