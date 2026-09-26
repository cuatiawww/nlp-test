"""Fase 0: AGENT_ENABLED=false baseline — no DeepSeek HTTP, status distinction."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config
from app.llm_gate import (
    AGENT_STATUS_APPLIED,
    AGENT_STATUS_DISABLED,
    AGENT_STATUS_FAILED,
    AGENT_STATUS_NOT_CALLED_GATE,
    resolve_agent_invocation_status,
    should_escalate_to_llm,
)


class AgentDisabledBaselineTests(unittest.TestCase):
    def test_agent_enabled_defaults_false(self):
        """Rules-first Fase 0: external LLM must default off in this suite."""
        self.assertFalse(config.AGENT_ENABLED)

    def test_status_disabled_beats_gate_and_applied(self):
        self.assertEqual(
            resolve_agent_invocation_status(
                agent_enabled=False,
                gate_would_escalate=True,
                review_attempted=True,
                review_applied=True,
            ),
            AGENT_STATUS_DISABLED,
        )

    def test_status_not_called_gate(self):
        self.assertEqual(
            resolve_agent_invocation_status(
                agent_enabled=True,
                gate_would_escalate=False,
            ),
            AGENT_STATUS_NOT_CALLED_GATE,
        )

    def test_status_failed_on_exception_flag(self):
        self.assertEqual(
            resolve_agent_invocation_status(
                agent_enabled=True,
                gate_would_escalate=True,
                review_attempted=True,
                review_failed=True,
            ),
            AGENT_STATUS_FAILED,
        )

    def test_status_failed_on_empty_attempt(self):
        self.assertEqual(
            resolve_agent_invocation_status(
                agent_enabled=True,
                gate_would_escalate=True,
                review_attempted=True,
                review_applied=False,
            ),
            AGENT_STATUS_FAILED,
        )

    def test_status_applied(self):
        self.assertEqual(
            resolve_agent_invocation_status(
                agent_enabled=True,
                gate_would_escalate=True,
                review_attempted=True,
                review_applied=True,
            ),
            AGENT_STATUS_APPLIED,
        )

    def test_gate_kill_switch_when_disabled(self):
        with patch.object(config, "AGENT_ENABLED", False):
            self.assertFalse(
                should_escalate_to_llm(
                    disease="Dengue",
                    confidence=0.2,
                    extracted=["Dengue"],
                    is_official_bulletin=True,
                    is_explicit_outbreak=True,
                    is_health_related=True,
                    case_count=100,
                    death_count=5,
                    location_missing=True,
                    needs_review=True,
                )
            )

    def test_chat_json_never_http_when_disabled(self):
        from app import agent

        with patch.object(config, "AGENT_ENABLED", False):
            with patch.object(agent.urllib.request, "urlopen") as urlopen:
                result = agent.chat_json("sys", "user")
                self.assertEqual(result, {})
                urlopen.assert_not_called()

    def test_validate_and_correct_never_http_when_disabled(self):
        from app import deepseek

        with patch.object(config, "AGENT_ENABLED", False):
            with patch("app.agent.chat_json") as chat_json:
                result = deepseek.validate_and_correct_events(
                    text="Dengue outbreak in Johor with 100 cases",
                    title="Dengue",
                    draft_disease="Dengue",
                    draft_case_count=100,
                )
                self.assertIsNone(result)
                chat_json.assert_not_called()

    def test_multi_event_llm_extract_skips_when_disabled(self):
        from app import multi_event_extractor as mee

        with patch.object(config, "AGENT_ENABLED", False):
            with patch("app.agent.chat_json") as chat_json:
                events = mee._llm_extract_events("Dengue in Johor 100 cases", ["Dengue"])
                self.assertEqual(events, [])
                chat_json.assert_not_called()


if __name__ == "__main__":
    unittest.main()
