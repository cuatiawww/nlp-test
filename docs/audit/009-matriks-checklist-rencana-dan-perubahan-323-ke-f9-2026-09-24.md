# Matriks Checklist Rencana dan Perubahan Commit 323 ke F9

Tanggal audit: 2026-09-24  
Rentang commit: `323ca26dd7ee014c49e9de387cc11f7a7e654d4d` sampai `f9c736fadca0f0e2a74864435be9fe9a0a341def`  
Commit yang terbaca: `323ca26`, `b4b56d4`, `c248185`, `f9c736f`  
Status: audit berbasis Git; tidak menyimpulkan keberhasilan runtime tanpa eksekusi nyata.

## Legenda

| Tanda | Arti |
|---|---|
| ✅ | Implementasi ditemukan dan sesuai tujuan utama |
| ◐ | Implementasi sebagian; masih ada gap atau belum lengkap |
| ❌ | Belum ditemukan implementasi yang memenuhi tujuan |
| ⚠️ | Kode tersedia, tetapi hasil runtime atau akurasinya belum diverifikasi |

## 1. Checklist rencana utama

| No. | Rencana | Bukti pada rentang commit | Status | Kesimpulan audit |
|---:|---|---|:---:|---|
| 1 | Reset + inisiasi ulang data penyakit berdasarkan PPT | `database/init/120_clean_and_inject_asean_master_diseases.sql` menghapus konsep/alias lama lalu mengisi master ASEAN. Runtime memakai `services/nlp-python/app/disease_master.py`. | ✅ | Reset dan inisiasi ulang master penyakit ada. Kesesuaian isi terhadap PPT tidak dapat dibuktikan dari Git karena file PPT tidak termasuk rentang audit. |
| 2 | Reset + inisiasi ulang data source, hanya menyisakan Google News dan source Phase 1 | `database/init/122_data_source_controls.sql` hanya mengubah default dan menonaktifkan source lama. Tidak ada operasi selektif yang menghapus source lain dan menyisakan Google News/Phase 1. | ❌ | Source reset selektif belum dikerjakan. Source hanya dipause, bukan dibersihkan atau di-seed ulang sesuai daftar yang diminta. |
| 3 | Rapikan rule confidence `0.75` | `services/nlp-python/app/config.py` menetapkan `DEEPSEEK_TRIGGER_CONFIDENCE=0.75`; `services/nlp-python/app/llm_gate.py` memicu review saat confidence di bawah threshold. | ◐ | Angka `0.75` sudah menjadi threshold DeepSeek, bukan threshold global seluruh rule/NLP. Perlu dipastikan apakah memang itu maksud finalnya. |
| 4 | Lepas semua kode API selain Review | `services/nlp-python/app/icd11.py` dihapus, konfigurasi WHO ICD-11 dihapus, provider OpenAI dilepas dari agent, dan resolusi penyakit diarahkan ke local disease master. DeepSeek tetap dipakai sebagai review rear-gate. | ✅ | Ketergantungan API ontology penyakit eksternal sudah dilepas. Route kompatibilitas `/icd11/resolve` masih ada, tetapi hanya memanggil local disease master dan tidak menghubungi WHO. |
| 5 | Perbaiki penetapan Health / Outbreak | `pipeline.py` mempertahankan keputusan dari source text, menyaring non-health topic, memakai evidence/sub-events, dan mengalihkan validasi event ambigu ke rear-gate. `deepseek.py` memiliki filter non-event dan atomic event. | ✅ ⚠️ | Logika perbaikan ada. Hasil precision/recall health-outbreak belum dibuktikan dengan dataset berlabel atau regression run pada rentang commit. |
| 6 | Cek hasil implementasi DeepSeek Review | `deepseek.py` memiliki schema prompt, guardrail zero-hallucination, validasi disease master, evidence, lokasi, dan sub-events. | ◐ ⚠️ | Implementasi review ada, tetapi bukti hasil nyata belum ada. Default `AGENT_ENABLED=false`, dan sejumlah test lama justru ikut terhapus pada commit F9. |
| 7 | Hapus semua data analisa/reset event dan buat tombol reset | Pada tree yang diaudit ada `POST /api/v1/data/cleanup-events` yang menghapus `disease_events`. Tidak ditemukan tombol frontend dan endpoint tersebut tidak menghapus seluruh `raw_reports`/hasil analisa lain. Tidak ada bukti endpoint ini dibuat dalam rentang commit. | ◐ | Pintu backend tersedia, tetapi belum menjadi reset analisa yang lengkap dan belum dioperasikan dari UI. Scope penghapusan juga perlu dipastikan sebelum tombol dibuat karena bersifat destruktif. |
| 8 | Buat trigger On/Off collector source | `collector_sources.enabled`, scheduler membaca source aktif, endpoint update source, dan kontrol UI source tersedia. Migration 122 membuat source lama nonaktif. | ✅ | Kontrol per source sudah tersedia. `Jalankan` tetap menjadi aksi eksplisit; `Aktifkan/Pause` mengendalikan jadwal berikutnya. |
| 9 | Implementasikan DeepSeek Review untuk confidence `<= 0.75` | `llm_gate.py` memicu saat `confidence < DEEPSEEK_TRIGGER_CONFIDENCE`, juga saat `needs_review`, lokasi hilang, atau disease unknown yang memiliki kandidat. | ◐ ⚠️ | Mekanisme gate sudah ada, tetapi operator meminta `<=` sementara kode saat ini memakai `<`. Default-nya juga nonaktif sampai `AGENT_ENABLED=true` dan API key tersedia. |

## 2. Catatan penting tentang threshold `0.75`

Kode saat ini menggunakan kondisi:

```python
confidence < config.DEEPSEEK_TRIGGER_CONFIDENCE
```

Artinya nilai `0.74` akan masuk DeepSeek, sedangkan nilai tepat `0.75` tidak masuk hanya karena threshold. Jika kebutuhan bisnis benar-benar berarti “confidence kurang dari atau sama dengan 0.75”, kondisinya harus menjadi `<=` dan diuji secara eksplisit. Ini belum diubah dalam rentang commit yang diaudit.

## 3. Pekerjaan yang ditemukan di luar daftar utama

### 3.1 Masih satu tema sistem dan perlu dipertahankan dalam audit

| Area | Perubahan yang ditemukan | Dampak |
|---|---|---|
| Master negara | Migration `121_expand_master_countries_outside_asean_and_global.sql` dan perbaikan runner migration pada `b4b56d4`. | Menambah cakupan country/global di luar reset penyakit. |
| Penyatuan jalur NLP | URL worker diarahkan ke `/nlp/analyze/raw`; endpoint URL memakai shared `pipeline.run`; bounded path tetap tersedia untuk kebutuhan latency khusus. | Tiga jalur lebih konsisten, tetapi timeout dan beban perlu diuji ulang. |
| Matrix dan multi-event | `crawl_matrix_jobs.py` membawa disease, evidence, confidence, needs_review, dan relasi sub-event. | Output lebih kaya, tetapi belum otomatis memiliki provenance source/run. |
| Source catalog | Penetapan country, coverage scope, ASEAN coverage, credibility, dan detail run source diperbarui. | Mendukung UI source dan pelacakan collector, belum sama dengan akurasi NLP. |
| Frontend master data | Filter penyakit dan label UI diarahkan ke local disease master serta alias database. | Mengurangi hardcode penyakit dan ketergantungan ICD-11. |
| Infrastruktur | `c248185` mengubah routing K3s untuk maintenance page/NLP path. | Perubahan deployment, bukan perubahan kualitas ekstraksi. |

### 3.2 Perubahan besar di luar daftar dan perlu review risiko

Commit F9 menghapus banyak fixture, test, script, dan dokumen lama, termasuk test di `services/nlp-python/app/tests/`, beberapa script sinkronisasi, dan artefak validasi Slice 7. Ini bukan bagian eksplisit dari sembilan rencana utama. Dampaknya:

- regression coverage NLP menjadi lebih kecil;
- pembuktian DeepSeek, multi-event, extraction, dan QA gate perlu dibuat ulang atau dipulihkan secara selektif;
- penghapusan fixture tidak boleh dianggap sebagai bukti bahwa perilaku tersebut sudah tidak diperlukan.

## 4. Pekerjaan yang belum tercakup dan perlu dicatat untuk tahap berikutnya

| Pekerjaan lanjutan | Alasan |
|---|---|
| Reset source selektif | Perlu daftar source resmi yang dipertahankan: Google News dan source Phase 1. Migration saat ini belum melakukan whitelist. |
| Tombol reset analisa yang aman | Perlu pilihan scope minimal: event saja, event + relasi, raw article, atau seluruh hasil NLP. Wajib confirmation dan audit log. |
| Provenance `source_id`/`run_id` sampai hasil NLP | `collector_runs` sudah punya statistik collector, tetapi hasil NLP belum dapat diagregasi secara konsisten per source dan per run. |
| Metrik health/outbreak per source | Setelah provenance tersedia, baru dapat dihitung health-related, disease event, sub-event, needs-review, dan error NLP per source. |
| Verifikasi DeepSeek | Aktifkan hanya pada environment test, siapkan fixture berlabel, uji confidence `0.74`, `0.75`, `0.76`, unknown, non-health, dan multi-event. |
| Penilaian akurasi | Metrik jumlah hasil bukan precision/recall. Diperlukan ground truth manual untuk mengukur akurasi health, disease, location, metric, dan outbreak. |

## 5. Status worktree saat audit

Saat dokumen ini dibuat, `git status` menunjukkan perubahan di luar HEAD `f9c736f` berupa:

- modifikasi lokal `services/backend-rust/src/main.rs`;
- file audit lokal `docs/audit/008-audit-hardcoded-dummy-frontend-dan-perbaikan-backend-2026-09-24.md` yang belum tracked.

Keduanya tidak diubah oleh audit ini. Dokumen ini juga tidak melakukan commit atau push.

## 6. Kesimpulan singkat

Fondasi utama sudah ada: disease master lokal, penghapusan ketergantungan ICD-11 eksternal, gate DeepSeek `0.75`, perbaikan health/outbreak, dan trigger source. Yang belum selesai bukan lagi sekadar konfigurasi, melainkan reset data/source yang terkontrol, verifikasi hasil, serta provenance `source_id/run_id` agar kualitas NLP dapat dihitung per source secara benar.
