"""Gold-set accuracy gate: ≥18/20 fixtures must pass before merge."""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from tests.nlp_gold.runner import GOLD_SIZE, PASS_BAR, failure_summary, run_gold_set, write_failures_doc


class NlpGoldSetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = run_gold_set()
        write_failures_doc(cls.report)
        cls.by_id = {score.fixture_id: score for score in cls.report["scores"]}

    def test_twenty_ready_fixtures(self):
        self.assertGreaterEqual(self.report["ready"], GOLD_SIZE, failure_summary(self.report))

    def test_pass_bar(self):
        self.assertGreaterEqual(
            self.report["passed"],
            PASS_BAR,
            failure_summary(self.report),
        )

    def test_critical_asean_001_cidrap(self):
        score = self.by_id["asean-001"]
        self.assertTrue(score.passed, failure_summary({"passed": 0, "ready": 1, "pass_bar": 1, "gold_size": 1, "failures": [score]}))
        self.assertEqual(score.prediction.get("country"), "Cambodia")
        self.assertEqual(score.prediction.get("case_count"), 1)

    def test_critical_asean_002_singapore_measles(self):
        score = self.by_id["asean-002"]
        self.assertTrue(score.passed, failure_summary({"passed": 0, "ready": 1, "pass_bar": 1, "gold_size": 1, "failures": [score]}))
        self.assertEqual(score.prediction.get("case_count"), 43)


if __name__ == "__main__":
    unittest.main()
