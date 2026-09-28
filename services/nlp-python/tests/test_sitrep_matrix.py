"""Sitrep tables and e-week matrices are scraped on the front path."""

import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.admin_abbreviations import apply_admin_abbreviations, bind_document_admin_scope
from app.multi_event_extractor import compose_structured_events
from app.sitrep_matrix import append_tables_within_limit, flatten_pdf_tables, looks_like_sitrep_matrix
from app.surveillance_extraction import (
    GazetteerLinker,
    _METRIC_PATTERN_CACHE,
    _RELATION_PATTERN_CACHE,
    extract_metric_relations,
)


KEMENKES_M35 = """
Informasi Penambahan Kasus Penyakit Infeksi Emerging di Global
Minggu Epidemiologi ke-35 Tahun 2026

No. Penyakit Negara Tambahan Kasus Periode Penambahan
Konfirmasi Kematian

1 COVID-19 Tiga negara ASEAN dan sekitarnya pelaporan: Thailand, Cina, dan Korea Selatan 19,122 28 M33 - M35 2026
2 Penyakit Ebola RD Kongo 593 271 M35 2026
3 Legionellosis Amerika Serikat, Jepang, Spanyol, Australia, dan Korea Selatan 524 0 M33 - M35 2026
4 Mpox Thailand, Madagaskar, Indonesia, Singapura, dan Ukraina 211 0 M35 2026
5 Penyakit Virus West Nile Italia, Serbia, Hungaria, Spanyol, Austria, Kroasia, Makedonia Utara, Siprus, Yunani, Romania, Brasil, Prancis, dan Belanda 172 0 M35 2026
6 Listeriosis Amerika Serikat, Spanyol, Australia, dan Cina 24 0 M33 - M35 2026
7 Penyakit Meningokokus Amerika Serikat, Spanyol, Korea Selatan, Thailand, dan Australia 15 0 M34 - M35 2026
8 Polio Nigeria, RD Kongo, Sudan, dan Mali 15 0 M35 2026
9 Demam Lassa Guinea 4 0 M25 - M35 2026
10 Virus Hanta Panama, Argentina, Indonesia, dan Korea Selatan 4 0 M34 - M35 2026
11 Demam Kuning Peru 1 0 M35 2026
12 Avian Influenza A(H5N1) Bangladesh 1 0 M35 2026
13 Avian Influenza A(H9N2) Cina 1 0 M35 2026

Keterangan:
Data s.d M35 Tahun 2026 per tanggal 12 September 2026 pukul 12.00 WIB
"""

NEA_DENGUE = """
Dengue Cases
National Environment Agency Singapore

It is important to note that the day-to-day numbers fluctuate, as they depend
on the number of cases notified each day. Therefore, weekly numbers are a
better reflection of actual trends.

Number of Reported Cases
19-Sep 20-Sep 21-Sep 22-Sep 23-Sep 24-Sep 25-Sep at 11am
8 7 17 18 8 13 5

Number of Reported Cases by E-week (from Sun 0000hrs to Sat 2359hrs)
E-week 32 (09-15 Aug 2026) E-week 33 (16-22 Aug 2026) E-week 34 (23-29 Aug 2026) E-week 35 (30 Aug-05 Sep 2026) E-week 36 (06-12 Sep 2026) E-week 37 (13-19 Sep 2026) E-week 38 (20-25 Sep 2026)
95 104 88 87 73 74 68

Cumulative No. of cases for 2026 (First 37 E-weeks): 2411
"""


class SitrepMatrixTests(unittest.TestCase):
    def setUp(self):
        apply_admin_abbreviations()
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()

    def _events(self, text, disease, country, published="2026-09-12"):
        bind_document_admin_scope(text)
        linker = GazetteerLinker(allow_remote=False)
        relations = extract_metric_relations(
            text, linker=linker, published_date=published, source_country=country
        )
        return compose_structured_events(
            text=text,
            primary_disease=disease,
            primary_location=country,
            diseases_extracted=[disease],
            locations=[],
            case_count=0,
            death_count=0,
            primary_country=country,
            linker=linker,
            relations=relations,
            published_at=published,
        ), relations

    def test_kemenkes_emerging_table_is_one_event_per_row(self):
        self.assertTrue(looks_like_sitrep_matrix(KEMENKES_M35))
        events, relations = self._events(KEMENKES_M35, "COVID-19", "Indonesia")
        by_disease = {}
        for event in events:
            by_disease.setdefault(str(event.get("disease") or ""), []).append(event)

        covid = max(
            (
                item for item in events
                if "covid" in str(item.get("disease") or "").casefold()
            ),
            key=lambda item: int(item.get("case_count") or 0),
        )
        self.assertEqual(int(covid.get("case_count") or 0), 19122)
        self.assertEqual(int(covid.get("death_count") or 0), 28)
        self.assertTrue(extractors.is_global_scope_country(covid.get("country")))

        ebola = next(
            item for item in events
            if "ebola" in str(item.get("disease") or "").casefold()
        )
        self.assertEqual(int(ebola.get("case_count") or 0), 593)
        self.assertEqual(int(ebola.get("death_count") or 0), 271)
        self.assertIn("congo", str(ebola.get("country") or "").casefold())

        h5 = next(
            item for item in events
            if "h5n1" in str(item.get("disease") or "").casefold()
        )
        self.assertEqual(int(h5.get("case_count") or 0), 1)
        self.assertEqual(str(h5.get("country") or ""), "Bangladesh")

        h9 = next(
            item for item in events
            if "h9n2" in str(item.get("disease") or "").casefold()
        )
        self.assertEqual(int(h9.get("case_count") or 0), 1)
        self.assertEqual(str(h9.get("country") or ""), "China")

        stolen_thailand = [
            item for item in events
            if str(item.get("country") or "") == "Thailand"
            and int(item.get("case_count") or 0) in {19122, 211, 524}
        ]
        self.assertEqual(stolen_thailand, [])
        self.assertGreaterEqual(len({item.get("disease") for item in events}), 10)

    def test_nea_eweek_daily_and_cumulative(self):
        self.assertTrue(looks_like_sitrep_matrix(NEA_DENGUE))
        events, relations = self._events(NEA_DENGUE, "Dengue", "Singapore")
        weekly = {
            str(item.time_frame): int(item.cases)
            for item in relations
            if item.qualifier in {"weekly", "sitrep_weekly"}
        }
        self.assertIn(95, weekly.values())
        self.assertIn(104, weekly.values())
        self.assertIn(68, weekly.values())
        daily = {
            str(item.time_frame): int(item.cases)
            for item in relations
            if item.qualifier in {"daily", "sitrep_daily"}
        }
        self.assertEqual(daily.get("2026-09-19"), 8)
        self.assertEqual(daily.get("2026-09-21"), 17)
        self.assertEqual(daily.get("2026-09-25"), 5)
        cumulative = [item for item in relations if item.qualifier in {"cumulative", "sitrep_cumulative"}]
        self.assertEqual(cumulative[0].cases, 2411)
        countries = {str(item.get("country") or "") for item in events}
        self.assertEqual(countries, {"Singapore"})
        self.assertGreaterEqual(len(events), 8)

    def test_pdf_tables_do_not_expand_past_the_article_budget(self):
        body = "WHO SEARO bulletin\n" + ("dengue cases. " * 50)
        grid = " | ".join(["Indonesia", "1200", "4"]) 
        huge = "\n".join([grid] * 5000)
        capped = append_tables_within_limit(body, huge, 48000)
        self.assertLessEqual(len(capped), 48000)
        self.assertTrue(capped.startswith("WHO SEARO bulletin"))
        self.assertIn("Indonesia", capped)

    def test_pdf_tables_flatten_into_text(self):
        flat = flatten_pdf_tables([{"rows": [["Disease", "Cases"], ["Dengue", "10"]]}])
        self.assertIn("Dengue | 10", flat)
        self.assertTrue(looks_like_sitrep_matrix("x", pdf_tables=[{"rows": [["Dengue", "10"]]}]))

    def test_agent_is_front_path_when_table_is_opaque(self):
        opaque = (
            "Informasi Penambahan Kasus Penyakit Infeksi Emerging di Global "
            "Minggu Epidemiologi ke-35 Tahun 2026\n"
            "matrix rows were image-only"
        )
        self.assertTrue(looks_like_sitrep_matrix(opaque))
        with patch.object(config, "AGENT_ENABLED", True), patch(
            "app.agent.chat_json",
            return_value={
                "rows": [{
                    "disease": "COVID-19",
                    "countries": ["Thailand", "China", "South Korea"],
                    "cases": 19122,
                    "deaths": 28,
                    "period": "M33 - M35 2026",
                    "evidence": "Minggu Epidemiologi ke-35 Tahun 2026",
                }]
            },
        ) as chat:
            events, relations = self._events(opaque + " 19122 28", "COVID-19", "Indonesia")
        chat.assert_called()
        self.assertTrue(any(int(item.cases or 0) == 19122 for item in relations))

    def test_sitrep_does_not_use_rear_gate(self):
        import inspect
        from app import pipeline
        source = inspect.getsource(pipeline.run)
        self.assertIn("if sitrep_matrix:", source)
        self.assertIn("should_use_deepseek = False", source)


if __name__ == "__main__":
    unittest.main()
