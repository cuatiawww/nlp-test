import unittest


class TranslationBudgetTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
