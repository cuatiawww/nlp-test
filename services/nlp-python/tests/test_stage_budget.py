import sys
import time
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.stage_budget import bounded_call

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
            bounded_call(slow, (), 0.2)
        self.assertLess(time.monotonic() - start, 3)

    def test_child_error_is_visible(self):
        with self.assertRaisesRegex(RuntimeError, "ValueError"):
            bounded_call(broken, (), 3)
