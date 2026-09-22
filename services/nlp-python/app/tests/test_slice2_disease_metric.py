import unittest
from app.schemas import AnalyzeRequest
from app import pipeline


class TestSlice2DiseaseMetric(unittest.TestCase):
    def test_historical_ebola_alert_suppressed_and_flagged(self):
        text = (
            "Brunei Darussalam health advisory on viral hemorrhagic fevers. "
            "Historically, in the 2014 Ebola outbreak, 246 cases and 80 deaths were recorded in West Africa. "
            "The Ministry of Health advises travelers to remain vigilant."
        )
        req = AnalyzeRequest(text=text, source_country="Brunei", published_at="2026-03-01", rules_only=True)
        resp = pipeline.run(req)
        self.assertEqual(resp.country, "Brunei")
        self.assertEqual(resp.disease_classification, "Ebola disease")
        self.assertEqual(resp.case_count, 246)
        self.assertEqual(resp.death_count, 80)
        self.assertFalse(resp.outbreak_alert, "Historical figures must NOT trigger an active outbreak alert")
        self.assertIn("historical_context", resp.validation_flags)

    def test_sub_events_preserve_parent_disease_not_unknown(self):
        text = (
            "Measles cases in the Philippines continue to spread nationwide. "
            "The Department of Health logged 1,627 cases in Metro Manila as immunization efforts intensify."
        )
        req = AnalyzeRequest(text=text, source_country="Philippines", published_at="2026-02-15", rules_only=True)
        resp = pipeline.run(req)
        self.assertEqual(resp.disease_classification, "Measles")
        self.assertGreaterEqual(len(resp.sub_events), 1)
        for evt in resp.sub_events:
            self.assertEqual(evt.disease, "Measles")
            self.assertNotEqual(evt.disease.upper(), "UNKNOWN")

    def test_singapore_cda_measles_cases_and_comparator_separation(self):
        text = (
            "Singapore imposes mandatory isolation of measles cases, contact tracing, as infections rise. "
            "Eleven measles cases were recorded in January, compared with two cases in the same month last year. "
            "There were 27 cases for the whole of 2025. "
            "Of the 11 cases, laboratory testing confirmed that three were genetically linked."
        )
        req = AnalyzeRequest(text=text, source_country="Singapore", published_at="2026-02-06", rules_only=True)
        resp = pipeline.run(req)
        self.assertEqual(resp.country, "Singapore")
        self.assertEqual(resp.disease_classification, "Measles")
        self.assertEqual(resp.case_count, 11)
        self.assertEqual(len(resp.sub_events), 1)
        self.assertEqual(resp.sub_events[0].case_count, 11)
        self.assertEqual(resp.sub_events[0].disease, "Measles")

    def test_thailand_multi_country_roundup_primary_context(self):
        text = (
            "Regional health update: health monitoring in Myanmar continues with mosquito surveys. "
            "Meanwhile, Thailand reported 2,190 cases of leptospirosis and 2 deaths across northern provinces."
        )
        req = AnalyzeRequest(text=text, source_country="Thailand", published_at="2026-04-12", rules_only=True)
        resp = pipeline.run(req)
        self.assertEqual(resp.country, "Thailand")
        self.assertEqual(resp.disease_classification, "Leptospirosis")
        self.assertEqual(resp.case_count, 2190)
        self.assertEqual(resp.death_count, 2)


if __name__ == "__main__":
    unittest.main()
