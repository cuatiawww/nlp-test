# NLP gold set (20 articles)

Official pack: `nlp-gold-20.json` + rubric `nlp-gold-20.md` (ASEAN + Timor-Leste).

Scoring uses **title + evidence_quote** only (no live HTTP). Ingest and the manual crawler both call `extractors.predict_surveillance_facts`.

## Layout

- `nlp-gold-20.json` — 20 fixtures (`id`, `url`, `title`, `evidence_quote`, `expected`)
- `nlp-gold-20.md` — human rubric and notes (alternates, must_not)
- `runner.py` — disease, country, cases (exact or notes-allowed alternate), deaths (null = do not invent), garbage province, `must_not_contain`
- `gazetteer.py` — ASEAN place seed when the locations table is not loaded
- `FAILURES.md` — rewritten by the test with any remaining misses

## Rubric

PASS if all of: disease (aliases OK), ASEAN-primary country, cases exact or an alternate listed in notes, deaths exact when a number / not invented when null, no `must_not_contain` hit.

Critical fixtures:

- **asean-001** CIDRAP: H5N1 + Cambodia; cases=1 (focal girl), not Utah / Measles / Indonesia / Were
- **asean-002** Singapore measles: cases=43 exactly; never 802151 / Americas distractors

## Run

```
cd services/nlp-python
python3 -m tests.nlp_gold.runner
python3 -m unittest tests.test_gold_set tests.test_cidrap_cambodia tests.test_extraction_counts tests.test_rules -v
```

Done bar: **≥18/20**.
