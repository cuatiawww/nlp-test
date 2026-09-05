# Memahami Peta, Marker, dan EWS

Dokumen ini menjelaskan hubungan antara peta, marker, popup, dan Early Warning System (EWS) pada dashboard surveilans penyakit.

## 1. Apa itu EWS?

EWS (*Early Warning System*) adalah mekanisme untuk memberikan sinyal peringatan dini ketika data suatu penyakit memenuhi aturan tertentu. EWS bukan keputusan final bahwa telah terjadi wabah. Sinyal tetap perlu diverifikasi oleh petugas epidemiologi.

Alur sederhananya:

```text
Raw report / SKDR / IBS / EBS
        ↓
NLP mengekstrak penyakit, lokasi, kasus, kematian, dan event type
        ↓
outbreak_alert + outbreak rule + validasi lokasi
        ↓
Backend menghitung severity EWS
        ↓
Panel EWS, marker peta, dan popup
```

## 2. Sumber data utama

Dashboard publik mengambil data dari endpoint `GET /api/v1/public-dashboard`.

Endpoint tersebut menghasilkan dua kumpulan penting:

| Field | Arti | Digunakan untuk |
|---|---|---|
| `locations` | Semua lokasi event kesehatan yang memenuhi filter | Marker peta, ringkasan lokasi, total kasus |
| `alerts` | Hanya lokasi yang sudah memiliki severity selain `NORMAL` | Daftar EWS, KPI active alerts, marker EWS yang seharusnya |

Setiap lokasi umumnya memiliki:

| Field | Arti |
|---|---|
| `location_name` | Nama lokasi kejadian |
| `country` | Negara lokasi |
| `latitude`, `longitude` | Koordinat untuk marker |
| `disease` | Penyakit yang terdeteksi |
| `cases` | Total kasus hasil agregasi |
| `deaths` | Total kematian hasil agregasi |
| `event_count` | Jumlah event/source yang digabungkan |
| `confidence` | Confidence NLP |
| `threshold` | Ambang kasus dari tabel aturan outbreak |
| `outbreak_alert` | Flag alert dari proses NLP |
| `has_alert` | Hasil akhir apakah lokasi menjadi alert |
| `severity` | Level akhir: `NORMAL`, `WARNING`, `HIGH`, atau `CRITICAL` pada tampilan |
| `detail` | Rincian event dan sumber data |

## 3. Arti marker di peta (Terbaru & Dinamis)

Peta telah diperbarui menggunakan **titik berbasis severity dengan animasi denyut radius gelombang (pulsating waves radar)**. Area poligon negara dinetralkan sehingga fokus visual 100% berada pada titik lokasi kejadian aktual dan tingkat keparahannya:

| Marker & Denyut Radius | Severity Level | Warna & Efek Visual | Apakah EWS? |
|---|---|---|---|
| **Merah Berdenyut Cepat** | `AWAS` / `CRITICAL` | Titik merah (`#EF4444`) + 2 lapis gelombang denyut cepat (1200ms, r: 22px) | Ya, level tertinggi |
| **Oranye Berdenyut** | `SIAGA` / `HIGH` | Titik oranye (`#F97316`) + 2 lapis gelombang denyut mantap (1500ms, r: 18px) | Ya, alert tinggi |
| **Kuning/Emas Berdenyut** | `WASPADA` / `WARNING` | Titik kuning amber (`#EAB308`) + denyut lembut (1800ms, r: 14px) | Ya, peringatan dini |
| **Hijau Zamrud** | `NORMAL` / `SIGNAL` | Titik emerald (`#10B981`) + halo stabil | Bukan alert (sinyal terpantau) |
| **Biru Berdenyut** | Marker Exact / Analisis | Titik biru (`#0060A9`) | Hasil analisis URL/spesifik |
| **Lingkaran Radius Transparan** | Jangkauan Buffer EWS | Lingkaran radius (km) di sekitar titik alert aktif | Ya, visualisasi radius dampak EWS |

Poligon negara kini diwarnai netral (`rgba(241, 245, 249, 0.35)`) dengan garis batas abu-abu rapi dan highlight biru saat difokuskan, menghilangkan kebingungan gradasi warna negara yang sebelumnya mirip warna marker.

## 4. Arti warna dan istilah severity

Kode internal backend masih menggunakan istilah Indonesia agar kompatibel dengan database dan API. Label yang dilihat pengguna menggunakan bahasa Inggris.

| Kode internal | Label tampilan | Makna |
|---|---|---|
| `AWAS` | `CRITICAL` | Sinyal paling serius |
| `SIAGA` | `HIGH` | Sinyal alert tinggi |
| `WASPADA` | `WARNING` | Sinyal peringatan |
| `NORMAL` | `NORMAL` | Belum menjadi alert EWS |

`CRITICAL` pada popup dan `CRITICAL` pada panel EWS adalah level yang sama dengan kode internal `AWAS`. Itu bukan dua jenis alert yang berbeda.

## 5. Bagaimana severity dihitung?

Backend mengambil beberapa komponen:

1. `outbreak_alert` dari hasil NLP.
2. `threshold` penyakit dari tabel `disease_outbreak_rules` melalui `min_case_count`.
3. Total `cases` dan `deaths` per lokasi dan penyakit.
4. Confidence NLP.
5. Validitas nama lokasi dan koordinat.

Validasi lokasi EWS membutuhkan confidence minimal `0.35`, nama lokasi yang valid, serta koordinat latitude dan longitude.

Aturan severity yang sedang digunakan backend:

```text
Jika outbreak_alert = false
    → NORMAL

Jika outbreak_alert = true dan cases >= 2 × threshold
   atau deaths > 0
    → AWAS / CRITICAL

Jika outbreak_alert = true dan cases >= threshold
    → SIAGA / HIGH
```

Catatan: kode backend saat ini memiliki cabang `WASPADA`, tetapi karena kondisi `model_alert` langsung mengarah ke `SIAGA`, level `WASPADA` dapat jarang atau tidak pernah tercapai. Ini perlu dirapikan ketika aturan severity final disepakati.

## 6. Hubungan panel EWS dengan peta

Panel EWS kiri seharusnya menampilkan kumpulan `alerts`. Marker EWS di peta juga seharusnya menggunakan kumpulan `alerts` yang sama.

Dengan demikian:

```text
Jumlah CRITICAL di panel EWS
        =
Jumlah marker CRITICAL di peta
```

Perbedaan jumlah harus dianggap sebagai indikasi bug filter, agregasi, atau koordinat yang tidak valid.

## 7. Perbaikan yang Telah Diterapkan (Status Terkini)

Masalah pemahaman dan hardcoding sebelumnya telah diselesaikan:

- ✅ **Labeling Hardcode Dihapus**: Label statis `Regional IBS Alert` telah dilepas sepenuhnya. Popup kini menampilkan **Severity Badge dinamis** (`CRITICAL Alert`, `HIGH Alert`, `WARNING Alert`, `VERIFIED Signal`), tipe sumber dinamis (`detail.source_type`), nama sumber dinamis, dan terjemahan nama penyakit.
- ✅ **Pewarnaan Negara Dinemotifkan (Neutralized)**: Seluruh negara tidak lagi diwarnai kuning/oranye/merah berdasarkan agregasi kasus kasar, sehingga tidak menimbulkan salah tafsir bahwa seluruh wilayah negara tertular.
- ✅ **Animasi Denyut Gelombang Radius Ditambahkan**: Setiap titik marker kini memiliki animasi gelombang denyut (*pulsating radar ring*) yang warnanya dan frekuensinya mencerminkan keparahan (*severity*) wabah secara langsung di atas peta.
- ✅ **Legend Peta Diperbarui**: Panduan legenda kini mencantumkan arti warna titik dan animasi denyut radius keparahan secara transparan.

## 8. Rancangan tampilan yang direkomendasikan

Peta sebaiknya memiliki dua layer marker yang jelas:

### Layer EWS Alerts

Hanya menampilkan lokasi dengan `has_alert = true`.

| Level | Warna | Tampilan |
|---|---|---|
| `CRITICAL` | Merah | Marker lebih besar dan dapat diberi efek pulse |
| `HIGH` | Oranye | Marker alert berwarna oranye |
| `WARNING` | Kuning | Marker peringatan berwarna kuning |

### Layer Monitored Events

Menampilkan lokasi event biasa dengan marker biru atau abu-abu. Layer ini sebaiknya memiliki toggle terpisah dan tidak aktif secara default ketika pengguna ingin fokus pada EWS.

Peta juga sebaiknya memiliki kontrol:

```text
[✓] Show EWS Alerts
[ ] Show Monitored Events
[ ] Show Analyzed URL Location
```

## 9. Isi popup yang ideal

Popup untuk lokasi EWS sebaiknya menggunakan format berikut:

```text
EWS ALERT LOCATION
Jakarta, Indonesia
Dengue Fever

Status: CRITICAL
Alert reason: Cases exceeded 2× disease threshold

Cases: 48
Deaths: 2
Threshold: 20
Confidence: 91%
Events: 6
Source: News / SKDR IBS / SKDR EBS
Latest report: September 5, 2026

EWS is an early warning signal, not a confirmed outbreak declaration.
```

Popup untuk event biasa:

```text
MONITORED HEALTH EVENT
Status: NORMAL
This location is monitored but has not triggered an EWS alert.
```

Label sumber harus diambil dari data aktual. Hindari label hardcode `Regional IBS Alert` jika event dapat berasal dari sumber lain.

## 10. Perbedaan EWS, IBS, dan EBS

| Istilah | Peran |
|---|---|
| EWS | Mesin/aturan peringatan dini berdasarkan sinyal data |
| IBS | *Indicator-Based Surveillance*, laporan indikator rutin terstruktur dari fasilitas kesehatan |
| EBS | *Event-Based Surveillance*, laporan rumor/kejadian yang perlu diverifikasi |
| NLP event | Event yang diekstrak dari berita, RSS, media sosial, atau dokumen lain |

IBS dan EBS adalah jenis sumber atau jalur surveilans. EWS adalah mekanisme penilaian alert yang dapat menggunakan data dari beberapa jalur tersebut.

Jadi, titik EWS tidak otomatis berarti titik IBS. Sebaliknya, data IBS dapat menjadi input EWS jika memenuhi aturan dan memiliki lokasi yang valid.

## 11. File kode terkait

- `services/backend-rust/src/main.rs` — query `public-dashboard`, agregasi lokasi, threshold, dan perhitungan severity.
- `services/frontend-next/app/page.tsx` — panel EWS, KPI active alerts, dan popup detail alert.
- `services/frontend-next/components/AseanMap.tsx` — marker peta ASEAN, radius, dan popup lokasi.
- `services/frontend-next/components/SpatialOutbreakMap.tsx` — pembungkus peta pada dashboard.
- `services/frontend-next/components/IndonesiaDetailMapClient.tsx` — peta detail wilayah Indonesia; status `TERDETEKSI` bukan severity EWS.
- `services/nlp-python/app/pipeline.py` — penentuan `outbreak_alert` pada hasil NLP.

## 12. Prinsip desain yang harus dipertahankan

1. Marker EWS hanya berasal dari data `alerts` atau `has_alert = true`.
2. Marker event biasa harus dibedakan secara visual dari marker EWS.
3. Popup harus menjelaskan alasan alert, bukan hanya menampilkan warna.
4. Kode internal boleh tetap `AWAS/SIAGA/WASPADA`, tetapi label UI harus konsisten `CRITICAL/HIGH/WARNING`.
5. Panel EWS dan marker EWS harus memakai sumber data dan filter yang sama.
6. EWS harus selalu dijelaskan sebagai sinyal peringatan dini, bukan konfirmasi wabah.

