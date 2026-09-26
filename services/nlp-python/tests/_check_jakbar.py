from app.admin_abbreviations import apply_admin_abbreviations
from app import config, extractors
from app.multi_event_extractor import compose_structured_events
from app.surveillance_extraction import extract_metric_relations, GazetteerLinker

apply_admin_abbreviations()
config.build_location_patterns()
extractors.invalidate_location_alias_cache()
GazetteerLinker._SHARED_FOLDED_COORDS = None
GazetteerLinker._SHARED_MENTION_PATTERN = None
GazetteerLinker._SHARED_SIG = None

text = (
    "Jakarta (ANTARA) - Suku Dinas Kesehatan (Sudinkes) Jakarta Barat mengatakan "
    "Kecamatan Cengkareng mencatat kasus Demam Berdarah Dengue (DBD) terbanyak di "
    "wilayah Jakarta Barat selama 2026. Kepala Seksi Pencegahan dan Pengendalian "
    "Penyakit Sudinkes Jakarta Barat Arum Ambarsari menyebutkan dari 842 kasus DBD "
    "yang tercatat di wilayah Jakarta Barat sejak 1 Januari hingga 23 April 2026, "
    "wilayah Cengkareng melaporkan 327 kasus. "
    '"Jadi, mulai 1 Januari-23 April 2026, di wilayah Cengkareng mencatat 327 kasus '
    "DBD, Kalideres 188, Grogol Petamburan 57, Kebon Jeruk 85, Tamansari 27, "
    'Kembangan 65, Palmerah 46 dan Tambora 47 kasus," kata Arum saat dihubungi '
    "ANTARA di Jakarta, Jumat. "
    "Menurut dia, tren kasus DBD di wilayah Jakarta Barat juga menunjukkan "
    "peningkatan, terutama sejak Januari hingga Maret 2026. "
    '"Pada Januari itu ada 134 kasus, Februari 203, Maret 315, lalu April '
    '(berjalan) tercatat 190 kasus," papar Arum.'
)

for name in [
    "Jakarta Barat", "Jakbar", "Cengkareng", "Kalideres", "Grogol Petamburan",
    "Kebon Jeruk", "Tamansari", "Kembangan", "Palmerah", "Tambora", "Jakarta",
]:
    hier = extractors.resolve_location_hierarchy(name)
    print("hier", name, "->", hier.get("canonical_name"), hier.get("country"), hier.get("admin1"))

print("primary", extractors.extract_location(text))
print("places", [(p.get("name"), p.get("country")) for p in extractors.extract_all_locations(text) or []])
print("countries", extractors.extract_named_countries(text), extractors.extract_country_hint(text[:1500]))
rels = extract_metric_relations(text)
print("relations")
for rel in rels:
    print(
        " ",
        getattr(rel.location, "name", None),
        getattr(rel.location, "country", None),
        rel.cases,
        rel.deaths,
        getattr(rel, "time_frame", None),
        (rel.evidence or "")[:90],
    )
events = compose_structured_events(
    text=text,
    primary_disease="dengue fever DBD",
    primary_location="Jakarta Barat",
    primary_country="Indonesia",
    diseases_extracted=["dengue fever DBD"],
    locations=[],
    case_count=842,
    death_count=0,
    published_at="2026-04-24",
)
print("events")
for evt in events:
    print(
        " ",
        evt.get("location_name"),
        evt.get("country"),
        evt.get("admin1"),
        evt.get("admin2"),
        evt.get("case_count"),
        evt.get("event_date_start"),
        evt.get("event_date_end"),
        (evt.get("evidence") or "")[:70],
    )
