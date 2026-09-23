# Slice 7 — multilingual evidence and event attribution

Tanggal: 2026-09-23  
Status: selesai lokal, belum dipush

## Hasil utama

Pipeline sekarang tetap menjadikan teks asli sebagai sumber evidence. Translation/NLLB tetap auxiliary dan tidak menjadi blocker untuk extraction atau event composition. Candidate metric dipisahkan berdasarkan country scope, sentence/evidence, qualifier, dan reporting period sebelum masuk ke event.

Perbaikan generik yang diterapkan:

- `new`, `cumulative`, `comparison`, `historical`, `suspected`, `confirmed`, dan explicit-zero death dipertahankan sebagai qualifier.
- Metric naratif selalu digabungkan dengan metric-location pass; sebelumnya pass naratif dapat dilewati ketika kandidat lokasi sudah ditemukan.
- `2 new cases` dan `121 cumulative cases` dalam satu klausa tidak lagi kehilangan salah satunya.
- Death dan case pada scope/periode yang sama dapat digabung tanpa mengubah qualifier cases.
- Angka pada token seperti `COVID-19` tidak lagi dibaca sebagai angka kasus.
- Frasa referensial seperti `two cases were from Jakarta and Sulawesi` tidak membuat event kota duplikat apabila tidak ada count per kota.
- Country-level fallback memakai country evidence dan tidak memakai publisher location sebagai event location.
- Evidence, sentence id, offset, dan `evidence_offset_space=original` tetap berasal dari artikel asli.
- Native country aliases, language markers, metric vocabulary, dan fallback lexicon diload dari DB dengan safety defaults untuk cold start.

## Perubahan file

- `services/nlp-python/app/surveillance_extraction.py`: metric candidate, country/period attribution, qualifier scope, native-script/date handling, and merge guards.
- `services/nlp-python/app/intelligence.py`: scoped metric merge, new/cumulative/historical fields, explicit-zero deaths, and event attribution.
- `services/nlp-python/app/pipeline.py`: projection of metric fields and multi-country parent/sub-event composition.
- `services/nlp-python/app/schemas.py`: `new_cases`, `cumulative_cases`, and `historical_cases`.
- `services/nlp-python/app/extractors.py`: native country aliases and longest compound-country matching.
- `services/nlp-python/app/config.py`: DB lexicon plus deterministic safety defaults.
- `services/nlp-python/app/tests/test_narrative_intelligence.py`: regression for country-scoped new/cumulative metrics and referential locations.

## Bahasa dan aksara

Coverage yang dipakai pipeline saat ini adalah language code `id`, `ms`, `th`, `vi`, `km`, `lo`, `my`, `tl`, serta `en` sebagai auxiliary/bridge. Ini mencakup bahasa utama 11 negara ASEAN melalui country/location scope; bukan berarti setiap negara mempunyai model translation khusus.

Thai, Lao, Myanmar, dan Khmer diprioritaskan lewat unicode-script detection dan evidence asli. Latin-script Malay/Indonesian dibedakan dengan marker DB plus fallback marker, bukan hanya `langdetect`. Model besar tidak dimuat per artikel; NLLB tetap asynchronous dan lazy.

## Validasi

### Automated regression

```text
Ran 222 tests in 55.913s
OK
```

Focused narrative/surveillance tests: `16/16 OK`.

### Gold field-level

JSON final tersimpan di [`slice7-field-gold-2026-09-23-after-fix.json`](slice7-field-gold-2026-09-23-after-fix.json).

| Field | Precision | Recall | TP / FP / FN |
|---|---:|---:|---:|
| Disease | 0.90 | 1.00 | 18 / 2 / 0 |
| Country | 1.00 | 0.90 | 18 / 0 / 2 |
| Location | 1.00 | 1.00 | 8 / 0 / 0 |
| Cases | 1.00 | 1.00 | 19 / 0 / 0 |
| Deaths | 1.00 | 1.00 | 9 / 0 / 0 |
| Time | 1.00 | 1.00 | 5 / 0 / 0 |
| Evidence | 1.00 | 1.00 | 20 / 0 / 0 |

Automated test pass rate sudah 100% (`222/222`), tetapi field-level gold belum 100%. Dua residual country false-negative dan dua disease normalization mismatch tetap perlu gold follow-up; tidak diklaim selesai sempurna.

### Local invariant smoke

| Skenario | Hasil |
|---|---|
| Vietnam, dengue, sekitar 70.000 cases, 9 deaths | country `Vietnam`, disease `Dengue`, cases `70000`, deaths `9` |
| Yemen, 120.000 refugees, conflict context | scope `OUTSIDE ASEAN`, original evidence `Yemen`, disease `UNKNOWN`, cases `0`, health `false` |
| Phnom Penh violence/policy text tanpa disease evidence | country context boleh terdeteksi, tetapi `is_health_related=false`, cases `0`, deaths `0` |
| Multi-country COVID-style text | Singapore dan Indonesia menjadi sub-event terpisah; Indonesia menyimpan `new_cases=2`, `cumulative_cases=121`, explicit `death_count=0` |

Smoke di atas memakai teks lokal berbentuk fixture untuk memeriksa invariant. Tiga URL acceptance asli belum tersedia sebagai fixture lokal pada gold pack ini, jadi tidak diklaim sebagai URL-level pass.

## Residual risk

- Gold disease masih memiliki dua mismatch label granular (`Poliomyelitis` vs `Polio (cVDPV2)`, dan `Mpox` vs `Mpox (clade Ib)`). Ini normalisasi konsep, bukan kegagalan metric attribution.
- Country recall masih 0.90 pada dua fixture yang country mention-nya tidak ter-resolve; perlu perluasan alias/NER berbasis DB, bukan regex URL-specific.
- Native-script semantic understanding tetap bergantung pada vocabulary DB dan preprocessing; tanpa evidence lexical yang cukup, NLLB tidak boleh dipakai untuk mengarang entity atau angka.
- Top-level `MULTI_COUNTRY` merupakan agregasi; `sub_events` tetap source of truth untuk country/disease/metric/time.

Tidak ada batch re-analysis dan tidak ada push ke Gitea/GitHub pada tahap ini.
