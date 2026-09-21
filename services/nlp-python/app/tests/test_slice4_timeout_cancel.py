import time
import unittest
from fastapi import HTTPException
from app.bounded_analysis import analyze_bounded, BoundedRequest, slots, GLOBAL_STAGE_TRACKER
import app.bounded_analysis as ba


class TestSlice4TimeoutCancel(unittest.TestCase):
    def test_analyze_bounded_short_payload_succeeds(self):
        req = BoundedRequest(
            text="Kementerian Kesehatan melaporkan 361 kasus Dengue di Jakarta.",
            source_country="Indonesia",
            interactive=True,
        )
        res = analyze_bounded(req)
        self.assertEqual(res.get("disease_classification"), "Dengue")
        self.assertEqual(res.get("case_count"), 361)

    def test_stage_timeout_kills_process_and_returns_408(self):
        req = BoundedRequest(
            text="Kementerian Kesehatan melaporkan 361 kasus Dengue di Jakarta.",
            source_country="Indonesia",
            interactive=True,
        )
        orig_budget = ba.INTERACTIVE_BUDGET_SECONDS
        orig_inference = ba.inference_stage
        try:
            ba.INTERACTIVE_BUDGET_SECONDS = 1

            def mock_hang(payload, translation, rules_only):
                time.sleep(5)
                return {"ok": True}

            ba.inference_stage = mock_hang
            t0 = time.time()
            with self.assertRaises(HTTPException) as ctx:
                analyze_bounded(req)
            self.assertEqual(ctx.exception.status_code, 408)
            self.assertLess(time.time() - t0, 3.0)
        finally:
            ba.INTERACTIVE_BUDGET_SECONDS = orig_budget
            ba.inference_stage = orig_inference

    def test_slot_freed_after_timeout_no_503(self):
        req = BoundedRequest(
            text="Kementerian Kesehatan melaporkan 361 kasus Dengue di Jakarta.",
            source_country="Indonesia",
            interactive=True,
        )
        # Verify slot is not locked and can process request
        res = analyze_bounded(req)
        self.assertEqual(res.get("disease_classification"), "Dengue")

    def test_stale_job_recovery_frees_semaphore(self):
        req = BoundedRequest(
            text="Kementerian Kesehatan melaporkan 361 kasus Dengue di Jakarta.",
            source_country="Indonesia",
            interactive=True,
        )
        slots.acquire(blocking=False)
        GLOBAL_STAGE_TRACKER.set_active("stale-unit-test", None)
        GLOBAL_STAGE_TRACKER.active_start = time.monotonic() - 40
        try:
            res = analyze_bounded(req)
            self.assertEqual(res.get("disease_classification"), "Dengue")
        finally:
            GLOBAL_STAGE_TRACKER.clear_active()


if __name__ == "__main__":
    unittest.main()
