"""Fase 3: disease–metric–location binding contract."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.multi_event_extractor import compose_structured_events
from app.surveillance_extraction import (
    GazetteerLinker,
    _METRIC_PATTERN_CACHE,
    _RELATION_PATTERN_CACHE,
    extract_metric_relations,
)


JOHOR_DENGGI = """
Kementerian Kesihatan Malaysia melaporkan 11,403 kes denggi di Johor Bahru minggu ini.
Sebanyak 3 kematian dicatat di hospital negeri.
Populasi penduduk Johor Bahru seramai 1,800,000 orang.
Sebanyak 200 responden tinjauan mengatakan mereka prihatin.
"""

SORONG_KIDS = """
Sebanyak 6 kasus gondongan pada anak-anak di Kota Sorong.
Tidak ada kematian yang dilaporkan.
"""

HISTORICAL_VS_ACTIVE = """
Pada tahun 2019, Malaysia mencatat 50,000 kes denggi.
Minggu ini, 120 kes denggi dilaporkan di Johor Bahru.
"""

MULTI_LOC = """
Terdapat 100 kes denggi di Johor Bahru dan 80 kes denggi di Melaka.
"""


class DiseaseMetricLocationBindingTests(unittest.TestCase):
    def setUp(self):
        self._coords = dict(config.LOCATION_COORDS)
        self._countries = dict(config.LOCATION_COUNTRIES)
        self._admin2 = dict(config.LOCATION_ADMIN2)
        self._patterns = list(config.LOCATION_PATTERNS)
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()
        extractors.invalidate_location_alias_cache()

    def tearDown(self):
        config.LOCATION_COORDS = self._coords
        config.LOCATION_COUNTRIES = self._countries
        config.LOCATION_ADMIN2 = self._admin2
        config.LOCATION_PATTERNS = self._patterns
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()
        extractors.invalidate_location_alias_cache()

    def _use_places(self, rows: dict[str, tuple[str, float, float]]):
        config.LOCATION_COORDS = {name: (lat, lon) for name, (_, lat, lon) in rows.items()}
        config.LOCATION_COUNTRIES = {name: country for name, (country, _, _) in rows.items()}
        config.LOCATION_ADMIN2 = {}
        config.LOCATION_PATTERNS = []
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()
        return GazetteerLinker(
            coords=config.LOCATION_COORDS,
            countries=config.LOCATION_COUNTRIES,
            allow_remote=False,
        )

    def _events(self, text: str, linker: GazetteerLinker, *, primary_location: str, primary_country: str):
        diseases = extractors.extract_diseases(text) + extractors.extract_alias_diseases(text)
        diseases = extractors.prefer_outbreak_diseases(diseases, text)
        relations = extract_metric_relations(text, linker=linker)
        events = compose_structured_events(
            text=text,
            primary_disease=diseases[0] if diseases else "UNKNOWN",
            primary_location=primary_location,
            diseases_extracted=diseases,
            locations=[],
            case_count=0,
            death_count=0,
            primary_country=primary_country,
            linker=linker,
            relations=relations,
        )
        return diseases, relations, events

    def test_johor_bahru_denggi_binds_cases_not_population(self):
        linker = self._use_places({
            "Johor Bahru": ("Malaysia", 1.4927, 103.7414),
            "Johor": ("Malaysia", 1.4854, 103.7610),
            "Malaysia": ("Malaysia", 4.2105, 101.9758),
        })
        diseases, relations, events = self._events(
            JOHOR_DENGGI, linker, primary_location="Johor Bahru", primary_country="Malaysia",
        )
        self.assertTrue(diseases)
        self.assertEqual(diseases[0], "Dengue")
        local_cases = {
            (relation.location.name, int(relation.cases or 0))
            for relation in relations
            if getattr(relation, "source_scope", "article_local") != "global_average"
            and int(getattr(relation, "cases", 0) or 0) > 0
        }
        self.assertIn(("Johor Bahru", 11403), local_cases)
        self.assertFalse(any(cases in {1800000, 200} for _, cases in local_cases))
        counted = {
            (evt.get("location_name"), int(evt.get("case_count") or 0), int(evt.get("death_count") or 0))
            for evt in events
        }
        self.assertTrue(any(loc == "Johor Bahru" and cases == 11403 for loc, cases, _ in counted))
        for evt in events:
            if int(evt.get("case_count") or 0) == 11403:
                self.assertEqual(evt.get("disease"), "Dengue")
                self.assertNotEqual(int(evt.get("death_count") or 0), 11403)

    def test_deaths_not_equal_cases(self):
        linker = self._use_places({
            "Johor Bahru": ("Malaysia", 1.4927, 103.7414),
            "Malaysia": ("Malaysia", 4.2105, 101.9758),
        })
        _, relations, events = self._events(
            JOHOR_DENGGI, linker, primary_location="Johor Bahru", primary_country="Malaysia",
        )
        for relation in relations:
            cases = int(getattr(relation, "cases", 0) or 0)
            deaths = int(getattr(relation, "deaths", 0) or 0)
            if cases and deaths:
                self.assertNotEqual(cases, deaths)
        for evt in events:
            cases = int(evt.get("case_count") or 0)
            deaths = int(evt.get("death_count") or 0)
            if cases and deaths:
                self.assertNotEqual(cases, deaths)

    def test_sorong_six_children_gondongan(self):
        linker = self._use_places({
            "Sorong": ("Indonesia", -0.8768, 131.2558),
            "Kota Sorong": ("Indonesia", -0.8768, 131.2558),
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
        })
        diseases, relations, events = self._events(
            SORONG_KIDS, linker, primary_location="Sorong", primary_country="Indonesia",
        )
        self.assertTrue(diseases)
        self.assertEqual(diseases[0], "Mumps")
        local = {
            (relation.location.name, int(relation.cases or 0))
            for relation in relations
            if int(getattr(relation, "cases", 0) or 0) > 0
        }
        self.assertTrue(
            any(cases == 6 for _, cases in local)
            or any(int(e.get("case_count") or 0) == 6 for e in events)
        )

    def test_historical_not_collapsed_into_active(self):
        linker = self._use_places({
            "Johor Bahru": ("Malaysia", 1.4927, 103.7414),
            "Malaysia": ("Malaysia", 4.2105, 101.9758),
        })
        _, relations, events = self._events(
            HISTORICAL_VS_ACTIVE, linker, primary_location="Johor Bahru", primary_country="Malaysia",
        )
        counted = {(e.get("location_name"), int(e.get("case_count") or 0)) for e in events}
        self.assertTrue(
            any(int(getattr(r, "cases", 0) or 0) == 120 for r in relations)
            or any(cases == 120 for _, cases in counted)
        )
        johor_active = [cases for loc, cases in counted if loc == "Johor Bahru"]
        if johor_active:
            self.assertNotEqual(johor_active[0], 50000)

    def test_multi_location_yields_multi_event(self):
        linker = self._use_places({
            "Johor Bahru": ("Malaysia", 1.4927, 103.7414),
            "Melaka": ("Malaysia", 2.1896, 102.2501),
            "Malaysia": ("Malaysia", 4.2105, 101.9758),
        })
        _, relations, events = self._events(
            MULTI_LOC, linker, primary_location="Johor Bahru", primary_country="Malaysia",
        )
        local = {
            (relation.location.name, int(relation.cases or 0))
            for relation in relations
            if int(getattr(relation, "cases", 0) or 0) > 0
        }
        self.assertIn(("Johor Bahru", 100), local)
        self.assertIn(("Melaka", 80), local)
        counted = {
            (evt.get("location_name"), int(evt.get("case_count") or 0))
            for evt in events
            if int(evt.get("case_count") or 0) > 0
        }
        self.assertGreaterEqual(len(counted), 2)
        self.assertIn(("Johor Bahru", 100), counted)
        self.assertIn(("Melaka", 80), counted)


if __name__ == "__main__":
    unittest.main()
