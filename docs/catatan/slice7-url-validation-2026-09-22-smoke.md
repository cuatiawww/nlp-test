# Slice 7 ASEAN URL validation

- Run: `2026-09-22T02:40:08.933602+00:00`
- URLs: `5`
- Full NLP: `3/5` (60.0%)
- Rules-only, timeout, and fetch failures remain visible; no fallback values are substituted.

| ID | Expected country | Full NLP | Status | Disease | Country out | Cases | Deaths | Latency ms | Error |
|---|---|---:|---|---|---|---:|---:|---:|---|
| IDN-S7-01 | Indonesia | True | completed | Dengue | Indonesia | 161752 | 673 | 9401 | — |
| IDN-S7-02 | Indonesia | True | completed | Measles | Indonesia | 22074 | 0 | 12508 | — |
| IDN-S7-03 | Indonesia | True | completed | Measles | Indonesia | 3 | 17 | 9731 | — |
| IDN-S7-04 | Indonesia | False | failed | — | — | — | — | 58355 | Full NLP failed (NLP HTTP 408: {"detail":"NLP stage exceeded budget (27s)"}). Article text was fetched; retry Full NLP (do not silently use rules-only). |
| PHL-S7-01 | Philippines | False | failed | — | — | — | — | 1918 | Source returned a browser challenge or blocked access: source returned a browser challenge status=403 |
