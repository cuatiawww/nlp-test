# Audit 011 — Pipeline URL WHO dengan LLM Aktif

Tanggal run: 25 September 2026
Mode: `analysis-jobs` → collector → worker → `pipeline.run` → database
Konfigurasi: `AGENT_ENABLED=true`, `NLP_MODEL=fine-tuned`, `DEEPSEEK_MODEL=deepseek-chat`
Tujuan: menguji hasil aktual pipeline ketika DeepSeek rear-gate aktif, termasuk penggunaan token dan validasi hasil yang tersimpan.

## Konfigurasi pengujian

```text
AGENT_ENABLED=true
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_PROMPT_CHARS=4500
DEEPSEEK_RESPONSE_MAX_TOKENS=800
DEEPSEEK_MAX_TOKENS=800
```

Worker `raw` dan `social` dihentikan sementara agar tidak ada artikel lain yang memicu DeepSeek. `analysis-job-worker` tetap aktif untuk menjalankan dua URL audit melalui jalur normal.

## URL dan job

| No. | URL | Job ID | Status |
|---:|---|---|---|
| 1 | WHO Disease Outbreak News — Bundibugyo virus | `58496273-dea7-460f-bd0d-235cdf7882c8` | `completed` |
| 2 | WHO childhood cancer medicines strategy | `7177141b-f70a-49df-9440-458195b216ba` | `completed` |

Jalur aktual:

```text
POST /analysis-jobs
  -> analysis_jobs
  -> worker fetch article
  -> POST /nlp/analyze/raw
  -> pipeline.run
  -> optional DeepSeek rear-gate
  -> save_completed
  -> disease_events + child events
```

## Penggunaan DeepSeek

Hanya URL pertama yang memanggil DeepSeek. Log service NLP:

```text
DeepSeek usage provider=deepseek prompt_tokens=1652 completion_tokens=410 total_tokens=2062
```

URL kedua tidak memanggil DeepSeek karena gate lokal mengenalinya sebagai artikel kebijakan/informasi tanpa outbreak aktif. Ini sesuai desain hemat token.

Artikel pertama memiliki content hasil collector sepanjang 17.857 karakter. Review packet yang dikirim ke DeepSeek dibatasi sekitar 4.500 karakter berisi kalimat evidence, draft NLP, daftar penyakit, dan lokasi yang ditemukan lokal. Estimasi prompt jika full article dikirim sekitar 5.328 token, sedangkan run aktual menggunakan 1.652 prompt token.

## Hasil URL 1 — WHO Disease Outbreak News

### Ground truth dari artikel

Artikel menyatakan:

- Bundibugyo virus disease / Ebola disease.
- Republik Demokratik Kongo: `6757` kasus terkonfirmasi dan `3267` kematian.
- Total lintas lokasi: `6778` kasus dan `3269` kematian.
- Uganda: `20` kasus dan `2` kematian.
- Prancis: `1` kasus.
- Dua kasus didiagnosis di Republik Demokratik Kongo dan kemudian dirawat di Jerman; ini bukan berarti Jerman memiliki 20 kasus.

### Output pipeline aktual

| Field | Output |
|---|---|
| `disease_classification` | `Ebola` |
| `location_name` | `MULTI_COUNTRY` |
| `is_health_related` | `true` |
| `event_type` | `disease outbreak wabah` |
| `outbreak_alert` | `false` — salah, seharusnya `true` |
| `needs_review` | `true` |
| API result `case_count` | `13897` — double count |
| API result `death_count` | `9803` — salah association |
| pipeline total time | `116.97` detik |

### Child event yang tersimpan di database

| Lokasi | Cases | Deaths | Penilaian |
|---|---:|---:|---|
| Democratic Republic of the Congo | 6778 | 3267 | Total kasus tercampur dengan total lintas lokasi; perlu dipisahkan dari nilai country-specific 6757. |
| Uganda | 20 | 3269 | Salah; `3269` adalah total kematian lintas lokasi, bukan kematian Uganda. |
| France | 1 | 0 | Sesuai sumber. |
| Germany | 20 | 0 | Salah; sumber hanya menyebut dua kasus DRC yang dirawat di Jerman. |
| Indonesia | 300 | 0 | Salah; berasal dari konteks clinical trial, bukan kasus Indonesia. |

### Penilaian

DeepSeek berhasil dipanggil dan mengembalikan JSON, tetapi hasil akhir belum akurat. Evidence validator hanya memastikan kutipan ada di artikel; validator belum cukup kuat untuk memastikan setiap angka benar-benar terikat ke lokasi yang sama. Selain itu, angka provinsi/total dan angka lintas negara masih dapat terjumlah ulang.

Status: **FAIL — jangan deploy hasil URL 1 ke production sebagai event final.**

## Hasil URL 2 — WHO Childhood Cancer Medicines

### Expected

Artikel membahas strategi/kebijakan pasar obat kanker anak. Ini artikel kesehatan, tetapi bukan laporan outbreak dan tidak memberikan event epidemiologis aktif.

### Output pipeline aktual

| Field | Output |
|---|---|
| `disease_classification` | `UNKNOWN` |
| `location_name` | kosong |
| `case_count` | `0` |
| `death_count` | `0` |
| `outbreak_alert` | `false` |
| `is_health_related` | `true` |
| `event_type` | `health update` |
| `sub_events` | `[]` |
| pipeline total time | `7.877` detik |

Penilaian: **PASS untuk pemisahan artikel informasi kesehatan dari outbreak**. DeepSeek tidak dipanggil dan tidak ada token yang digunakan.

## Database verification

### URL 1

```text
analysis_job: 58496273-dea7-460f-bd0d-235cdf7882c8
event_id: dedf2501-1c8c-4842-9096-47a2ec7a32bc
parent location: MULTI_COUNTRY
child events: 5
needs_review: true
```

### URL 2

```text
analysis_job: 7177141b-f70a-49df-9440-458195b216ba
event_id: 60810769-2202-433b-ab06-e59ea0f65645
parent location: NULL
child events: 0
is_health_related: true
outbreak_alert: false
needs_review: true
```

## Temuan teknis

1. Shared pipeline benar-benar berjalan dengan LLM aktif; tidak ada fallback rules-only pada kedua job.
2. Gate token sudah efektif: artikel kebijakan tidak memanggil DeepSeek.
3. Pengiriman evidence ringkas menghemat prompt secara signifikan dibanding full article.
4. Guardrail verbatim evidence belum cukup untuk menguji relasi `lokasi ↔ angka`; satu kalimat dapat memuat banyak negara dan beberapa angka.
5. Post-processing masih perlu aturan source-first:
   - country total harus dipisahkan dari total lintas negara;
   - angka kematian tidak boleh diwariskan ke negara lain;
   - angka clinical trial tidak boleh menjadi event negara;
   - total induk tidak boleh menjumlahkan child event yang merupakan subset provinsi.
6. `outbreak_alert` harus dipertahankan `true` bila artikel WHO DON secara eksplisit melaporkan outbreak dan event memiliki kasus/kematian tervalidasi.

## Kesimpulan

Pipeline LLM aktif sudah teruji end-to-end dan penghematan token berjalan. URL kedua sudah diklasifikasikan dengan benar sebagai health update non-outbreak. URL pertama masih gagal pada korelasi multi-event dan agregasi metrik, sehingga hasilnya harus tetap berstatus review dan belum layak menjadi data final/training.

Setelah audit, `AGENT_ENABLED` dikembalikan ke `false` agar tidak ada pemanggilan DeepSeek otomatis. Worker raw/social juga tetap dihentikan sementara.

## Retest setelah perbaikan rear-gate — 25 September 2026

Retest ini dijalankan pada source code terbaru melalui jalur:

```text
collector /extract-url -> pipeline.run
```

Hasil retest tidak ditulis ke database produksi. Tujuannya memeriksa ulang ekstraksi dan koreksi LLM tanpa membuat event duplikat.

### URL 1 — WHO Disease Outbreak News

Dengan konfigurasi produksi yang ketat (`DEEPSEEK_TRIGGER_CONFIDENCE=0.85`), confidence lokal tepat `0.85`, sehingga DeepSeek **tidak dipanggil** sesuai aturan “hanya di bawah 0.85”. Hasil rules-only masih membawa masalah lama: parent `13897` kasus, `0` kematian, dan relasi child yang salah. Ini bukan hasil yang layak disimpan sebagai event final.

Untuk menguji jalur koreksi secara diagnostik, ambang dinaikkan sementara menjadi `0.86` hanya di proses test. DeepSeek kemudian mengembalikan dan pipeline mempertahankan:

| Lokasi | Cases | Deaths | Status |
|---|---:|---:|---|
| Democratic Republic of the Congo | 6757 | 3267 | benar |
| Uganda | 20 | 2 | benar |
| France | 1 | 0 | benar |

Parent lintas negara menjadi `6778` kasus dan `3269` kematian, `outbreak_alert=true`, serta tidak lagi menghasilkan child Germany/Indonesia. Waktu pipeline sekitar `8.84` detik dengan hasil collector sepanjang `17.934` karakter.

Perbaikan yang diuji adalah mempertahankan nama negara sebagai `location_name` ketika DeepSeek mengembalikan event level negara tanpa provinsi/kota. Sebelumnya event yang valid tersebut dibuang karena `location_name=null`, lalu bundle lokal yang salah kembali dipakai.

### URL 2 — WHO Childhood Cancer Medicines

Hasil tetap benar sebagai artikel informasi kesehatan non-outbreak:

| Field | Output |
|---|---|
| `disease_classification` | `UNKNOWN` |
| `is_health_related` | `true` |
| `event_type` | `health update` |
| `case_count` / `death_count` | `0` / `0` |
| `outbreak_alert` | `false` |
| `sub_events` | `[]` |
| DeepSeek | tidak dipanggil |

Waktu pipeline sekitar `4.21` detik dengan hasil collector sepanjang `6.916` karakter.

### Status retest

- Jalur DeepSeek dan korelasi multi-country sudah benar ketika artikel berada di bawah ambang review.
- Filter artikel kebijakan/informasi tetap hemat token dan tidak menghasilkan outbreak palsu.
- Dengan ambang persis `0.85`, URL 1 masih dapat lolos tanpa review karena confidence lokal dibulatkan tepat ke batas. Jika URL WHO resmi harus selalu melewati rear-gate saat memiliki multi-country evidence atau korelasi metrik kompleks, aturan gate perlu diubah khusus untuk bulletin resmi; konfigurasi strict `<0.85` saat ini memang tidak akan memanggil DeepSeek pada kasus tersebut.
- Retest ini tidak mengubah row database lama dan tidak mengaktifkan DeepSeek permanen.

### Regression check setelah retest

```text
28 passed in 0.51s
```

Yang lulus: gate confidence, guardrail metric/location, multi-event foundation, dan stage budget. `py_compile` untuk `pipeline.py`, `deepseek.py`, dan `llm_gate.py` serta `git diff --check` juga lulus.

Satu test legacy di `test_interactive_pipeline.py::test_bulk_path_still_calls_auxiliary_heads_when_not_interactive` masih gagal karena auxiliary heads tidak dipanggil pada jalur bulk saat ini. Test tersebut tidak terkait perubahan rear-gate country-level dan tidak mengubah hasil retest WHO.
