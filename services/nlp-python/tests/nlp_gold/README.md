# NLP gold set (20 articles)

Parent is attaching a 20-URL pack next. Until then, fixtures ship with inline `title` + `text` so scoring is deterministic (no live fetch).

## Layout

- `fixtures.json` — 20 rows (`id`, optional `url`, `title`, `text`, `expect`)
- `runner.py` — scores disease, country, exact cases when present, rejected non-geo tokens, ASEAN-primary
- `gazetteer.py` — ASEAN place seed used when the locations table is not loaded
- `FAILURES.md` — rewritten by the test with any remaining misses

## Expect schema

```json
{
  "disease": ["Measles", "campak"],
  "country": "Singapore",
  "cases": 43,
  "reject_locations": ["Were", "Asia"],
  "asean_primary": true
}
```

`cases: null` means the article has no explicit case total — the extractor must not invent a number (0 / unknown).

## Attach the parent URL pack

Replace or add `url` plus fetched article `text` on the same `id`. Keep `expect` unless the news itself changed. Do not point the scorer at live HTTP during CI.

## Run

```
cd services/nlp-python
python3 -m unittest tests.test_gold_set tests.test_cidrap_cambodia tests.test_extraction_counts -v
```

Done bar: **≥18/20** ready fixtures must pass before merge.

Ingest and the manual crawler both use `/nlp/analyze/raw` → `pipeline.run` → `extractors.predict_surveillance_facts`.
