import unittest


class TranslationBudgetTests(unittest.TestCase):
    def test_indonesian_is_source_first_and_does_not_require_translation(self):
        from app import config
        from app.translator import translate_and_extract

        original = config.TRANSLATION_NATIVE_FIRST_LANGS
        try:
            config.TRANSLATION_NATIVE_FIRST_LANGS = frozenset({"id"})
            result = translate_and_extract("Ditemukan 10 kasus dengue.", "id")
        finally:
            config.TRANSLATION_NATIVE_FIRST_LANGS = original
        self.assertFalse(result["translated"])
        self.assertEqual(result["translation_status"], "not_required")

    def test_interactive_chunk_budget_keeps_only_one_source_window(self):
        from app.translator import _translation_chunks

        chunks, truncated = _translation_chunks(
            "Satu. Dua. Tiga.",
            max_chars=1200,
            chunk_chars=6,
            max_chunks=1,
        )

        self.assertEqual(chunks, ["Satu."])
        self.assertTrue(truncated)

    def test_translation_budget_does_not_change_source_authority(self):
        from app import config

        self.assertEqual(config.TRANSLATION_INTERACTIVE_MAX_CHUNKS, 1)
        self.assertLessEqual(
            config.TRANSLATION_INTERACTIVE_MAX_CHARS,
            config.TRANSLATION_MAX_CHARS,
        )

    def test_non_native_translation_is_deferred_without_loading_model(self):
        from unittest.mock import patch
        from app import config
        from app.translator import translate_and_extract

        original = config.TRANSLATION_ASYNC_ENABLED
        try:
            config.TRANSLATION_ASYNC_ENABLED = True
            with patch("app.translator._nllb", side_effect=AssertionError("model must not load")):
                result = translate_and_extract("รายงานผู้ป่วย 10 ราย", "th")
        finally:
            config.TRANSLATION_ASYNC_ENABLED = original

        self.assertFalse(result["translated"])
        self.assertEqual(result["translation_status"], "pending")
        self.assertEqual(result["provider"], "nllb-async")

    def test_missing_offline_model_fails_fast(self):
        import os
        from unittest.mock import patch
        from app.translator import _nllb

        with patch.dict(
            os.environ,
            {
                "TRANSLATION_LOCAL_ENABLED": "true",
                "HF_HUB_OFFLINE": "1",
                "TRANSFORMERS_OFFLINE": "1",
                "TRANSLATION_LOCAL_MODEL": "missing/example-model",
            },
            clear=False,
        ):
            with patch("app.translator._resolve_cached_model_path", return_value="missing/example-model"):
                self.assertIsNone(_nllb("รายงาน 1 ราย", "th"))


if __name__ == "__main__":
    unittest.main()
