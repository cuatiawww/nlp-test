# Shared Core QA — 2026-09-22

## Runtime recovery

Before QA, `disease-nlp-python` was `unhealthy` and `/health` timed out.
Only the NLP service was rebuilt and recreated:

```text
docker compose build disease-nlp-python
docker compose up -d --no-deps --force-recreate disease-nlp-python
```

Result: container became `healthy` after approximately 33 seconds and
`GET /health` returned HTTP 200. No database, frontend, worker, or crawler
container was recreated.

## Test input

The same source text was sent to each adapter.

### Single event

> Thailand's Department of Disease Control reported 53,362 hand, foot and
> mouth disease cases and one death nationwide from 1 January to 1 September
> 2026. Bangkok reported 120 cases during the same period.

### Multi-disease event

> Vietnam reported 361 dengue cases and 10 influenza cases from January
> through September 2026, with 3 deaths. The cases were reported nationwide;
> Ho Chi Minh City reported 40 dengue cases.

## Adapter comparison

| Article | Adapter | Status | Disease | Country | Cases | Deaths | Core events | Locations | Evidence |
|---|---|---:|---|---|---:|---:|---:|---:|---:|
| Single | `/nlp/analyze/url` | PASS | HFMD | Thailand | 53,362 | 1 | 1 | 2 | 4 |
| Single | `/nlp/analyze/raw` | PASS | HFMD | Thailand | 53,362 | 1 | 1 | 2 | 4 |
| Single | `/nlp/analyze/surveillance` | PASS* | HFMD | Thailand | 53,362 | 1 | contract-only | 1 | 4 |
| Multi | `/nlp/analyze/url` | PASS | Dengue + Influenza events | Vietnam | 371 | 3 | 2 | 2 | 5 |
| Multi | `/nlp/analyze/raw` | PASS | Dengue + Influenza events | Vietnam | 371 | 3 | 2 | 2 | 5 |
| Multi | `/nlp/analyze/surveillance` | PASS* | Dengue + Influenza | Vietnam | 371 | 3 | contract-only | 1 | 5 |

`/nlp/analyze/url` and `/nlp/analyze/raw` expose `sub_events`. The
surveillance endpoint intentionally exposes the legacy `SurveillanceOutput`
contract, so it has no `sub_events` field; its country, aggregate metrics,
disease labels, location hierarchy, and evidence were compared instead.

The multi-disease result originally exposed only the parent disease through
the surveillance adapter. The adapter was corrected to retain unique disease
labels from core events; the rerun returned `Dengue` and `Influenza`.

## Automated adapter tests

| Test group | Result |
|---|---:|
| NLP shared-core adapter | 3 passed |
| NLP multi-event foundation | 5 passed |
| Reanalyze worker endpoint contract | 2 passed |
| Matrix worker tests | 18 passed |
| Collector crawl adapter tests | 6 passed |

The complete `analysis_jobs` worker module currently has one unrelated test
fixture error in `test_fetch_article_uses_fail_fast_http`: its mocked response
does not set `status_code`, while production code correctly reads that field.
The shared-core endpoint assertions pass independently.

## QA conclusion

The shared extraction/event core is equivalent across the tested adapters for
disease, country, cases, deaths, evidence, and core event count. The
surveillance response remains a shape adapter and intentionally collapses
country output; it does not run a second extraction pipeline.

This run is a deterministic adapter smoke test using identical article text.
Actual URL fetch, database persistence, and manual crawl job execution remain
the next integration gate.
