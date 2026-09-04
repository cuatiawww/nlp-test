# SKDR IBS & EBS Data Matrix

Dokumen ini menjelaskan bentuk data yang diproses oleh integrasi SKDR IBS dan
EBS, tempat penyimpanannya, serta pemetaan data menuju dashboard NLP.

> Catatan: SKDR menyimpan seluruh record API asli sebagai JSON. Nama field
> aktual dapat berbeda antar-response. Matriks ini mengikuti alias field yang
> sudah didukung oleh collector dan perlu dikonfirmasi dengan payload produksi.

## 1. Definisi sumber

| Sumber aplikasi | Endpoint teknis | Keterangan |
|---|---|---|
| EBS | `POST /api/ebs` | Mengambil record EBS berdasarkan tahun dan pagination. |
| IBS | `POST /api/Alert` | IBS adalah label aplikasi untuk endpoint teknis Alert. Data diambil per minggu epidemiologi. |

Konfigurasi API berada di environment collector:

| Environment | Fungsi |
|---|---|
| `SKDR_API_URL` | Base URL API SKDR. Default `https://skdr.kemkes.go.id`. |
| `SKDR_USER_KEY` | Credential API. Tidak disimpan di database. |
| `SKDR_EBS_LIMIT` | Batas record per halaman EBS. |
| `SKDR_ALERT_LIMIT` | Batas record per halaman IBS/Alert. |
| `SKDR_ALERT_LOOKBACK_WEEKS` | Jumlah minggu IBS yang diambil pada sinkronisasi normal. |
| `SKDR_FETCH_TIME` | Jadwal sinkronisasi harian. |

## 2. Parameter request API

Collector menggunakan `multipart/form-data`, bukan JSON body.

| Parameter | EBS | IBS/Alert | Contoh |
|---|---:|---:|---|
| `tahun` | Ya | Ya | `2026` |
| `limit` | Ya | Ya | `100` atau `500` |
| `page` | Ya | Ya | `1` |
| `minggu` | Tidak | Ya | `12` |

## 3. Matriks penyimpanan data

| Layer | Tabel/queue | Isi utama | Status |
|---|---|---|---|
| Source registry | `collector_sources` | Nama sumber, tipe `skdr_api`, endpoint `ebs`/`alert`, schedule, enabled | Sudah tersedia |
| Run monitoring | `collector_runs` | Status proses, jumlah ditemukan, jumlah diproses, error | Sudah tersedia |
| Raw SKDR | `skdr_reports` | Payload API asli, endpoint, tahun, minggu, tanggal, hash, dedupe | Sudah tersedia |
| NLP input | RabbitMQ `disease.skdr` | Teks normalisasi dan referensi `skdr_report_id` | Sudah tersedia |
| Raw NLP | `raw_reports` | Teks yang dikirim ke NLP dan status processing | Sudah tersedia |
| NLP result | `disease_events` | Penyakit, lokasi, kasus, kematian, confidence, alert, koordinat | Sudah tersedia |

## 4. Kolom tabel `skdr_reports`

| Kolom | Contoh isi | Fungsi |
|---|---|---|
| `id` | UUID | ID internal record SKDR |
| `source_id` | UUID | Relasi ke `collector_sources` |
| `endpoint_name` | `ebs` / `ibs` | Asal record |
| `external_key` | ID dari API | Kunci record dari SKDR jika tersedia |
| `report_year` | `2026` | Tahun laporan |
| `epidemiological_week` | `12` | Minggu epidemiologi |
| `report_date` | `2026-03-20` | Tanggal laporan yang dinormalisasi |
| `page_number` | `1` | Halaman API |
| `payload` | JSON object | Seluruh record asli API |
| `normalized_text` | Teks laporan | Teks standar untuk NLP |
| `payload_hash` | SHA-256 | Deteksi perubahan payload |
| `dedupe_key` | SHA-256 | Mencegah duplikasi lintas EBS/IBS |
| `raw_report_id` | UUID/null | Relasi ke hasil penyimpanan `raw_reports` |
| `last_enqueued_at` | Timestamp/null | Waktu terakhir dikirim ke queue NLP |
| `fetched_at` | Timestamp | Waktu diambil dari API |

## 5. Field payload API yang dikenali collector

Collector mencari beberapa alias field agar response API yang berbeda tetap
bisa diproses.

| Konsep data | Alias field yang dikenali | Masuk ke |
|---|---|---|
| ID eksternal | `id`, `id_ebs`, `id_alert`, `id_event`, `uuid`, `kode`, `code`, `nomor` | `external_key` |
| Penyakit | `penyakit`, `nama_penyakit`, `disease`, `disease_name`, `jenis` | `normalized_text`, NLP |
| Lokasi | `lokasi`, `wilayah`, `provinsi`, `kabupaten`, `kota`, `location`, `region` | `normalized_text`, NLP `location_name` |
| Jumlah kasus | `kasus`, `jumlah_kasus`, `case_count`, `cases`, `jumlah` | `normalized_text`, NLP `case_count` |
| Jumlah kematian | `kematian`, `jumlah_kematian`, `death_count`, `deaths`, `meninggal` | `normalized_text`, NLP `death_count` |
| Tanggal | `tanggal`, `tanggal_laporan`, `date`, `report_date`, `created_at`, `updated_at` | `report_date`, NLP `published_at` |
| Tahun | Parameter request `tahun` | `report_year` |
| Minggu epidemiologi | Parameter request `minggu` | `epidemiological_week` |

Field lain yang dikirim oleh API tidak hilang. Field tersebut tetap berada di
`skdr_reports.payload`, tetapi belum otomatis menjadi kolom terstruktur.

## 6. Contoh payload hipotetis

Contoh berikut hanya ilustrasi struktur. Ini bukan data produksi.

```json
{
  "id": "EBS-2026-000123",
  "penyakit": "Dengue",
  "provinsi": "Jawa Barat",
  "kabupaten": "Kabupaten Bandung",
  "kecamatan": "Cileunyi",
  "tanggal_laporan": "2026-03-20",
  "minggu": 12,
  "kasus": 27,
  "kematian": 1,
  "status": "Waspada"
}
```

Record tersebut disimpan utuh di `skdr_reports.payload` dan dibuatkan teks
normalisasi seperti:

```text
SKDR EBS
Penyakit: Dengue
Lokasi: Jawa Barat
Kasus: 27
Kematian: 1
Tahun: 2026
Minggu epidemiologi: 12
Tanggal laporan: 2026-03-20
Data SKDR: {...payload asli...}
```

## 7. Data yang masuk ke `disease_events`

Setelah masuk queue `disease.skdr`, worker mengirim teks normalisasi ke NLP.
Hasilnya disimpan sebagai event penyakit:

| Kolom `disease_events` | Sumber hasil |
|---|---|
| `source_type` | `skdr_api` |
| `source_name` | Nama source SKDR |
| `published_at` | Tanggal laporan |
| `original_text` | `normalized_text` |
| `location_name` | Hasil ekstraksi lokasi NLP |
| `geom` | Koordinat jika NLP berhasil menemukan lokasi |
| `disease_extracted` | Penyakit hasil ekstraksi |
| `disease_classification` | Klasifikasi penyakit NLP |
| `case_count` | Jumlah kasus hasil NLP |
| `death_count` | Jumlah kematian hasil NLP |
| `confidence` | Confidence hasil NLP |
| `outbreak_alert` | Hasil aturan alert NLP |
| `raw_report_id` | Relasi ke `raw_reports` |

## 8. Penempatan data di aplikasi

| Kebutuhan | Sumber yang dipakai |
|---|---|
| Melihat payload SKDR asli | `skdr_reports.payload` |
| Melihat status sinkronisasi | `collector_runs` |
| Pencarian penyakit/lokasi | `disease_events` melalui `/api/v1/events` |
| Ringkasan dashboard | `/api/v1/summary`, `/api/v1/events/stats`, `/api/v1/public-dashboard` |
| Peta penyakit | `disease_events.location_name` dan `disease_events.geom` |
| Audit sumber data | `collector_sources` dan `skdr_reports.source_id` |

## 9. Rekomendasi pengembangan berikutnya

Untuk analisis epidemiologi yang lebih akurat, data SKDR sebaiknya tidak hanya
dipaksa menjadi `disease_events`, karena satu record SKDR dapat berupa
rekapitulasi mingguan dan bukan satu berita atau satu kejadian.

Disarankan membuat tabel terstruktur tambahan, misalnya `skdr_observations`,
dengan field:

| Kelompok | Field yang disarankan |
|---|---|
| Identitas | `skdr_report_id`, `endpoint_name`, `external_key` |
| Waktu | `report_year`, `epidemiological_week`, `report_date` |
| Wilayah | `country`, `province`, `district`, `subdistrict`, `village` |
| Penyakit | `disease_code`, `disease_name`, `syndrome` |
| Indikator | `suspected_count`, `probable_count`, `confirmed_count`, `death_count` |
| Operasional | `facility_name`, `reporting_unit`, `status` |
| Audit | `payload JSONB`, `created_at`, `updated_at` |

Tabel tambahan tersebut dapat dipakai untuk matriks mingguan, grafik tren,
rekap per provinsi/kabupaten, dan peta SKDR tanpa mencampur angka rekap SKDR
dengan event berita atau media sosial.

## 10. Query untuk melihat isi aktual

Jalankan di server tanpa menampilkan `SKDR_USER_KEY`:

```bash
docker exec db-postgres psql -U postgres -d disease_ai -c \
  "SELECT endpoint_name, COUNT(*), MIN(report_date), MAX(report_date)
   FROM skdr_reports GROUP BY endpoint_name ORDER BY endpoint_name;"
```

Melihat satu payload terbaru:

```bash
docker exec db-postgres psql -U postgres -d disease_ai -c \
  "SELECT endpoint_name, report_year, epidemiological_week, report_date,
          jsonb_pretty(payload)
   FROM skdr_reports ORDER BY fetched_at DESC LIMIT 1;"
```

Melihat apakah record sudah diteruskan ke NLP:

```bash
docker exec db-postgres psql -U postgres -d disease_ai -c \
  "SELECT endpoint_name,
          COUNT(*) AS total,
          COUNT(raw_report_id) AS linked_to_nlp,
          COUNT(*) FILTER (WHERE last_enqueued_at IS NOT NULL) AS enqueued
   FROM skdr_reports GROUP BY endpoint_name ORDER BY endpoint_name;"
```
