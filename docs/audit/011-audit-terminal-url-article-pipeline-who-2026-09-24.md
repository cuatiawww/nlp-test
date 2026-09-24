# Audit Terminal URL Article Pipeline - WHO

Tanggal pengujian: 24 September 2026  
Mode: terminal, backend URL Analyzer, `async=true`, `force_refresh=true`  
Tujuan: mencatat keluaran aktual sistem tanpa membetulkan, menebak, atau mengisi hasil yang tidak dikembalikan sistem.

## URL yang diuji

1. `https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON617?utm_source=chatgpt.com`
2. `https://www.who.int/news/item/15-09-2026-new-strategy-to-build-a-healthier-market-for-childhood-cancer-medicines?utm_source=chatgpt.com`

## Jalur pengujian

```text
POST /api/v1/analyze-url
  -> analysis_jobs
  -> worker fetch article
  -> worker POST /nlp/analyze/raw
  -> pipeline.run
  -> simpan result
  -> GET /api/v1/analysis-jobs/{job_id}
```

Rujukan kode:

- `services/backend-rust/src/main.rs`: submit URL dan polling `analysis-jobs`.
- `services/worker-python/app/analysis_jobs.py`: urutan `fetch` lalu `nlp`, penyimpanan result, dan aturan fallback.
- `services/nlp-python/app/main.py`: endpoint `/nlp/analyze/raw` yang memanggil `pipeline.run`.
- `services/nlp-python/app/pipeline.py`: pipeline NLP bersama.

## Status infrastruktur saat pengujian

| Komponen | Hasil terminal |
|---|---|
| Backend `localhost:8081/health` | OK |
| NLP `localhost:8000/health` | OK; model dilaporkan `fine-tuned` |
| Collector `localhost:8002/health` dari host | Tidak terbuka dari host |
| Direct import `WebScraperCollector` dari WSL | Tidak berjalan; dependency `scrapling` tidak tersedia |

Catatan: collector internal tetap berhasil mengambil URL pertama melalui worker. Jadi kegagalan direct import di WSL bukan bukti bahwa WHO memblokir crawler.

---

## Artikel 1 - WHO Disease Outbreak News

### Status job aktual

- Job ID: `728de5a2-5338-4b54-af4c-00f51fb76425`
- Submit backend: `HTTP 200`, status `queued`
- Job sempat berstatus `processing`, stage `fetch`, lalu stage `nlp`
- Fetch selesai dan artikel tersimpan
- Status akhir: `failed`, stage `finished`
- Error: `Full NLP failed (HTTPConnectionPool(host='disease-nlp-python', port=8000): Read timed out. (read timeout=270.0))`
- Warning: `article text retained. Retry Full NLP (do not silently use rules-only)`

### Data yang benar-benar diambil crawler

| Field | Nilai aktual |
|---|---|
| `http_status` | `200` |
| `fetch_mode` | `direct_http` |
| `title` | `Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo` |
| `published_at` | `2026-09-10` |
| `final_url` | `https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON617` |
| `canonical_url` | `https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON617` |
| `source_country` | kosong |
| panjang `content` | `17.857` karakter |
| `content_hash` | `3582af7dab84af42088078fc6466dd2c676626b2111eb7466cdc20eae9b5b219` |
| `url_hash` | `8a0335701ea5c5932a8dc0c5d5c8a77782aeca965824bbe7978741ea4d614c0c` |

Awal content yang dikembalikan crawler:

```text
See all DONs related to this event Read more about Ebola disease Situation at a glance Since the last Disease Outbreak News was published on 28 August 2026, the Bundibugyo virus outbreak in the Democratic Republic of the Congo has expanded to one additional health zone, Kayna, in North Kivu. This increase brings the total number of affected health zones to 61 across six out of 26 provinces of the country: Bas-Uélé, Haut-Uélé, Ituri, North Kivu, South Kivu, and Tshopo. As of 7 September 2026, the Democratic Republic of the Congo has reported 6757 confirmed cases, including 3267 deaths...
```

Angka di atas hanya terlihat di `content` mentah. Angka tersebut belum menjadi `case_count` atau `death_count` sistem karena NLP tidak mengembalikan result.

### 10 pemeriksaan pipeline

| No. | Pertanyaan | Hasil aktual |
|---:|---|---|
| 1 | Apa yang crawler ambil? | Artikel berhasil diambil HTTP 200; title, tanggal, canonical URL, hash, dan content 17.857 karakter tersedia. |
| 2 | Apa payload yang dikirim ke NLP? | Worker mencoba kontrak `/nlp/analyze/raw` dengan `text`, `source_type=web`, `source_name=URL Analyzer`, `source_country`, `published_at`, `rules_only=false`, dan `source_url`. Respons NLP tidak pernah kembali. Fungsi membentuk text dari `title + dua newline + content`; content 17.857 karakter berada di bawah batas 35.000 karakter. |
| 3 | Language / script terdeteksi apa? | Tidak tersedia. Tidak ada field `language` atau `script` pada result crawler. |
| 4 | Rules menemukan disease apa? | Tidak ada output rules yang tersimpan. Fallback rules-only tidak dijalankan karena konfigurasi fallback bersifat opt-in. |
| 5 | XLM-R menghasilkan apa? | Tidak ada output model. Health endpoint hanya melaporkan runtime model `fine-tuned`; itu bukan hasil inferensi artikel ini. |
| 6 | Location resolver menemukan lokasi apa? | Tidak ada hasil resolver yang dikembalikan. Lokasi yang tampak di teks mentah tidak boleh dianggap sebagai output resolver. |
| 7 | Angka mana yang dianggap cases/deaths? | Tidak ada `case_count`, `death_count`, atau field metric dari NLP. Angka 6757/3267 dan angka lain masih hanya teks artikel. |
| 8 | Disease, Location, Metric terhubung bagaimana? | Tidak terbentuk pada output akhir karena tahap NLP gagal sebelum result analysis tersedia. |
| 9 | `sub_events` terbentuk bagaimana? | Tidak terbentuk; field `sub_events` tidak ada pada result crawler. |
| 10 | Output akhir salah mulai dari mana? | Bukan salah ekstraksi crawler pada pengujian ini. Titik gagal terobservasi mulai dari request worker ke host internal `disease-nlp-python:8000`, yang timeout 270 detik. |

### Bentuk result akhir yang tersimpan

Result hanya berisi metadata/content hasil fetch dan `needs_review=true`. Field NLP berikut tidak ada: `language`, `disease_classification`, `disease_mentions`, `locations`, `case_count`, `death_count`, `sub_events`, dan `confidence`.

---

## Artikel 2 - WHO Childhood Cancer Medicines

### Status job aktual

- Job ID: `d563524a-92dd-460c-bc51-309cd7411926`
- Submit backend: `HTTP 200`, status `queued`
- Job sempat terpantau `processing`, stage `fetch`, lalu `processing`, stage `nlp`
- Status pengecekan terakhir: `processing`, stage `nlp`
- `result`: `null`
- `error`: `null`
- `warnings`: `[]`
- Tidak ada final result pada waktu audit ditutup.

### 10 pemeriksaan pipeline

| No. | Pertanyaan | Hasil aktual |
|---:|---|---|
| 1 | Apa yang crawler ambil? | Job sudah melewati stage `fetch` dan masuk stage `nlp`, tetapi payload hasil fetch tidak tersedia pada endpoint status saat audit ditutup. |
| 2 | Apa payload yang dikirim ke NLP? | Belum dapat dibuktikan dari result; job masih `processing`. Kontrak kode yang dipakai worker sama seperti Artikel 1. |
| 3 | Language / script terdeteksi apa? | Belum tersedia. |
| 4 | Rules menemukan disease apa? | Belum tersedia. |
| 5 | XLM-R menghasilkan apa? | Belum tersedia. |
| 6 | Location resolver menemukan lokasi apa? | Belum tersedia. |
| 7 | Angka mana yang dianggap cases/deaths? | Belum tersedia. |
| 8 | Disease, Location, Metric terhubung bagaimana? | Belum terbentuk atau belum dikembalikan. |
| 9 | `sub_events` terbentuk bagaimana? | Belum tersedia; `result=null`. |
| 10 | Output akhir salah mulai dari mana? | Belum bisa ditentukan. Observasi terakhir berhenti pada stage `nlp`, bukan pada hasil model atau validasi akhir. |

Pengecekan status tambahan sempat mengalami timeout HTTP 15 detik, lalu endpoint kembali menunjukkan job masih `processing` pada stage `nlp`.

---

## Kesimpulan audit tanpa koreksi hasil

1. Artikel pertama **berhasil di-fetch** oleh collector dan content mentahnya tersimpan.
2. Artikel pertama **belum menghasilkan output NLP**, karena koneksi worker ke `disease-nlp-python:8000` timeout.
3. Artikel kedua **sudah masuk pipeline dan mencapai stage NLP**, tetapi belum mengembalikan result ketika audit ditutup.
4. Tidak ada dasar valid dari pengujian ini untuk menyatakan disease, bahasa, lokasi, cases, deaths, confidence, atau `sub_events` sebagai output NLP untuk kedua artikel.
5. Masalah yang terbukti dari terminal adalah konektivitas/availability jalur worker ke service NLP internal, bukan kesalahan klasifikasi artikel.
6. Rules-only tidak boleh disimpulkan berjalan; warning sistem menyatakan fallback tersebut opt-in dan tidak digunakan.

## Validasi yang dijalankan

```text
GET  http://localhost:8081/health                         -> 200
GET  http://localhost:8000/health                         -> 200
POST http://localhost:8081/api/v1/analyze-url             -> 200 untuk kedua URL
GET  http://localhost:8081/api/v1/analysis-jobs/{job_id}  -> status job aktual
```

Direct import `WebScraperCollector` dari WSL tidak menjadi hasil utama karena environment tersebut tidak memiliki dependency `scrapling`. Tidak ada perubahan pipeline atau pembetulan hasil dilakukan selama audit ini.
