# Shared NLP Core Implementation — 2026-09-22

## Scope

Plan 1–7 QA field-level sudah lulus sebelum perubahan ini. Shared-core ini
menyatukan jalur ekstraksi dan event composition tanpa mengubah UI atau
menambahkan model translation baru.

## Jalur setelah perubahan

| Consumer | Peran | Jalur NLP |
|---|---|---|
| Analyze URL | HTTP/bounded adapter | `pipeline.run` |
| Reanalyze job | fetch, retry, persist adapter | `pipeline.run` melalui `/nlp/analyze/url` |
| Matrix collector/worker | fetch, queue, filter, persist adapter | `pipeline.run` melalui `/nlp/analyze/raw` |
| Legacy surveillance consumer | response-shape adapter | `/nlp/analyze/surveillance` → `pipeline.run` |

`/nlp/analyze/surveillance` tidak lagi menjalankan extractor sendiri. Fungsi
`surveillance_from_analysis` hanya mengubah `AnalyzeResponse` menjadi kontrak
surveillance lama; entity, metric relation, location attribution, temporal
guard, dan multi-event tetap berasal dari `pipeline.run`.

## Kontrak yang dipertahankan

- teks/evidence asli tetap berasal dari core;
- event per disease tetap dapat digabung pada level country tanpa menjumlahkan
  aggregate dan regional breakdown dua kali;
- death metric tidak dibuat dari case metric oleh adapter;
- multi-country tetap menjadi beberapa `SurveillanceLocation`;
- NLLB/translation tetap auxiliary dan tidak dipanggil oleh adapter ini.

## Verification

- shared adapter tests: 3 passed;
- multi-event foundation regression: 5 passed;
- Python syntax check: NLP, collector, dan matrix worker passed;
- full regression berikutnya dijalankan setelah container runtime stabil.

Reference source: shared core `pipeline.run` pada HEAD `129e252` sebelum
perubahan surgical ini.

## Masih ditahan

- UI aggregation/modal tidak diubah;
- retraining tidak dimulai pada PR ini;
- persistence schema berbeda antara URL event dan crawl matrix tetap menjadi
  tanggung jawab adapter masing-masing.
