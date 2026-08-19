#!/usr/bin/env python3
"""Generate idempotent ASEAN gazetteer SQL from the public GeoNames dumps.

The output is SQL by default so it can be piped to the PostgreSQL container:
  python scripts/bootstrap_asean_locations.py | docker compose ... psql ...

We keep administrative centres, capitals, and populated places with at least
5,000 residents. This gives broad ASEAN coverage without turning every NLP
request into a regex scan over hundreds of thousands of hamlets.
"""

from __future__ import annotations

import csv
import io
import sys
import urllib.request
import zipfile


COUNTRIES = {
    "BN": "Brunei", "KH": "Cambodia", "ID": "Indonesia", "LA": "Laos",
    "MY": "Malaysia", "MM": "Myanmar", "PH": "Philippines", "SG": "Singapore",
    "TH": "Thailand", "TL": "Timor-Leste", "VN": "Vietnam",
}
ADMIN_CODES = {"PPLC", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5", "PPLG"}


def sql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def rows_for(country_code: str):
    url = f"https://download.geonames.org/export/dump/{country_code}.zip"
    with urllib.request.urlopen(url, timeout=90) as response:
        payload = response.read()
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        filename = f"{country_code}.txt"
        with archive.open(filename) as raw:
            reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8"), delimiter="\t")
            for row in reader:
                if len(row) < 19 or row[6] != "P":
                    continue
                feature_code = row[7]
                population = int(row[14] or 0)
                if feature_code not in ADMIN_CODES and population < 5000:
                    continue
                name, ascii_name = row[1].strip(), row[2].strip()
                lat, lon = row[4], row[5]
                country = COUNTRIES[country_code]
                yield name, lat, lon, country
                if ascii_name and ascii_name != name:
                    yield ascii_name, lat, lon, country


def main() -> None:
    values: set[tuple[str, str, str, str]] = set()
    for code in COUNTRIES:
        for name, lat, lon, country in rows_for(code):
            values.add((name, lat, lon, country))
        print(f"-- loaded {COUNTRIES[code]}", file=sys.stderr)

    print("BEGIN;")
    print("INSERT INTO locations (name, latitude, longitude, country) VALUES")
    ordered = sorted(values, key=lambda item: (item[3], item[0]))
    for index, (name, lat, lon, country) in enumerate(ordered):
        comma = "," if index < len(ordered) - 1 else ""
        print(f"({sql(name)}, {float(lat):.6f}, {float(lon):.6f}, {sql(country)}){comma}")
    print("ON CONFLICT (name, country) DO NOTHING;")
    print("COMMIT;")
    print(f"-- generated {len(ordered)} locations", file=sys.stderr)


if __name__ == "__main__":
    main()
