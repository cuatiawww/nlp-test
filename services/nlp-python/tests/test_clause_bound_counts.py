"""Clause-level counts stay on their own places, in more than one language."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.multi_event_extractor import compose_structured_events
from types import SimpleNamespace

from app.surveillance_extraction import (
    GazetteerLinker,
    _METRIC_PATTERN_CACHE,
    _RELATION_PATTERN_CACHE,
    extract_metric_relations,
    promote_country_total,
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

    def test_country_total_and_province_stay_separate_events(self):
        linker = self._use_places({
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
            "Jawa Barat": ("Indonesia", -6.9175, 107.6191),
            "Tây Java": ("Indonesia", -6.9175, 107.6191),
            "Java Occidental": ("Indonesia", -6.9175, 107.6191),
        })
        config.LOCATION_ALIASES = {
            "west java": "Jawa Barat",
            "West Java": "Jawa Barat",
        }
        linker = GazetteerLinker(
            coords=config.LOCATION_COORDS,
            countries=config.LOCATION_COUNTRIES,
            allow_remote=False,
        )
        narratives = {
            "en": (
                "Geographic Distribution of Suspected Dengue Cases in Indonesia, September 2026. "
                "According to a report from the Ministry of Health, as of the 36th epidemiological "
                "week or early September 2026, there were 309,786 suspected cases of dengue in Indonesia. "
                "During this period, West Java became the province with the most suspected dengue "
                "cases nationwide, with 63,748 cases."
            ),
            "id": (
                "Menurut laporan Kementerian Kesehatan, hingga minggu ke-36 tahun 2026, "
                "tercatat 309.786 kasus demam berdarah di Indonesia. Pada periode ini, "
                "Jawa Barat menjadi provinsi dengan kasus terbanyak secara nasional, yakni 63.748 kasus."
            ),
            "vi": (
                "Theo báo cáo, tính đến tuần dịch tễ 36 năm 2026, có 309.786 ca mắc sốt xuất huyết "
                "tại Indonesia. Trong giai đoạn này, Tây Java là tỉnh có nhiều ca nhất trên cả nước, với 63.748 ca."
            ),
            "es": (
                "Había 309.786 casos de dengue en Indonesia. "
                "Java Occidental se convirtió en la provincia con más casos, con 63.748 casos."
            ),
        }
        expected_place = {
            "en": "Jawa Barat",
            "id": "Jawa Barat",
            "vi": "Tây Java",
            "es": "Java Occidental",
        }
        for language, text in narratives.items():
            with self.subTest(language=language):
                diseases, relations, events = self._events(
                    text, linker, primary_location="Jawa Barat", primary_country="Indonesia",
                )
                self.assertEqual(diseases[0], "Dengue")
                local = {
                    (relation.location.name, relation.cases, relation.deaths)
                    for relation in relations
                    if relation.source_scope == "article_local" and relation.cases
                }
                self.assertIn(("Indonesia", 309786, None), local)
                self.assertIn((expected_place[language], 63748, None), local)
                counted = {
                    (evt.get("location_name"), int(evt.get("case_count") or 0), int(evt.get("death_count") or 0))
                    for evt in events
                    if int(evt.get("case_count") or 0) > 0
                }
                self.assertEqual(counted, {("Indonesia", 309786, 0)})
                self.assertIn(expected_place[language], str(events[0].get("admin1") or ""))
                self.assertNotIn((expected_place[language], 309786, 0), counted)
                self.assertNotIn(("Indonesia", 63748, 0), counted)
                self.assertFalse(any(deaths == 309786 for _, _, deaths in counted))

    def test_other_countries_and_cities_stay_separate_events(self):
        linker = self._use_places({
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
            "Bandung": ("Indonesia", -6.9175, 107.6191),
            "Thailand": ("Thailand", 15.8700, 100.9925),
            "Bangkok": ("Thailand", 13.7563, 100.5018),
            "Chiang Mai": ("Thailand", 18.7883, 98.9853),
            "Philippines": ("Philippines", 12.8797, 121.7740),
            "Quezon City": ("Philippines", 14.6760, 121.0437),
            "Vietnam": ("Vietnam", 14.0583, 108.2772),
            "Hanoi": ("Vietnam", 21.0278, 105.8342),
            "Nigeria": ("Nigeria", 9.0820, 8.6753),
            "Lagos": ("Nigeria", 6.5244, 3.3792),
        })
        config.LOCATION_ALIASES = {
            "filipina": "Philippines",
            "kota bandung": "Bandung",
            "việt nam": "Vietnam",
            "viet nam": "Vietnam",
            "hà nội": "Hanoi",
            "ha noi": "Hanoi",
        }
        linker = GazetteerLinker(
            coords=config.LOCATION_COORDS,
            countries=config.LOCATION_COUNTRIES,
            allow_remote=False,
        )
        narratives = [
            (
                "th-city",
                "There were 80,000 suspected cases of dengue in Thailand. During this period, "
                "Bangkok became the city with the most suspected dengue cases nationwide, with 12,400 cases.",
                [("Thailand", 80000), ("Bangkok", 12400)],
            ),
            (
                "ph-city",
                "Tercatat 54.210 kasus demam berdarah di Filipina. Quezon City menjadi kota "
                "dengan kasus terbanyak secara nasional, yakni 9.200 kasus.",
                [("Philippines", 54210), ("Quezon City", 9200)],
            ),
            (
                "id-city",
                "Tercatat 309.786 kasus demam berdarah di Indonesia. Pada periode ini, "
                "Kota Bandung menjadi kota dengan kasus terbanyak, dengan 8.421 kasus.",
                [("Indonesia", 309786), ("Bandung", 8421)],
            ),
            (
                "vn-city",
                "Có 45.000 ca mắc sốt xuất huyết tại Việt Nam. Trong giai đoạn ini, "
                "Hà Nội là thành phố có nhiều ca nhất, với 6.200 ca.",
                [("Vietnam", 45000), ("Hanoi", 6200)],
            ),
            (
                "ng-city",
                "There were 15,000 cases of dengue in Nigeria. Lagos became the city "
                "with the most cases, with 4,800 cases.",
                [("Nigeria", 15000), ("Lagos", 4800)],
            ),
            (
                "two-cities",
                "Thailand recorded 80,000 dengue cases. Bangkok reported 12,400 cases and Chiang Mai reported 3,100 cases.",
                [("Thailand", 80000), ("Bangkok", 12400), ("Chiang Mai", 3100)],
            ),
            (
                "unknown-city",
                "There were 80,000 suspected cases of dengue in Thailand. During this period, "
                "Lampang became the city with the most suspected dengue cases nationwide, with 1,200 cases.",
                [("Thailand", 80000), ("Lampang", 1200)],
            ),
        ]
        for label, text, expected in narratives:
            with self.subTest(label=label):
                _, relations, events = self._events(
                    text, linker, primary_location=expected[0][0], primary_country=expected[0][0],
                )
                local = {
                    (relation.location.name, relation.cases)
                    for relation in relations
                    if relation.source_scope == "article_local" and relation.cases
                }
                counted = {
                    (evt.get("location_name"), int(evt.get("case_count") or 0))
                    for evt in events
                    if int(evt.get("case_count") or 0) > 0 and evt.get("country")
                }
                for place, count in expected:
                    self.assertIn((place, count), local)
                country_name, country_count = expected[0]
                self.assertEqual(counted, {(country_name, country_count)})
                joined = " ".join(str(evt.get("admin1") or "") for evt in events)
                for place, count in expected[1:]:
                    if (place, count) in local and any(
                        evt.get("country") and place in str(evt.get("admin1") or "")
                        for evt in events
                    ):
                        self.assertIn(place, joined)
                    self.assertNotIn((place, country_count), counted)
                    self.assertNotIn((country_name, count), counted)

    def test_country_total_parent_drops_only_the_empty_country_row(self):
        events = [
            SimpleNamespace(location_name="Indonesia", country="Indonesia", case_count=309786, death_count=0, latitude=-2.5, longitude=118.0),
            SimpleNamespace(location_name="Indonesia", country="Indonesia", case_count=0, death_count=0, latitude=-2.5, longitude=118.0),
            SimpleNamespace(location_name="Jawa Barat", country="Indonesia", case_count=63748, death_count=0, latitude=-6.9, longitude=107.6),
        ]
        kept, country_row = promote_country_total(events)
        self.assertIs(country_row, events[0])
        self.assertEqual(
            [(evt.location_name, evt.case_count) for evt in kept],
            [("Indonesia", 309786), ("Jawa Barat", 63748)],
        )

    def test_same_count_on_country_and_province_is_not_a_split(self):
        events = [
            SimpleNamespace(location_name="Indonesia", country="Indonesia", case_count=100, death_count=0),
            SimpleNamespace(location_name="Jawa Barat", country="Indonesia", case_count=100, death_count=0),
        ]
        kept, country_row = promote_country_total(events)
        self.assertIsNone(country_row)
        self.assertEqual(kept, events)


if __name__ == "__main__":
    unittest.main()
