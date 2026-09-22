# Field-fix PR: country, metric, location, time, evidence

Tanggal: 2026-09-22

Scope PR ini hanya memperbaiki field intelligence pada `pipeline.run` dan
komponen extractor/evidence yang sudah ada. Collector, reanalyze adapter,
shared-core copy, dan retraining tidak disentuh.

## Masalah yang diperbaiki

- Metric source-first sebelumnya dapat mengambil angka locality yang muncul
  belakangan sebagai total artikel. Selector sekarang memberi prioritas pada
  metric yang terikat negara artikel, tetapi tetap mempertahankan breakdown
  locality sebagai evidence/location candidate.
- Historical comparator tidak boleh menggantikan angka tahun aktif.
- Focal single-case tidak boleh berubah menjadi total historis negara.
- Evidence tidak lagi terpotong karena ellipsis editorial, number word, atau
  kalimat konteks lokasi/clinical yang diperlukan untuk attribution.
- Gold scorer sekarang menilai semua lokasi source-backed di `locations[]`,
  bukan hanya parent `location_name` yang dapat benar secara aggregate-country.

## Acceptance regression

Kasus inti:

- Thailand dengue: `21,620` cases dan `31` deaths tidak tertimpa
  breakdown Bangkok `1,785` dan `4`.
- Focal H5N1: satu kasus baru tidak tertimpa total historis `19`.
- Location hierarchy: candidate seperti Siem Reap, Aceh, Tay Ninh, Khanh
  Hoa, Dili, dan Phnom Penh tetap terbaca dari evidence asli.
- Country isolation dan death/case invariants tetap dijaga oleh guard yang
  sudah ada.

## Gold-20 before/after

Baseline sebelum field-fix ada di
`slice7-field-gold-2026-09-22.json`. Hasil setelah field-fix ada di
`slice7-field-gold-2026-09-22-after-field-fix.json`.

| Field | Baseline P/R | After P/R |
|---|---:|---:|
| disease | 0.90 / 1.00 | 0.90 / 1.00 |
| country | 0.9474 / 0.9474 | 1.00 / 0.95 |
| cases | 0.7895 / 1.00 | 1.00 / 1.00 |
| deaths | 1.00 / 1.00 | 1.00 / 1.00 |
| location | 0.50 / 0.1429 | 1.00 / 1.00 |
| time | not scored | 1.00 / 1.00 |
| evidence | 0.75 / 1.00 | 1.00 / 1.00 |

QA gate: **PASS**. Detail tersimpan di
`slice7-field-gold-qa-gate-after-field-fix-2026-09-22.json`.

Time gold hanya dianotasi pada lima fixture yang memiliki periode eksplisit
di evidence asli. Tanggal publikasi tidak dipakai sebagai event date.

## Tests

Full regression di container NLP:

```text
Ran 208 tests in 71.220s
OK
```

Shared-core copy masih ditahan sampai PR field-fix ini direview/di-merge.
