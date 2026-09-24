# Migrasi dari ICD-11 ke Disease Master Lokal

Tanggal: 2026-09-24  
Status: perubahan lokal, belum commit/push

## Keputusan

Sistem tidak lagi melakukan lookup, OAuth token exchange, auto-discovery,
atau auto-learning ke API ICD-11/WHO. Klasifikasi penyakit hanya boleh memakai
konsep aktif dari database lokal:

- `disease_concepts.disease_id`
- `disease_concepts.canonical_name`
- `disease_concepts.source`
- alias aktif pada `disease_aliases`

Migration master yang menjadi sumber data adalah
`database/init/120_clean_and_inject_asean_master_diseases.sql`.

## Alur baru

```text
artikel / URL
  -> extractor + optional DeepSeek candidate
  -> pencocokan canonical name/alias ke Disease Master lokal
  -> disease_id + canonical_name + evidence + confidence
  -> event/sub-event/matrix/dashboard
```

Jika istilah tidak ada di master lokal, hasilnya tetap menjadi kandidat/review;
sistem tidak boleh membuat kode ontologi baru atau mencari ke layanan eksternal.

## Perubahan kode

- Resolver baru berada di `services/nlp-python/app/disease_master.py`.
- `services/nlp-python/app/icd11.py`, worker sinkronisasi WHO, dan helper
  ekspor alias WHO dihapus.
- `pipeline.run` mengisi `disease_id` dan `master_source`; DeepSeek hanya
  memilih konsep yang sudah ada di master lokal.
- Endpoint baru adalah `POST /disease/resolve`. Alias tersembunyi
  `/icd11/resolve` dipertahankan sementara untuk kompatibilitas klien lama,
  tetapi alias tersebut hanya memanggil resolver lokal dan tidak mengakses API.
- FE Disease Master, directory, review, crawl matrix, dashboard, dan laporan
  tidak lagi menampilkan ICD-11/ontology code; FE memakai ID dan source lokal.

## Kompatibilitas data lama

Kolom legacy `icd11_code` dan `disease_icd11_code` belum dihapus dari schema
database atau tipe response. Kolom tersebut nullable dan tidak lagi diisi oleh
resolver baru. Ini mencegah record lama gagal dibaca sambil memindahkan sumber
keputusan ke `disease_concept_id`/`disease_id`.

## Verifikasi lokal

- `py_compile` untuk app NLP dan worker: lulus.
- Test resolver Disease Master lokal: 3 test lulus.
- Test relation worker: 5 test lulus.
- Build FE belum dapat dijalankan di host ini karena `node_modules` tidak
  tersedia pada workspace UNC; tidak ada commit atau push dilakukan.
