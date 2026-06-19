#!/usr/bin/env python3
"""Seed ASEAN news sources ke database via Backend API."""

import json
import sys
import urllib.request
import urllib.error

API_BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
JSON_PATH = "database/sample_sources_asean.json"


def main():
    with open(JSON_PATH) as f:
        data = json.load(f)

    total = 0
    ok = 0
    fail = 0

    for country_group in data:
        country = country_group["country"]
        for src in country_group["sources"]:
            total += 1
            name = src["name"]
            stype = src["source_type"]
            config = src["config"]
            schedule = src.get("schedule", "interval:120")

            payload = json.dumps({
                "name": name,
                "source_type": stype,
                "config": config,
                "schedule": schedule,
            }).encode()

            print(f"[{country}] {name} ({stype}) ... ", end="", flush=True)

            try:
                req = urllib.request.Request(
                    f"{API_BASE}/api/v1/sources",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                resp = urllib.request.urlopen(req, timeout=15)
                result = json.loads(resp.read().decode())
                if result.get("success"):
                    print("✅ Added")
                    ok += 1
                else:
                    print(f"❌ {result.get('error', 'unknown')}")
                    fail += 1
            except urllib.error.HTTPError as e:
                try:
                    err_body = json.loads(e.read().decode())
                    print(f"❌ {err_body.get('error', e.code)}")
                except Exception:
                    print(f"❌ HTTP {e.code}")
                fail += 1
            except Exception as e:
                print(f"❌ {e}")
                fail += 1

    print(f"\nDone! {ok}/{total} added, {fail} failed.")
    print(f"Check: {API_BASE.replace(':8080', ':3001')}/sources")


if __name__ == "__main__":
    main()
