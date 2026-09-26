"""Disease co-mention pollution: bare glossary hits must not join primary."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors


DENGUE_WITH_TB_GLOSSARY = """
Dengue Situation Update 751
6 August 2026
Update on the Dengue situation in the Western Pacific Region

Cambodia
As of 26 July 2026, a total of 40 915 dengue cases, including 58 deaths
(case fatality rate: 0.1%), have been reported through the National Dengue
Surveillance System. This represents a 67.7% increase compared to 2025.

Glossary
TB tuberculosis transmission; malaria vector control footnotes.
Related diseases: Tuberculosis (TB), Malaria.
"""


class DiseaseComentionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        config.DISEASE_DICT.update({
            "dengue": "Dengue",
            "dbd": "Dengue",
            "tuberculosis": "Tuberculosis",
            "tb": "Tuberculosis",
            "malaria": "Malaria",
        })

    def test_incidental_tb_glossary_does_not_join_dengue_primary(self):
        diseases = extractors.extract_diseases(DENGUE_WITH_TB_GLOSSARY)
        self.assertIn("Dengue", diseases)
        filtered = extractors.filter_diseases_to_evidence(diseases, DENGUE_WITH_TB_GLOSSARY)
        preferred = extractors.prefer_outbreak_diseases(filtered, DENGUE_WITH_TB_GLOSSARY)
        self.assertEqual(preferred, ["Dengue"])
        facts = extractors.predict_surveillance_facts(DENGUE_WITH_TB_GLOSSARY)
        self.assertEqual(facts.get("disease"), "Dengue")
        self.assertEqual(facts.get("diseases"), ["Dengue"])

    def test_evidenced_multi_disease_retained(self):
        text = (
            "Johor reported 120 dengue cases this week. "
            "Separately, HFMD cases reached 85 in the same state, with 2 deaths."
        )
        config.DISEASE_DICT.update({
            "dengue": "Dengue",
            "hfmd": "Hand, foot and mouth disease",
            "hand, foot and mouth disease": "Hand, foot and mouth disease",
            "hand foot and mouth": "Hand, foot and mouth disease",
        })
        diseases = extractors.prefer_outbreak_diseases(
            extractors.filter_diseases_to_evidence(extractors.extract_diseases(text), text),
            text,
        )
        labels = {extractors.normalize_disease_display(d).lower() for d in diseases}
        self.assertTrue(any("dengue" in x for x in labels))
        self.assertTrue(
            any("hand" in x or "hfmd" in x or "mouth" in x for x in labels),
            msg=f"expected HFMD retained, got {labels}",
        )


if __name__ == "__main__":
    unittest.main()
