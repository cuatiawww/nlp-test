import os
import sys
import tempfile
import time
import unittest
from unittest import mock
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.inference_pool import InferencePool
from app.model_cache import local_model_available, resolve_local_model_path


class ModelCacheTests(unittest.TestCase):
    def test_resolves_legacy_models_dirname_under_hf_home(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            snapshot = root / "models--facebook--nllb-200-distilled-600M" / "snapshots" / "abc"
            snapshot.mkdir(parents=True)
            (snapshot / "config.json").write_text("{}", encoding="utf-8")
            (snapshot / "model.safetensors").write_bytes(b"x")
            with mock.patch.dict(os.environ, {"HF_HOME": str(root), "HF_HUB_CACHE": "", "TRANSFORMERS_CACHE": ""}, clear=False):
                resolved = resolve_local_model_path("facebook/nllb-200-distilled-600M")
                self.assertEqual(resolved, str(snapshot))
                self.assertTrue(local_model_available("facebook/nllb-200-distilled-600M"))

    def test_resolves_hub_layout_and_indobert_alias(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            snapshot = root / "hub" / "models--indolem--indobert-base-uncased" / "snapshots" / "def"
            snapshot.mkdir(parents=True)
            (snapshot / "config.json").write_text("{}", encoding="utf-8")
            (snapshot / "pytorch_model.bin").write_bytes(b"x")
            with mock.patch.dict(os.environ, {"HF_HOME": str(root), "HF_HUB_CACHE": "", "TRANSFORMERS_CACHE": ""}, clear=False):
                resolved = resolve_local_model_path("indolem/indobert-base-uncased")
            self.assertEqual(resolved, str(snapshot))


class InferencePoolTests(unittest.TestCase):
    def test_queue_accepts_work_while_workers_are_busy(self):
        pool = InferencePool(workers=1, queue_limit=2)
        started = time.time()
        first = pool.submit(lambda: time.sleep(0.2) or "a")
        second = pool.submit(lambda: "b")
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        snap = pool.snapshot()
        self.assertEqual(snap["workers"][0]["label"], "NLP A")
        self.assertLess(time.time() - started, 0.15)
        self.assertEqual(pool.result(second, timeout=2), "b")

    def test_full_queue_returns_none(self):
        pool = InferencePool(workers=1, queue_limit=1)
        self.assertIsNotNone(pool.submit(lambda: time.sleep(0.4)))
        for _ in range(50):
            if pool.snapshot()["busy_count"]:
                break
            time.sleep(0.01)
        self.assertIsNotNone(pool.submit(lambda: "queued"))
        self.assertIsNone(pool.submit(lambda: "rejected"))


if __name__ == "__main__":
    unittest.main()
