"""Round 3 DeepSeek escalation gate — tokens only on low-confidence paths."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import config
from app.llm_gate import should_escalate_to_llm, truncate_for_llm


class LlmGateTests(unittest.TestCase):
    def test_multiple_extracted_diseases_do_not_trigger_llm(self):
        self.assertFalse(should_escalate_to_llm(
            disease="Dengue",
            confidence=0.88,
            extracted=["Dengue", "Malaria"],
            language="en",
        ))

    def test_unknown_does_trigger(self):
        self.assertTrue(should_escalate_to_llm(
            disease="UNKNOWN",
            confidence=0.2,
            extracted=[],
            language="en",
        ))

    def test_non_health_topic_skips_llm(self):
        self.assertFalse(should_escalate_to_llm(
            non_health_topic=True,
            disease="UNKNOWN",
            confidence=0.1,
        ))
        self.assertFalse(should_escalate_to_llm(
            interactive=True,
            disease="UNKNOWN",
            confidence=0.1,
        ))
        self.assertFalse(should_escalate_to_llm(
            is_noisy=True,
            disease="UNKNOWN",
            confidence=0.1,
        ))

    def test_agent_disabled_is_kill_switch(self):
        with patch.object(config, "AGENT_ENABLED", False):
            self.assertFalse(should_escalate_to_llm(disease="UNKNOWN", confidence=0.1))

    def test_truncate_bounds_prompt(self):
        with patch.object(config, "DEEPSEEK_PROMPT_CHARS", 20):
            self.assertLessEqual(len(truncate_for_llm("alpha beta gamma delta epsilon")), 20)

    def test_geocode_review_does_trigger(self):
        self.assertTrue(should_escalate_to_llm(
            disease="Dengue",
            confidence=0.9,
            extracted=["Dengue"],
            language="en",
            needs_review=True,
        ))


if __name__ == "__main__":
    unittest.main()
