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

    def test_twenty_ready_fixtures(self):
        self.assertGreaterEqual(self.report["ready"], GOLD_SIZE, failure_summary(self.report))

    def test_pass_bar(self):
        self.assertGreaterEqual(
            self.report["passed"],
            PASS_BAR,
            failure_summary(self.report),
        )


if __name__ == "__main__":
    unittest.main()
