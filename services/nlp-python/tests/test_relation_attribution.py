"""Relation attribution stays on the local disease, place, and clause."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.intelligence import build_atomic_events, sentence_spans
from app.multi_event_extractor import _collapse_same_country_events, compose_structured_events
from app.surveillance_extraction import (
    GazetteerLinker,
    _METRIC_PATTERN_CACHE,
    _RELATION_PATTERN_CACHE,
    extract_metric_relations,
)


class RelationAttributionTests(unittest.TestCase):
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

    def _use_places(self, rows: dict[str, tuple[str, float, float]], aliases: dict[str, str] | None = None):
        config.LOCATION_COORDS = {name: (lat, lon) for name, (_, lat, lon) in rows.items()}
        config.LOCATION_COUNTRIES = {name: country for name, (country, _, _) in rows.items()}
        config.LOCATION_ADMIN2 = {}
        config.LOCATION_PATTERNS = []
        config.LOCATION_ALIASES = dict(aliases or {})
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
        published_at: str | None = None,
    ):
        diseases = extractors.extract_diseases(text) + extractors.extract_alias_diseases(text)
        diseases = extractors.prefer_outbreak_diseases(diseases, text)
        relations = extract_metric_relations(text, linker=linker, published_date=published_at)
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
            published_at=published_at,
        )
        return diseases, relations, events

    def _local_cases(self, relations):
        return {
            (relation.location.name, int(relation.cases or 0))
            for relation in relations
            if getattr(relation, "source_scope", "article_local") == "article_local"
            and int(getattr(relation, "cases", 0) or 0) > 0
        }

    def test_contrastive_connectives_keep_country_metrics_apart(self):
        linker = self._use_places({
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
            "Vietnam": ("Vietnam", 14.0583, 108.2772),
        }, aliases={"việt nam": "Vietnam", "viet nam": "Vietnam"})
        narratives = {
            "id": (
                "Indonesia mencatat 1.200 kasus demam berdarah, "
                "sementara itu Vietnam mencatat 800 kasus."
            ),
            "en": (
                "Indonesia reported 1,200 dengue cases. "
                "Meanwhile Vietnam recorded 800 cases."
            ),
            "vi": (
                "Indonesia ghi nhận 1.200 ca sốt xuất huyết, "
                "trong khi đó Việt Nam ghi nhận 800 ca."
            ),
        }
        for language, text in narratives.items():
            with self.subTest(language=language):
                _, relations, events = self._events(
                    text, linker, primary_location="Indonesia", primary_country="Indonesia",
                )
                local = self._local_cases(relations)
                self.assertIn(("Indonesia", 1200), local)
                self.assertIn(("Vietnam", 800), local)
                counted = {
                    (evt.get("location_name"), int(evt.get("case_count") or 0))
                    for evt in events
                    if int(evt.get("case_count") or 0) > 0
                }
                self.assertIn(("Indonesia", 1200), counted)
                self.assertIn(("Vietnam", 800), counted)
                self.assertNotIn(("Indonesia", 800), counted)
                self.assertNotIn(("Vietnam", 1200), counted)
                clauses = [value for _, _, value in sentence_spans(text)]
                self.assertGreaterEqual(len(clauses), 2)

    def test_native_thai_binds_bangkok_cases_and_deaths(self):
        linker = self._use_places({
            "Bangkok": ("Thailand", 13.7563, 100.5018),
            "Thailand": ("Thailand", 15.8700, 100.9925),
        }, aliases={"กรุงเทพมหานคร": "Bangkok"})
        text = (
            "กระทรวงสาธารณสุขรายงานผู้ป่วยไข้เลือดออก 45 รายในกรุงเทพมหานคร "
            "และมีผู้เสียชีวิต 15 ราย"
        )
        _, relations, events = self._events(
            text, linker, primary_location="Bangkok", primary_country="Thailand",
        )
        local = self._local_cases(relations)
        self.assertIn(("Bangkok", 45), local)
        death_rows = [
            relation for relation in relations
            if relation.location.name == "Bangkok" and relation.deaths
        ]
        self.assertTrue(any(int(relation.deaths or 0) == 15 for relation in death_rows))
        counted = {
            (evt.get("location_name"), int(evt.get("case_count") or 0), int(evt.get("death_count") or 0))
            for evt in events
        }
        self.assertTrue(any(loc == "Bangkok" and cases == 45 for loc, cases, _ in counted))
        self.assertFalse(any(deaths == 45 for _, _, deaths in counted))

    def test_vietnamese_and_tagalog_locatives_bind_city_counts(self):
        linker = self._use_places({
            "Hanoi": ("Vietnam", 21.0278, 105.8342),
            "Vietnam": ("Vietnam", 14.0583, 108.2772),
            "Quezon City": ("Philippines", 14.6760, 121.0437),
            "Philippines": ("Philippines", 12.8797, 121.7740),
        }, aliases={"hà nội": "Hanoi", "ha noi": "Hanoi"})
        cases = [
            (
                "vi",
                "Bộ Y tế báo cáo 27 ca sốt xuất huyết tại Hà Nội.",
                ("Hanoi", 27),
                "Vietnam",
            ),
            (
                "tl",
                "Nag-ulat ang Department of Health ng 9,200 kaso ng dengue sa Quezon City.",
                ("Quezon City", 9200),
                "Philippines",
            ),
        ]
        for language, text, expected, country in cases:
            with self.subTest(language=language):
                _, relations, events = self._events(
                    text, linker, primary_location=expected[0], primary_country=country,
                )
                self.assertIn(expected, self._local_cases(relations))
                counted = {
                    (evt.get("location_name"), int(evt.get("case_count") or 0))
                    for evt in events
                    if int(evt.get("case_count") or 0) > 0
                }
                self.assertIn(expected, counted)

    def test_new_and_cumulative_stay_separate_metrics(self):
        linker = self._use_places({
            "Hanoi": ("Vietnam", 21.0278, 105.8342),
            "Vietnam": ("Vietnam", 14.0583, 108.2772),
        }, aliases={"hà nội": "Hanoi"})
        text = (
            "Hà Nội ghi nhận 27 ca mắc mới sốt xuất huyết. "
            "Tổng tích lũy là 1.450 ca mắc."
        )
        _, relations, _ = self._events(
            text, linker, primary_location="Hanoi", primary_country="Vietnam",
        )
        hanoi = [relation for relation in relations if relation.location.name == "Hanoi"]
        values = {int(relation.cases or 0) for relation in hanoi if relation.cases}
        self.assertIn(27, values)
        self.assertIn(1450, values)
        qualifiers = {relation.qualifier for relation in hanoi if relation.cases}
        self.assertTrue(any(item == "new" for item in qualifiers))
        self.assertTrue(any(item == "cumulative" for item in qualifiers))

    def test_explicit_zero_deaths_stay_on_the_named_city(self):
        linker = self._use_places({
            "Hanoi": ("Vietnam", 21.0278, 105.8342),
            "Ho Chi Minh City": ("Vietnam", 10.8231, 106.6297),
            "Vietnam": ("Vietnam", 14.0583, 108.2772),
        }, aliases={"hà nội": "Hanoi"})
        text = (
            "Hà Nội ghi nhận 27 ca sốt xuất huyết. Không có tử vong. "
            "Thành phố Hồ Chí Minh ghi nhận 40 ca và 2 tử vong."
        )
        events = build_atomic_events(text, disease_labels=["Dengue"], linker=linker)
        by_place = {
            evt.get("location_name"): (int(evt.get("case_count") or 0), int(evt.get("death_count") or 0))
            for evt in events
        }
        self.assertEqual(by_place.get("Hanoi", (0, None))[0], 27)
        self.assertEqual(by_place.get("Hanoi", (None, None))[1], 0)
        hcmc = next(
            (
                (int(evt.get("case_count") or 0), int(evt.get("death_count") or 0))
                for evt in events
                if "Ho Chi Minh" in str(evt.get("location_name") or "")
            ),
            None,
        )
        if hcmc:
            self.assertEqual(hcmc[1], 2)
            self.assertNotEqual(hcmc[0], 27)

    def test_indonesia_national_total_is_not_west_java(self):
        linker = self._use_places({
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
            "Jawa Barat": ("Indonesia", -6.9175, 107.6191),
            "Jawa Timur": ("Indonesia", -7.5361, 112.2384),
            "Jawa Tengah": ("Indonesia", -7.1509, 110.1403),
            "Banten": ("Indonesia", -6.4058, 106.0640),
        }, aliases={
            "west java": "Jawa Barat",
            "east java": "Jawa Timur",
            "central java": "Jawa Tengah",
        })
        text = (
            "According to a report from the Ministry of Health (Kemenkes), as of the 36th "
            "epidemiological week or early September 2026, there were 309,786 suspected "
            "cases of dengue in Indonesia. During this period, West Java became the "
            "province with the most suspected dengue cases nationwide, with 63,748 cases. "
            "This was followed by East Java with 41,037 cases and Central Java with "
            "37,518 cases. Here is a list of the 10 provinces with the most suspected "
            "dengue cases nationwide, as of September 19, 2026 at 10:00 WIB: "
            "West Java: 63,748 cases; East Java: 41,037 cases; Central Java: 37,518 cases; "
            "Banten: 30,887 cases."
        )
        _, relations, events = self._events(
            text, linker, primary_location="Indonesia", primary_country="Indonesia",
        )
        local = self._local_cases(relations)
        self.assertIn(("Indonesia", 309786), local)
        self.assertIn(("Jawa Barat", 63748), local)
        self.assertIn(("Jawa Timur", 41037), local)
        self.assertNotIn(("Jawa Barat", 309786), local)
        self.assertFalse(any(cases == 10 for _, cases in local))
        counted = {
            (evt.get("location_name"), int(evt.get("case_count") or 0))
            for evt in events
            if int(evt.get("case_count") or 0) > 0
        }
        self.assertEqual(counted, {("Indonesia", 309786)})
        self.assertNotIn(("Jawa Barat", 309786), counted)
        provinces = str(events[0].get("admin1") or "")
        self.assertIn("Jawa Barat", provinces)
        self.assertIn("Jawa Timur", provinces)
        self.assertIn(";", provinces)
        projected = _collapse_same_country_events(events)
        self.assertEqual(len(projected), 1)
        self.assertEqual(projected[0]["location_name"], "Indonesia")
        self.assertEqual(int(projected[0]["case_count"] or 0), 309786)
        self.assertIn("Jawa Barat", str(projected[0].get("admin1") or ""))

    def test_global_average_without_country_counts_stays_one_global_event(self):
        linker = self._use_places({
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
            "Vietnam": ("Vietnam", 14.0583, 108.2772),
            "Thailand": ("Thailand", 15.8700, 100.9925),
        }, aliases={"việt nam": "Vietnam"})
        narratives = {
            "en": (
                "There are 200,000 dengue cases worldwide on average each year. "
                "The disease is present in Indonesia, Vietnam, and Thailand."
            ),
            "id": (
                "Rata-rata terdapat 200.000 kasus demam berdarah secara global setiap tahun. "
                "Penyakit ini ada di Indonesia, Vietnam, dan Thailand."
            ),
        }
        for language, text in narratives.items():
            with self.subTest(language=language):
                _, relations, events = self._events(
                    text, linker, primary_location="Indonesia", primary_country="Indonesia",
                )
                local = self._local_cases(relations)
                self.assertFalse(any(cases == 200000 for _, cases in local))
                self.assertEqual(len(events), 1)
                self.assertEqual(events[0].get("location_name"), "Global")
                self.assertEqual(int(events[0].get("case_count") or 0), 200000)
                listed = str(events[0].get("country") or "")
                self.assertIn("Indonesia", listed)
                self.assertIn("Vietnam", listed)
                self.assertIn("Thailand", listed)
                self.assertIn(";", listed)
                self.assertFalse(events[0].get("admin1"))
                self.assertNotIn(("Indonesia", 200000), {
                    (evt.get("location_name"), int(evt.get("case_count") or 0))
                    for evt in events
                })

    def test_unrelated_country_mention_is_not_a_case_country(self):
        linker = self._use_places({
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
            "Vietnam": ("Vietnam", 14.0583, 108.2772),
            "Thailand": ("Thailand", 15.8700, 100.9925),
            "Japan": ("Japan", 36.2048, 138.2529),
        })
        text = (
            "There are 200,000 dengue cases worldwide on average each year. "
            "The disease is present in Indonesia and Vietnam. "
            "Officials later flew to Japan for a trade meeting. "
            "Tourism in Thailand is recovering."
        )
        _, _, events = self._events(
            text, linker, primary_location="Indonesia", primary_country="Indonesia",
        )
        self.assertEqual(len(events), 1)
        listed = str(events[0].get("country") or "")
        self.assertIn("Indonesia", listed)
        self.assertIn("Vietnam", listed)
        self.assertNotIn("Japan", listed)
        self.assertNotIn("Thailand", listed)

    def test_global_average_does_not_swallow_country_totals(self):
        linker = self._use_places({
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
            "Vietnam": ("Vietnam", 14.0583, 108.2772),
        })
        text = (
            "Worldwide there are 200,000 dengue cases each year. "
            "Indonesia recorded 5,000 cases. Vietnam recorded 3,000 cases."
        )
        _, _, events = self._events(
            text, linker, primary_location="Indonesia", primary_country="Indonesia",
        )
        counted = {
            (evt.get("location_name"), int(evt.get("case_count") or 0))
            for evt in events
            if int(evt.get("case_count") or 0) > 0
        }
        self.assertIn(("Indonesia", 5000), counted)
        self.assertIn(("Vietnam", 3000), counted)
        self.assertNotIn(("Indonesia", 200000), counted)
        self.assertNotIn(("Vietnam", 200000), counted)

    def test_two_diseases_in_one_city_do_not_share_one_count(self):
        linker = self._use_places({
            "Jakarta": ("Indonesia", -6.2088, 106.8456),
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
        })
        text = "Di Jakarta tercatat 100 kasus dengue dan 40 kasus chikungunya."
        _, relations, events = self._events(
            text, linker, primary_location="Jakarta", primary_country="Indonesia",
        )
        local = {
            (relation.disease, relation.location.name, int(relation.cases or 0))
            for relation in relations
            if relation.cases
        }
        self.assertIn(("Dengue", "Jakarta", 100), local)
        self.assertIn(("Chikungunya", "Jakarta", 40), local)
        counted = {
            (evt.get("disease"), evt.get("location_name"), int(evt.get("case_count") or 0))
            for evt in events
            if int(evt.get("case_count") or 0) > 0
        }
        self.assertIn(("Dengue", "Jakarta", 100), counted)
        self.assertIn(("Chikungunya", "Jakarta", 40), counted)
        self.assertNotIn(("Dengue", "Jakarta", 40), counted)
        self.assertNotIn(("Chikungunya", "Jakarta", 100), counted)

    def test_relative_and_year_windows_are_separate_events(self):
        linker = self._use_places({
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
        })
        published = "2026-09-26"
        narratives = {
            "id": (
                "Indonesia mencatat 5.000 kasus dengue sepanjang tahun ini. "
                "Tiga bulan yang lalu tercatat 12 kematian dengue di Indonesia. "
                "Pada tahun 2023 tercatat 2.000 kasus dengue di Indonesia."
            ),
            "en": (
                "Indonesia recorded 5,000 dengue cases this year. "
                "Three months ago there were 12 dengue deaths in Indonesia. "
                "In 2023 Indonesia recorded 2,000 dengue cases."
            ),
        }
        for language, text in narratives.items():
            with self.subTest(language=language):
                _, _, events = self._events(
                    text,
                    linker,
                    primary_location="Indonesia",
                    primary_country="Indonesia",
                    published_at=published,
                )
                dated = {
                    (
                        int(evt.get("case_count") or 0),
                        int(evt.get("death_count") or 0),
                        evt.get("event_date_start"),
                    )
                    for evt in events
                }
                self.assertIn((5000, 0, "2026-01-01"), dated)
                self.assertIn((0, 12, "2026-06-26"), dated)
                self.assertIn((2000, 0, "2023-01-01"), dated)
                self.assertEqual(len(events), 3)

    def test_named_cities_without_counts_are_not_events(self):
        linker = self._use_places({
            "Indonesia": ("Indonesia", -2.5489, 118.0149),
            "Jakarta": ("Indonesia", -6.2088, 106.8456),
            "Surabaya": ("Indonesia", -7.2575, 112.7521),
        })
        text = (
            "Indonesia recorded 5,000 dengue cases this year. "
            "Jakarta and Surabaya were among the affected cities."
        )
        _, _, events = self._events(
            text, linker, primary_location="Indonesia", primary_country="Indonesia",
        )
        places = {evt.get("location_name") for evt in events}
        self.assertIn("Indonesia", places)
        self.assertNotIn("Jakarta", places)
        self.assertNotIn("Surabaya", places)


if __name__ == "__main__":
    unittest.main()
