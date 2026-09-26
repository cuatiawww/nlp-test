"""Fase 2: rules-first disease resolver contract."""
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.rules_first_resolver import apply_resolution_to_provenance, resolve_disease_label


def _evidence(disease: str, text: str) -> bool:
    return disease.casefold() in text.casefold()


class RulesFirstResolverTests(unittest.TestCase):
    def test_rule_with_evidence_beats_model(self):
        res = resolve_disease_label(
            rule_candidates=["Dengue"],
            model_disease="Malaria",
            text="Dengue cases rose in Johor. Malaria is also discussed historically.",
            has_textual_evidence=_evidence,
        )
        self.assertEqual(res.disease, "Dengue")
        self.assertEqual(res.source, "rule_over_model")
        self.assertTrue(res.model_rule_conflict)
        self.assertTrue(res.needs_review)

    def test_rule_outside_classifier_still_valid(self):
        res = resolve_disease_label(
            rule_candidates=["Acute Respiratory Infection (ISPA)"],
            model_disease="UNKNOWN",
            text="Acute Respiratory Infection (ISPA) cases increased this week",
            has_textual_evidence=_evidence,
        )
        self.assertEqual(res.disease, "Acute Respiratory Infection (ISPA)")
        self.assertEqual(res.source, "rule")
        self.assertFalse(res.model_rule_conflict)

    def test_model_without_evidence_becomes_unknown(self):
        res = resolve_disease_label(
            rule_candidates=[],
            model_disease="Rabies",
            text="Oil pipeline kasus reported in rural area",
            has_textual_evidence=_evidence,
        )
        self.assertEqual(res.disease, "UNKNOWN")
        self.assertEqual(res.source, "unknown")
        self.assertTrue(res.needs_review)

    def test_model_with_evidence_used_when_no_rule(self):
        res = resolve_disease_label(
            rule_candidates=[],
            model_disease="Malaria",
            text="Malaria outbreak confirmed",
            has_textual_evidence=_evidence,
        )
        self.assertEqual(res.disease, "Malaria")
        self.assertEqual(res.source, "model")

    def test_matching_rule_and_model_no_conflict(self):
        res = resolve_disease_label(
            rule_candidates=["Dengue"],
            model_disease="Dengue",
            text="Dengue fever in Johor Bahru",
            has_textual_evidence=_evidence,
        )
        self.assertEqual(res.source, "rule")
        self.assertFalse(res.model_rule_conflict)

    def test_provenance_helper_sets_conflict_flag(self):
        res = resolve_disease_label(
            rule_candidates=["Dengue"],
            model_disease="Malaria",
            text="Dengue and also mentions Malaria elsewhere",
            has_textual_evidence=_evidence,
        )
        prov = apply_resolution_to_provenance({"method": "test"}, res)
        self.assertTrue(prov["model_rule_conflict"])
        self.assertIn("model_rule_conflict", prov["validation_flags"])
        self.assertEqual(prov["disease_resolution_source"], "rule_over_model")


if __name__ == "__main__":
    unittest.main()
