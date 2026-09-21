# ASEAN 22 URL rerun after multilingual pipeline increment

Tanggal uji: 21 September 2026, Asia/Jakarta
Stack: Docker lokal, frontend proxy `http://localhost:3010/nlp`, async
`analyze-url`, Full NLP worker
Runner: `scripts/asean_22_terminal_test.py`
Rules-only fallback: tidak digunakan
Dummy data: tidak digunakan

## Ringkasan

| Hasil | Rerun 19 Sep | Rerun 21 Sep |
|---|---:|---:|
| URL diuji | 22 | 22 |
| Full NLP | 14 | 19 |
| Partial/weak karena translation atau fetch | 7 | 0 |
| Failed | 1 | 3 |
| Full NLP rate | 63.6% | 86.4% |

Catatan: pada rerun kedua, translation timeout tidak lagi menurunkan job menjadi
`partial`. Empat job tetap `completed` dengan `translation_status=timeout` dan
`needs_review=true`. Karena itu status NLP dan status translation sekarang dapat
dibaca terpisah.

## Matriks hasil aktual

| ID | Negara | Bahasa aktual | Translation | NLP | Disease | Country | Cases | Deaths | Events | Review |
|---|---|---|---|---|---|---|---:|---:|---:|---|
| BRN-01 | Brunei | `ms` | timeout | FULL | Cholera | Brunei | 5 | 0 | 1 | true |
| BRN-02 | Brunei | `en` | not_required | FULL | Nipah virus disease | Brunei | 0 | 0 | 1 | false |
| KHM-01 | Cambodia | fetch failed | - | FAILED | - | - | - | - | 0 | - |
| KHM-02 | Cambodia | `en` | not_required | FULL | Avian influenza | Cambodia | 27 | 12 | 4 | true |
| IDN-01 | Indonesia | `id` | not_required | FULL | Measles | Indonesia | 8,372 | 6 | 1 | false |
| IDN-02 | Indonesia | `id` | not_required | FULL | Measles | Indonesia | 8,224 | 69 | 1 | false |
| LAO-01 | Laos | `lo` | timeout | FULL | Dengue | Laos | 1 | 0 | 1 | true |
| LAO-02 | Laos | `lo` | timeout | FULL | Dengue | Laos | 214 | 0 | 1 | true |
| MYS-01 | Malaysia | `ms` | timeout | FULL | UNKNOWN | Malaysia | 32 | 0 | 0 | true |
| MYS-02 | Malaysia | `en` | not_required | FULL | Dengue | Malaysia | 65,979 | 62 | 1 | false |
| MMR-01 | Myanmar | `my` | completed/cache | FULL | UNKNOWN | Myanmar | 0 | 0 | 0 | true |
| MMR-02 | Myanmar | `en` | not_required | FULL | Cholera | Myanmar | 0 | 0 | 1 | true |
| PHL-01 | Philippines | fetch failed | - | FAILED | - | - | - | - | 0 | - |
| PHL-02 | Philippines | fetch failed | - | FAILED | - | - | - | - | 0 | - |
| SGP-01 | Singapore | `en` | not_required | FULL | Measles | Singapore | 50 | 0 | 1 | true |
| SGP-02 | Singapore | `en` | not_required | FULL | Mpox | Singapore | 2 | 0 | 1 | false |
| THA-01 | Thailand | `th` | completed/cache | FULL | COVID-19 | Thailand | 99,691 | 15 | 1 | true |
| THA-02 | Thailand | `en` | not_required | FULL | Dengue | Thailand | 19,000 | 17 | 1 | true |
| VNM-01 | Vietnam | `vi` | timeout | FULL | Dengue | Vietnam | 146 | 0 | 1 | true |
| VNM-02 | Vietnam | `en` | not_required | FULL | Dengue | Vietnam | 316 | 0 | 1 | false |
| TLS-01 | Timor-Leste | `pt` | unavailable | FULL | Dengue | Timor-Leste | 0 | 0 | 1 | true |
| TLS-02 | Timor-Leste | `en` | not_required | FULL | Dengue | Timor-Leste | 288 | 20 | 2 | false |

## Perubahan yang terukur

1. Indonesian tidak lagi menunggu NLLB. IDN-01 dan IDN-02 berubah dari
   `partial/translation unavailable` menjadi `completed` dengan
   `translation_status=not_required`.
2. Vietnamese VNM-02 tidak lagi mengambil angka `11` dari “11 new outbreaks”.
   Hasil sekarang `316` cases. Ini berasal dari penghapusan asosiasi outbreak
   sebagai metric cases dan penambahan konteks `metric_non_case` di DB.
3. Malay terdeteksi sebagai `ms` pada BRN-01 dan MYS-01, bukan `id` seperti
   baseline. Namun MYS-01 masih `UNKNOWN` dan hanya menangkap 32 cases; disease
   dan metric relation Malay masih perlu ditingkatkan.
4. Thai THA-01 tetap mempertahankan `99,691` cases dan `15` deaths dari teks
   asli. NLLB hanya cache semantic view.
5. BRN-01, LAO-01/02, MYS-01, dan VNM-01 tetap memiliki evidence asli serta
   hasil source extraction walaupun translation timeout. Timeout sekarang
   terlihat sebagai status tambahan, bukan kegagalan NLP utama.

## Masalah yang masih terlihat

- KHM-01 serta PHL-01/02 gagal di tahap fetch/fallback. Ini bukan kegagalan
  extraction dan tidak boleh dianggap sebagai disease `UNKNOWN`.
- Malay MYS-01 belum menghubungkan disease, metric, dan evidence dengan benar.
- Lao dan Vietnamese masih sering mengalami translation timeout, tetapi source
  extraction tetap selesai. Perlu pengukuran budget/model per bahasa, bukan
  menaikkan timeout global tanpa batas.
- BRN-01 masih menghasilkan Cholera dan perlu review; guard lokasi country sudah
  tersedia, tetapi relation/disease context pada artikel itu belum memadai.
- KHM-02 menghasilkan empat sub-event dari satu laporan aggregate/breakdown dan
  memiliki flag `abnormal_cfr_ratio`; perlu review event aggregation, bukan
  menghapus evidence.
- MMR-01 tetap `UNKNOWN` karena artikelnya tidak memberikan metric surveillance
  yang koheren, bukan karena translation gagal.

## Kesimpulan

Rerun menunjukkan peningkatan operasional Full NLP dari 63.6% menjadi 86.4%.
Kenaikan ini terutama berasal dari pemisahan translation status dari NLP status,
bukan dari klaim bahwa extraction semua bahasa sudah sempurna. Angka, disease,
location, period, dan evidence tetap harus dinilai per relasi dan konteks asli.

JSON mentah rerun tersimpan sementara di:

`/tmp/asean-22-rerun-2026-09-21-after-restart.json`
