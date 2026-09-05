# UI Copy Renaming Plan

Rencana ini hanya mengubah label, frasa, dan kalimat yang terlihat pengguna.
Isi data, angka, nama penyakit, field API, database, dan logika analisis tetap.

## Kosakata utama

- `real-time`
- `multilingual`
- `surveillance`
- `monitoring`
- `signals`
- `sources`
- `notifications`
- `data`

Istilah faktual seperti `cases`, `deaths`, `symptoms`, nama penyakit, lokasi,
tanggal, dan sumber tetap dipertahankan.

## Identitas dan dashboard

| Current | Proposed |
|---|---|
| ASEAN Disease Outbreak Surveillance AI | ASEAN Real-time AI Surveillance Data |
| Real-time Multilingual Disease Monitoring | Real-time Multilingual Data Monitoring |
| ASEAN Disease Outbreak Dashboard | ASEAN Real-time Surveillance Dashboard |
| Validated Events | Validated Signals |
| Locations | Mapped Locations |
| Total Crawled | Collected Records |
| Spatial Distribution of Disease Outbreak | Surveillance Signal Map |
| Outbreak Summary by Location | Surveillance Summary by Location |
| Outbreak Event Summary | Surveillance Signal Summary |
| Outbreak Threshold | Signal Threshold |
| Outbreak Markers | Signal Markers |
| Detected disease event locations | Detected signal locations |
| Source Credibility Score | Source Reliability Score |
| AI Confidence Level | Model Confidence |
| Event Type | Signal Type |
| Health Related | In Monitoring Scope |
| Needs Review | Review Status |
| NLP Entity Extraction Data | Extracted Data |

## Early Warning System / EWS

EWS tetap dipertahankan sebagai istilah teknis, tetapi label publik dibuat lebih
berorientasi pada fungsi sinyal dan notifikasi, mengikuti gaya `real-time surveillance`.

| Current | Proposed |
|---|---|
| Early Warning System | Early Warning Signals (EWS) |
| Disease & location based | Location-based surveillance signals |
| EWS uses disease thresholds, location, confidence, and active user radius. | Signals use thresholds, mapped locations, model confidence, and active radius. |
| Enable Early Warning Service (EWS) | Enable Early Warning Notifications (EWS) |
| To automatically detect disease outbreaks near you... | Receive real-time surveillance notifications for monitored signals near your location... |
| Realtime Siren & Web Push | Real-time Notifications & Web Push |
| Outbreak Radius Detection | Nearby Signal Radius |
| EWS Radius Active | Early Warning Active |
| EWS: OUTBREAK NEAR YOUR LOCATION! | SURVEILLANCE SIGNAL NEAR YOUR LOCATION |
| MOH RI Disease EWS Active | MOH RI Early Warning Active |
| EWS Status | Signal Status |
| Pulsing Radius | Active Signal Radius |
| Active EWS Radius | Active Signal Radius |
| Radius pulse appears after configuration | Radius appears after notification settings are enabled |
| Impact radius | Signal Radius |

Data dinamis seperti nama penyakit, jumlah kasus, kematian, lokasi, threshold,
dan jarak notifikasi tidak diubah.

## Data collection / crawling

| Current | Proposed |
|---|---|
| DATA CRAWLING PIPELINE | REAL-TIME DATA COLLECTION PIPELINE |
| Data Crawling Engine Performance | Real-time Data Collection Performance |
| Total News / Media | Collected News & Media |
| API & Data Studio | Official APIs & Data Feeds |
| Live Engine Pipeline | Live Collection Pipeline |
| raw data | source records |
| terproses NLP | processed records |
| Filter Kategori | Channel Filters |
| Pilihan Tampilan Dinamis | View Options |
| 4 Mgg Terakhir | Last 4 Weeks |

## Batas perubahan

Perubahan nanti diprioritaskan pada `app_name`/`app_tagline`, locale dashboard,
label peta, modal detail, EWS consent, dan teks crawling yang masih hardcoded.
Nama field seperti `disease_classification`, `outbreak_alert`, `EWS`, serta
aturan backend tidak disentuh.
