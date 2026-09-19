"""Validate extraction and event attribution directly on native-script text."""

import json

from app import config
from app.epidemiology import extract_event_period
from app.intelligence import build_atomic_events
from app.surveillance_extraction import GazetteerLinker, extract_metric_relations


SAMPLES = {
    "th": "กระทรวงสาธารณสุขรายงานผู้ป่วยไข้เลือดออก 45 รายในกรุงเทพมหานคร เมื่อวันที่ 12 กันยายน 2026",
    "km": "ក្រសួងសុខាភិបាលបានរាយការណ៍ករណីជំងឺគ្រុនឈាមចំនួន 15 ករណីនៅភ្នំពេញ នៅថ្ងៃទី 12 ខែកញ្ញា ឆ្នាំ 2026",
    "vi": "Bộ Y tế báo cáo 27 ca sốt xuất huyết tại Hà Nội vào ngày 12 tháng 9 năm 2026.",
}


def validation_linker() -> GazetteerLinker:
    """Supply the three fixture locations when validation runs without Postgres."""
    coords = {
        "Bangkok": (13.7563, 100.5018),
        "Phnom Penh": (11.5564, 104.9282),
        "Hanoi": (21.0278, 105.8342),
    }
    countries = {"Bangkok": "Thailand", "Phnom Penh": "Cambodia", "Hanoi": "Vietnam"}
    aliases = {
        "กรุงเทพมหานคร": "Bangkok",
        "ភ្នំពេញ": "Phnom Penh",
        "Hà Nội": "Hanoi",
    }
    config.LOCATION_COORDS.update(coords)
    config.LOCATION_COUNTRIES.update(countries)
    config.LOCATION_ALIASES.update(aliases)
    return GazetteerLinker(coords=coords, countries=countries, allow_remote=False)


def main() -> None:
    linker = validation_linker()
    for language, original_text in SAMPLES.items():
        relations = extract_metric_relations(original_text, linker=linker)
        events = build_atomic_events(original_text, disease_labels=["Dengue"], linker=linker)
        print(json.dumps({
            "language": language,
            "original_text": original_text,
            "event_count": len(events),
            "date_period": extract_event_period(original_text),
            "relation_count": len(relations),
            "relations": [
                {
                    "location": relation.location.name,
                    "cases": relation.cases,
                    "deaths": relation.deaths,
                    "evidence": relation.evidence,
                }
                for relation in relations
            ],
            "events": events,
        }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
