import unittest
from app.schemas import AnalyzeRequest
from app import pipeline
from app import extractors


class TestSlice1MultiEvent(unittest.TestCase):
    def test_parent_metric_stays_country_level_and_no_fake_regional_events(self):
        text = (
            "Jakarta, 26 Februari 2026 Kementerian Kesehatan Republik Indonesia menyampaikan "
            "perkembangan terkini situasi campak nasional.\n"
            "Sementara pada tahun 2026 hingga Minggu ke-7, tercatat 8.224 kasus suspek campak, "
            "572 kasus terkonfirmasi, dan 4 kematian (CFR 0,05 persen).\n"
            "Pada periode tersebut, terdapat 45 kejadian luar biasa (KLB) campak di 29 kabupaten/kota "
            "pada 11 provinsi, yaitu Sumatera Utara, Sumatera Barat, Sumatera Selatan, Banten, "
            "Jawa Barat, Jawa Tengah, DI Yogyakarta, Jawa Timur, Nusa Tenggara Barat, Sulawesi Selatan, "
            "dan Sulawesi Tengah."
        )
        req = AnalyzeRequest(text=text, source_country="Indonesia", rules_only=True)
        resp = pipeline.run(req)
        self.assertEqual(resp.country, "Indonesia")
        self.assertEqual(resp.disease_classification, "Measles")
        self.assertEqual(resp.case_count, 8224)
        self.assertEqual(len(resp.sub_events), 1)
        self.assertEqual(resp.sub_events[0].location_name, "Indonesia")
        self.assertEqual(resp.sub_events[0].case_count, 8224)
        # Provinces are in location matrix, not fake regional events
        self.assertGreaterEqual(len(resp.locations), 5)
        self.assertIn("8.224", resp.sub_events[0].evidence)

    def test_myanmar_with_no_numbers_produces_zero_events(self):
        text = "Situation report on malaria control in Myanmar. Health authorities are monitoring mosquito activity."
        req = AnalyzeRequest(text=text, source_country="Myanmar", rules_only=True)
        resp = pipeline.run(req)
        self.assertEqual(len(resp.sub_events), 0)
        self.assertEqual(resp.case_count, 0)
        self.assertEqual(resp.death_count, 0)

    def test_two_diseases_with_different_counts_splits_events(self):
        text = "Kementerian Kesehatan melaporkan 361 kasus Dengue dan 10 kasus Influenza di Indonesia selama bulan ini."
        req = AnalyzeRequest(text=text, source_country="Indonesia", rules_only=True)
        resp = pipeline.run(req)
        self.assertEqual(len(resp.sub_events), 2)
        diseases = {e.disease: e.case_count for e in resp.sub_events}
        self.assertEqual(diseases.get("Dengue"), 361)
        self.assertEqual(diseases.get("Influenza"), 10)
        self.assertEqual(resp.disease_display, "Dengue; Influenza")
        self.assertEqual(resp.cases_display, "Dengue(361); Influenza(10)")
        for e in resp.sub_events:
            self.assertIn("361 kasus Dengue", e.evidence)

    def test_shared_aggregate_phrase_does_not_duplicate_counts(self):
        text = "The Philippines recorded 1,627 measles and rubella cases."
        metrics = extractors.extract_disease_case_metrics(text, ["Measles", "Rubella"])
        self.assertEqual(metrics, {})


if __name__ == "__main__":
    unittest.main()
