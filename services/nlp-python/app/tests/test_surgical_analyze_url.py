import unittest
from unittest.mock import patch


class SurgicalAnalyzeUrlAcceptanceTests(unittest.TestCase):
    def setUp(self):
        from app import config

        self.config = config
        self.translation = patch(
            "app.pipeline.translate_and_extract",
            return_value={
                "translated_text": "",
                "structured": {},
                "provider": "none",
                "translation_status": "not_required",
            },
        )
        self.translation.start()
        self.model = patch.object(config, "NLP_MODEL", "none")
        self.model.start()
        self.disease_dict = patch.dict(config.DISEASE_DICT, {"dengue": "Dengue"})
        self.disease_dict.start()

    def tearDown(self):
        self.disease_dict.stop()
        self.model.stop()
        self.translation.stop()

    def test_dengue_country_cases_and_deaths_stay_source_first(self):
        from app import extractors
        from app.pipeline import run
        from app.schemas import AnalyzeRequest

        self.assertEqual(
            extractors.extract_death_count(
                "Việt Nam ghi nhận 70.000 ca sốt xuất huyết và 9 ca tử vong."
            ),
            9,
        )

        result = run(AnalyzeRequest(
            text="Vietnam reported around 70,000 dengue cases nationwide and 9 deaths.",
            interactive=True,
            historical_fast=True,
        ))

        self.assertEqual(result.disease_classification, "Dengue")
        self.assertEqual(result.country, "Vietnam")
        self.assertEqual(result.case_count, 70000)
        self.assertEqual(result.death_count, 9)
        self.assertIsInstance(result.outbreak_alert, bool)

    def test_yemen_scope_rejects_refugee_count_and_fuzzy_samir(self):
        from app import config
        from app.pipeline import run
        from app.schemas import AnalyzeRequest

        with patch.object(config, "LOCATION_COORDS", {"Samir": (0.0, 0.0)}), \
             patch.object(config, "LOCATION_COUNTRIES", {"Samir": "Indonesia"}):
            result = run(AnalyzeRequest(
                text=(
                    "Yemen conflict update: 120,000 refugees and displaced people "
                    "need assistance. No disease cases are reported."
                ),
                interactive=True,
                historical_fast=True,
            ))

        self.assertEqual(result.country, "OUTSIDE ASEAN")
        self.assertEqual(result.surveillance_scope, "Outside ASEAN")
        self.assertNotEqual(result.location_name, "Samir")
        self.assertEqual(result.case_count, 0)
        self.assertEqual(result.death_count, 0)
        self.assertFalse(result.is_health_related)

    def test_phnom_penh_violence_without_disease_is_not_health(self):
        from app.pipeline import run
        from app.schemas import AnalyzeRequest

        result = run(AnalyzeRequest(
            text=(
                "Phnom Penh website reports violence and political unrest. "
                "There is no disease, infection, outbreak, or health surveillance event."
            ),
            interactive=True,
            historical_fast=True,
        ))

        self.assertEqual(result.disease_classification, "UNKNOWN")
        self.assertFalse(result.is_health_related)
        self.assertEqual(result.case_count, 0)
        self.assertEqual(result.death_count, 0)
        self.assertIsInstance(result.outbreak_alert, bool)


if __name__ == "__main__":
    unittest.main()
