# PROMPT — Shared NLP core: relation attribution & multi-event composition

You are implementing intelligence in the **shared NLP core** of `cuatiawww/nlp-test` (NLP-PENYAKIT). Work surgically. Prefer extending `multi_event_extractor` / extractors / pipeline over a rewrite. Investigate first; any root-cause guess below is non-binding.

---

## Problem (systemic — NOT one article)

Multi-country / multi-metric articles collapse into **one** event. Numbers exist in the text but get **bound to the wrong country / wrong qualifier / wrong period**. Publish date often overwrites event period. Disease class from fine-tuned XLM-R is often fine; **composition is broken**.

Symptom pattern (illustrative only — do NOT hardcode these countries/numbers/URLs):
- Country A’s large case count unbound
- Country B’s “new” cases dropped
- Country B’s cumulative count becomes the single top-level `case_count` under Country A
- Country B’s `deaths: 0` applied to Country A’s event
- Locations mentioned as case origins stay only in evidence, or wrongly spawn empty sub-events

Concurrency / thread-cap changes already pushed in `main.py` / `classifier.py` are **ops only**. Leave them. They do not fix attribution.

---

## Target pipeline

```
original article
→ sentence/paragraph segmentation
→ disease / location / metric / time candidates
→ country-context attribution
→ disease–metric–time relation
→ event composition
→ article summary
```

### MetricCandidate MUST include
`value`, `metric_type`, `qualifier` (new | cumulative | comparison | historical | suspected | confirmed | rate | hospitalization | …), `period`, `country_scope`, `disease_scope`, `sentence_id`, `evidence` (original text — never drop / never replace with translation).

---

## MUST

1. Split events by `disease + country + time period + evidence relation`.
2. Treat metrics as **candidates** first; classify new vs cumulative vs deaths vs comparison vs historical before picking a primary `case_count`.
3. Bind each metric to country via: sentence of the number, nearest country/location, sentence subject, paragraph/heading scope, connectives (“sementara itu”, “di X”, equivalents in other languages), `sentence_id` + evidence — **not** first country found in the article.
4. Deaths have **their own scope** — explicit zero in one country’s sentence must not zero every event.
5. Locations without per-location counts → `locations[]` on the country event; do **not** invent empty sub-events.
6. `period` from event text; `published_at` separate; publish date must **not** replace event period.
7. New cases and cumulative cases are **different metrics** — one must not overwrite the other.
8. Top-level may be `MULTI_COUNTRY` / empty; **`events[]` / `sub_events` are source of truth**.
9. Keep crawl + URL Analysis on the **same** composer path.
10. Few strong fixtures (2–3 multi-country / multi-metric, any ASEAN language) + focused unit tests on attribution/composer. Quality > test volume.

## MUST NOT

- Hardcode any URL, site, or specific country pair
- “Fix” by regex special-case for one article
- Retrain / Colab / change gold labels by hand-waving before structure is correct
- Raise uvicorn workers on CPU as a substitute
- Let NLLB invent numbers or erase original evidence
- Silent rules-only fallback presented as Full NLP success
- Touch unrelated UI (AseanMap, etc.)

---

## Role split (do not blur)

| Layer | Job |
| Lexicon DB | vocabulary / aliases |
| Preprocess | tokenize, script, sentence segmentation |
| Fine-tuned classifier | health relevance, disease class |
| NLLB | auxiliary only |
| **Shared core (THIS PR)** | evidence, attribution, metric/time reasoning, event compose |

---

## Implementation order

1. `MetricCandidate` + `EvidenceCandidate` (+ sentence_id, scope, qualifier, period)
2. Generic country-context attribution
3. Guards: new / cumulative / comparison / death + temporal
4. Multi-country event composition (keep multi-disease-ready)
5. Re-score a small gold slice per field (disease, country, cases, deaths, location, time, evidence, **event count**) — no claim of 99% open-web

One coherent PR is OK if commits stay ordered and reviewable.

---

## Acceptance

- Multi-country fixture: correct **event count**; no metric stolen across countries; new ≠ cumulative; deaths scoped; period ≠ publish date when period exists in text
- Single-country fixture: still **one** clean event (no multi-event noise)
- Evidence preserved on candidates/events
- Short note: API shape top-level vs `events[]` / `sub_events`, and that crawl + URL Analysis both use it
- Diff contains **zero** URL-specific branches

## Out of scope

Sample-20 UNKNOWN mass run; GPU; hospitalization UI field (candidate type OK); production deploy unless asked.

---

## Deliverable

Surgical PR on shared core + minimal fixtures/tests + brief README/note in PR body. Investigate existing code first; extend, don’t rewrite the world.
