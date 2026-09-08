# Panduan Menyeluruh Metrik dan Data Dashboard

Dokumen ini menjelaskan dari mana data dashboard berasal, bagaimana data
diproses, arti setiap istilah, serta bagian mana yang sudah dinamis dan mana
yang masih berupa template/fallback.

Dokumen ini mengikuti implementasi aktual pada backend Rust, service NLP,
collector Python, dan frontend Next.js. Angka pada dashboard bukan otomatis
berarti jumlah kasus resmi nasional; sebagian besar adalah sinyal hasil
ekstraksi dari sumber yang dikumpulkan sistem.

## 1. Gambaran besar sistem

```text
Sumber data
  ├─ RSS / website berita
  ├─ media sosial / CSV
  ├─ SKDR IBS dan EBS
  └─ URL yang dianalisis manual
        ↓
Collector dan collector_runs
        ↓
raw_reports / skdr_reports
        ↓ RabbitMQ
Service NLP
  ├─ bahasa dan terjemahan
  ├─ penyakit dan alias WHO ICD-11
  ├─ kasus dan kematian
  ├─ lokasi dan koordinat
  ├─ relevance, sentiment, event type
  └─ outbreak rule dan confidence
        ↓
disease_events
        ↓
Backend aggregation
        ↓
Dashboard, peta, grafik, tabel, dan detail bukti
```

## 2. Matriks sumber data dan penyimpanan

| Sumber | Contoh | Penyimpanan awal | Hasil akhir | Keterangan |
|---|---|---|---|---|
| `rss` | Feed berita | `raw_reports` | `disease_events` | Artikel diambil dari RSS dan diproses NLP. |
| `web` | Website berita, URL Analyzer | `raw_reports` | `disease_events` | Isi artikel, judul, URL, dan tanggal diproses. |
| `social_media` | Facebook, Instagram, CSV sosial media | `raw_reports` | `disease_events` | Sinyal media sosial harus dibaca sebagai indikasi, bukan konfirmasi klinis. |
| `csv` | Dataset lokal | `raw_reports` | `disease_events` | Struktur tergantung importer CSV. |
| `skdr_api` EBS | `/api/ebs` | `skdr_reports` | `raw_reports` lalu `disease_events` | Payload asli disimpan sebagai JSONB. |
| `skdr_api` IBS | `/api/Alert` | `skdr_reports` | `raw_reports` lalu `disease_events` | Di aplikasi endpoint teknis `Alert` diberi label `ibs`. |
| URL manual | Halaman Analyze URL | `raw_reports` | `disease_events` | Record lama untuk URL yang sama dibersihkan sebelum hasil baru disimpan. |

### Tabel utama

| Tabel | Isi | Fungsi |
|---|---|---|
| `collector_sources` | Source, jenis, jadwal, status aktif | Registry sumber yang boleh dijalankan collector. |
| `collector_runs` | Status run, jumlah ditemukan, jumlah masuk, error | Monitoring proses collector. |
| `raw_reports` | Teks asli/normalisasi, URL, status proses | Antrian dan audit input NLP umum. |
| `skdr_reports` | Payload JSON asli, endpoint, tahun, minggu, hash, dedupe key | Audit dan penyimpanan khusus data SKDR. |
| `disease_events` | Hasil ekstraksi dan klasifikasi NLP | Sumber utama agregasi dashboard. |
| `locations` | Nama wilayah, negara, latitude, longitude | Gazetteer/geometri untuk peta dan validasi alert. |
| `disease_concepts` | Konsep penyakit canonical dan kode WHO | Kamus penyakit tervalidasi. |
| `disease_aliases` | Nama lokal, singkatan, sinonim | Pencocokan multilingual. |
| `disease_outbreak_rules` | Penyakit dan `min_case_count` | Ambang aturan outbreak/EWS. |
| `disease_discovery_candidates` | Istilah baru yang belum tervalidasi WHO | Karantina istilah sebelum dipromosikan menjadi konsep aktif. |

## 3. Jalur data berdasarkan lapisan

| Lapisan | Data yang dihasilkan | Mentah atau hasil AI? |
|---|---|---|
| Source registry | Nama source, endpoint, jadwal, enabled | Konfigurasi |
| Collector run | Ditemukan, berhasil diproses, error | Operasional |
| `skdr_reports.payload` | Seluruh JSON dari API SKDR | Mentah dari API |
| `raw_reports.original_text` | Teks artikel atau teks normalisasi SKDR | Input NLP |
| NLP response | Penyakit, kasus, lokasi, sentiment, confidence | Hasil model/rule NLP |
| `disease_events` | Gabungan input dan hasil NLP | Data terstruktur aplikasi |
| `public-dashboard` | Agregasi terfilter dan deduplicated | Hasil query backend |
| UI dashboard | Card, grafik, map, tabel | Presentasi; dapat memiliki fallback template |

## 4. Matriks KPI utama dashboard

| Metrik | Definisi aktual | Sumber | Cara hitung | Catatan penting |
|---|---|---|---|---|
| **Cases / Detected Cases** | Total `case_count` positif dari event yang lolos filter dashboard | `disease_events.case_count` | `SUM(GREATEST(case_count, 0))` | Bukan otomatis kasus resmi; dapat berasal dari berita, sosial media, atau SKDR. |
| **Deaths** | Total `death_count` positif | `disease_events.death_count` | `SUM(GREATEST(death_count, 0))` | Kematian yang diekstrak/diterima sistem, bukan selalu data kematian nasional. |
| **Events / Validated Events** | Jumlah event penyakit yang masuk agregasi | `disease_events` | `COUNT(*)` setelah filter dan deduplikasi | Bukan jumlah pasien; satu event dapat mewakili satu laporan atau artikel. |
| **Locations** | Jumlah lokasi berbeda pada event | `disease_events.location_name` | `COUNT(DISTINCT location_name)` setelah agregasi | Lokasi `Unknown` dapat muncul jika event lolos tanpa lokasi detail. |
| **Active Alerts** | Lokasi/penyakit yang berubah menjadi alert setelah aturan EWS | `outbreak_alert`, confidence, lokasi, koordinat, threshold | Jumlah item dengan severity bukan `NORMAL` | Bukan sekadar jumlah artikel atau kata “alert”. |
| **CFR** | Case Fatality Ratio | `deaths` dan `cases` | `deaths / cases × 100` | Bermakna jika numerator dan denominator memiliki cakupan/periode sama. |
| **Current Month** | Nilai pada periode bulan berjalan yang dipilih | `published_at` | Agregasi sejak awal bulan sampai query | Bukan selalu satu bulan kalender lengkap. |
| **Previous Month** | Nilai periode pembanding | `published_at` | Bulan sebelum periode current | Untuk tahun historis, backend memakai Desember sebagai current dan November sebagai previous. |
| **Weekly Trend** | Agregasi per minggu epidemiologi | `skdr_reports.epidemiological_week` atau minggu dari `published_at` | `SUM(cases)`, `SUM(deaths)`, `COUNT(events)` per minggu | Dikembalikan bila filter source IBS, EBS, atau SKDR digunakan. |
| **Updated At** | Waktu response agregasi dibuat | `public-dashboard.updated_at` | Timestamp UTC saat backend membentuk response | Bukan waktu terakhir collector mengambil setiap source. |
| **Available Years** | Tahun yang memiliki event yang lolos filter | `published_at` pada `disease_events` | `DISTINCT EXTRACT(YEAR FROM published_at)` | Menunjukkan tahun yang tersedia, bukan jaminan semua data tahun lengkap. |
| **AI Summary** | Ringkasan singkat dari alert teratas | Backend rule engine | Dibuat dari daftar alert; provider saat ini `local-rule-engine` | Bukan jawaban LLM generatif dan tidak menggantikan evidence. |

## 5. Matriks alert dan EWS

| Istilah | Arti | Sumber/logika | Dampak pada dashboard |
|---|---|---|---|
| **`outbreak_alert`** | Flag awal bahwa event memenuhi sinyal outbreak | Rule NLP: sinyal outbreak dan jumlah kasus/kematian memenuhi aturan penyakit | Menjadi input awal perhitungan EWS. |
| **Outbreak rule** | Aturan ambang penyakit | `disease_outbreak_rules.min_case_count` | Menentukan batas pembanding kasus. |
| **Threshold** | Nilai ambang yang digunakan untuk lokasi/penyakit | Nilai maksimum rule penyakit; default minimal `1` jika tidak ada rule | Ditampilkan sebagai pembanding, bukan jumlah kasus. |
| **EWS verified** | Event memenuhi syarat minimum untuk dinaikkan ke alert | Confidence minimal `0.35`, lokasi tidak kosong, latitude dan longitude tersedia | Jika gagal, severity dipaksa `NORMAL`. |
| **`NORMAL`** | Belum menjadi peringatan aktif | Tidak ada model alert atau validasi EWS gagal | Tidak masuk daftar active alerts. |
| **`WASPADA`** | Sinyal mendekati threshold | Secara konseptual ratio kasus sekitar 75% threshold | Dapat tidak muncul ketika `model_alert=true` karena alur akan minimal menjadi `SIAGA`. |
| **`SIAGA`** | Sinyal alert aktif | `model_alert=true` atau kasus mencapai threshold | Masuk daftar alert. |
| **`AWAS`** | Sinyal prioritas tertinggi | Kasus minimal dua kali threshold atau terdapat kematian | Diurutkan paling atas pada daftar alert. |
| **Active Alert** | Alert yang lolos validasi dan severity bukan `NORMAL` | `severity != NORMAL` | KPI dan daftar alert dashboard. |
| **Model alert** | Nilai mentah dari `outbreak_alert` | Event NLP/database | Belum sama dengan active alert sebelum validasi lokasi/confidence. |

### Urutan logika severity saat ini

```text
Jika model_alert = false              → NORMAL
Jika kasus >= 2 × threshold           → AWAS
Jika kematian > 0                      → AWAS
Jika kasus >= threshold                → SIAGA
Jika model_alert = true                → SIAGA
Jika ratio kasus >= 75% threshold      → WASPADA
Selain itu                             → NORMAL
```

Syarat tambahan agar severity dipakai:

```text
confidence >= 0.35
location_name tidak kosong
latitude tersedia
longitude tersedia
```

## 6. Matriks field hasil NLP pada `disease_events`

| Field | Arti | Cara mendapatkan | Catatan |
|---|---|---|---|
| `language` | Bahasa input yang terdeteksi | Language detector/NLP | Tidak selalu sama dengan bahasa website. |
| `normalized_text` | Teks yang sudah dinormalisasi untuk NLP | Collector/NLP | Bukan salinan HTML mentah. |
| `translated` | Apakah teks diterjemahkan | Translation pipeline | `true` berarti ada teks hasil terjemahan. |
| `translation_provider` | Provider/model penerjemah | Local model atau agent | Audit proses terjemahan. |
| `translated_text` | Teks hasil terjemahan | Translation pipeline | Dipakai sebagai bantuan, bukan sumber asli utama. |
| `original_location_name` | Lokasi sebelum normalisasi | Extractor | Berguna untuk audit perubahan nama. |
| `location_name` | Lokasi utama yang dipilih | Gazetteer + NLP | Dipakai untuk agregasi dan peta. |
| `latitude` / `longitude` | Koordinat lokasi utama | `locations` atau resolver lokasi | Tanpa koordinat, event tidak memenuhi EWS verified. |
| `country` | Negara konteks | URL/content/source country dan normalisasi | Negara publisher tidak otomatis menjadi negara kejadian. |
| `symptoms` | Gejala yang ditemukan | Dictionary/rule/NLP | Bukan diagnosis. |
| `disease_extracted` | Semua kandidat penyakit yang ditemukan | Keyword, alias, WHO concept, agent | Dapat berisi penyakit utama dan sekunder. |
| `disease_mentions` | Mention explainable per istilah | Pipeline + WHO/local concept | Menyimpan surface form, canonical name, role, evidence, confidence, dan source resolusi. |
| `disease_classification` | Label penyakit utama | Ranking lokal, model, agent, WHO validation | Label utama untuk agregasi. |
| `case_count` | Jumlah kasus yang diekstrak | Rule angka + konteks kalimat | Sistem berusaha menghindari angka tahun, persentase, dan kematian sebagai kasus. |
| `death_count` | Jumlah kematian yang diekstrak | Rule angka + konteks fatalitas | Tidak otomatis dikonversi menjadi case count. |
| `confidence` | Tingkat keyakinan hasil klasifikasi | Model/rule/pipeline | Bukan probabilitas epidemiologis. |
| `outbreak_alert` | Flag sinyal outbreak event | Explicit outbreak + threshold rule | Belum sama dengan active alert. |
| `sentiment` | Nada emosional/komunikasi teks | Classifier: positive/negative/neutral | Bukan tingkat keparahan medis. |
| `sentiment_score` | Skor classifier sentiment | Model sentiment | Tidak boleh ditafsirkan sebagai risiko kematian. |
| `event_type` | Jenis konteks laporan | Event classifier/rule | Contoh: health update atau disease outbreak. |
| `event_confidence` | Keyakinan jenis event | Event classifier/rule | Berbeda dari confidence penyakit. |
| `relevance_score` | Relevansi terhadap kesehatan | Relevance classifier | Umumnya high/medium/low. |
| `relevance_confidence` | Keyakinan klasifikasi relevansi | Relevance classifier | Berbeda dari confidence penyakit. |
| `is_health_related` | Apakah event terkait kesehatan | Rule + classifier | Event non-health tidak seharusnya masuk dashboard penyakit. |
| `needs_review` | Perlu pemeriksaan operator | Umumnya confidence di bawah threshold review | Bukan berarti data pasti salah. |
| `source_credibility` | Skor kredibilitas tipe source | `SOURCE_CREDIBILITY_MAP` | Menilai tipe sumber, bukan kebenaran setiap klaim. |
| `source_credibility_label` | Label kredibilitas sumber | Source type/config | Untuk filter dan audit. |
| `published_at` | Tanggal laporan/event | Metadata artikel atau SKDR | Dipakai untuk filter bulan/tahun. |
| `source_type` | Jenis sumber | Registry collector | Contoh `web`, `rss`, `social_media`, `skdr_api`. |
| `source_name` | Nama source spesifik | `collector_sources` atau URL Analyzer | Untuk audit asal data. |
| `raw_report_id` | Relasi ke input mentah | Database | Menelusuri kembali payload/teks. |

## 7. Istilah penyakit dan WHO ICD-11

| Istilah | Arti |
|---|---|
| **Surface form** | Bentuk kata asli yang muncul di sumber, misalnya `DBD`, `dengue`, atau istilah lokal. |
| **Canonical name** | Nama penyakit standar setelah normalisasi. |
| **Primary disease** | Penyakit yang dianggap fokus utama artikel/laporan. |
| **Secondary disease** | Penyakit yang hanya disebut sebagai pembanding, latar belakang, atau penyakit terkait. |
| **WHO ICD-11 code** | Kode resmi WHO jika istilah berhasil divalidasi. |
| **Local WHO concept** | Konsep WHO yang tersimpan di `disease_concepts`. |
| **Alias** | Nama alternatif di `disease_aliases`. |
| **Pending discovery candidate** | Istilah yang ditemukan agent tetapi belum divalidasi WHO. |
| **Resolution source** | Asal keputusan mapping: local concept, WHO ICD-11, agent + WHO, atau local rule. |
| **Disease classification** | Label utama yang digunakan untuk agregasi statistik. |

Agent boleh membantu menemukan dan memilih istilah, tetapi tidak boleh
menciptakan kode ICD-11. Jika WHO tidak menemukan konsep, istilah masuk antrean
review `disease_discovery_candidates`.

## 8. Istilah lokasi dan peta

| Istilah | Arti |
|---|---|
| **Source country** | Negara konteks yang diberikan collector dari konfigurasi/URL. |
| **Event country** | Negara tempat kejadian menurut isi laporan dan normalisasi. |
| **Publisher country** | Negara organisasi/domain penerbit; tidak otomatis lokasi kejadian. |
| **Gazetteer** | Daftar nama lokasi resmi beserta negara dan koordinat. |
| **Location normalization** | Penyamaan variasi nama wilayah. |
| **Primary location** | Lokasi utama yang dipilih untuk event. |
| **Secondary locations** | Lokasi lain yang disebut dan dapat dibuat menjadi event turunan. |
| **Centroid** | Titik tengah agregasi beberapa koordinat lokasi. |
| **Map marker** | Titik lokasi yang ditampilkan di peta. |
| **Location confidence** | Keyakinan resolver lokasi; berbeda dari disease confidence. |

## 9. Istilah kualitas dan kredibilitas data

| Istilah | Arti praktis | Jangan disamakan dengan |
|---|---|---|
| **Confidence** | Keyakinan model/rule terhadap hasil ekstraksi atau klasifikasi | Kepastian medis atau probabilitas pasien |
| **Relevance** | Seberapa relevan laporan terhadap topik kesehatan | Kredibilitas sumber |
| **Health-related** | Keputusan biner apakah event berkaitan dengan kesehatan | Diagnosis penyakit |
| **Needs review** | Penanda untuk pemeriksaan manusia | Bukti event palsu |
| **Source credibility** | Prioritas kepercayaan berdasarkan jenis sumber | Verifikasi setiap klaim |
| **Validated** | Lolos filter teknis/semantik dashboard | Konfirmasi laboratorium |
| **Deduplicated** | Record ganda disaring berdasarkan URL/raw report/dedupe key | Dua laporan berbeda tentang kejadian sama |
| **Raw payload** | JSON asli sebelum normalisasi | Hasil NLP |
| **Normalized text** | Teks standar yang dikirim ke NLP | Payload asli |

## 10. Sentiment, relevance, dan event type

| Field/istilah | Nilai umum | Makna |
|---|---|---|
| `sentiment = positive` | Nada positif | Misalnya keberhasilan program atau penurunan kasus. Bukan berarti situasi aman secara medis. |
| `sentiment = negative` | Nada negatif | Misalnya peningkatan kasus atau kematian. Bukan otomatis outbreak. |
| `sentiment = neutral` | Nada informatif | Laporan faktual tanpa nada emosional kuat. |
| `relevance_score = high` | Sangat relevan | Ada sinyal kesehatan/penyakit kuat. |
| `relevance_score = medium` | Relevan sebagian | Ada konteks kesehatan tetapi bukti terbatas. |
| `relevance_score = low` | Relevansi rendah | Tidak menjadi dasar utama keputusan epidemiologi. |
| `event_type = health update` | Informasi kesehatan umum | Contoh edukasi, profil penyakit, atau kebijakan. |
| `event_type = disease outbreak wabah` | Laporan dengan sinyal outbreak | Tetap harus dilihat bersama kasus, kematian, threshold, dan evidence. |
| `event_type = unknown` | Konteks belum ditentukan | Perlu review atau tidak masuk agregasi utama. |

## 11. SKDR IBS dan EBS

| Istilah | Arti | Penyimpanan |
|---|---|---|
| **IBS** | Indicator Based Surveillance; laporan indikator penyakit rutin | API teknis `/api/Alert`, label internal `ibs` |
| **EBS** | Event Based Surveillance; laporan kejadian/rumor | API teknis `/api/ebs`, label internal `ebs` |
| **Endpoint name** | Asal record SKDR, `ibs` atau `ebs` | `skdr_reports.endpoint_name` |
| **Epidemiological week** | Minggu epidemiologi laporan | `skdr_reports.epidemiological_week` |
| **External key** | ID record dari API SKDR | `skdr_reports.external_key` |
| **Payload** | JSON asli SKDR | `skdr_reports.payload` |
| **Dedupe key** | Hash pencegah record ganda | `skdr_reports.dedupe_key` |
| **Enqueued** | Record dikirim ke RabbitMQ/NLP | `last_enqueued_at` dan `raw_report_id` |
| **Alert SKDR** | Sinyal dari data IBS/Alert | Tidak otomatis sama dengan `outbreak_alert` NLP. |
| **Status rumor** | Status EBS seperti terverifikasi/investigasi | Berada di payload asli jika dikirim API. |

SKDR lebih dekat dengan data surveilans operasional, sedangkan berita dan
media sosial lebih dekat dengan open-source signal. Keduanya dapat masuk
`disease_events`, tetapi asal dan tingkat interpretasinya harus dibaca dari
`source_type` dan `source_name`.

## 12. Endpoint backend yang dipakai dashboard

| Endpoint | Fungsi | Sumber utama |
|---|---|---|
| `GET /api/v1/public-dashboard` | KPI, alert, lokasi, penyakit, tren, ringkasan | `disease_events` dan `skdr_reports` |
| `GET /api/v1/events` | Daftar event dengan filter/pagination | `disease_events` |
| `GET /api/v1/events/stats` | Statistik penyakit, lokasi, sentiment, relevance, source | `disease_events` |
| `GET /api/v1/summary` | Ringkasan per lokasi dan penyakit | `disease_events` |
| `GET /api/v1/skdr-reports` | Payload dan metadata SKDR | `skdr_reports` |
| `GET /api/v1/sources` | Registry collector | `collector_sources` |
| `GET /api/v1/runs` | Riwayat collector | `collector_runs` |
| `POST /api/v1/analyze-url` | Analisis URL manual | NLP lalu `raw_reports`/`disease_events` |

Contoh filter dashboard regional:

```text
/api/v1/public-dashboard?country=Indonesia&year=2026&source=skdr
/api/v1/public-dashboard?country=Indonesia&year=2026&source=ibs
/api/v1/public-dashboard?country=Indonesia&year=2026&source=ebs
```

## 13. Status halaman `detail-region`

Halaman `/nlp/detail-region?country=Indonesia` belum 100% dinamis.

### Bagian yang mengambil API

`IncidentDetailPage` memanggil `public-dashboard` untuk:

- KPI kasus, kematian, event, lokasi, dan active alert;
- daftar penyakit;
- tren mingguan;
- alert dan lokasi peta;
- tahun data yang tersedia.

Request regional dijalankan ulang setiap 60 detik.

### Bagian yang masih template/fallback

`RegionalIncidentPage` memulai halaman dengan `TEMPLATE_EVENT` statis. Jika
API kosong atau gagal, frontend masih memiliki fallback angka dan array contoh,
antara lain:

- total kasus `90195`;
- kematian `19`;
- active alert `28`;
- penyakit utama DBD;
- data minggu `W-23` sampai `W-34`;
- breakdown RS, Puskesmas, Pustu, dan Klinik;
- data grafik provinsi IBS/EBS;
- teks insight dengan angka respon `92%`.

Karena itu angka fallback tidak boleh dibaca sebagai data aktual. Perbaikan
yang direkomendasikan adalah mengganti fallback dengan status `Data belum
tersedia`, menampilkan `updated_at`, dan memisahkan tab IBS/EBS.

Parameter URL `country=Indonesia` saat ini belum menjadi filter bebas di
`RegionalIncidentPage`; halaman regional mengunci konteksnya ke Indonesia.

## 14. Cara membedakan data aktual dan fallback

| Pemeriksaan | Data aktual | Fallback/template |
|---|---|---|
| Response `/api/v1/public-dashboard` | Ada `updated_at`, `kpis`, `locations`, atau `by_disease` | Response gagal/kosong |
| Card KPI | Nilai berubah mengikuti response API | Nilai kembali ke angka default |
| Weekly signal | Membaca `weekly_trend` dari response | Menampilkan data contoh W-23–W-34 |
| Peta | Marker berasal dari `regionalSkdrData.locations` | Marker template Jakarta/Indonesia |
| Status source | Menunjukkan response/sync aktual | Teks koneksi dapat tetap tampil meskipun data kosong |
| Database | Ada record pada `disease_events`/`skdr_reports` | Tidak ada record tetapi UI tetap terisi |

Query pemeriksaan:

```sql
SELECT source_type, COUNT(*)
FROM disease_events
GROUP BY source_type
ORDER BY source_type;

SELECT endpoint_name, COUNT(*), MIN(fetched_at), MAX(fetched_at)
FROM skdr_reports
GROUP BY endpoint_name;

SELECT name, source_type, enabled, schedule, config
FROM collector_sources
WHERE source_type = 'skdr_api';
```

## 15. Batasan interpretasi untuk pimpinan

1. **Detected cases bukan otomatis kasus resmi.** Angka berasal dari ekstraksi
   sumber dan harus dibandingkan dengan laporan resmi.
2. **Sentiment bukan severity.** Artikel bernada negatif belum tentu memiliki
   outbreak, sedangkan artikel netral bisa memuat outbreak penting.
3. **Confidence bukan probabilitas klinis.** Confidence adalah keyakinan
   sistem terhadap ekstraksi/klasifikasi.
4. **Active alert bukan semua alert mentah.** Active alert memerlukan rule,
   confidence, lokasi, dan koordinat.
5. **Tidak ada record bukan berarti tidak ada penyakit.** Bisa berarti
   collector belum berjalan, source disabled, API gagal, atau data belum
   diproses NLP.
6. **Angka dashboard dapat terduplikasi secara konseptual** jika beberapa
   sumber melaporkan kejadian sama tetapi dedupe tidak mengenalinya.
7. **SKDR dan berita memiliki karakter berbeda.** SKDR bisa berupa rekap
   mingguan, sedangkan berita/media sosial bisa berupa satu laporan kejadian.

## 16. Checklist membaca satu angka

```text
1. Sumbernya apa? web, RSS, social_media, atau SKDR?
2. Periode published_at/report_date kapan?
3. Filter country, year, dan source apa yang digunakan?
4. Itu cases, events, deaths, locations, atau active alerts?
5. Confidence dan needs_review bagaimana?
6. Ada evidence/payload asli yang bisa diaudit?
7. Nilai berasal dari API atau fallback UI?
8. Apakah angka sudah dibandingkan dengan sumber resmi?
```

## Referensi implementasi

- [SKDR IBS/EBS Data Matrix](SKDR_IBS_EBS_DATA_MATRIX.md)
- [ICD-11 Agent Walkthrough](ICD11_AGENT_WALKTHROUGH.md)
- `services/backend-rust/src/main.rs` — endpoint dan agregasi dashboard
- `services/nlp-python/app/pipeline.py` — alur ekstraksi NLP dan rule
- `services/frontend-next/components/incident/IncidentDetailPage.tsx` —
  visualisasi regional dan fallback UI
- `services/frontend-next/components/incident/RegionalIncidentPage.tsx` —
  template awal halaman regional
