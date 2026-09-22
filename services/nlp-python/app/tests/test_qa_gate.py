import unittest

from app.qa_gate import evaluate_field_report


def _report(**overrides):
    fields = {
        field: {
            "annotated": 10,
            "precision": 0.95,
            "recall": 0.95,
        }
        for field in ("disease", "country", "cases", "deaths", "location", "time", "evidence")
    }
    fields.update(overrides)
    return {"fields": fields}


class TestQAGate(unittest.TestCase):
    def test_missing_time_annotation_fails_closed(self):
        result = evaluate_field_report(
            _report(time={"annotated": 0, "precision": None, "recall": None})
        )
        self.assertEqual(result["status"], "fail")
        self.assertEqual(result["fields"]["time"]["status"], "fail")

    def test_thresholds_pass_only_when_coverage_and_scores_pass(self):
        result = evaluate_field_report(_report())
        self.assertEqual(result["status"], "pass")

    def test_cases_precision_failure_is_reported(self):
        result = evaluate_field_report(
            _report(cases={"annotated": 10, "precision": 0.79, "recall": 1.0})
        )
        self.assertEqual(result["status"], "fail")
        self.assertIn("precision", result["fields"]["cases"]["reasons"][0])


if __name__ == "__main__":
    unittest.main()
