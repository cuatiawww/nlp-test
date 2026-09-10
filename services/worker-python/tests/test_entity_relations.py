import unittest

from app.entity_relations import disease_relation_rows, location_relation_rows


class EntityRelationTests(unittest.TestCase):
    def test_location_rows_keep_explicit_locations_and_bind_counts_only_to_event_location(self):
        rows = location_relation_rows(
            {
                "location_name": "Vientiane",
                "case_count": 10,
                "death_count": 2,
                "locations": [
                    {"name": "Vientiane", "country": "Laos"},
                    {"name": "Luang Prabang", "country": "Laos"},
                ],
            }
        )

        self.assertEqual([row["location_name"] for row in rows], ["Vientiane", "Luang Prabang"])
        self.assertEqual(rows[0]["role"], "event")
        self.assertEqual(rows[0]["case_count"], 10)
        self.assertIsNone(rows[1]["case_count"])
        self.assertEqual(rows[1]["role"], "other")

    def test_disease_rows_keep_secondary_mentions_without_copying_primary_counts(self):
        rows = disease_relation_rows(
            {
                "disease_classification": "dengue fever",
                "case_count": 10,
                "death_count": 1,
                "disease_mentions": [
                    {
                        "surface_form": "dengue",
                        "canonical_name": "dengue fever",
                        "role": "primary",
                        "evidence": "Vientiane reported 10 dengue cases.",
                        "icd11_code": "1B01",
                    },
                    {
                        "surface_form": "measles",
                        "canonical_name": "measles",
                        "role": "secondary",
                        "evidence": "Measles vaccination was also discussed.",
                    },
                ],
            }
        )

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["case_count"], 10)
        self.assertEqual(rows[0]["icd11_code"], "1B01")
        self.assertIsNone(rows[1]["case_count"])
        self.assertEqual(rows[1]["role"], "mentioned")

    def test_empty_entities_do_not_create_phantom_rows(self):
        self.assertEqual(location_relation_rows({"location_name": None}), [])
        self.assertEqual(disease_relation_rows({"disease_classification": "UNKNOWN"}), [])


    def test_sub_event_child_relation_rows(self):
        """Test child event relation generation for multi-event decomposition."""
        child_loc_nlp = {
            "location_name": "Singapura",
            "latitude": 1.3521,
            "longitude": 103.8198,
            "country": "Singapore",
            "case_count": 445,
            "death_count": 0,
            "locations": [{
                "name": "Singapura",
                "latitude": 1.3521,
                "longitude": 103.8198,
                "country": "Singapore",
                "role": "event",
            }],
            "disease_classification": "Influenza A(H3N2)",
            "confidence": 0.95,
            "disease_extracted": ["Influenza A(H3N2)"],
            "disease_mentions": [],
        }
        loc_rows = location_relation_rows(child_loc_nlp)
        self.assertEqual(len(loc_rows), 1)
        self.assertEqual(loc_rows[0]["location_name"], "Singapura")
        self.assertEqual(loc_rows[0]["case_count"], 445)
        self.assertEqual(loc_rows[0]["role"], "event")

        dis_rows = disease_relation_rows(child_loc_nlp)
        self.assertEqual(len(dis_rows), 1)
        self.assertEqual(dis_rows[0]["disease_name"], "Influenza A(H3N2)")
        self.assertEqual(dis_rows[0]["case_count"], 445)
        self.assertEqual(dis_rows[0]["role"], "primary")


if __name__ == "__main__":
    unittest.main()
