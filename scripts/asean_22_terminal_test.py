#!/usr/bin/env python3
"""Run a fixed 22-URL ASEAN multilingual smoke test through the live URL API.

This is a test fixture, not extraction logic. It deliberately records the
application response without rules-only or dummy fallback data.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from asean_url_accuracy_harness import analyze_one  # noqa: E402


CASES = [
    ("BRN-01", "Brunei", "Malay", "Latin", "https://moh.gov.bn/news/nasihat-kesihatan-semasa-banjir/"),
    ("BRN-02", "Brunei", "English", "Latin", "https://www.bruneitribune.com/no-nipah-virus-cases-detected-in-brunei-darussalam/"),
    ("KHM-01", "Cambodia", "Khmer", "Khmer", "https://moh.gov.kh/en/notice/detail/400"),
    ("KHM-02", "Cambodia", "English", "Latin", "https://www.who.int/emergencies/disease-outbreak-news/item/2025-DON575"),
    ("IDN-01", "Indonesia", "Indonesian", "Latin", "https://www.kemkes.go.id/id/waspada-campak-jelang-libur-lebaran-kemenkes-percepat-imunisasi-anak-di-wilayah-risiko"),
    ("IDN-02", "Indonesia", "English", "Latin", "https://www.kemkes.go.id/eng/kemenkes-waspadai-dinamika-campak-nasional-dan-global"),
    ("LAO-01", "Laos", "Lao", "Lao", "https://kpl.gov.la/detail.aspx?id=57118"),
    ("LAO-02", "Laos", "English", "Latin", "https://kpl.gov.la/EN/detail.aspx?id=101848"),
    ("MYS-01", "Malaysia", "Malay", "Latin", "https://www.bernama.com/bm/news.php?id=2605025"),
    ("MYS-02", "Malaysia", "English", "Latin", "https://www.bernama.com/en/news.php?id=2605035"),
    ("MMR-01", "Myanmar", "Burmese", "Myanmar", "https://www.moi.gov.mm/news/81121"),
    ("MMR-02", "Myanmar", "English", "Latin", "https://www.who.int/publications/m/item/myanmar--who-health-emergency-appeal-2026"),
    ("PHL-01", "Philippines", "Filipino", "Latin", "https://balita.mb.com.ph/2026/02/07/kaso-ng-dengue-sa-pagpasok-ng-2026-naitalang-nasa-higit-7k/"),
    ("PHL-02", "Philippines", "English", "Latin", "https://www.gmanetwork.com/news/topstories/nation/1001460/doh-logs-over-15k-dengue-cases-from-aug-2-to-15-higher-than-previous-period/story/"),
    ("SGP-01", "Singapore", "English", "Latin", "https://www.moh.gov.sg/newsroom/update-on-measles-situation-and-vaccination-coverage/"),
    ("SGP-02", "Singapore", "English", "Latin", "https://www.channelnewsasia.com/singapore/mpox-clade-1b-infection-cases-communicable-diseases-agency-6033226"),
    ("THA-01", "Thailand", "Thai", "Thai", "https://www.ddc.moph.go.th/brc/news.php?deptcode=brc&news=59964"),
    ("THA-02", "Thailand", "English", "Latin", "https://www.bangkokpost.com/thailand/general/2590549/dengue-cases-this-year-pass-19-000"),
    ("VNM-01", "Vietnam", "Vietnamese", "Latin", "https://www.vietnamplus.vn/dich-sot-xuat-huyet-tai-ha-noi-co-xu-huong-gia-tang-post1126592.amp"),
    ("VNM-02", "Vietnam", "English", "Latin", "https://en.vietnamplus.vn/hanoi-steps-up-dengue-prevention-as-cases-rise-post350367.vnp"),
    ("TLS-01", "Timor-Leste", "Portuguese", "Latin", "https://timor-leste.gov.tl/?lang=pt&p=47040"),
    ("TLS-02", "Timor-Leste", "English", "Latin", "https://reliefweb.int/report/timor-leste/timor-leste-dengue-outbreak-response-final-report-dref-ndeg-mdrtp005"),
]


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key] = value.strip().strip('"').strip("'")
    return values


def login(base_url: str, username: str, password: str) -> str:
    request = urllib.request.Request(
        base_url.rstrip("/") + "/api/auth/login",
        data=json.dumps({"username": username, "password": password}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    token = ((payload.get("data") or {}).get("token"))
    if not token:
        raise RuntimeError("login succeeded without a session token")
    return token


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("NLP_API_URL", "http://localhost:3010/nlp"))
    parser.add_argument("--username", default=os.getenv("NLP_TEST_USERNAME", "webmaster"))
    parser.add_argument("--password", default=os.getenv("WEBMASTER_PASSWORD"))
    parser.add_argument("--poll-timeout", type=int, default=int(os.getenv("ASEAN_HARNESS_POLL_SECONDS", "240")))
    parser.add_argument("--json-out", default="")
    args = parser.parse_args()

    env = load_env()
    password = args.password or env.get("WEBMASTER_PASSWORD")
    if not password:
        raise SystemExit("WEBMASTER_PASSWORD is required via .env or environment")

    token = login(args.base_url, args.username, password)
    rows = []
    print(f"ASEAN 22 URL test: {len(CASES)} URLs, base={args.base_url}")
    for case_id, country, language, script, url in CASES:
        outcome = analyze_one(args.base_url, token, url, True, args.poll_timeout)
        row = {
            "id": case_id,
            "country_expected": country,
            "language_expected": language,
            "script_expected": script,
            "url": url,
            **{key: value for key, value in outcome.items() if key != "result"},
            "country_extracted": outcome.get("country"),
            "province": outcome.get("province"),
            "city": outcome.get("city"),
            "result": outcome.get("result") or {},
        }
        rows.append(row)
        result = row["result"]
        print(
            f"[{('FULL' if row['full_nlp'] else 'WEAK'):4}] {case_id} {country:12} "
            f"lang={language:10} http={row['http_status']} status={row['analysis_status']} "
            f"disease={row['disease']!s:.28} country_out={row['country_extracted']!s:.18} "
            f"cases={row['case_count']} deaths={row['death_count']} "
            f"events={len(result.get('events') or result.get('atomic_events') or [])} "
            f"review={row['needs_review']} latency_ms={row['latency_ms']}"
        )

    full = sum(1 for row in rows if row["full_nlp"])
    print(f"Full NLP: {full}/{len(rows)}")
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON: {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
