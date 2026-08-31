#!/usr/bin/env python3
"""
Test Accuracy — 10 test case untuk validasi hasil NLP analisis URL
Menggunakan field name yang sesuai dengan API response actual.
"""
import json
import urllib.request
import sys
from datetime import datetime

API_URL = "http://localhost:3010/nlp/api/v1/analyze-url"
ALT_API_URL = "http://localhost:8081/api/v1/analyze-url"

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"
BOLD = "\033[1m"

test_cases = [
    {
        "id": 1,
        "name": "WHO Hantavirus Outbreak (EN) — Artikel Spesifik",
        "url": "https://www.who.int/news/item/07-05-2026-who-s-response-to-hantavirus-cases-linked-to-a-cruise-ship",
        "expect": {
            "disease_classification": "hantavirus",
            "event_type": "disease outbreak wabah",
            "is_health_related": True,
            "case_count": lambda v: v is not None and v > 0,
            "language": "en",
            "event_confidence": lambda v: v is not None and v > 0.8,
        },
        "note": "WHO article hantavirus — harus disease outbreak + EN"
    },
    {
        "id": 2,
        "name": "VNExpress Suc Khoe (VI) — Portal Kesehatan Vietnam",
        "url": "https://vnexpress.net/suc-khoe",
        "expect": {
            "language": lambda v: v in ("vi", "en"),
            "is_health_related": True,
        },
        "note": "VNExpress portal kesehatan — bahasa Vietnam, health-related"
    },
    {
        "id": 3,
        "name": "Rappler Hantavirus PH — Artikel Spesifik (404 fallback)",
        "url": "https://www.rappler.com/science/life-health/what-is-hantavirus-killed-cruise-ship-passengers/",
        "expect": {
            "disease_classification": "hantavirus",
            "language": "en",
        },
        "note": "Rappler artikel hantavirus — Filipina dalam EN"
    },
    {
        "id": 4,
        "name": "WHO Chikungunya Global (EN) — Laporan WHO",
        "url": "https://www.who.int/emergencies/disease-outbreak-news",
        "expect": {
            "language": "en",
            "is_health_related": True,
        },
        "note": "WHO Disease Outbreak News portal — harus health-related"
    },
    {
        "id": 5,
        "name": "Bangkok Post Thailand (EN) — Berita Umum",
        "url": "https://www.bangkokpost.com/thailand/general/",
        "expect": {
            "language": "en",
        },
        "note": "Bangkok Post — general news, English"
    },
    {
        "id": 6,
        "name": "WHO Viet Nam (VI/EN) — Portal Kesehatan",
        "url": "https://www.who.int/vietnam/news",
        "expect": {
            "is_health_related": True,
            "language": lambda v: v in ("vi", "en"),
        },
        "note": "WHO Vietnam — health-related EN/VI"
    },
    {
        "id": 7,
        "name": "Borneo Bulletin Brunei (EN) — Headline",
        "url": "https://borneobulletin.com.bn/category/headline/",
        "expect": {
            "language": "en",
        },
        "note": "Borneo Bulletin Brunei — English"
    },
    {
        "id": 8,
        "name": "ReliefWeb Dengue Alert (EN) — Epidemi Pasifik",
        "url": "https://reliefweb.int/updates?list=Health&search=dengue+thailand+2026",
        "expect": {
            "is_health_related": True,
            "disease_classification": "dengue fever DBD",
        },
        "note": "ReliefWeb dengue alert — harus health-related + dengue"
    },
    {
        "id": 9,
        "name": "WHO Thailand (EN/TH) — Portal Berita",
        "url": "https://www.who.int/thailand/news",
        "expect": {
            "is_health_related": True,
            "language": lambda v: v in ("en", "th"),
        },
        "note": "WHO Thailand — health-related"
    },
    {
        "id": 10,
        "name": "NST Malaysia (EN) — Berita Nasional",
        "url": "https://www.nst.com.my/news/nation",
        "expect": {
            "language": "en",
        },
        "note": "NST Malaysia — English"
    },
    {
        "id": 11,
        "name": "Dengue in the Philippines 2026 — Validasi Negara Filipina",
        "url": "https://denguevisualatlas.com/en/dengue-in-the-philippines-2026/",
        "expect": {
            "country": "Philippines",
            "disease_classification": "dengue fever DBD",
            "is_health_related": True,
            "locations": lambda v: isinstance(v, list) and len(v) >= 3,
        },
        "note": "Memastikan artikel Filipina terdeteksi sebagai negara Philippines, bukan Indonesia"
    },
    {
        "id": 12,
        "name": "RS Roemani Semarang — Kasus Campak KLB Indonesia",
        "url": "https://rsroemani.com/artikel/kasus-campak-2026-di-indonesia-melonjak-puluhan-klb-terjadi-kenali-gejala-dan-pencegahannya",
        "expect": {
            "country": "Indonesia",
            "disease_classification": "Campak",
            "location_name": "Semarang",
            "is_health_related": True,
        },
        "note": "Memastikan penyakit campak terdeteksi sebagai 'Campak' dan lokasi utama adalah Semarang"
    },
    {
        "id": 13,
        "name": "RSPP Jakarta — Lonjakan Kasus DBD di Beberapa Provinsi",
        "url": "https://rspp.co.id/artikel-detail-792-Lonjakan-Kasus-DBD-(Demam-Berdarah-Dengue)-di-Beberapa-Provinsi.html",
        "expect": {
            "country": "Indonesia",
            "disease_classification": "DBD",
            "published_at": "2025-05-26",
            "title": "Lonjakan Kasus DBD (Demam Berdarah Dengue) di Beberapa Provinsi",
            "is_health_related": True,
            "locations": lambda v: isinstance(v, list) and not any(loc.get("name") == "Sarang" for loc in v),
        },
        "note": "Memastikan artikel portal RS berhasil di-crawl tanpa timeout, judul lengkap, tanggal akurat 2025-05-26, dan tanpa kebocoran lokasi 'Sarang'"
    },
]


def call_api(url: str) -> dict:
    last_err = None
    for target in (API_URL, ALT_API_URL):
        req = urllib.request.Request(
            target,
            data=json.dumps({"url": url}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                return json.loads(resp.read())
        except Exception as e:
            last_err = e
            continue
    return {"success": False, "error": str(last_err)}


def check_expect(field: str, actual, expect_val) -> tuple[bool, str]:
    if actual is None and expect_val is not None:
        return False, f"got None, expected {expect_val}"
    if callable(expect_val):
        ok = expect_val(actual)
        return ok, f"custom check {'✅' if ok else '❌'} (got: {actual})"
    if isinstance(expect_val, str):
        ok = expect_val.lower() in str(actual).lower()
        return ok, f"contains '{expect_val}'? {'✅' if ok else f'❌ (got: {actual})'}"
    if isinstance(expect_val, bool):
        ok = actual == expect_val
        return ok, f"={expect_val}" if ok else f"!={expect_val} (got: {actual})"
    if isinstance(expect_val, (int, float)):
        ok = actual == expect_val
        return ok, f"={expect_val}" if ok else f"!={expect_val} (got: {actual})"
    return True, "?"


def run_tests():
    print(f"\n{BOLD}{'='*90}{RESET}")
    print(f"{BOLD}  TEST AKURASI NLP — 10 Test Case{RESET}")
    print(f"{BOLD}  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
    print(f"{BOLD}{'='*90}{RESET}\n")

    total = len(test_cases)
    passed = 0
    warnings = 0
    errors = 0

    for tc in test_cases:
        print(f"{BOLD}[Test #{tc['id']}] {tc['name']}{RESET}")
        print(f"  URL: {tc['url'][:100]}")
        print(f"  Note: {tc['note']}")

        result = call_api(tc["url"])
        if not result.get("success"):
            print(f"  {RED}  ERROR: {result.get('error', 'unknown')}{RESET}\n")
            errors += 1
            continue

        data = result["data"]

        print(f"  {CYAN}Results:{RESET}")
        print(f"    Disease: {data.get('disease_classification', '-')} ({data.get('confidence', 0):.2f})")
        print(f"    Event:   {data.get('event_type', '-')} ({data.get('event_confidence', 0):.2f})")
        print(f"    Cases:   {data.get('case_count', '-')} Deaths: {data.get('death_count', '-')}")
        sent_score = data.get('sentiment_score')
        score_repr = f"({sent_score:.2f})" if isinstance(sent_score, (int, float)) else ""
        print(f"    Sent:    {data.get('sentiment', '-')} {score_repr}")
        print(f"    Lang:    {data.get('language', '-')} Health: {data.get('is_health_related', '-')}")
        symp = data.get('symptoms', [])
        print(f"    Symp:    {symp[:6]}{'...' if len(symp) > 6 else ''}")

        checks = []
        for field, expect_val in tc["expect"].items():
            actual = data.get(field)
            ok, msg = check_expect(field, actual, expect_val)
            checks.append((field, ok, msg))

        ok_count = sum(1 for _, ok, _ in checks if ok)
        total_checks = len(checks)
        fail_count = total_checks - ok_count

        for field, ok, msg in checks:
            status = f"{GREEN}✅ PASS{RESET}" if ok else f"{RED}❌ FAIL{RESET}"
            print(f"    {status} {field}: {msg}")

        if fail_count == 0:
            print(f"  {GREEN}  ✅ PASSED ({ok_count}/{total_checks}){RESET}")
            passed += 1
        elif ok_count >= total_checks / 2:
            print(f"  {YELLOW}  ⚠️  PARTIAL ({ok_count}/{total_checks}){RESET}")
            warnings += 1
        else:
            print(f"  {RED}  ❌ FAILED ({ok_count}/{total_checks}){RESET}")
            errors += 1

        print()

    print(f"{BOLD}{'='*90}{RESET}")
    print(f"{BOLD}  SUMMARY{RESET}")
    print(f"  Total: {total} | {GREEN}Passed: {passed}{RESET} | {YELLOW}Partial: {warnings}{RESET} | {RED}Failed: {errors}{RESET}")
    print(f"{BOLD}{'='*90}{RESET}\n")

    return passed, warnings, errors


if __name__ == "__main__":
    run_tests()
