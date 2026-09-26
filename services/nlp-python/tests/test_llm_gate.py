"""Round 3 DeepSeek escalation gate — tokens only on low-confidence paths."""
import os
import sys
import unittest
from urllib.error import HTTPError
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app import config
from app.llm_gate import (
    distinct_case_figure_count,
    should_escalate_to_llm,
    text_has_unbound_metric_evidence,
    truncate_for_llm,
)
from app.deepseek import (
    _compact_review_body,
    validate_and_correct_events,
    verify_ground_truth_guardrails,
    _scoped_metric_count,
)
from app.extractors import extract_case_count, extract_named_countries
from app.agent import _is_quota_failure


class LlmGateTests(unittest.TestCase):
    def test_rear_gate_is_taught_the_repeated_mistakes(self):
        import inspect
        source = inspect.getsource(validate_and_correct_events)
        self.assertIn("COVID-19", source)
        self.assertIn("RD Kongo", source)
        self.assertIn("3 bulan yang lalu", source)
        self.assertIn("same disease, place, and count", source)
        self.assertIn("10 people were infected", source)
        self.assertIn("tingkat kasus", source)

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

    def test_multi_fact_still_escalates_at_high_confidence(self):
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Mpox",
                confidence=0.92,
                extracted=["Mpox"],
                case_count=40,
                death_count=0,
                is_health_related=True,
                multi_fact=True,
            ))
            self.assertFalse(should_escalate_to_llm(
                disease="Mpox",
                confidence=0.92,
                extracted=["Mpox"],
                case_count=40,
                death_count=0,
                is_health_related=True,
                multi_fact=False,
            ))
            self.assertFalse(should_escalate_to_llm(
                disease="Mpox",
                confidence=0.92,
                extracted=["Mpox"],
                is_health_related=False,
                multi_fact=True,
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

    def test_high_confidence_unbound_metrics_still_escalate(self):
        """Continuous rows pin confidence at 0.85 once a disease is grounded."""
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.90,
                extracted=["Dengue"],
                case_count=0,
                death_count=0,
                is_health_related=True,
                unbound_metrics=True,
            ))
            self.assertFalse(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.90,
                extracted=["Dengue"],
                case_count=0,
                death_count=0,
                is_health_related=True,
            ))

    def test_cross_country_comparison_still_escalates(self):
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.92,
                extracted=["Dengue"],
                case_count=10,
                death_count=0,
                is_health_related=True,
                cross_country_comparison=True,
            ))

    def test_prior_year_rate_does_not_become_a_second_event(self):
        article = (
            "JAKARTA — An Indonesian news site reported in English that 10 people were "
            "infected with dengue in Australia this month. Last year, Japan recorded a "
            "dengue case rate of 12.4 per 100,000 people."
        )
        reviewed = verify_ground_truth_guardrails({
            "is_health_related": True,
            "outbreak_alert": True,
            "disease_classification": "Dengue",
            "sub_events": [
                {
                    "disease": "Dengue",
                    "country": "Australia",
                    "location_name": "Australia",
                    "case_count": 10,
                    "death_count": 0,
                    "evidence": "10 people were infected with dengue in Australia this month.",
                },
                {
                    "disease": "Dengue",
                    "country": "Japan",
                    "location_name": "Japan",
                    "case_count": 12,
                    "death_count": 0,
                    "evidence": "Last year, Japan recorded a dengue case rate of 12.4 per 100,000 people.",
                },
            ],
        }, article)
        events = reviewed["sub_events"]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["country"], "Australia")
        self.assertEqual(events[0]["case_count"], 10)

    def test_publisher_country_conflict_still_escalates(self):
        with patch.object(config, "AGENT_ENABLED", True):
            self.assertTrue(should_escalate_to_llm(
                disease="Cholera",
                confidence=0.92,
                extracted=["Cholera"],
                case_count=80,
                death_count=4,
                is_health_related=True,
                publisher_country_conflict=True,
            ))
            self.assertFalse(should_escalate_to_llm(
                disease="Cholera",
                confidence=0.92,
                extracted=["Cholera"],
                case_count=80,
                death_count=4,
                is_health_related=True,
            ))

    def test_unbound_metrics_stay_off_without_agent(self):
        with patch.object(config, "AGENT_ENABLED", False):
            self.assertFalse(should_escalate_to_llm(
                disease="Dengue",
                confidence=0.40,
                extracted=["Dengue"],
                case_count=0,
                death_count=0,
                is_health_related=True,
                unbound_metrics=True,
            ))

    def test_unbound_metric_evidence_ignores_years_and_covid_suffix(self):
        self.assertTrue(text_has_unbound_metric_evidence(
            "An Giang logged 1,240 dengue cases and 3 deaths."
        ))
        self.assertTrue(text_has_unbound_metric_evidence("Three dead from HFMD in Vietnam."))
        self.assertFalse(text_has_unbound_metric_evidence(
            "In 2026 dengue cases rose across the province."
        ))
        self.assertFalse(text_has_unbound_metric_evidence(
            "COVID-19 preparedness update with no incident total."
        ))

    def test_covid_suffix_is_not_a_case_count(self):
        headline = "Singapore monitoring rise in COVID-19 infections; current vaccine still effective."
        self.assertIsNone(_scoped_metric_count(headline, "Singapore", "cases", headline))
        self.assertEqual(extract_case_count(headline, disease="COVID-19"), 0)
        stated = "Singapore reported 42 COVID-19 cases this week."
        self.assertEqual(_scoped_metric_count(stated, "Singapore", "cases", stated), 42)
        self.assertEqual(extract_case_count(stated, disease="COVID-19"), 42)

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

    def test_named_countries_include_places_outside_asean(self):
        text = (
            "The United Kingdom reported 12 mpox cases, Lithuania reported 4, "
            "Germany reported 9, Denmark reported 2 and Latvia reported 1."
        )
        names = set(extract_named_countries(text))
        self.assertTrue({"United Kingdom", "Lithuania", "Germany", "Denmark", "Latvia"} <= names)

    def test_distinct_case_figures_ignore_a_single_death_total(self):
        self.assertEqual(distinct_case_figure_count(
            "Indonesia mencatat 39672 kasus dengan 105 kematian. Jakarta mencatat 4200 kasus."
        ), 2)
        self.assertEqual(distinct_case_figure_count(
            "Vietnam reported 6573 cases and 1 death."
        ), 1)

    def test_multi_fact_prompt_keeps_each_place_and_uses_the_larger_budget(self):
        with patch.object(config, "AGENT_ENABLED", True), patch.object(
            config, "DEEPSEEK_MAX_TOKENS", 1500
        ), patch("app.deepseek.chat_json", return_value={
            "is_health_related": True,
            "outbreak_alert": True,
            "disease_classification": "Mpox",
            "sub_events": [],
        }) as chat_json:
            validate_and_correct_events(
                text="Germany reported 12 mpox cases. Lithuania reported 4 mpox cases.",
                draft_disease="Mpox",
                review_focus=["multi-fact"],
            )
        system_prompt, _user_prompt = chat_json.call_args.args[:2]
        self.assertIn("province or city count are separate events", system_prompt)
        self.assertIn("countries outside ASEAN", system_prompt)
        self.assertIn("SENTENCE LINKS", system_prompt)
        self.assertEqual(chat_json.call_args.kwargs["max_tokens"], 1500)

    def test_cross_sentence_pronoun_keeps_the_place_from_the_previous_sentence(self):
        source = "Wabah kolera melanda Yaman. Sebanyak 1200 kasus tercatat di sana. Jerman melaporkan 4 kasus."
        self.assertEqual(
            _scoped_metric_count("Sebanyak 1200 kasus tercatat di sana.", "Yemen", "cases", source),
            1200,
        )
        self.assertIsNone(
            _scoped_metric_count("Sebanyak 1200 kasus tercatat di sana.", "Germany", "cases", source),
        )
        result = verify_ground_truth_guardrails(
            {
                "is_health_related": True,
                "disease_classification": "Cholera",
                "sub_events": [
                    {
                        "disease": "Cholera",
                        "location_name": "Yemen",
                        "country": "Yemen",
                        "case_count": 1200,
                        "death_count": 0,
                        "evidence": "Wabah kolera melanda Yaman. Sebanyak 1200 kasus tercatat di sana.",
                    }
                ],
            },
            source,
            allowed_diseases=["Cholera"],
        )
        self.assertEqual(result["sub_events"][0]["case_count"], 1200)
        self.assertEqual(result["sub_events"][0]["country"], "Yemen")

    def test_respectively_pairs_each_country_with_its_own_count(self):
        source = (
            "The United Kingdom, Lithuania and Germany have reported outbreaks. "
            "They recorded 12, 4 and 9 cases respectively."
        )
        evidence = "They recorded 12, 4 and 9 cases respectively."
        self.assertEqual(_scoped_metric_count(evidence, "United Kingdom", "cases", source), 12)
        self.assertEqual(_scoped_metric_count(evidence, "Lithuania", "cases", source), 4)
        self.assertEqual(_scoped_metric_count(evidence, "Germany", "cases", source), 9)

    def test_review_body_keeps_the_sentence_a_count_refers_to(self):
        filler = "Berita lain tanpa angka sama sekali. " * 30
        text = filler + "Wabah kolera melanda Yaman. Sebanyak 1200 kasus tercatat di sana."
        body = _compact_review_body(text, 700)
        self.assertIn("melanda Yaman", body)
        self.assertIn("di sana", body)

    def test_guardrail_keeps_country_total_and_city_count(self):
        source = (
            "Kementerian Kesehatan mencatat kasus DBD di Indonesia mencapai 39672 kasus dengan 105 kematian. "
            "DKI Jakarta mencatat 4200 kasus."
        )
        result = verify_ground_truth_guardrails(
            {
                "is_health_related": True,
                "disease_classification": "Dengue",
                "sub_events": [
                    {
                        "disease": "Dengue",
                        "location_name": "Indonesia",
                        "country": "Indonesia",
                        "case_count": 39672,
                        "death_count": 105,
                        "evidence": "Kementerian Kesehatan mencatat kasus DBD di Indonesia mencapai 39672 kasus dengan 105 kematian.",
                    },
                    {
                        "disease": "Dengue",
                        "location_name": "DKI Jakarta",
                        "country": "Indonesia",
                        "case_count": 4200,
                        "death_count": 0,
                        "evidence": "DKI Jakarta mencatat 4200 kasus.",
                    },
                ],
            },
            source,
            allowed_diseases=["Dengue"],
        )
        events = {event["location_name"]: event for event in result["sub_events"]}
        self.assertEqual(events["Indonesia"]["case_count"], 39672)
        self.assertEqual(events["Indonesia"]["death_count"], 105)
        self.assertEqual(events["DKI Jakarta"]["case_count"], 4200)

    def test_guardrail_does_not_read_health_zone_count_as_deaths(self):
        evidence = (
            "North Kivu reported 299 confirmed cases across 11 health zones, "
            "including 188 deaths."
        )
        self.assertEqual(_scoped_metric_count(evidence, "North Kivu", "cases"), 299)
        self.assertEqual(_scoped_metric_count(evidence, "North Kivu", "deaths"), 188)


if __name__ == "__main__":
    unittest.main()
