Analyze URL timeouts and the ASEAN URL harness
==============================================

Production symptom
------------------
Interactive URL Analysis on `/nlp` could return:

    Full NLP unavailable (NLP HTTP 408: {"detail": "NLP stage exceeded budget (90s)"});
    attempted bounded rules-only analysis

The article text was already fetched. The 90s killer then dropped the job to
rules-only, and the UI treated that partial as done.

Root causes addressed
---------------------
1. Interactive NLP ran inside a **forked child after HuggingFace models were
   loaded**. That routinely deadlocked (tokenizers/Rayon) until the 90s budget
   returned HTTP 408.
2. Fine-tuned disease classification still launched **three extra zero-shot
   XLM-RoBERTa heads** (sentiment / event_type / relevance) on the URL path.
3. Worker HTTP timeout (180s) and gateway sync timeout (30s) were not aligned
   with a realistic CPU inference window.
4. On 408 the worker **immediately ran rules-only** and cached that event, so
   retries kept serving the weak result.

Default behaviour now
---------------------
Floors are **in the Python/Rust code**. Deploy does **not** need `.env` or
compose edits. An existing production `.env` with `INFERENCE_STAGE_TIMEOUT_SECONDS=90`
or `NLP_REQUEST_TIMEOUT_SECONDS=180` is clamped up; env may only raise the budget.

- Stages run **in-process** (`NLP_STAGE_ISOLATION=inprocess`) against warmed
  models. `fork` remains available as an opt-in kill switch.
- Interactive URL jobs skip auxiliary zero-shot heads. Disease, geo, and
  counts still run. DeepSeek stays off the interactive path.
- When text is already stored (RAW, or a previous 408/rules-only event), the
  worker **does not re-fetch**.
- Full NLP is retried once on 408/503/timeout. Rules-only is **opt-in**.
- The UI polls the async job until `completed` or a real failure, and does
  not accept 408/rules-only as success.

Code floors (optional env may raise, not lower)
-----------------------------------------------
| Variable | Code floor | Where | Meaning |
| --- | --- | --- | --- |
| `TRANSLATION_STAGE_TIMEOUT_SECONDS` | `60` | nlp-python | Cap for the translation stage |
| `INFERENCE_STAGE_TIMEOUT_SECONDS` | `180` | nlp-python | Floor for the inference stage |
| `NLP_REQUEST_TIMEOUT_SECONDS` | `270` | nlp-python, worker, backend | Outer HTTP budget |
| `NLP_STAGE_OVERHEAD_SECONDS` | `15` | nlp-python | Transport margin subtracted from remaining inference budget |
| `NLP_STAGE_ISOLATION` | `inprocess` | nlp-python | `inprocess` (default) or `fork` |
| `ANALYZE_URL_NLP_RETRIES` | `1` | worker | Extra Full NLP attempts on retryable errors after text is in hand |
| `ANALYZE_URL_RULES_ONLY_FALLBACK` | `false` | worker | Set `true` only if operators explicitly want rules-only after Full NLP fails |

Do not edit `docker-compose.yml` or production `.env` for this fix. Recreate
the NLP service, analysis-job-worker, and backend so they pick up the new
code (existing `.env` 90s/180s values are ignored when below the floor).

Reverse proxies in front of the **async job POST** can stay short (job
creation is fast). The browser polls `GET /api/v1/analysis-jobs/:id`.

ASEAN URL harness
-----------------
Catalog: `scripts/asean_url_catalog.py` (3+ disease/health URLs × 11 ASEAN
members including Timor-Leste, plus the Newswav Johor dengue regression).

Validate the catalog (no network):

    python3 scripts/asean_url_accuracy_harness.py --catalog-only
    python3 -m unittest scripts/test_asean_url_catalog.py

Run against a warm local stack (login token required in production-like auth):

    NLP_API_URL=http://localhost:3010/nlp \
    NLP_API_TOKEN='<session token>' \
    python3 scripts/asean_url_accuracy_harness.py

Run against production:

    NLP_API_URL=https://abvc-surveillance.org/nlp \
    NLP_API_TOKEN='<session token>' \
    python3 scripts/asean_url_accuracy_harness.py --force-refresh

Each row records HTTP status, Full NLP vs weak/rules-only, disease, country,
province/city, case_count, death_count, needs_review, latency_ms, and error.
Missing counts stay null. Success gate with a **warm** NLP service: **≥80%
Full NLP** (not rules-only / not 408). The Newswav URL should extract Dengue,
Malaysia, about 9954 cases and 13 deaths, and must not tag Measles/Indonesia.

Auth and SSRF
-------------
`POST /api/v1/analyze-url` still requires a session. Collector/backend SSRF
allowlists are unchanged. This change does not open the fetch surface.
