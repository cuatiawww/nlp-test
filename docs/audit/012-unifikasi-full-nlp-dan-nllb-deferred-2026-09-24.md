# Audit 012 — Unifikasi Full NLP dan NLLB Deferred

Tanggal: 2026-09-24

## Keputusan

Analisis URL dan crawling menggunakan satu kontrak Full NLP:

```text
/nlp/analyze/raw
pipeline.run()
interactive=false
rules_only=false
```

Bounded analysis tidak lagi menjadi endpoint produksi dan worker tidak lagi
mencoba rules-only ketika Full NLP gagal. Artikel yang berhasil diambil tetap
disimpan sebagai RAW dengan status gagal dan `needs_review=true`; sistem tidak
mengubahnya menjadi event NLP dengan kualitas lebih rendah.

## Perubahan kode

| Area | Perubahan |
|---|---|
| NLP API | Router `/nlp/analyze-bounded` dilepas. Endpoint produksi memaksa profil Full NLP. |
| Backend URL | Analisis URL sinkron mengirim payload ke `/nlp/analyze/raw`. |
| Worker | Fallback `rules_only` dan konfigurasi `ANALYZE_URL_RULES_ONLY_FALLBACK` dilepas. Retry tetap Full NLP. |
| Input | Backend dan worker menggunakan `NLP_INPUT_MAX_CHARS`, default 35.000 karakter. |
| NLLB | Tidak dijalankan inline oleh `pipeline.run`; request utama menerima status pending dan worker mengantrekan enrichment setelah hasil utama tersimpan. |
| Strict surveillance | Belum diubah. Evaluasinya dilakukan setelah kontrak jalur sudah seragam. |

## Alur baru

```text
URL / continuous source
  → collector
  → shared text preparation
  → /nlp/analyze/raw
  → pipeline.run Full NLP
  → disease/location/metric/sub_events
  → persist result
  → queue NLLB enrichment jika diperlukan
```

NLLB hanya berfungsi sebagai bantuan semantik untuk bahasa yang memerlukannya.
Teks asli tetap menjadi sumber evidence untuk disease, lokasi, cases, deaths,
dan hubungan event.

## Dampak yang diharapkan

- Jalur URL dan crawling tidak lagi memiliki profil NLP berbeda.
- Artikel panjang tidak dipotong berbeda antara backend dan worker.
- Timeout tidak menghasilkan event rules-only yang dapat terlihat seperti hasil
  Full NLP.
- NLLB tidak menahan hasil surveillance utama.
- Strict surveillance masih dapat menjadi tahap mahal; hal itu sengaja belum
  disentuh dalam perubahan ini agar dampaknya dapat diukur terpisah.

## Verifikasi

- Python syntax check: berhasil.
- Referensi produksi ke bounded endpoint dan rules-only fallback: sudah dilepas.
- Regression test worker belum dapat dijalankan karena environment WSL tidak
  memiliki dependency `pika`.
- Rust formatter belum dapat dijalankan karena `cargo` tidak tersedia di
  environment WSL.
