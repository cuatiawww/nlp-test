import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, "/app")

from app.main import analyze_surveillance
from app.schemas import AnalyzeRequest
from app.surveillance_extraction import surveillance_from_analysis


class SharedCoreAdapterTest(unittest.TestCase):
    def test_single_event_is_serialized_without_reextracting(self):
        output = surveillance_from_analysis({
            "disease_classification": "HFMD",
            "disease_extracted": ["HFMD"],
            "country": "Thailand",
            "case_count": 53362,
            "death_count": 1,
            "event_date": "2026-09-01",
            "evidence": ["53,362 cases and one death"],
            "sub_events": [{
                "disease": "HFMD",
                "location_name": "Thailand",
                "country": "Thailand",
                "case_count": 53362,
                "death_count": 1,
                "time_frame": "2026",
            }],
            "relevance_score": "high",
            "source_credibility": 0.84,
            "is_health_related": True,
        })

        self.assertEqual(len(output.locations), 1)
        self.assertEqual(output.locations[0].country, "Thailand")
        self.assertEqual(output.locations[0].reported_cases, 53362)
        self.assertEqual(output.locations[0].deaths, 1)
        self.assertEqual(output.locations[0].time_frame, "2026")

    def test_multi_disease_events_stay_in_one_country_contract(self):
        output = surveillance_from_analysis({
            "disease_classification": ["Dengue", "Influenza"],
            "country": "Vietnam",
            "case_count": 371,
            "death_count": 3,
            "sub_events": [
                {
                    "disease": "Dengue",
                    "location_name": "Vietnam",
                    "country": "Vietnam",
                    "case_count": 361,
                    "death_count": 2,
                },
                {
                    "disease": "Influenza",
                    "location_name": "Vietnam",
                    "country": "Vietnam",
                    "case_count": 10,
                    "death_count": 1,
                },
            ],
            "relevance_score": "medium",
            "source_credibility": 0.84,
            "is_health_related": True,
        })

        self.assertEqual(len(output.locations), 1)
        self.assertEqual(output.locations[0].country, "Vietnam")
        self.assertEqual(output.locations[0].reported_cases, 371)
        self.assertEqual(output.locations[0].deaths, 3)

    @patch("app.main.pipeline.run")
    def test_surveillance_endpoint_is_only_a_shared_core_adapter(self, run):
        run.return_value = {
            "disease_classification": "Dengue",
            "country": "Thailand",
            "case_count": 12,
            "death_count": 1,
            "sub_events": [{
                "disease": "Dengue",
                "location_name": "Thailand",
                "country": "Thailand",
                "case_count": 12,
                "death_count": 1,
            }],
            "relevance_score": "high",
            "source_credibility": 0.84,
            "is_health_related": True,
        }

        result = analyze_surveillance(AnalyzeRequest(text="12 dengue cases and one death in Thailand"))

        run.assert_called_once()
        self.assertEqual(result.locations[0].reported_cases, 12)
        self.assertEqual(result.locations[0].deaths, 1)


if __name__ == "__main__":
    unittest.main()
