"""Round 3 DeepSeek escalation gate — tokens only on low-confidence paths."""
import os
import sys
import unittest
from urllib.error import HTTPError
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import config
from app.llm_gate import should_escalate_to_llm, truncate_for_llm
from app.deepseek import verify_ground_truth_guardrails, _scoped_metric_count
from app.agent import _is_quota_failure


class LlmGateTests(unittest.TestCase):
    def test_confidence_threshold_boundary(self):
        """Only health rows below 0.85 are eligible for review."""
        with patch.object(config, "AGENT_ENABLED", True):
            # Exactly 0.85 MUST NOT trigger review.
            self.assertTrue(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.84,
                extracted=["Dengue"],
                language="id",
                is_health_related=True,
            ))
            self.assertFalse(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.85,
                extracted=["Dengue"],
                language="id",
                is_health_related=True,
            ))
            # Above 0.85 MUST NOT trigger review.
            self.assertFalse(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.86,
                extracted=["Dengue"],
                language="id",
                is_health_related=True,
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

    def test_policy_article_with_metrics_can_trigger_review(self):
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.80,
                extracted=["Dengue"],
                is_policy_content=True,
                case_count=39672,
                death_count=105,
                is_health_related=True,
            ))

    def test_deepseek_quota_failure_is_fail_open(self):
        payment_required = HTTPError(
            "https://api.deepseek.com/chat/completions",
            402,
            "Payment Required",
            {},
            None,
        )
        rate_limit = HTTPError(
            "https://api.deepseek.com/chat/completions",
            429,
            "Too Many Requests",
            {},
            None,
        )
        self.assertTrue(_is_quota_failure(payment_required))
        self.assertTrue(_is_quota_failure(rate_limit, "insufficient balance"))
        self.assertFalse(_is_quota_failure(rate_limit, "temporary rate limit"))

    def test_official_who_don_bulletin_triggers_llm(self):
        """URL 1 Case: Official WHO DON bulletins with confidence <= 0.85 must trigger LLM validation."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Marburg virus disease",
                confidence=0.80,
                extracted=["Marburg virus disease"],
                is_official_bulletin=True,
                is_explicit_outbreak=True,
                is_health_related=True,
            ))

    def test_high_confidence_official_bulletin_skips_llm(self):
        """High-confidence health rows do not consume review tokens."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertFalse(should_escalate_to_llm(
                disease="Mpox",
                confidence=0.90,
                extracted=["Mpox"],
                is_official_bulletin=True,
                location_missing=True,
                is_health_related=True,
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
                is_health_related=True,
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
                confidence=0.84,
                extracted=["Hand, Foot, and Mouth Disease"],
                is_explicit_outbreak=True,
                case_count=0,
                death_count=0,
                is_health_related=True,
            ))

    def test_location_conflict_triggers_llm(self):
        """Mimika->Blitar Case: Location mismatch must trigger LLM to inspect actual article context."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Measles",
                confidence=0.84,
                extracted=["Measles"],
                has_location_conflict=True,
                is_health_related=True,
            ))

    def test_disease_with_missing_location_triggers_llm(self):
        """Identified disease with completely missing location must trigger LLM."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Measles",
                confidence=0.84,
                extracted=["Measles"],
                location_missing=True,
                is_health_related=True,
            ))

    def test_geocode_review_does_trigger(self):
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.84,
                extracted=["Dengue"],
                language="en",
                needs_review=True,
                is_health_related=True,
            ))

    def test_non_health_rows_never_trigger_review(self):
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertFalse(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.10,
                extracted=["Dengue"],
                is_health_related=False,
                is_explicit_outbreak=True,
                is_official_bulletin=True,
            ))

    def test_deepseek_guardrail_binds_metrics_to_country(self):
        source = (
            "As of 7 September 2026, the Democratic Republic of the Congo has "
            "reported 6757 confirmed cases, including 3267 deaths. "
            "As of 7 September 2026, a cumulative total of 6778 confirmed cases "
            "has been reported: 6757 in the Democratic Republic of the Congo "
            "(including two cases diagnosed in the Democratic Republic of the Congo "
            "and subsequently treated in Germany), 20 cases in Uganda and one case "
            "in France. Overall, 3269 deaths have been reported, including two in Uganda. "
            "A clinical trial enrolled 300 people."
        )
        broad = (
            "As of 7 September 2026, a cumulative total of 6778 confirmed cases "
            "has been reported: 6757 in the Democratic Republic of the Congo "
            "(including two cases diagnosed in the Democratic Republic of the Congo "
            "and subsequently treated in Germany), 20 cases in Uganda and one case "
            "in France. Overall, 3269 deaths have been reported, including two in Uganda."
        )
        result = verify_ground_truth_guardrails(
            {
                "is_health_related": True,
                "disease_classification": "Ebola",
                "sub_events": [
                    {
                        "disease": "Ebola",
                        "location_name": "Democratic Republic of the Congo",
                        "country": "Democratic Republic of the Congo",
                        "case_count": 6778,
                        "death_count": 3267,
                        "evidence": "As of 7 September 2026, the Democratic Republic of the Congo has reported 6757 confirmed cases, including 3267 deaths.",
                    },
                    {
                        "disease": "Ebola",
                        "location_name": "Uganda",
                        "country": "Uganda",
                        "case_count": 20,
                        "death_count": 3269,
                        "evidence": broad,
                    },
                    {
                        "disease": "Ebola",
                        "location_name": "France",
                        "country": "France",
                        "case_count": 1,
                        "death_count": 0,
                        "evidence": broad,
                    },
                    {
                        "disease": "Ebola",
                        "location_name": "Germany",
                        "country": "Germany",
                        "case_count": 20,
                        "death_count": 0,
                        "evidence": broad,
                    },
                    {
                        "disease": "Ebola",
                        "location_name": "Indonesia",
                        "country": "Indonesia",
                        "case_count": 300,
                        "death_count": 0,
                        "evidence": "A clinical trial enrolled 300 people.",
                    },
                ],
            },
            source,
            allowed_diseases=["Ebola"],
        )
        events = {event["location_name"]: event for event in result["sub_events"]}
        self.assertEqual(events["Democratic Republic of the Congo"]["case_count"], 6757)
        self.assertEqual(events["Democratic Republic of the Congo"]["death_count"], 3267)
        self.assertEqual(events["Uganda"]["case_count"], 20)
        self.assertEqual(events["Uganda"]["death_count"], 2)
        self.assertEqual(events["France"]["case_count"], 1)
        self.assertNotIn("Germany", events)
        self.assertNotIn("Indonesia", events)

    def test_deepseek_guardrail_supports_asean_metric_phrasing(self):
        indonesia = "Kementerian Kesehatan mencatat kasus DBD di Indonesia mencapai 39672 kasus dengan 105 kematian."
        vietnam = "Tỉnh Gia Lai ghi nhận 2913 ca mắc và 1 ca tử vong trong năm 2026."
        self.assertEqual(_scoped_metric_count(indonesia, "Indonesia", "cases"), 39672)
        self.assertEqual(_scoped_metric_count(indonesia, "Indonesia", "deaths"), 105)
        self.assertEqual(_scoped_metric_count(vietnam, "Gia Lai", "cases"), 2913)
        self.assertEqual(_scoped_metric_count(vietnam, "Gia Lai", "deaths"), 1)

    def test_guardrail_uses_nearby_location_context_without_mixing_periods(self):
        source = (
            "Tỉnh Gia Lai ghi nhận số ca SXH tăng nhanh. Lũy kế từ đầu năm 2026, "
            "địa phương đã ghi nhận 2.913 ca mắc, tăng 1.838 ca so với cùng kỳ. "
            "Đáng chú ý, Gia Lai cũng ghi nhận ca tử vong đầu tiên do SXH."
        )
        evidence = (
            "Lũy kế từ đầu năm 2026, địa phương đã ghi nhận 2.913 ca mắc, "
            "tăng 1.838 ca so với cùng kỳ. Đáng chú ý, Gia Lai cũng ghi nhận "
            "ca tử vong đầu tiên do SXH."
        )
        self.assertEqual(_scoped_metric_count(evidence, "Gia Lai", "cases", source), 2913)
        self.assertEqual(_scoped_metric_count(evidence, "Gia Lai", "deaths", source), 1)

    def test_guardrail_does_not_read_health_zone_count_as_deaths(self):
        evidence = (
            "North Kivu reported 299 confirmed cases across 11 health zones, "
            "including 188 deaths."
        )
        self.assertEqual(_scoped_metric_count(evidence, "North Kivu", "cases"), 299)
        self.assertEqual(_scoped_metric_count(evidence, "North Kivu", "deaths"), 188)


if __name__ == "__main__":
    unittest.main()
