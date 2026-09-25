"""Round 3 DeepSeek escalation gate — tokens only on low-confidence paths."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import config
from app.llm_gate import should_escalate_to_llm, truncate_for_llm


class LlmGateTests(unittest.TestCase):
    def test_confidence_threshold_boundary(self):
        """Verify <= 0.75 threshold escalation behavior."""
        with patch.object(config, "AGENT_ENABLED", True):
            # Exactly 0.75 MUST trigger review (operator rule: confidence <= 0.75)
            self.assertTrue(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.75,
                extracted=["Dengue"],
                language="id",
            ))
            # Below 0.75 MUST trigger review
            self.assertTrue(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.74,
                extracted=["Dengue"],
                language="id",
            ))
            # Above 0.75 MUST NOT trigger review (for non-bulletin standard articles)
            self.assertFalse(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.76,
                extracted=["Dengue"],
                language="id",
            ))
            self.assertFalse(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.92,
                extracted=["Dengue"],
                language="id",
            ))

    def test_ncd_only_never_triggers_llm(self):
        """URL 2 Case: Cancer/NCD articles must NEVER enter the LLM (zero token waste)."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertFalse(should_escalate_to_llm(
                disease="Cancer",
                confidence=0.30,
                extracted=["Cancer"],
                ncd_only=True,
                is_policy_content=True,
            ))

    def test_policy_market_without_outbreak_never_triggers_llm(self):
        """Policy/market articles with no outbreak signal must NEVER enter LLM."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertFalse(should_escalate_to_llm(
                disease="UNKNOWN",
                confidence=0.20,
                extracted=["Medicine"],
                is_policy_content=True,
                is_explicit_outbreak=False,
            ))

    def test_official_who_don_bulletin_triggers_llm(self):
        """URL 1 Case: Official WHO DON bulletins with confidence <= 0.85 must trigger LLM validation."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Marburg virus disease",
                confidence=0.80,
                extracted=["Marburg virus disease"],
                is_official_bulletin=True,
                is_explicit_outbreak=True,
            ))

    def test_official_bulletin_with_missing_location_triggers_llm(self):
        """Official outbreak bulletins with missing location must trigger LLM."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Mpox",
                confidence=0.90,
                extracted=["Mpox"],
                is_official_bulletin=True,
                location_missing=True,
            ))

    def test_multiple_extracted_diseases_do_not_trigger_llm(self):
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertFalse(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.88,
                extracted=["Dengue", "Malaria"],
                language="en",
            ))

    def test_ambiguous_unknown_disease_with_candidates_triggers(self):
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="UNKNOWN",
                confidence=0.2,
                extracted=["Demam Berdarah"],
                language="id",
            ))

    def test_unknown_without_candidates_skips_llm(self):
        """Zero-token saving on non-health or junk articles where local pipeline found nothing."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertFalse(should_escalate_to_llm(
                disease="UNKNOWN",
                confidence=0.0,
                extracted=[],
                language="id",
            ))

    def test_non_health_topic_skips_llm(self):
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertFalse(should_escalate_to_llm(
                non_health_topic=True,
                disease="UNKNOWN",
                confidence=0.1,
                extracted=["Dengue"],
            ))
            self.assertFalse(should_escalate_to_llm(
                interactive=True,
                disease="UNKNOWN",
                confidence=0.1,
                extracted=["Dengue"],
            ))
            self.assertFalse(should_escalate_to_llm(
                is_noisy=True,
                disease="UNKNOWN",
                confidence=0.1,
                extracted=["Dengue"],
            ))

    def test_agent_disabled_is_kill_switch(self):
        with patch.object(config, "AGENT_ENABLED", False):
            self.assertFalse(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.5,
                extracted=["Dengue"],
                is_official_bulletin=True,
            ))

    def test_truncate_bounds_prompt(self):
        with patch.object(config, "DEEPSEEK_PROMPT_CHARS", 20):
            self.assertLessEqual(len(truncate_for_llm("alpha beta gamma delta epsilon")), 20)

    def test_outbreak_with_zero_metrics_triggers_llm(self):
        """Vietnam/Mimika Case: Outbreak news with 0 counts extracted locally must trigger LLM verification."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Hand, Foot, and Mouth Disease",
                confidence=0.85,
                extracted=["Hand, Foot, and Mouth Disease"],
                is_explicit_outbreak=True,
                case_count=0,
                death_count=0,
            ))

    def test_location_conflict_triggers_llm(self):
        """Mimika->Blitar Case: Location mismatch must trigger LLM to inspect actual article context."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Measles",
                confidence=0.85,
                extracted=["Measles"],
                has_location_conflict=True,
            ))

    def test_disease_with_missing_location_triggers_llm(self):
        """Identified disease with completely missing location must trigger LLM."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Measles",
                confidence=0.85,
                extracted=["Measles"],
                location_missing=True,
            ))

    def test_geocode_review_does_trigger(self):
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.9,
                extracted=["Dengue"],
                language="en",
                needs_review=True,
            ))


if __name__ == "__main__":
    unittest.main()
