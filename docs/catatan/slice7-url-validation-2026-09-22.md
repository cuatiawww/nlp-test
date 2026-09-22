# Slice 7 ASEAN URL validation

- Run: `2026-09-22T02:48:05.931372+00:00`
- URLs: `29`
- Full NLP: `25/29` (86.21%)
- Rules-only, timeout, and fetch failures remain visible; no fallback values are substituted.

| ID | Expected country | Full NLP | Status | Disease | Country out | Cases | Deaths | Latency ms | Error |
|---|---|---:|---|---|---|---:|---:|---:|---|
| IDN-S7-01 | Indonesia | True | completed | Dengue | Indonesia | 161752 | 673 | 9454 | — |
| IDN-S7-02 | Indonesia | True | completed | Measles | Indonesia | 22074 | 0 | 10913 | — |
| IDN-S7-03 | Indonesia | True | completed | Measles | Indonesia | 3 | 17 | 10882 | — |
| IDN-S7-04 | Indonesia | False | failed | — | — | — | — | 57347 | Full NLP failed (NLP HTTP 408: {"detail":"NLP stage exceeded budget (27s)"}). Article text was fetched; retry Full NLP (do not silently use rules-only). |
| PHL-S7-01 | Philippines | False | failed | — | — | — | — | 1937 | Source returned a browser challenge or blocked access: source returned a browser challenge status=403 |
| PHL-S7-02 | Philippines | False | failed | — | — | — | — | 57828 | Full NLP failed (NLP HTTP 408: {"detail":"NLP stage exceeded budget (27s)"}). Article text was fetched; retry Full NLP (do not silently use rules-only). |
| PHL-S7-03 | Philippines | False | failed | — | — | — | — | 1904 | Source returned a browser challenge or blocked access: source returned a browser challenge status=403 |
| MYS-S7-01 | Malaysia | True | completed | Dengue | Malaysia | 51046 | 0 | 10342 | — |
| MYS-S7-02 | Malaysia | True | completed | Mpox | Malaysia | 23 | 0 | 10302 | — |
| THA-S7-01 | Thailand | True | completed | Hand, foot and mouth disease | Thailand | 53362 | 53362 | 6635 | — |
| THA-S7-02 | Thailand | True | completed | Melioidosis | Indonesia | 3844 | 77 | 11109 | — |
| VNM-S7-01 | Vietnam | True | completed | Measles | Vietnam | 42000 | 5 | 11170 | — |
| VNM-S7-02 | Vietnam | True | completed | Dengue | Vietnam | 57021 | 4 | 8085 | — |
| VNM-S7-03 | Vietnam | True | completed | Dengue | Vietnam | 297289 | 0 | 10876 | — |
| SGP-S7-01 | Singapore | True | completed | Measles | Singapore | 40 | 0 | 14906 | — |
| SGP-S7-02 | Singapore | True | completed | Dengue | Singapore | 600 | 0 | 14870 | — |
| SGP-S7-03 | Singapore | True | completed | Dengue | Singapore | 39 | 0 | 8005 | — |
| KHM-S7-01 | Cambodia | True | completed | Dengue | Cambodia | 46 | 46 | 8537 | — |
| KHM-S7-02 | Cambodia | True | completed | Avian influenza | Cambodia | 986 | 12 | 21914 | — |
| LAO-S7-01 | Laos | True | completed | Dengue | Laos | 20115 | 11 | 6360 | — |
| LAO-S7-02 | Laos | True | completed | Dengue | Laos | 29032 | 17 | 14302 | — |
| LAO-S7-03 | Laos | True | completed | Dengue | Laos | 214 | 0 | 9354 | — |
| MMR-S7-01 | Myanmar | True | completed | Acute diarrhea | Myanmar | 238 | 0 | 11085 | — |
| MMR-S7-02 | Myanmar | True | completed | Dengue | Myanmar | 10 | 0 | 6641 | — |
| BRN-S7-01 | Brunei | True | completed | Tuberculosis | Brunei | 235 | 0 | 9626 | — |
| BRN-S7-02 | Brunei | True | completed | Influenza | Brunei | 259 | 259 | 6419 | — |
| TLS-S7-01 | Timor-Leste | True | completed | Malaria | Timor-Leste | 223000 | 0 | 12407 | — |
| TLS-S7-02 | Timor-Leste | True | completed | Chikungunya | Timor-Leste | 195 | 0 | 25075 | — |
| REG-S7-01 | — | True | completed | Dengue | Malaysia | 505 | 174 | 27991 | — |
