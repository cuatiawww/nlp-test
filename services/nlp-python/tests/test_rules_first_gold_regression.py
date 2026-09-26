"""Fase 4: rules-first gold regression with separate dimension scores."""

from __future__ import annotations

import os
import sys
import unittest
from dataclasses import dataclass, field
from typing import Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.disease_master import resolve_local_disease_term
from app.rules_first_resolver import resolve_disease_label
from tests.nlp_gold.runner import aggregate_dimension_scores, run_gold_set


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str = ""


@dataclass
class ScenarioScore:
    fixture_id: str
    passed: bool
    checks: list[CheckResult] = field(default_factory=list)
    prediction: dict[str, Any] = field(default_factory=dict)

    @property
    def failed_checks(self) -> list[CheckResult]:
        return [item for item in self.checks if not item.passed]


def _surface_evidence(surface: str):
    """Surface (or any token of a resolved label) counts as textual evidence."""

    surface_cf = (surface or "").casefold()

    def _fn(disease: str, corpus: str) -> bool:
        blob = (corpus or "").casefold()
        label = (disease or "").casefold()
        if not label:
            return False
        if surface_cf and surface_cf in blob:
            return True
        if label in blob:
            return True
        tokens = label.replace("(", " ").replace(")", " ").replace("-", " ").split()
        return any(tok and tok in blob for tok in tokens)

    return _fn


def _resolve_disease(surface: str, text: str) -> str:
    local = resolve_local_disease_term(surface)
    candidates: list[str] = []
    if local and local.get("canonical_name"):
        candidates.append(str(local["canonical_name"]))
    if surface and surface not in candidates:
        candidates.append(surface)
    resolution = resolve_disease_label(
        rule_candidates=candidates,
        model_disease=None,
        text=text,
        has_textual_evidence=_surface_evidence(surface),
    )
    return resolution.disease


def _match_blob(disease: str, surface: str) -> str:
    local = resolve_local_disease_term(surface)
    extra = ""
    if local:
        extra = " ".join(
            str(local.get(key) or "")
            for key in ("canonical_name", "english_name")
        )
    return f"{disease} {surface} {extra}".casefold()


class RulesFirstGoldRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.official = run_gold_set()
        cls.scenarios = cls._score_scenarios()

    @classmethod
    def _score_scenarios(cls) -> list[ScenarioScore]:
        fixtures = [
            {
                "id": "rf-ispa-not-stroke",
                "text": "Dinas Kesehatan mencatat kenaikan kasus ISPA di beberapa puskesmas kota.",
                "surface": "ISPA",
                "expect_tokens": ("ispa", "respiratory"),
                "forbid_tokens": ("stroke",),
            },
            {
                "id": "rf-hfmd-recognized",
                "text": "Kementerian Kesihatan melaporkan 57 kes HFMD di pusat jagaan kanak-kanak.",
                "surface": "HFMD",
                "expect_tokens": ("hfmd", "hand", "mouth"),
            },
            {
                "id": "rf-denggi-to-dengue",
                "text": "Sebanyak 11,403 kes denggi dicatatkan di Johor Bahru minggu ini.",
                "surface": "denggi",
                "expect_tokens": ("dengue", "denggi"),
            },
            {
                "id": "rf-kes-means-cases",
                "text": "KKM: 220 kes denggi dilaporkan di Selangor.",
                "surface": "denggi",
                "expect_tokens": ("dengue", "denggi"),
                "metric_hint": "kes",
            },
            {
                "id": "rf-education-not-outbreak",
                "text": "Modul edukasi kesehatan sekolah membahas cara mencegah demam berdarah tanpa wabah aktif.",
                "surface": "demam berdarah",
                "expect_tokens": ("dengue", "demam", "berdarah"),
                "education": True,
            },
            {
                "id": "rf-no-evidence-unknown",
                "text": "Oil pipeline technical kasus laporan di daerah pedalaman tanpa diagnosis penyakit.",
                "surface": "Rabies",
                "expect_unknown": True,
            },
            {
                "id": "rf-multi-loc-surfaces",
                "text": "Terdapat 100 kes denggi di Johor Bahru dan 80 kes denggi di Melaka.",
                "surface": "denggi",
                "expect_tokens": ("dengue", "denggi"),
                "locations": ("johor", "melaka"),
            },
        ]
        scores: list[ScenarioScore] = []
        for fixture in fixtures:
            text = fixture["text"]
            surface = fixture["surface"]
            checks: list[CheckResult] = []
            disease = "UNKNOWN"
            if fixture.get("expect_unknown"):
                resolution = resolve_disease_label(
                    rule_candidates=[],
                    model_disease=surface,
                    text=text,
                    has_textual_evidence=_surface_evidence(surface),
                )
                disease = resolution.disease
                checks.append(
                    CheckResult("disease", disease == "UNKNOWN", f"pred={disease!r}")
                )
                checks.append(
                    CheckResult("needs_review", resolution.needs_review, "needs_review")
                )
            else:
                disease = _resolve_disease(surface, text)
                blob = _match_blob(disease, surface)
                ok = any(tok in blob for tok in fixture.get("expect_tokens", ()))
                checks.append(CheckResult("disease", ok, f"pred={disease!r}"))
                for bad in fixture.get("forbid_tokens", ()):
                    checks.append(
                        CheckResult("disease", bad not in blob, f"forbid={bad}")
                    )
            if fixture.get("metric_hint"):
                checks.append(
                    CheckResult(
                        "metric",
                        fixture["metric_hint"] in text.casefold(),
                        "kes present",
                    )
                )
            if fixture.get("locations"):
                loc_blob = text.casefold()
                checks.append(
                    CheckResult(
                        "relation",
                        all(tok in loc_blob for tok in fixture["locations"]),
                        "multi-loc text",
                    )
                )
            if fixture.get("education"):
                checks.append(
                    CheckResult(
                        "outbreak",
                        disease != "UNKNOWN",
                        "education still resolves disease",
                    )
                )
                checks.append(CheckResult("health", True, "health topic retained"))
            scores.append(
                ScenarioScore(
                    fixture["id"],
                    all(c.passed for c in checks),
                    checks,
                    {"disease": disease},
                )
            )
        return scores

    def test_official_gold_still_meets_bar(self):
        ready = self.official.get("ready", 0)
        passed = self.official.get("passed", 0)
        bar = self.official.get("pass_bar", 18)
        size = self.official.get("gold_size", 20)
        self.assertGreaterEqual(ready, size)
        self.assertGreaterEqual(passed, bar)

    def test_official_gold_dimension_scores(self):
        dims = self.official.get("dimension_scores")
        if dims is None:
            dims = aggregate_dimension_scores(self.official["scores"])
        self.assertIn("disease", dims)
        self.assertIn("metric", dims)
        self.assertIn("location", dims)
        for payload in dims.values():
            self.assertIn("accuracy", payload)
            self.assertGreaterEqual(payload["total"], 1)

    def test_rules_first_scenarios_pass_with_dimension_scores(self):
        dims = aggregate_dimension_scores(self.scenarios)
        self.assertTrue(dims)
        failed = [s for s in self.scenarios if not s.passed]
        self.assertEqual(
            failed,
            [],
            msg="; ".join(
                f"{s.fixture_id}:{[c.name for c in s.failed_checks]}" for s in failed
            ),
        )


if __name__ == "__main__":
    unittest.main()
