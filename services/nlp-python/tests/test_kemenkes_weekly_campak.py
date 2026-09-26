"""Kemenkes weekly measles sitrep stays national; age 25 is not Cianjur cases."""

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


KEMENKES_CAMPAK = """
Jakarta (ANTARA) - Kementerian Kesehatan mengatakan, pada minggu ke-12 2026,
kasus campak menurun menjadi 146 kasus, di mana pada minggu ke-11 terdapat
sekitar 368 kasus, dan ada penurunan sebesar sekitar 93 persen ketika
minggu ke-12 dibandingkan dengan minggu pertama 2026.

"Dan kalau kita lihat pada minggu pertama tahun 2026 jumlah kasusnya itu
2.220. Jadi ketika kita membandingkan dari minggu pertama sampai dengan
minggu ke-12. Bisa kita lihat disini terjadi penurunan kurang lebih 93
persen," kata Plt. Direktur Jenderal Penanggulangan Penyakit Andi Saguni
di Jakarta, Senin.

Andi mengatakan, terdapat 14 provinsi dengan kasus tinggi pada 2025-2026,
antara lain Sumatera Utara, Banten, Jawa Barat, Jawa Tengah, Yogyakarta,
dan Jawa Timur. Sejumlah provinsi, seperti Sumatera Utara dan Sumatera Barat,
kini kasusnya turun hingga 0 kasus, dan provinsi-provinsi lainnya turun kasusnya.

Pihaknya juga melakukan surveilans di 10 kabupaten dan kota dengan kasus
tertinggi, seperti Tangerang Selatan, Tangerang, Bima, Palembang, Pandeglang,
Jakarta Barat, Depok, Palu, Serang, dan Jakarta Pusat.

Dia juga menjelaskan tentang tindak lanjut pihaknya berupa penyelidikan
epidemiologi, merespon meninggalnya seorang tenaga kesehatan berusia 25 tahun
di Cianjur, Jawa Barat akibat campak.

Secara umum, katanya, kasus campak di Cianjur lebih rendah dibandingkan 10
daerah tertinggi, dengan total suspek 25 kasus dan 9 kasus terkonfirmasi,
serta tidak ada kasus baru di minggu ke 12.
"""


class KemenkesWeeklyCampakTests(unittest.TestCase):
    def setUp(self):
        apply_admin_abbreviations()
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()
        bind_document_admin_scope(KEMENKES_CAMPAK)

    def _run(self):
        linker = GazetteerLinker(allow_remote=False)
        relations = extract_metric_relations(
            KEMENKES_CAMPAK, linker=linker, published_date="2026-03-30"
        )
        events = compose_structured_events(
            text=KEMENKES_CAMPAK,
            primary_disease="Measles",
            primary_location="Indonesia",
            diseases_extracted=["Measles"],
            locations=[],
            case_count=0,
            death_count=0,
            primary_country="Indonesia",
            linker=linker,
            relations=relations,
            published_at="2026-03-30",
        )
        return relations, events

    def test_weekly_national_totals_are_separate_indonesia_events(self):
        relations, events = self._run()
        weekly = {
            (relation.location.name, relation.location.country, relation.cases)
            for relation in relations
            if relation.qualifier == "weekly" and relation.cases
        }
        self.assertIn(("Indonesia", "Indonesia", 146), weekly)
        self.assertIn(("Indonesia", "Indonesia", 368), weekly)
        self.assertIn(("Indonesia", "Indonesia", 2220), weekly)
        self.assertFalse(any(relation.cases == 93 for relation in relations))
        age_hits = [
            relation for relation in relations
            if relation.cases == 25 and "berusia" in (relation.evidence or "")
        ]
        self.assertFalse(age_hits)

        counted = {
            (evt.get("location_name"), evt.get("country"), int(evt.get("case_count") or 0))
            for evt in events
            if int(evt.get("case_count") or 0) > 0
        }
        self.assertIn(("Indonesia", "Indonesia", 146), counted)
        self.assertIn(("Indonesia", "Indonesia", 368), counted)
        self.assertIn(("Indonesia", "Indonesia", 2220), counted)
        self.assertGreaterEqual(len(counted), 3)
        self.assertFalse(any(country != "Indonesia" for _, country, _ in counted))
        cianjur_only = [
            evt for evt in events
            if evt.get("location_name") == "Cianjur" and int(evt.get("case_count") or 0) == 25
        ]
        if cianjur_only:
            self.assertIn("Cianjur", cianjur_only[0].get("evidence") or "")


if __name__ == "__main__":
    unittest.main()
