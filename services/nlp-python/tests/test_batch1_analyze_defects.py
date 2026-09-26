"""Staging URL Analyze batch 1: rules-path defects with AGENT off."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.epidemiology import extract_event_period, reconcile_stale_publication_date
from app.multi_event_extractor import (
    _extract_who_country_section_events,
    _split_who_country_sections,
    compose_structured_events,
    who_bulletin_char_limit,
)
from app.surveillance_extraction import (
    GazetteerLinker,
    _METRIC_PATTERN_CACHE,
    _RELATION_PATTERN_CACHE,
    extract_metric_relations,
)


WHO_INLINE = """
Dengue Situation Update 751
Update on the Dengue situation in the Western Pacific Region
Cambodia As of 26 July 2026, a total of 40 915 dengue cases, including 58 deaths, have been reported.
China (Monthly update) In June 2026, a total of 255 dengue cases were reported in China.
Indonesia As of 5 August 2026, 124 dengue cases and no deaths were reported in July 2026, bringing the cumulative total from January to July 2026 to 75 431 cases and 203 deaths.
Lao People's Democratic Republic As of 4 August 2026, a total of 1 200 dengue cases, including 2 deaths, have been reported.
"""

SUMSEL = """
PALEMBANG — Dinas Kesehatan Sumatera Selatan mencatat 1.426 kasus DBD dan 11 kematian hingga Mei tahun 2026.
Angka tersebut naik dibandingkan periode yang sama tahun 2025 yang mencatat 366 kasus dan 4 kematian.
Kementerian Kesehatan juga membandingkan dengan Malaysia yang mencatat 80 kasus pada laporan regional.
"""

CENGKARENG = """
JAKARTA — Kecamatan Cengkareng mencatat kasus DBD terbanyak di Jakarta Barat.
Dinas Kesehatan Jakarta Barat mencatat 842 kasus DBD hingga 23 April 2026, dengan Cengkareng 327 kasus.
Berita terkait
Singapura mencatat 112 kasus dengue. Malaysia mencatat 190 kasus. Indonesia secara regional 1.281 kasus.
"""

EW12 = """
Kemenkes: Minggu ke-12 kasus campak menurun jadi 146 kasus
Kementerian Kesehatan menyatakan pada minggu epidemiologi ke-12 tahun 2026 kasus campak nasional menurun menjadi 146 kasus.
Di Cianjur tercatat 25 kasus pada periode yang sama. Flu burung tetap dipantau sebagai penyakit lain.
"""

MEASLES_TAGS = """
Indonesian Health Ministry warns of measles ahead of Eid holidays
The Ministry of Health reported 10,453 suspected measles cases and 6 deaths by epidemiological week 8 of 2026 in Indonesia.
Tags: Avian Influenza Bird Flu
"""

EW32 = """
Perkembangan Situasi Penyakit Infeksi Emerging Minggu Epidemiologi ke-32 Tahun 2026
Kementerian Kesehatan melaporkan secara nasional.
Mpox: 12 kasus konfirmasi dilaporkan di Indonesia.
Demam berdarah: 1.200 kasus.
Campak: 80 kasus.
Hak cipta 2024
"""


class Batch1AnalyzeDefectTests(unittest.TestCase):
    def setUp(self):
        self._coords = dict(config.LOCATION_COORDS)
        self._countries = dict(config.LOCATION_COUNTRIES)
        self._patterns = list(config.LOCATION_PATTERNS)
        self._aliases = dict(getattr(config, "LOCATION_ALIASES", {}) or {})
        rows = {
            "Indonesia": ("Indonesia", -2.5, 118.0),
            "Cambodia": ("Cambodia", 12.5, 105.0),
            "China": ("China", 35.0, 104.0),
            "Malaysia": ("Malaysia", 3.1, 101.7),
            "Singapore": ("Singapore", 1.3, 103.8),
            "Laos": ("Laos", 19.8, 102.5),
            "Sumatera Selatan": ("Indonesia", -3.3, 104.0),
            "Jawa Barat": ("Indonesia", -6.9, 107.6),
            "Jakarta Barat": ("Indonesia", -6.16, 106.75),
            "Cengkareng": ("Indonesia", -6.15, 106.73),
            "Cianjur": ("Indonesia", -6.82, 107.14),
        }
        config.LOCATION_COORDS = {name: (lat, lon) for name, (_, lat, lon) in rows.items()}
        config.LOCATION_COUNTRIES = {name: country for name, (country, _, _) in rows.items()}
        config.LOCATION_PATTERNS = []
        config.LOCATION_ALIASES = {"sumsel": "Sumatera Selatan", "west jakarta": "Jakarta Barat"}
        config.DISEASE_DICT.update({
            "dengue": "Dengue",
            "dbd": "Dengue",
            "demam berdarah": "Dengue",
            "measles": "Measles",
            "campak": "Measles",
            "mpox": "Mpox",
            "tuberculosis": "Tuberculosis",
            "lao": "Tuberculosis",
            "flu burung": "Avian influenza",
            "avian influenza": "Avian influenza",
            "bird flu": "Avian influenza",
        })
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()
        self.linker = GazetteerLinker(
            coords=config.LOCATION_COORDS,
            countries=config.LOCATION_COUNTRIES,
            allow_remote=False,
        )

    def tearDown(self):
        config.LOCATION_COORDS = self._coords
        config.LOCATION_COUNTRIES = self._countries
        config.LOCATION_PATTERNS = self._patterns
        config.LOCATION_ALIASES = self._aliases
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()
        extractors.invalidate_location_alias_cache()

    def _events(self, text, primary_location, primary_country, published=None):
        diseases = extractors.prefer_outbreak_diseases(
            extractors.filter_diseases_to_evidence(
                extractors.extract_diseases(text) + extractors.extract_alias_diseases(text),
                text,
            ),
            text,
        )
        relations = extract_metric_relations(
            text,
            linker=self.linker,
            published_date=published,
            source_country=primary_country,
        )
        facts = extractors.predict_surveillance_facts(text, primary_country)
        events = compose_structured_events(
            text=text,
            primary_disease=diseases[0] if diseases else facts.get("disease") or "Dengue",
            primary_location=primary_location,
            diseases_extracted=diseases,
            locations=[],
            case_count=facts.get("case_count") or 0,
            death_count=facts.get("death_count") or 0,
            primary_country=primary_country,
            linker=self.linker,
            relations=relations,
            published_at=published,
        )
        return diseases, facts, events

    def test_who_inline_headings_keep_indonesia_cumulative(self):
        countries = [country for country, _ in _split_who_country_sections(WHO_INLINE)]
        self.assertIn("Indonesia", countries)
        self.assertIn("Cambodia", countries)
        self.assertIn("China", countries)
        events = {
            event["country"]: event
            for event in _extract_who_country_section_events(WHO_INLINE, "Dengue")
        }
        self.assertEqual(events["Indonesia"]["case_count"], 75431)
        self.assertEqual(events["Indonesia"]["death_count"], 203)
        self.assertEqual(events["Cambodia"]["case_count"], 40915)
        self.assertNotEqual(set(events), {"Cambodia"})
        diseases = extractors.prefer_outbreak_diseases(
            extractors.extract_alias_diseases(WHO_INLINE) + extractors.extract_diseases(WHO_INLINE),
            WHO_INLINE,
        )
        self.assertNotIn("Tuberculosis", diseases)

    def test_who_bulletin_cap_reaches_later_country_section(self):
        pad = "Figure caption dengue weekly trend in Cambodia. " * 200
        long_text = (
            "Dengue Situation Update 751\nWestern Pacific Region\n"
            "Cambodia\nAs of 26 July 2026, a total of 40 915 dengue cases, including 58 deaths.\n"
            + pad
            + "\nIndonesia\nAs of 5 August 2026, bringing the cumulative total to 75 431 cases and 203 deaths.\n"
        )
        limit = who_bulletin_char_limit(long_text, 6000)
        self.assertGreater(limit, 6000)
        self.assertIn("Indonesia", long_text[:limit])

    def test_sumsel_keeps_local_total_not_malaysia_or_2025(self):
        diseases, facts, events = self._events(
            SUMSEL, "Sumatera Selatan", "Indonesia", "2026-05-31"
        )
        self.assertEqual(diseases, ["Dengue"])
        self.assertNotEqual(facts["country"], "Malaysia")
        self.assertNotEqual(facts["case_count"], 80)
        counted = {
            (event["location_name"], event["case_count"], event["death_count"])
            for event in events
        }
        self.assertIn(("Sumatera Selatan", 1426, 11), counted)
        self.assertNotIn(("Malaysia", 80, 0), counted)
        period = extract_event_period(SUMSEL, published_at="2026-05-31")
        self.assertTrue(str(period["event_date_start"]).startswith("2026"))
        self.assertNotEqual(period["event_date_start"], "2025-01-01")
        self.assertNotEqual(period["event_date_end"], "2025-12-31")

    def test_related_block_does_not_import_singapore_malaysia(self):
        _, facts, events = self._events(
            CENGKARENG, "Jakarta Barat", "Indonesia", "2026-04-24"
        )
        self.assertNotIn("Malaysia", str(facts["country"]))
        self.assertNotIn("Singapore", str(facts["country"]))
        countries = {event.get("country") for event in events}
        self.assertNotIn("Malaysia", countries)
        self.assertNotIn("Singapore", countries)
        counts = {event["case_count"] for event in events}
        self.assertIn(842, counts)
        self.assertIn(327, counts)
        self.assertFalse(counts & {1281, 190, 112})

    def test_national_measles_week_is_not_the_district_or_avian_flu(self):
        diseases, facts, events = self._events(EW12, "Indonesia", "Indonesia", "2026-03-30")
        self.assertNotIn("Avian influenza", diseases)
        self.assertEqual(facts["country"], "Indonesia")
        counted = {(event["location_name"], event["case_count"]) for event in events}
        self.assertIn(("Indonesia", 146), counted)
        self.assertNotEqual(counted, {("Cianjur", 25)})

    def test_tag_avian_influenza_does_not_join_measles(self):
        diseases = extractors.prefer_outbreak_diseases(
            extractors.filter_diseases_to_evidence(
                extractors.extract_diseases(MEASLES_TAGS) + extractors.extract_alias_diseases(MEASLES_TAGS),
                MEASLES_TAGS,
            ),
            MEASLES_TAGS,
        )
        self.assertIn("Measles", diseases)
        self.assertNotIn("Avian influenza", diseases)

    def test_ew32_title_week_multi_disease_and_stale_copyright_year(self):
        period = extract_event_period(EW32, published_at="2024-11-01")
        self.assertEqual(period["period_type"], "weekly")
        self.assertTrue(str(period["event_date_start"]).startswith("2026"))
        published = reconcile_stale_publication_date(EW32, "2024-11-01", period)
        self.assertTrue(str(published).startswith("2026"))
        diseases, _, events = self._events(EW32, "Indonesia", "Indonesia", published)
        labels = {item.casefold() for item in diseases}
        self.assertIn("mpox", labels)
        self.assertTrue(any("dengue" in item for item in labels))
        self.assertTrue(any("measles" in item for item in labels))
        counts = {event["case_count"] for event in events}
        self.assertIn(12, counts)
        self.assertIn(1200, counts)
        self.assertIn(80, counts)
        self.assertNotIn("Unknown", diseases)


if __name__ == "__main__":
    unittest.main()
