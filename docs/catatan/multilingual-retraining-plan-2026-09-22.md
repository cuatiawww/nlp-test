# Multilingual retraining preparation — 2026-09-22

## Status

Retraining belum dijalankan. Yang sudah dibuat adalah manifest yang memisahkan
gold evaluation dari antrean anotasi URL. Ini sengaja: hasil prediksi pipeline
tidak boleh dipakai sebagai label training tanpa review, dan gold evaluation
tidak boleh bocor menjadi data training.

```text
docs/catatan/multilingual-retraining-manifest-2026-09-22.jsonl
20  evaluation / reviewed gold
4   annotation_queue / belum berlabel
0   eligible_for_training
```

Manifest dibuat dengan:

```bash
python3 scripts/build_multilingual_retraining_manifest.py
```

Setiap baris menyimpan `original_text` dan `native_evidence`. `translated_text`
hanya field tambahan; tidak pernah menggantikan sumber asli. Baris URL yang
belum dianotasi memiliki `labels` bernilai `null` dan tidak boleh masuk ke
Trainer.

## Mengapa belum langsung retrain

Dataset gold-20 adalah evaluasi regresi, bukan corpus training. Empat hasil
Slice 7 yang masuk masih berupa prediksi dan memerlukan anotasi field-level:
disease, country, locality, cases, deaths, time, dan evidence. Melatih dari
prediksi akan memperkuat kesalahan yang sedang ingin kita perbaiki.

Langkah berikutnya setelah anotasi:

1. Tambahkan baris berlabel ke manifest dengan `role=training` dan
   `eligible_for_training=true`.
2. Split berdasarkan `source_hash`/artikel, bukan potongan kalimat acak, agar
   artikel yang sama tidak masuk train dan evaluation.
3. Fine-tune `xlm-roberta-base` menjadi checkpoint
   `AutoModelForSequenceClassification`; base encoder tidak boleh dipakai
   langsung sebagai zero-shot/NLI classifier.
4. Evaluasi pada gold-20 yang tetap terisolasi. Promosikan checkpoint hanya
   jika disease, country, cases, deaths, time, dan native evidence tidak
   mengalami regresi.
5. Deploy sebagai model optional/lazy. Extraction dari teks asli tetap
   menjadi authority; translation NLLB tetap auxiliary.

## Guard checkpoint

`app/models/classifier.py` sekarang memvalidasi `architectures` pada
`config.json` sebelum membuat pipeline. Checkpoint tanpa
`SequenceClassification` ditolak dan masuk cooldown, sehingga tidak dibuat
head acak yang menghasilkan skor tampak meyakinkan. Ini menjaga pipeline
deterministik dan mencegah checkpoint yang salah memperlambat setiap artikel.

## Batasan yang masih ada

- Empat antrean Slice 7 belum menjadi gold karena belum ada anotasi manusia.
- Akurasi field-level belum boleh diklaim 99%.
- Shared core Analyze URL/reanalyze/collector tetap menunggu QA field-level
  lulus; pekerjaan ini tidak mengubah UI atau membuat fork pipeline.
