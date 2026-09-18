"""Tests for Phase 3: Epistemic Status, Temporal Interval & Metric Qualification."""

import unittest
from datetime import date
from unittest.mock import patch

from app import config, extractors, pipeline
from app.epidemiology import (
    classify_epistemic_status,
    qualify_metric_type,
    extract_event_period,
)
from app.multi_event_extractor import compose_structured_events
from app.schemas import AnalyzeRequest


class EpistemicStatusTest(unittest.TestCase):
    """Test classification of epistemic modality."""

    def test_suspected_epistemic_cues(self):
        text = "Diduga 15 warga di Boyolali terinfeksi antraks setelah memotong sapi sakit."
        self.assertEqual(classify_epistemic_status(text), "suspected")

        text_probable = "A total of 4 probable cases of monkeypox were identified."
        self.assertEqual(classify_epistemic_status(text_probable), "suspected")

    def test_confirmed_epistemic_cues(self):
        text = "Dinkes Jabar mengonfirmasi 45 kasus positif rabies berdasarkan hasil uji laboratorium."
        self.assertEqual(classify_epistemic_status(text), "confirmed")

        text_lab = "Laboratory-confirmed dengue infections reached 120 in Bangkok."
        self.assertEqual(classify_epistemic_status(text_lab), "confirmed")

    def test_rumor_unverified_cues(self):
        text = "Beredar kabar burung di media sosial bahwa 100 orang tertular virus misterius di pasar."
        self.assertEqual(classify_epistemic_status(text), "rumor")

        text_unverified = "Unverified reports circulating online claim a new respiratory outbreak."
        self.assertEqual(classify_epistemic_status(text_unverified), "rumor")

    def test_retracted_hoax_cues(self):
        text = "Dinkes DKI Jakarta membantah kabar hoaks mengenai wabah kolera massal."
        self.assertEqual(classify_epistemic_status(text), "retracted")

        text_false = "Health officials disproven the false alarm of Ebola in the district."
        self.assertEqual(classify_epistemic_status(text_false), "retracted")

    def test_official_report_cues(self):
        text = "Kemenkes RI mempublikasikan siaran pers mengenai pemantauan tren DBD di Indonesia."
        self.assertEqual(classify_epistemic_status(text), "official_report")

    def test_default_reported(self):
        text = "Kasus demam berdarah tercatat sebanyak 12 di wilayah Bandung."
        self.assertEqual(classify_epistemic_status(text), "reported")


class MetricQualificationTest(unittest.TestCase):
    """Test metric qualification into cumulative, new, active, or death metrics."""

    def test_cumulative_metric(self):
        text = "Tercatat 2.450 kasus akumulatif sejak awal tahun 2026."
        m_type, unit = qualify_metric_type(text)
        self.assertEqual(m_type, "cumulative_cases")
        self.assertEqual(unit, "persons")

        text_en = "Malaysia recorded 19,313 dengue infections year-to-date."
        m_type, _ = qualify_metric_type(text_en)
        self.assertEqual(m_type, "cumulative_cases")

    def test_new_cases_metric(self):
        text = "Terdapat penambahan 15 kasus baru hari ini di Depok."
        m_type, unit = qualify_metric_type(text)
        self.assertEqual(m_type, "new_cases")
        self.assertEqual(unit, "persons")

    def test_active_cases_metric(self):
        text = "Sebanyak 30 kasus aktif masih menjalani perawatan di rumah sakit."
        m_type, unit = qualify_metric_type(text)
        self.assertEqual(m_type, "active_cases")
        self.assertEqual(unit, "persons")

    def test_deaths_metric(self):
        text = "Dua belas orang meninggal dunia akibat gigitan anjing rabies."
        m_type, unit = qualify_metric_type(text, has_cases=False, has_deaths=True)
        self.assertEqual(m_type, "deaths")
        self.assertEqual(unit, "persons")


class TemporalIntervalResolutionTest(unittest.TestCase):
    """Test resolution of date intervals, relative dates, and epi-weeks."""

    def test_explicit_date_range(self):
        text = "Kasus DBD tercatat antara 1 Februari hingga 15 Maret 2026 di Semarang."
        res = extract_event_period(text)
        self.assertEqual(res["event_date_start"], "2026-02-01")
        self.assertEqual(res["event_date_end"], "2026-03-15")
        self.assertEqual(res["period_type"], "cumulative")
        self.assertTrue(res["date_needs_review"])

    def test_epidemiological_week(self):
        text = "Laporan surveilans penyakit pekan ke-12 tahun 2026."
        res = extract_event_period(text)
        # Week 12 of 2026: Monday 2026-03-16 to Sunday 2026-03-22
        self.assertEqual(res["event_date_start"], "2026-03-16")
        self.assertEqual(res["event_date_end"], "2026-03-22")
        self.assertEqual(res["period_type"], "weekly")
        self.assertFalse(res["date_needs_review"])

    def test_relative_yesterday(self):
        text = "Kemarin ditemukan 5 kasus infeksi di Surabaya."
        res = extract_event_period(text, published_at="2026-05-20T08:00:00Z")
        self.assertEqual(res["event_date"], "2026-05-19")
        self.assertEqual(res["event_date_start"], "2026-05-19")
        self.assertEqual(res["event_date_end"], "2026-05-19")
        self.assertEqual(res["period_type"], "incident")

    def test_relative_last_week(self):
        text = "Pada pekan lalu tercatat 18 kasus campak."
        # Published on Wednesday 2026-05-20 -> previous week was Mon 2026-05-11 to Sun 2026-05-17
        res = extract_event_period(text, published_at="2026-05-20T08:00:00Z")
        self.assertEqual(res["event_date_start"], "2026-05-11")
        self.assertEqual(res["event_date_end"], "2026-05-17")
        self.assertEqual(res["period_type"], "weekly")


class StructuredMultiEventEnrichmentTest(unittest.TestCase):
    """Test SubEvent enrichment with epistemic status, metric type, and intervals."""

    def setUp(self):
        config.LOCATION_COORDS = {
            "Bandung": (-6.9175, 107.6191),
            "Depok": (-6.4025, 106.7942),
            "Jakarta": (-6.2088, 106.8456),
        }
        config.LOCATION_COUNTRIES = {
            "Bandung": "Indonesia",
            "Depok": "Indonesia",
            "Jakarta": "Indonesia",
        }
        config.LOCATION_ADMIN1 = {
            "Bandung": "Jawa Barat",
            "Depok": "Jawa Barat",
            "Jakarta": "DKI Jakarta",
        }
        config.LOCATION_ISO3 = {
            "Bandung": "IDN",
            "Depok": "IDN",
            "Jakarta": "IDN",
        }
        config.build_location_patterns()

    def test_subevents_have_epistemic_and_metric_qualification(self):
        text = (
            "Dinkes Jabar mengonfirmasi kasus DBD: "
            "90 kasus positif di Bandung dan penambahan 15 kasus baru di Depok "
            "sejak 1 Januari hingga 20 Februari 2026."
        )
        events = compose_structured_events(
            text=text,
            primary_disease="Demam Berdarah",
            primary_location="Bandung",
            diseases_extracted=["Demam Berdarah"],
            locations=[{"name": "Bandung"}, {"name": "Depok"}],
            case_count=105,
            death_count=0,
        )

        self.assertGreaterEqual(len(events), 2)
        by_loc = {evt["location_name"]: evt for evt in events}

        self.assertIn("Bandung", by_loc)
        self.assertIn("Depok", by_loc)

        # Both inherit the confirmed epistemic status of the announcement
        self.assertEqual(by_loc["Bandung"]["epistemic_status"], "confirmed")
        self.assertEqual(by_loc["Depok"]["epistemic_status"], "confirmed")

        # Dates propagated
        self.assertEqual(by_loc["Bandung"]["event_date_start"], "2026-01-01")
        self.assertEqual(by_loc["Bandung"]["event_date_end"], "2026-02-20")

    def test_single_event_fallback_has_qualification(self):
        text = "Diduga 12 warga Semarang terkena antraks."
        events = compose_structured_events(
            text=text,
            primary_disease="Antraks",
            primary_location="Semarang",
            diseases_extracted=["Antraks"],
            locations=[{"name": "Semarang"}],
            case_count=12,
            death_count=0,
        )

        self.assertEqual(len(events), 1)
        evt = events[0]
        self.assertEqual(evt["epistemic_status"], "suspected")
        self.assertEqual(evt["metric_type"], "cases")
        self.assertEqual(evt["unit"], "persons")


class PipelineEpistemicIntegrationTest(unittest.TestCase):
    """Test full pipeline response contracts with Phase 3 qualifications."""

    def test_pipeline_confirmed_typed_counts(self):
        req = AnalyzeRequest(
            text="Dinkes konfirmasi 30 kasus positif leptospirosis di Semarang.",
            source_country="Indonesia",
            rules_only=True,
        )
        resp = pipeline.run(req)
        self.assertEqual(resp.epistemic_status, "confirmed")
        self.assertEqual(resp.confirmed_cases, 30)

    def test_pipeline_suspected_typed_counts(self):
        req = AnalyzeRequest(
            text="Diduga 8 warga terkena flu burung di Subang.",
            source_country="Indonesia",
            rules_only=True,
        )
        resp = pipeline.run(req)
        self.assertEqual(resp.epistemic_status, "suspected")
        self.assertEqual(resp.suspected_cases, 8)


if __name__ == "__main__":
    unittest.main()
