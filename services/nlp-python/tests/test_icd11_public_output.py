import unittest

from app.icd11 import project_icd11_public_output


class Icd11PublicOutputTests(unittest.TestCase):
    def test_uses_who_name_and_code_for_public_primary(self):
        result = project_icd11_public_output(
            primary="Dengue",
            extracted=["Dengue", "Zika"],
            mentions=[
                {"canonical_name": "Dengue fever", "icd11_code": "1D2Z", "role": "primary"},
                {"canonical_name": "Zika", "icd11_code": None, "role": "secondary"},
            ],
        )

        self.assertEqual(result["primary"], "Dengue fever")
        self.assertEqual(result["extracted"], ["Dengue fever"])
        self.assertEqual(result["unresolved_indexes"], [1])

    def test_unresolved_terms_do_not_become_public_disease_labels(self):
        result = project_icd11_public_output(
            primary="Acute diarrhea",
            extracted=["Acute diarrhea"],
            mentions=[
                {"canonical_name": "Acute diarrhea", "icd11_code": None, "role": "primary"},
            ],
        )

        self.assertEqual(result["primary"], "UNKNOWN")
        self.assertEqual(result["extracted"], [])
        self.assertEqual(result["unresolved_indexes"], [0])

    def test_existing_who_name_is_not_rewritten_to_local_english_name(self):
        result = project_icd11_public_output(
            primary="Dengue fever",
            extracted=["Dengue fever"],
            mentions=[
                {
                    "canonical_name": "Dengue fever",
                    "icd11_code": "1D2Z",
                    "role": "primary",
                },
            ],
        )

        self.assertEqual(result["primary"], "Dengue fever")
        self.assertEqual(result["extracted"], ["Dengue fever"])
        self.assertEqual(result["unresolved_indexes"], [])


if __name__ == "__main__":
    unittest.main()
