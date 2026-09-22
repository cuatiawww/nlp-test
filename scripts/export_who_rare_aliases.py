#!/usr/bin/env python3
"""Export active WHO ICD-11 concept aliases for rare-label fallback."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-container", default="db-postgres")
    parser.add_argument("--database", default="disease_ai")
    parser.add_argument("--label-map", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    label_map = json.loads(Path(args.label_map).read_text(encoding="utf-8"))
    labels = sorted(label_map)
    quoted = ", ".join("'" + label.replace("'", "''") + "'" for label in labels)
    query = f"""
SELECT c.canonical_name,
       COALESCE(c.ontology_system, ''),
       COALESCE(c.ontology_code, ''),
       COALESCE(a.alias, ''),
       COALESCE(a.language, '')
FROM disease_concepts c
LEFT JOIN disease_aliases a
  ON a.concept_id = c.id AND a.is_active
WHERE c.is_active
  AND lower(c.canonical_name) IN ({', '.join("lower(" + value + ")" for value in quoted.split(', '))})
ORDER BY c.canonical_name, a.alias;
"""
    output = subprocess.check_output(
        [
            "docker", "exec", "-i", args.database_container,
            "psql", "-U", "postgres", "-d", args.database,
            "-At", "-F", "\t", "-c", query,
        ],
        text=True,
    )

    concepts: dict[str, dict] = {}
    for line in output.splitlines():
        fields = line.split("\t")
        if len(fields) != 5:
            continue
        canonical, system, code, alias, language = fields
        item = concepts.setdefault(
            canonical,
            {
                "canonical_name": canonical,
                "ontology_system": system,
                "ontology_code": code,
                "aliases": [],
            },
        )
        if alias:
            item["aliases"].append({"value": alias, "language": language})

    for label in labels:
        concepts.setdefault(
            label,
            {
                "canonical_name": label,
                "ontology_system": None,
                "ontology_code": None,
                "aliases": [{"value": label, "language": "fallback"}],
            },
        )

    Path(args.output).write_text(
        json.dumps(concepts, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Exported WHO alias concepts: {len(concepts)}")


if __name__ == "__main__":
    main()
