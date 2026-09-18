"""Tests for Phase 4: Evidence Attribution & Validation Layer."""

import unittest
from app import config, extractors, pipeline
from app.epidemiology import (
    find_evidence_offsets,
    validate_surveillance_facts,
    calibrate_outbreak_alert,
)
from app.multi_event_extractor import compose_structured_events
from app.schemas import AnalyzeRequest


class EvidenceAttributionTest(unittest.TestCase):
    """Test verbatim evidence text span attribution and character offsets."""

    def test_find_evidence_offsets_exact(self):
        text = "Kemenkes melaporkan 45 kasus positif DBD di Bandung pada pekan ini."
        evidence = "45 kasus positif DBD di Bandung"
        start, end = find_evidence_offsets(text, evidence)
        self.assertIsNotNone(start)
        self.assertIsNotNone(end)
        self.assertEqual(text[start:end], evidence)

    def test_find_evidence_offsets_whitespace_normalized(self):
        text = "Tercatat   20 kasus kolera   di Surabaya kemarin."
        evidence = "20 kasus kolera di Surabaya"
        start, end = find_evidence_offsets(text, evidence)
        self.assertIsNotNone(start)
        self.assertIsNotNone(end)
        self.assertIn("20 kasus kolera", text[start:end])

    def test_find_evidence_offsets_empty(self):
        start, end = find_evidence_offsets("", "some evidence")
        self.assertIsNone(start)
        self.assertIsNone(end)


class PlausibilityValidationTest(unittest.TestCase):
    """Test epidemiological plausibility and contradiction rules."""

    def test_death_exceeds_cases(self):
        text = "Ditemukan 10 kasus DBD dan 50 kematian di Depok."
        needs_rev, flags = validate_surveillance_facts(
            text=text,
            disease="Dengue",
            case_count=10,
            death_count=50,
        )
        self.assertTrue(needs_rev)
        self.assertIn("death_exceeds_cases", flags)

    def test_extreme_count_anomaly(self):
        text = "Sebanyak 1.250.000 kasus flu burung dilaporkan hari ini."
        needs_rev, flags = validate_surveillance_facts(
            text=text,
            disease="Avian Influenza",
            case_count=1_250_000,
            death_count=0,
            count_period_type="incident",
        )
        self.assertTrue(needs_rev)
        self.assertIn("extreme_count_anomaly", flags)

    def test_abnormal_cfr_ratio(self):
        # Dengue typically has CFR < 1%; 18 deaths from 25 cases is an extreme anomaly
        text = "Sebanyak 25 kasus DBD dengan 18 korban meninggal dunia."
        needs_rev, flags = validate_surveillance_facts(
            text=text,
            disease="Demam Berdarah",
            case_count=25,
            death_count=18,
        )
        self.assertTrue(needs_rev)
        self.assertIn("abnormal_cfr_ratio", flags)

    def test_retracted_report_flag(self):
        text = "Dinkes DKI membantah kabar hoaks wabah kolera di Jakarta."
        needs_rev, flags = validate_surveillance_facts(
            text=text,
            disease="Kolera",
            case_count=0,
            death_count=0,
            epistemic_status="retracted",
        )
        self.assertTrue(needs_rev)
        self.assertIn("retracted_report", flags)

    def test_unverified_rumor_flag(self):
        text = "Beredar kabar burung di medsos 500 orang tertular virus misterius."
        needs_rev, flags = validate_surveillance_facts(
            text=text,
            disease="UNKNOWN",
            case_count=500,
            death_count=0,
            epistemic_status="rumor",
        )
        self.assertTrue(needs_rev)
        self.assertIn("unverified_rumor", flags)

    def test_conflicting_counts_headline_vs_body(self):
        text = "15 Kasus Kolera Ditemukan di Wilayah Subang\n\nPetugas mencatat ada 1.500 kasus kolera menyebar cepat."
        needs_rev, flags = validate_surveillance_facts(
            text=text,
            disease="Kolera",
            case_count=15,
            death_count=0,
        )
        self.assertTrue(needs_rev)
        self.assertIn("conflicting_counts", flags)


class OutbreakAlertCalibratorTest(unittest.TestCase):
    """Test calibration of outbreak alert signals."""

    def test_retracted_suppresses_alert(self):
        alert = calibrate_outbreak_alert(
            disease="Kolera",
            case_count=200,
            death_count=10,
            epistemic_status="retracted",
            explicit_outbreak=True,
            base_alert=True,
        )
        self.assertFalse(alert)

    def test_rumor_suppresses_alert(self):
        alert = calibrate_outbreak_alert(
            disease="Antraks",
            case_count=100,
            death_count=5,
            epistemic_status="rumor",
            explicit_outbreak=True,
            base_alert=True,
        )
        self.assertFalse(alert)

    def test_death_exceeds_cases_suppresses_alert(self):
        alert = calibrate_outbreak_alert(
            disease="Demam Berdarah",
            case_count=5,
            death_count=25,
            epistemic_status="confirmed",
            explicit_outbreak=True,
            validation_flags=["death_exceeds_cases"],
            base_alert=True,
        )
        self.assertFalse(alert)

    def test_cumulative_without_outbreak_cues_suppresses_alert(self):
        alert = calibrate_outbreak_alert(
            disease="Demam Berdarah",
            case_count=1500,
            death_count=10,
            epistemic_status="confirmed",
            count_period_type="cumulative",
            explicit_outbreak=False,
            base_alert=True,
        )
        self.assertFalse(alert)

    def test_valid_incident_confirmed_triggers_alert(self):
        alert = calibrate_outbreak_alert(
            disease="Demam Berdarah",
            case_count=80,
            death_count=2,
            epistemic_status="confirmed",
            count_period_type="incident",
            explicit_outbreak=True,
            validation_flags=[],
            base_alert=True,
        )
        self.assertTrue(alert)


class MultiEventAndPipelineValidationTest(unittest.TestCase):
    """Test SubEvent attribution offsets and pipeline response validation flags."""

    def setUp(self):
        config.LOCATION_COORDS = {
            "Bandung": (-6.9175, 107.6191),
            "Depok": (-6.4025, 106.7942),
        }
        config.LOCATION_COUNTRIES = {
            "Bandung": "Indonesia",
            "Depok": "Indonesia",
        }
        config.LOCATION_ADMIN1 = {
            "Bandung": "Jawa Barat",
            "Depok": "Jawa Barat",
        }
        config.LOCATION_ISO3 = {
            "Bandung": "IDN",
            "Depok": "IDN",
        }
        config.build_location_patterns()

    def test_subevents_have_offsets_and_flags(self):
        text = "Dinkes mencatat 45 kasus DBD di Bandung dan 20 di Depok."
        events = compose_structured_events(
            text=text,
            primary_disease="Demam Berdarah",
            primary_location="Bandung",
            diseases_extracted=["Demam Berdarah"],
            locations=[{"name": "Bandung"}, {"name": "Depok"}],
            case_count=65,
            death_count=0,
        )
        self.assertGreaterEqual(len(events), 2)
        for evt in events:
            self.assertIn("validation_flags", evt)
            # When evidence text is found, offsets should be non-negative ints
            if evt.get("evidence"):
                self.assertIsNotNone(evt.get("evidence_offset_start"))
                self.assertIsNotNone(evt.get("evidence_offset_end"))

    def test_pipeline_anomaly_flags(self):
        req = AnalyzeRequest(
            text="Ditemukan 10 kasus DBD dan 50 kematian di Depok.",
            source_country="Indonesia",
            rules_only=True,
        )
        resp = pipeline.run(req)
        self.assertTrue(resp.needs_review)
        self.assertIn("death_exceeds_cases", resp.validation_flags)
        self.assertFalse(resp.outbreak_alert)


if __name__ == "__main__":
    unittest.main()
