import unittest

from app.icd11 import _parse_who_search_response


class Icd11SearchGuardTests(unittest.TestCase):
    def test_rejects_broad_single_word_match_to_unrelated_entity(self):
        result = _parse_who_search_response(
            "hepatitis",
            {
                "destinationEntities": [
                    {"title": "Hepatitis in late syphilis", "theCode": "1A62.2Y/DB90.Y", "score": 99},
                    {"title": "Hepatitis B", "theCode": "1E50.1", "score": 90},
                ]
            },
        )
        self.assertIsNone(result)

    def test_accepts_exact_specific_title(self):
        result = _parse_who_search_response(
            "hepatitis b",
            {"destinationEntities": [{"title": "Hepatitis B", "theCode": "1E50.1", "score": 90}]},
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["ontology_code"], "1E50.1")


if __name__ == "__main__":
    unittest.main()
