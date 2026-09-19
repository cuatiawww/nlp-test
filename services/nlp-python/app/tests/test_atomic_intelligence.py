"""Generic evidence-to-event regression tests."""

import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class AtomicIntelligenceTests(unittest.TestCase):
    def setUp(self):
        from app import config

        self.coords_patch = patch.object(
            config,
            "LOCATION_COORDS",
            {
                "Indonesia": (-6.2, 106.8),
                "Thailand": (13.7, 100.5),
                "Bandung": (-6.9, 107.6),
            },
        )
        self.countries_patch = patch.object(
            config,
            "LOCATION_COUNTRIES",
            {
                "Indonesia": "Indonesia",
                "Thailand": "Thailand",
                "Bandung": "Indonesia",
            },
        )
        self.coords_patch.start()
        self.countries_patch.start()

    def tearDown(self):
        self.countries_patch.stop()
        self.coords_patch.stop()

    def test_metrics_are_attributed_to_the_disease_in_the_same_sentence(self):
        from app.intelligence import build_atomic_events

        events = build_atomic_events(
            "Dengue: Indonesia reported 10 cases. Malaria: Thailand reported 5 cases.",
            disease_labels=["Dengue", "Malaria"],
        )

        self.assertEqual(
            {(item["disease"], item["location_name"], item["case_count"]) for item in events},
            {("Dengue", "Indonesia", 10), ("Malaria", "Thailand", 5)},
        )

    def test_ambiguous_disease_cooccurrence_is_reviewable_not_guessed(self):
        from app.intelligence import build_atomic_events

        events = build_atomic_events(
            "Dengue and malaria were discussed; Indonesia reported 10 cases.",
            disease_labels=["Dengue", "Malaria"],
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["disease"], "UNKNOWN")
        self.assertTrue(events[0]["needs_review"])

    def test_disease_from_neighbouring_sentence_is_not_metric_attribution(self):
        from app.intelligence import build_atomic_events

        events = build_atomic_events(
            "Dengue is listed as a travel-health reference. "
            "Thailand reported 10 cases.",
            disease_labels=["Dengue", "Acute hepatitis A"],
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["disease"], "UNKNOWN")
        self.assertEqual(events[0]["case_count"], 10)
        self.assertTrue(events[0]["needs_review"])

    def test_distinct_reporting_periods_remain_distinct_events(self):
        from app.intelligence import build_atomic_events

        events = build_atomic_events(
            "In 2024 Thailand recorded 100 cases. In 2026 Thailand recorded 5 cases.",
            disease_labels=["Dengue"],
        )

        self.assertEqual(len(events), 2)
        self.assertEqual({item["case_count"] for item in events}, {5, 100})
        self.assertEqual(len({item["time_frame"] for item in events}), 2)

    def test_unknown_location_is_not_forced_into_hint_country(self):
        from app.extractors import resolve_location_hierarchy

        unresolved = resolve_location_hierarchy("Unlisted Place", country_hint="Indonesia")
        self.assertIsNone(unresolved["country"])
        self.assertTrue(unresolved["needs_review"])

        conflicting = resolve_location_hierarchy("Bandung", country_hint="Thailand")
        self.assertEqual(conflicting["country"], "Indonesia")
        self.assertTrue(conflicting["country_conflict"])

    def test_non_case_metrics_are_preserved_as_metric_facts(self):
        from app.intelligence import build_atomic_events

        events = build_atomic_events(
            "Dengue surveillance in Indonesia recorded 500 tests and 200 vaccinated people.",
            disease_labels=["Dengue"],
        )

        metric_types = {metric["metric_type"] for event in events for metric in event["metrics"]}
        self.assertIn("tests", metric_types)
        self.assertIn("vaccinated", metric_types)

    def test_distinct_temporal_contexts_are_not_deduplicated(self):
        from app.multi_event_extractor import _deduplicate_events

        events = _deduplicate_events([
            {"disease": "Dengue", "location_name": "Thailand", "case_count": 100,
             "time_frame": "2024-01-01 to 2024-12-31", "temporal_context": "historical"},
            {"disease": "Dengue", "location_name": "Thailand", "case_count": 5,
             "time_frame": "2026-01-01 to 2026-12-31", "temporal_context": "historical"},
        ])

        self.assertEqual(len(events), 2)

    def test_negative_surveillance_keeps_evidence_and_status(self):
        from app.multi_event_extractor import compose_structured_events

        events = compose_structured_events(
            text="Brunei reported no Nipah virus cases detected.",
            primary_disease="Nipah virus disease",
            primary_location="Brunei",
            diseases_extracted=["Nipah virus disease"],
            locations=[],
            case_count=0,
            death_count=0,
        )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["epistemic_status"], "negative_surveillance")
        self.assertEqual(events[0]["metric_type"], "negative_surveillance")
        self.assertIn("no Nipah virus cases detected", events[0]["evidence"])

    def test_age_and_subtype_digits_are_not_surveillance_metrics(self):
        from app.intelligence import build_atomic_events

        events = build_atomic_events(
            "Officials reported an H5N1 avian influenza infection involving a 15-year-old boy from Kampong Thom.",
            disease_labels=["Avian influenza"],
        )

        self.assertEqual(events, [])

    def test_same_metric_is_not_duplicated_at_parent_and_child_location(self):
        from app.intelligence import build_atomic_events
        from app import config

        with patch.object(config, "LOCATION_ADMIN_LEVEL", {"Indonesia": 0, "Bandung": 2}), patch.object(
            config, "LOCATION_ADMIN1", {"Bandung": "Jawa Barat"}
        ), patch.object(config, "LOCATION_COUNTRIES", {"Indonesia": "Indonesia", "Bandung": "Indonesia"}):
            events = build_atomic_events(
                "Indonesia reported 12 dengue cases in Bandung.",
                disease_labels=["Dengue"],
            )

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["location_name"], "Bandung")
        self.assertEqual(events[0]["case_count"], 12)

    def test_exact_count_outranks_approximate_restatement(self):
        from app.extractors import extract_case_count

        text = (
            "Kasus ISPA sejak 1-14 September tercatat 11.370. "
            "Pernyataan lain menyebut "
            "11.000-an kasus secara perkiraan."
        )
        self.assertEqual(extract_case_count(text, disease="Acute respiratory infection"), 11370)


if __name__ == "__main__":
    unittest.main()
