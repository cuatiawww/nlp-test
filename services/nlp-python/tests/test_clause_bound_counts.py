"""Clause-level counts stay on their own places, in more than one language."""

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


BBC_MUMPS = """
Schools in Kota Bandung closed for several days after students fell ill.
Gondongan menyebar di Jawa Timur, dengan 2.001 kasus di Kabupaten Malang, 215 kasus di Kota Kediri, 907 kasus di Banyuwangi dan 1.596 di Jombang.
Secara global, gondongan merupakan penyakit endemik di seluruh dunia. Rata-rata lebih dari 500.000 kasus gondongan dilaporkan ke Organisasi Kesehatan Dunia (WHO) setiap tahunnya, termasuk Indonesia.
Vaksin MMR melindungi dari campak dan rubella.
Related: Measles outbreak reported in Papua
"""

ENGLISH_MUMPS = """
Clinics in Leeds reported 120 cases of mumps and Manchester reported 80 cases.
Worldwide, the WHO says the annual average is more than 500,000 cases each year.
Related: Measles cases climb in London
"""


class ClauseBoundCountTests(unittest.TestCase):
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
        if "Bandung" in rows:
            config.LOCATION_ADMIN2["Bandung"] = "Kota Bandung"
        config.LOCATION_PATTERNS = []
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()
        return GazetteerLinker(
            coords=config.LOCATION_COORDS,
            countries=config.LOCATION_COUNTRIES,
            allow_remote=False,
        )

    def _events(
        self,
        text: str,
        linker: GazetteerLinker,
        *,
        primary_location: str,
        primary_country: str,
    ):
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

    def test_bbc_mumps_counts_stay_on_their_places(self):
        linker = self._use_places({
            "Bandung": ("Indonesia", -6.9175, 107.6191),
            "Malang": ("Indonesia", -7.9797, 112.6304),
            "Kediri": ("Indonesia", -7.8167, 112.0105),
            "Jawa Timur": ("Indonesia", -7.5361, 112.2384),
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
        })
        diseases, relations, events = self._events(
            BBC_MUMPS, linker, primary_location="Bandung", primary_country="Indonesia",
        )
        self.assertEqual(diseases[0], "Mumps")
        local = {
            (relation.location.name, relation.cases)
            for relation in relations
            if relation.source_scope == "article_local" and relation.cases
        }
        self.assertIn(("Malang", 2001), local)
        self.assertIn(("Kediri", 215), local)
        self.assertIn(("Banyuwangi", 907), local)
        self.assertIn(("Jombang", 1596), local)
        self.assertFalse(any(cases == 500000 for _, cases in local))
        global_rows = [relation for relation in relations if relation.source_scope == "global_average"]
        self.assertTrue(global_rows)
        self.assertTrue(all(relation.cases == 0 and relation.value == 500000 for relation in global_rows))
        counted = {
            (evt.get("location_name"), int(evt.get("case_count") or 0))
            for evt in events
            if int(evt.get("case_count") or 0) > 0
        }
        self.assertIn(("Malang", 2001), counted)
        self.assertIn(("Kediri", 215), counted)
        self.assertIn(("Banyuwangi", 907), counted)
        self.assertIn(("Jombang", 1596), counted)
        self.assertNotIn(("Bandung", 2001), counted)
        self.assertFalse(any(count == 500000 for _, count in counted))
        self.assertFalse(any(evt.get("admin2") == "Kota Bandung" for evt in events))
        for evt in events:
            if int(evt.get("case_count") or 0) > 0:
                self.assertNotEqual(evt.get("disease"), "Measles")
                self.assertEqual(evt.get("disease"), "Mumps")

    def test_english_places_keep_counts_and_global_average_is_not_local(self):
        linker = self._use_places({
            "Leeds": ("United Kingdom", 53.8008, -1.5491),
            "Manchester": ("United Kingdom", 53.4808, -2.2426),
            "London": ("United Kingdom", 51.5074, -0.1278),
            "United Kingdom": ("United Kingdom", 54.0, -2.0),
        })
        diseases, relations, events = self._events(
            ENGLISH_MUMPS, linker, primary_location="London", primary_country="United Kingdom",
        )
        self.assertEqual(diseases[0], "Mumps")
        local = {
            (relation.location.name, relation.cases)
            for relation in relations
            if relation.source_scope == "article_local" and relation.cases
        }
        self.assertIn(("Leeds", 120), local)
        self.assertIn(("Manchester", 80), local)
        self.assertFalse(any(cases == 500000 for _, cases in local))
        global_rows = [relation for relation in relations if relation.source_scope == "global_average"]
        self.assertTrue(global_rows)
        self.assertTrue(all(relation.cases == 0 for relation in global_rows))
        counted = {
            (evt.get("location_name"), int(evt.get("case_count") or 0))
            for evt in events
            if int(evt.get("case_count") or 0) > 0
        }
        self.assertIn(("Leeds", 120), counted)
        self.assertIn(("Manchester", 80), counted)
        self.assertNotIn(("London", 120), counted)
        self.assertNotIn(("London", 80), counted)
        self.assertFalse(any(count == 500000 for _, count in counted))
        for evt in events:
            if int(evt.get("case_count") or 0) > 0:
                self.assertEqual(evt.get("disease"), "Mumps")


if __name__ == "__main__":
    unittest.main()
