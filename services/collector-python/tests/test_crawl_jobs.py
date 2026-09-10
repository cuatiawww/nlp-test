import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.crawl_jobs import _article_matches, _disease_labels, _selected_concept


class CrawlJobLogicTests(unittest.TestCase):
    def test_surveillance_labels_keep_a_scalar_as_one_label(self):
        analysis = {"disease_classification": "Dengue"}
        self.assertEqual(_disease_labels(analysis), ["Dengue"])

    def test_selected_concept_does_not_use_first_character(self):
        labels = _disease_labels({"disease_classification": ["Dengue"]})
        concept = {"canonical_name": "Dengue", "id": "concept-1"}
        label, selected = _selected_concept(labels, [concept])
        self.assertEqual(label, "Dengue")
        self.assertEqual(selected, concept)

    def test_article_filter_accepts_surveillance_list_and_country(self):
        analysis = {
            "disease_classification": ["Dengue"],
            "locations": [{"country": "Indonesia"}],
        }
        self.assertTrue(_article_matches(analysis, ["Dengue"], "Indonesia"))
        self.assertFalse(_article_matches(analysis, ["Measles"], "Indonesia"))


if __name__ == "__main__":
    unittest.main()
