import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import config, extractors
from app.disease_master import project_disease_master_output
from app.multi_event_extractor import (
    _collapse_same_country_events,
    _validate_location,
    compose_structured_events,
)
from app.surveillance_extraction import GazetteerLinker, extract_metric_relations


class RuntimeStructuredExtractionPlanTests(unittest.TestCase):
    def test_multi_disease_candidates_are_retained_in_one_scan(self):
        concepts = [
            {
                "canonical_name": "Dengue",
                "english_name": "Dengue fever",
                "aliases": [{"alias": "DBD"}],
            },
            {
                "canonical_name": "Chikungunya",
                "english_name": "Chikungunya virus disease",
                "aliases": [{"alias": "chikungunya"}],
            },
        ]
        self.assertEqual(
            extractors.extract_disease_mentions(
                "Dengue and chikungunya cases were reported in Thailand.", concepts
            ),
            ["Chikungunya", "Dengue"],
        )

    def test_country_hint_ignores_short_english_stopword_alias(self):
        self.assertIsNone(extractors.extract_country_hint("As of this week, cases rose."))

    def test_unresolved_candidate_is_not_erased_by_master_projection(self):
        projection = project_disease_master_output(
            primary="Dengue",
            extracted=["Dengue", "Emerging fever"],
            mentions=[
                {"canonical_name": "Dengue", "disease_id": "DENGUE", "role": "primary"},
                {"canonical_name": "Emerging fever", "disease_id": None, "role": "secondary"},
            ],
        )
        self.assertEqual(projection["primary"], "Dengue")
        self.assertEqual(projection["extracted"], ["Dengue", "Emerging fever"])
        self.assertEqual(projection["unresolved_indexes"], [1])

    def test_relation_keeps_location_specific_case_and_death_metrics(self):
        self.assertEqual(
            extractors.extract_country_hint(
                "6,757 confirmed cases and 3,267 deaths in DRC."
            ),
            "Democratic Republic of the Congo",
        )
        coords = {
            "North Kivu": (0.2, 29.0),
            "South Kivu": (-2.5, 28.8),
            "Democratic Republic of the Congo": (-2.9, 23.6),
        }
        countries = {
            "North Kivu": "Democratic Republic of the Congo",
            "South Kivu": "Democratic Republic of the Congo",
            "Democratic Republic of the Congo": "Democratic Republic of the Congo",
        }
        linker = GazetteerLinker(coords=coords, countries=countries, allow_remote=False)
        text = (
            "Ebola outbreaks were reported in North Kivu and South Kivu. "
            "North Kivu recorded 100 cases and 20 deaths. "
            "South Kivu recorded 50 cases and 5 deaths."
        )
        relations = extract_metric_relations(text, linker=linker)
        values = {
            relation.location.name: (relation.cases, relation.deaths)
            for relation in relations
            if relation.cases or relation.deaths is not None
        }
        self.assertEqual(values["North Kivu"], (100, 20))
        self.assertEqual(values["South Kivu"], (50, 5))

    def test_multi_event_projection_does_not_collapse_regional_rows(self):
        events = [
            {
                "disease": "Ebola",
                "location_name": "North Kivu",
                "country": "Democratic Republic of the Congo",
                "case_count": 100,
                "death_count": 20,
            },
            {
                "disease": "Ebola",
                "location_name": "South Kivu",
                "country": "Democratic Republic of the Congo",
                "case_count": 50,
                "death_count": 5,
            },
        ]
        projected = _collapse_same_country_events(events)
        self.assertEqual(
            {(item["location_name"], item["case_count"], item["death_count"]) for item in projected},
            {("North Kivu", 100, 20), ("South Kivu", 50, 5)},
        )

    def test_country_total_folds_provincial_breakdown_into_admin1(self):
        events = [
            {
                "disease": "Dengue",
                "location_name": "Indonesia",
                "country": "Indonesia",
                "case_count": 309786,
                "death_count": 0,
            },
            {
                "disease": "Dengue",
                "location_name": "Jawa Barat",
                "country": "Indonesia",
                "admin1": "Jawa Barat",
                "case_count": 63748,
                "death_count": 0,
            },
            {
                "disease": "Dengue",
                "location_name": "Jawa Timur",
                "country": "Indonesia",
                "admin1": "Jawa Timur",
                "case_count": 41037,
                "death_count": 0,
            },
            {
                "disease": "Dengue",
                "location_name": "Jawa Barat",
                "country": "Indonesia",
                "case_count": 309786,
                "death_count": 0,
            },
        ]
        projected = _collapse_same_country_events(events)
        self.assertEqual(len(projected), 1)
        self.assertEqual(projected[0]["location_name"], "Indonesia")
        self.assertEqual(projected[0]["case_count"], 309786)
        self.assertEqual(projected[0]["admin1"], "Jawa Barat; Jawa Timur")

    def test_relative_and_historical_windows_do_not_fold_into_current(self):
        events = [
            {
                "disease": "Dengue",
                "location_name": "Indonesia",
                "country": "Indonesia",
                "case_count": 5000,
                "death_count": 0,
                "temporal_context": "cumulative",
                "event_date_start": "2026-01-01",
                "event_date_end": "2026-09-26",
            },
            {
                "disease": "Dengue",
                "location_name": "Indonesia",
                "country": "Indonesia",
                "case_count": 0,
                "death_count": 12,
                "temporal_context": "monthly",
                "event_date_start": "2026-06-26",
                "event_date_end": "2026-06-26",
            },
            {
                "disease": "Dengue",
                "location_name": "Indonesia",
                "country": "Indonesia",
                "case_count": 2000,
                "death_count": 0,
                "temporal_context": "historical",
                "event_date_start": "2023-01-01",
                "event_date_end": "2023-12-31",
            },
        ]
        projected = _collapse_same_country_events(events)
        dated = {
            (int(item["case_count"] or 0), int(item["death_count"] or 0), item.get("event_date_start"))
            for item in projected
        }
        self.assertEqual(
            dated,
            {(5000, 0, "2026-01-01"), (0, 12, "2026-06-26"), (2000, 0, "2023-01-01")},
        )

    def test_route_adapters_keep_shared_nlp_endpoint_contract(self):
        path = Path(__file__).resolve()
        repo_root = next(
            (parent for parent in path.parents if (parent / "services/collector-python/app/crawl_jobs.py").exists()),
            None,
        )
        if repo_root is None:
            self.skipTest("repository source tree is not mounted in this runtime")
        services_root = repo_root / "services"
        collector = (services_root / "collector-python/app/crawl_jobs.py").read_text(encoding="utf-8")
        worker = (services_root / "worker-python/app/analysis_jobs.py").read_text(encoding="utf-8")
        matrix = (services_root / "worker-python/app/crawl_matrix_jobs.py").read_text(encoding="utf-8")
        self.assertIn("/nlp/analyze/surveillance", collector)
        self.assertIn("/nlp/analyze/raw", worker)
        self.assertIn("/nlp/analyze/raw", matrix)
        self.assertIn("pipeline.run", (repo_root / "services/nlp-python/app/main.py").read_text(encoding="utf-8"))

    def test_large_gazetteer_repeated_hierarchy_resolution_uses_index_and_cache(self):
        config.ensure_location_registry_loaded()
        self.assertGreaterEqual(len(config.LOCATION_COORDS), 13_000)
        candidates = list(config.LOCATION_COORDS)[:3]
        extractors.invalidate_location_alias_cache()
        extractors.folded_location_index()
        aliases = extractors.active_location_aliases()
        expected_canonical = [
            aliases.get(candidate.casefold()) or extractors.COUNTRY_ALIASES.get(candidate.casefold()) or candidate
            for candidate in candidates
        ]

        with patch.object(
            extractors,
            "_fold_location_text",
            wraps=extractors._fold_location_text,
        ) as folded:
            results = [
                extractors.resolve_location_hierarchy(candidate)
                for candidate in candidates
                for _ in range(4)
            ]

        self.assertEqual(len(results), 12)
        self.assertEqual(
            [item["canonical_name"] for item in results[::4]],
            expected_canonical,
        )
        self.assertLess(
            folded.call_count,
            100,
            "repeated hierarchy resolution must not rescan the full gazetteer",
        )

    def test_validate_location_does_not_require_linear_hierarchy_scan(self):
        candidate = next(iter(config.LOCATION_COORDS))
        with patch.object(
            extractors,
            "resolve_location_hierarchy",
            side_effect=AssertionError("linear hierarchy resolver called"),
        ):
            self.assertEqual(_validate_location(candidate), candidate)

    def test_compose_builds_atomic_events_once(self):
        from app import intelligence

        with patch.object(intelligence, "build_atomic_events", return_value=[]) as builder:
            compose_structured_events(
                text="Dengue cases were reported in Jakarta.",
                primary_disease="Dengue",
                primary_location="Jakarta",
                diseases_extracted=["Dengue"],
                locations=[],
                case_count=10,
                death_count=1,
                relations=[],
            )
        self.assertEqual(builder.call_count, 1)


if __name__ == "__main__":
    unittest.main()
