import sys
import time
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.stage_budget import bounded_call, remaining_inference_budget

def slow():
    time.sleep(30)

def successful():
    return {"value": 10}

def broken():
    raise ValueError("bad input")

class StageBudgetTests(unittest.TestCase):
    def test_success(self):
        self.assertEqual(bounded_call(successful, (), 3), {"value": 10})

    def test_timeout_terminates_child(self):
        start = time.monotonic()
        with self.assertRaises(TimeoutError):
            bounded_call(slow, (), 0.2, isolation="fork")
        self.assertLess(time.monotonic() - start, 3)

    def test_child_error_is_visible(self):
        with self.assertRaisesRegex(RuntimeError, "ValueError"):
            bounded_call(broken, (), 3, isolation="fork")

    def test_inprocess_reuses_caller_and_ignores_kill_budget(self):
        self.assertEqual(bounded_call(successful, (), 0.001, isolation="inprocess"), {"value": 10})

    def test_remaining_inference_budget_grows_when_translation_is_fast(self):
        self.assertGreaterEqual(remaining_inference_budget(5, 270, overhead=15), 180)
        self.assertEqual(remaining_inference_budget(250, 270, overhead=15), 5)
        self.assertEqual(remaining_inference_budget(400, 270, overhead=15), 1)
