"""Short H5N1 confirm headlines must yield case counts."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import extractors


class ShortH5N1ConfirmTests(unittest.TestCase):
    def test_short_h5n1_confirm_singular_is_one(self):
        text = "Cambodia confirms human H5N1 avian flu case"
        self.assertEqual(extractors._focal_human_case_override(text), 1)
        facts = extractors.predict_surveillance_facts(text)
        self.assertEqual(facts.get("case_count"), 1)

    def test_short_h5n1_confirm_n_cases(self):
        samples = [
            ("Ministry confirms 11 cases of H5N1 avian influenza", 11),
            ("11 confirmed H5N1 cases reported this month", 11),
            ("The ministry confirmed 11 laboratory-confirmed H5N1 cases.", 11),
            ("Cambodia confirms 11 human H5N1 avian flu cases", 11),
        ]
        for text, expected in samples:
            with self.subTest(text=text):
                self.assertEqual(
                    extractors.extract_case_count(text, disease="Avian influenza"),
                    expected,
                    msg=text,
                )
                facts = extractors.predict_surveillance_facts(text)
                self.assertEqual(facts.get("case_count"), expected, msg=text)


if __name__ == "__main__":
    unittest.main()
