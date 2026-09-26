"""An Indonesian wire about a European outbreak is not an Indonesian event."""

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


ARTICLE = """
Jakarta - Jumlah orang yang terinfeksi wabah Salmonella di beberapa negara di Eropa sudah lebih dari 100 orang. Sekitar bulan November 2025 dan Juni 2026, 106 kasus Salmonella Stanley yang terkonfirmasi dilaporkan di 13 negara Eropa dan Inggris Raya.
Wabah ini terutama menyerang anak-anak dan dewasa muda, dengan 49 orang membutuhkan rawat inap.
Inggris memiliki jumlah pasien terbanyak yakni 29 orang, selanjutnya Lithuania 23 orang, Jerman 14 orang, dan Denmark 10 orang.
Wabah ini awalnya terdeteksi oleh Denmark dan dilaporkan ke portal pengawasan penyakit menular Eropa (EpiPulse) pada akhir Maret 2026.
Dari hasil investigasi, pasien di Denmark, Estonia, Jerman, Latvia, dan Lithuania mengonsumsi produk mi instan rasa ayam dari merek Reeva sebelum sakit.
Di Latvia, Centre for Disease Prevention and Control (SKPC) mengatakan ada tiga kasus pada anak-anak sekolah dasar, yang sakit pada bulan April dan Mei.
"""

RSS = (
    '<a href="https://news.google.com/rss/articles/CBMi5gFBVV95cUxOc2NEdiZuNnhicGZL" target="_blank">'
    "100-an Orang Kena Infeksi Salmonella, Tren Konsumsi Mi Instan Mentah Jadi Sorotan"
    "</a>&nbsp;&nbsp;<font color=\"#6f6f6f\">Pemerintah Kabupaten Aceh Barat Daya</font>"
)


class ForeignOutbreakCountTests(unittest.TestCase):
    def setUp(self):
        self._coords = dict(config.LOCATION_COORDS)
        self._countries = dict(config.LOCATION_COUNTRIES)
        self._admin2 = dict(config.LOCATION_ADMIN2)
        self._patterns = list(config.LOCATION_PATTERNS)
        self._aliases = dict(getattr(config, "LOCATION_ALIASES", {}) or {})
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
        config.LOCATION_ALIASES = self._aliases
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()
        extractors.invalidate_location_alias_cache()

    def _linker(self):
        rows = {
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
            "Jakarta": ("Indonesia", -6.2088, 106.8456),
            "Rembang": ("Indonesia", -6.7063, 111.3456),
            "Jadi": ("Indonesia", -6.7063, 111.3456),
            "Aceh Barat Daya": ("Indonesia", 3.7833, 96.8833),
            "United Kingdom": ("United Kingdom", 54.0, -2.0),
            "Germany": ("Germany", 51.1657, 10.4515),
            "Denmark": ("Denmark", 56.2639, 9.5018),
            "Lithuania": ("Lithuania", 55.1694, 23.8813),
            "Latvia": ("Latvia", 56.8796, 24.6032),
            "Estonia": ("Estonia", 58.5953, 25.0136),
        }
        config.LOCATION_COORDS = {name: (lat, lon) for name, (_, lat, lon) in rows.items()}
        config.LOCATION_COUNTRIES = {name: country for name, (country, _, _) in rows.items()}
        config.LOCATION_ADMIN2 = {}
        config.LOCATION_PATTERNS = []
        config.LOCATION_ALIASES = {"jadi": "Rembang", "mentah": "Rembang"}
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()
        return GazetteerLinker(
            coords=config.LOCATION_COORDS,
            countries=config.LOCATION_COUNTRIES,
            allow_remote=False,
        )

    def test_google_news_snippet_is_not_an_indonesian_village(self):
        cleaned = extractors.strip_embedded_markup(RSS)
        self.assertNotIn("<", cleaned)
        self.assertNotIn("http", cleaned)
        self.assertNotIn("Pemerintah Kabupaten", cleaned)
        self.assertIn("100-an Orang Kena Infeksi Salmonella", cleaned)
        self.assertEqual(extractors.extract_case_count(cleaned), 100)
        self.assertIsNone(extractors.extract_location(cleaned))
        self.assertNotEqual(extractors.extract_country_hint(cleaned, publisher="Indonesia"), "Indonesia")

    def test_european_countries_keep_their_own_counts(self):
        linker = self._linker()
        self.assertEqual(extractors.extract_case_count(ARTICLE), 106)
        self.assertNotEqual(extractors.extract_death_count(ARTICLE), 49)
        self.assertNotEqual(
            extractors.extract_country_hint(ARTICLE, publisher="Indonesia"),
            "Indonesia",
        )
        location = extractors.extract_location(ARTICLE)
        self.assertNotIn(location, {"Indonesia", "Jakarta", "Rembang", "Jadi", "Aceh Barat Daya"})
        relations = extract_metric_relations(ARTICLE, linker=linker)
        local = {
            (relation.location.name, relation.cases)
            for relation in relations
            if relation.source_scope == "article_local" and relation.cases
        }
        self.assertIn(("United Kingdom", 29), local)
        self.assertIn(("Lithuania", 23), local)
        self.assertIn(("Germany", 14), local)
        self.assertIn(("Denmark", 10), local)
        self.assertIn(("Latvia", 3), local)
        self.assertNotIn(("United Kingdom", 106), local)
        self.assertFalse(any(cases == 49 for _, cases in local))
        self.assertFalse(any(name in {"Indonesia", "Jakarta", "Rembang", "Jadi"} for name, _ in local))
        events = compose_structured_events(
            text=ARTICLE,
            primary_disease="Salmonella",
            primary_location="Indonesia",
            diseases_extracted=["Salmonella"],
            locations=[],
            case_count=0,
            death_count=0,
            primary_country="Indonesia",
            linker=linker,
            relations=relations,
        )
        counted = {
            (evt.get("location_name"), int(evt.get("case_count") or 0))
            for evt in events
            if int(evt.get("case_count") or 0) > 0
        }
        self.assertIn(("United Kingdom", 29), counted)
        self.assertIn(("Lithuania", 23), counted)
        self.assertIn(("Germany", 14), counted)
        self.assertIn(("Denmark", 10), counted)
        self.assertIn(("Latvia", 3), counted)
        self.assertFalse(any(name in {"Indonesia", "Jakarta", "Rembang", "Jadi"} for name, _ in counted))
        self.assertFalse(any(deaths == 49 or cases == 49 for (_, cases), deaths in (
            ((evt.get("location_name"), int(evt.get("case_count") or 0)), int(evt.get("death_count") or 0))
            for evt in events
        )))


if __name__ == "__main__":
    unittest.main()
