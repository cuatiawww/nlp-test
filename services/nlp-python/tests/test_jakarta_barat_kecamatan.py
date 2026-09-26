"""Jakarta Barat sitrep: kecamatan counts stay Indonesian, month series stays local."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.admin_abbreviations import apply_admin_abbreviations, bind_document_admin_scope
from app.multi_event_extractor import compose_structured_events
from app.surveillance_extraction import (
    GazetteerLinker,
    _METRIC_PATTERN_CACHE,
    _RELATION_PATTERN_CACHE,
    extract_metric_relations,
)


ANTARA_JAKBAR = """
Jakarta (ANTARA) - Suku Dinas Kesehatan (Sudinkes) Jakarta Barat mengatakan
Kecamatan Cengkareng mencatat kasus Demam Berdarah Dengue (DBD) terbanyak di
wilayah Jakarta Barat selama 2026.

Kepala Seksi Pencegahan dan Pengendalian Penyakit Sudinkes Jakarta Barat
Arum Ambarsari menyebutkan dari 842 kasus DBD yang tercatat di wilayah
Jakarta Barat sejak 1 Januari hingga 23 April 2026, wilayah Cengkareng
melaporkan 327 kasus.

"Jadi, mulai 1 Januari-23 April 2026, di wilayah Cengkareng mencatat 327
kasus DBD, Kalideres 188, Grogol Petamburan 57, Kebon Jeruk 85, Tamansari 27,
Kembangan 65, Palmerah 46 dan Tambora 47 kasus," kata Arum saat dihubungi
ANTARA di Jakarta, Jumat.

Menurut dia, tren kasus DBD di wilayah Jakarta Barat juga menunjukkan
peningkatan, terutama sejak Januari hingga Maret 2026.

"Pada Januari itu ada 134 kasus, Februari 203, Maret 315, lalu April
(berjalan) tercatat 190 kasus," papar Arum.
"""


class JakartaBaratKecamatanTests(unittest.TestCase):
    def setUp(self):
        self._coords = dict(config.LOCATION_COORDS)
        self._countries = dict(config.LOCATION_COUNTRIES)
        self._admin1 = dict(getattr(config, "LOCATION_ADMIN1", {}) or {})
        self._admin2 = dict(getattr(config, "LOCATION_ADMIN2", {}) or {})
        self._iso3 = dict(getattr(config, "LOCATION_ISO3", {}) or {})
        self._levels = dict(getattr(config, "LOCATION_ADMIN_LEVEL", {}) or {})
        self._aliases = dict(getattr(config, "LOCATION_ALIASES", {}) or {})
        self._patterns = list(config.LOCATION_PATTERNS)
        config.LOCATION_COORDS["Kembangan"] = (1.3521, 103.7540)
        config.LOCATION_COUNTRIES["Kembangan"] = "Singapore"
        config.LOCATION_ADMIN1["Kembangan"] = "Singapore"
        config.LOCATION_ISO3["Kembangan"] = "SGP"
        config.LOCATION_COORDS["Tamansari"] = (-8.1720, 113.7020)
        config.LOCATION_COUNTRIES["Tamansari"] = "Indonesia"
        config.LOCATION_ADMIN1["Tamansari"] = "Jawa Timur"
        config.LOCATION_ADMIN2["Tamansari"] = "Jember"
        config.LOCATION_ISO3["Tamansari"] = "IDN"
        apply_admin_abbreviations()
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()
        bind_document_admin_scope(ANTARA_JAKBAR)

    def tearDown(self):
        config.LOCATION_COORDS = self._coords
        config.LOCATION_COUNTRIES = self._countries
        config.LOCATION_ADMIN1 = self._admin1
        config.LOCATION_ADMIN2 = self._admin2
        config.LOCATION_ISO3 = self._iso3
        config.LOCATION_ADMIN_LEVEL = self._levels
        config.LOCATION_ALIASES = self._aliases
        config.LOCATION_PATTERNS = self._patterns
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()
        extractors.invalidate_location_alias_cache()

    def _run(self):
        linker = GazetteerLinker(allow_remote=False)
        relations = extract_metric_relations(
            ANTARA_JAKBAR, linker=linker, published_date="2026-04-24"
        )
        events = compose_structured_events(
            text=ANTARA_JAKBAR,
            primary_disease="Dengue",
            primary_location="Jakarta Barat",
            diseases_extracted=["Dengue"],
            locations=[],
            case_count=0,
            death_count=0,
            primary_country="Indonesia",
            linker=linker,
            relations=relations,
            published_at="2026-04-24",
        )
        return relations, events

    def test_kecamatan_keep_their_own_counts_in_indonesia(self):
        relations, events = self._run()
        local = {
            (relation.location.name, relation.location.country, relation.cases)
            for relation in relations
            if relation.source_scope == "article_local" and relation.cases
        }
        self.assertIn(("Jakarta Barat", "Indonesia", 842), local)
        self.assertIn(("Cengkareng", "Indonesia", 327), local)
        self.assertIn(("Kalideres", "Indonesia", 188), local)
        self.assertIn(("Grogol Petamburan", "Indonesia", 57), local)
        self.assertIn(("Kebon Jeruk", "Indonesia", 85), local)
        self.assertIn(("Tamansari", "Indonesia", 27), local)
        self.assertIn(("Kembangan", "Indonesia", 65), local)
        self.assertIn(("Palmerah", "Indonesia", 46), local)
        self.assertIn(("Tambora", "Indonesia", 47), local)
        self.assertFalse(any(country in {"Malaysia", "Singapore"} for _, country, _ in local))
        self.assertFalse(any(cases in {1, 23} for _, _, cases in local))

        monthly = {
            relation.cases
            for relation in relations
            if relation.qualifier == "monthly"
            and relation.location.name == "Jakarta Barat"
            and relation.location.country == "Indonesia"
        }
        self.assertEqual(monthly, {134, 203, 315, 190})

        counted = {
            (evt.get("location_name"), evt.get("country"), int(evt.get("case_count") or 0))
            for evt in events
            if int(evt.get("case_count") or 0) > 0
        }
        self.assertIn(("Jakarta Barat", "Indonesia", 842), counted)
        self.assertIn(("Cengkareng", "Indonesia", 327), counted)
        self.assertIn(("Kembangan", "Indonesia", 65), counted)
        self.assertIn(("Tamansari", "Indonesia", 27), counted)
        self.assertFalse(any(country in {"Malaysia", "Singapore"} for _, country, _ in counted))

    def test_namesake_hierarchy_stays_jakarta_barat(self):
        bind_document_admin_scope(ANTARA_JAKBAR)
        kembangan = extractors.resolve_location_hierarchy("Kembangan", country_hint="Indonesia")
        self.assertEqual(kembangan["country"], "Indonesia")
        self.assertEqual(kembangan["canonical_name"], "Kembangan")
        self.assertEqual(kembangan["admin2_name"], "Jakarta Barat")
        tamansari = extractors.resolve_location_hierarchy("Tamansari", country_hint="Indonesia")
        self.assertEqual(tamansari["country"], "Indonesia")
        self.assertEqual(tamansari["admin2_name"], "Jakarta Barat")


if __name__ == "__main__":
    unittest.main()
