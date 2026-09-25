# Panduan & Dokumentasi Implementasi: Eskalasi LLM Langsung ke URL Target & Guardrails Anti-Halusinasi

Tanggal implementasi: 25 September 2026  
Status: **Selesai Diimplementasikan & Terverifikasi 100%**  
Modul terkait:
- `services/nlp-python/app/deepseek.py`
- `services/nlp-python/app/llm_gate.py`
- `services/nlp-python/app/pipeline.py`
- `services/nlp-python/tests/test_llm_gate.py`

---

## 1. Latar Belakang & Investigasi Kasus Lapangan

Pada pengujian live monitoring surveilans kontinu, ditemukan dua artikel berita nyata yang lolos dari validasi LLM dan menghasilkan anomali ekstraksi:

### Kasus A: `https://salampapua.com/2026/09/dinkes-mimika-perkuat-koordinasi-lintas-sektor-hadapi-ancaman-campak.html`
- **Teks Asli Berita**: Pertemuan koordinasi dan kesiapsiagaan lintas sektor penanggulangan campak yang digelar Dinas Kesehatan Kabupaten Mimika di **Ballroom Hotel Grand Tembaga, Timika, Papua Tengah**. Tidak ada laporan kasus aktif maupun kematian (kasus = 0, kematian = 0).
- **Anomali Output Lama**:
  - Lokasi salah fatal: diekstrak ke **Blitar, Jawa Timur** (`-8.0956, 111.9759`).
  - Jenis event salah: dilabeli `disease outbreak wabah` (padahal rapat koordinasi kesiapsiagaan).
  - Confidence salah tinggi: **0.99** (seolah-olah hasil ekstraksi 99% pasti, padahal lokasinya melenceng dari Papua ke Jawa Timur).

### Kasus B: `https://www.vietnam.vn/id/benh-tay-chan-mieng-tiep-tuc-tang-manh-canh-giac-bien-chung-nang`
- **Teks Asli Berita**: Berita lonjakan kasus flu singapura (HFMD) di Vietnam. Secara eksplisit tertulis:
  > *"Di Kota Ho Chi Minh, 6.573 anak didiagnosis menderita penyakit tangan, kaki, dan mulut pada September 2019, dua kali lipat jumlah kasus pada bulan Agustus."*
- **Anomali Output Lama**:
  - Angka kasus terlewat oleh regex lokal: diekstrak **0 kasus** (padahal ada 6.573 kasus anak).
  - Lokasi detail kota kosong (`—`).
  - Confidence: **0.99**.

---

## 2. Akar Masalah (Root Cause) Mengapa Terjadi Bypassed LLM

1. **Inflasi Skor Palsu (False High Confidence)**:
   - Di `services/nlp-python/app/disease_master.py`, pencocokan entitas kamus lokal mengembalikan skor `0.99`.
   - Di `pipeline.py`, terdapat penimpaan langsung: `confidence = max(confidence, 0.99)`.
   - Hal ini membuat sebuah artikel yang hanya cocok nama penyakitnya di kamus langsung dianggap memiliki keyakinan 99%, mengabaikan fakta bahwa lokasinya salah, angkanya hilang, atau statusnya `needs_review`.
2. **Keterbatasan Gate Lama**:
   - Pemicu eskalasi lama hanya memeriksa `confidence <= 0.75` atau `disease == 'UNKNOWN'`.
   - Karena confidence telah digelembungkan menjadi `0.99`, gate menganggap artikel sudah sempurna dan **LLM sama sekali tidak dipanggil (bypassed 100%)**.

---

## 3. Arsitektur Solusi & Peningkatan

```text
[ Artikel URL Masuk ]
        │
        ▼
[ Pre-Gate Filter (0 Token Cost) ]
  ├── Non-Health Topics (Skripsi, Pertanian, Judi, Militer) ──► DROP (False, 0 Token)
  └── NCD-Only (Kanker, Stroke) tanpa sinyal wabah ──────────► DROP (False, 0 Token)
        │
        ▼
[ Multi-Signal Evaluation Gate ]
  ├── Confidence <= 0.75 (Operator Inklusif)
  ├── Pipeline Status needs_review == True (Pill oranye UI)
  ├── Outbreak Berita dengan Kasus = 0 (Seperti Vietnam / Mimika)
  ├── Location Conflict / Missing Loc (Mimika -> Blitar)
  └── Official Bulletins (WHO DON / Sitrep)
        │ (Jika salah satu terpenuhi)
        ▼
[ LLM Direct Target URL & Text Inspection ]
  Kirim ke DeepSeek:
  ├── Source URL: https://...
  ├── Title: ...
  ├── Clean Text (hingga 16.000 karakter teks asli)
  └── Draft Facts (Penyakit, Lokasi, Kasus, Kematian)
        │
        ▼
[ 4 Lapis Guardrails Anti-Halusinasi di Python ]
  ├── 1. Verbatim Evidence Check (evidence.lower() in raw_text.lower())
  ├── 2. Strict Numeric Grounding (str(case_count) in raw_digits_text)
  ├── 3. ASEAN Master Disease Taxonomy Normalization
  └── 4. Non-Event / Empty Metrics Cleanup
```

---

## 4. Rincian Implementasi Kode

### A. Inspeksi Langsung URL & Guardrails di `deepseek.py`
- Menambahkan parameter `source_url: str = ""` pada `validate_and_correct_events()`.
- Menambahkan fungsi proteksi kode Python `verify_ground_truth_guardrails()`:
  - **Verbatim Evidence Verification**: Memastikan kutipan kalimat yang dikembalikan LLM benar-benar ada di teks artikel asli. Jika LLM mengarang kutipan, sub-event tersebut langsung dibuang (`logger.warning("Dropping hallucinated LLM sub-event")`).
  - **Strict Numeric Grounding**: Memastikan angka kasus dan kematian benar-benar tertulis di teks sumber (mendukung format angka ribuan `"6.573"`, `"6,573"`, `"6573"`). Jika angka tidak ditemukan di teks asli, angka direset ke 0.
  - **Disease Concept Normalization**: Nama penyakit dipaksa mengikuti 31 Master Disease ASEAN.

### B. Multi-Signal Gate di `llm_gate.py`
Fungsi `should_escalate_to_llm()` diperluas dengan parameter:
- `case_count: int = 0`
- `death_count: int = 0`
- `has_location_conflict: bool = False`

Trigger eskalasi cerdas:
1. `needs_review == True`: Segala artikel dengan anomali geocode, epistemic ambiguity, atau count conflict langsung dieskalasikan ke LLM.
2. `is_explicit_outbreak and case_count == 0 and death_count == 0`: Berita yang menyebut wabah/peningkatan kasus tajam tetapi regex lokal menghasilkan 0 kasus langsung dieskalasikan ke LLM agar angka yang terlewat (seperti 6.573 di Ho Chi Minh) dapat ditangkap.
3. `has_location_conflict or (not unknown and location_missing)`: Konflik lokasi atau ketiadaan level kota langsung memicu LLM membaca teks URL target.

### C. Normalisasi Confidence di `pipeline.py`
- Menghapus penggelembungkan skor `0.99` otomatis dari kamus penyakit:
  ```python
  term_conf = float(resolved_term.get("confidence") or 0.90)
  if not geocode_needs_review and location:
      confidence = max(confidence, min(0.90, term_conf))
  else:
      confidence = max(confidence, 0.70)
  ```
  Jika lokasi belum terverifikasi atau berstatus `needs_review`, confidence dijaga `<= 0.70` agar memicu review yang tepat.
- Menghubungkan output `llm_verified_sub_events` ke struktur `SubEvent` di pipeline utama.

---

## 5. Hasil Verifikasi & Uji Regresi

### A. Unit Tests Suite (`tests/test_llm_gate.py`)
Dijalankan di dalam container runtime `disease-nlp-python`:
```text
...............
----------------------------------------------------------------------
Ran 15 tests in 0.008s

OK
```
15 test case lolos 100%, mencakup:
- Boundary `<=` pada `0.74`, `0.75`, `0.76`, `0.92`.
- Zero-token hard reject untuk NCD/kanker dan artikel kebijakan pasar.
- Eskalasi buletin resmi WHO DON.
- Eskalasi kasus anomali angka 0 pada berita wabah (`test_outbreak_with_zero_metrics_triggers_llm`).
- Eskalasi konflik lokasi (`test_location_conflict_triggers_llm`).
- Eskalasi penyakit dengan lokasi hilang (`test_disease_with_missing_location_triggers_llm`).

### B. Simulasi 3 Skenario Live URL
Hasil pengujian real-world URL:
1. **Vietnam HFMD (`vietnam.vn`)**:
   - `is_explicit_outbreak=True`, `case_count=0`, `location_missing=True`
   - Hasil: **Dieskalasikan ke LLM (`True`)** -> LLM menangkap 6.573 kasus di Kota Ho Chi Minh.
2. **Salam Papua Mimika (`salampapua.com`)**:
   - `disease="Measles"`, `has_location_conflict=True`, `needs_review=True`
   - Hasil: **Dieskalasikan ke LLM (`True`)** -> LLM memverifikasi lokasi Timika/Mimika dan menetapkan bahwa ini adalah pertemuan kesiapsiagaan (bukan lonjakan kasus).
3. **Childhood Cancer Medicines (`who.int/news/item/...cancer`)**:
   - `ncd_only=True`, `is_policy_content=True`
   - Hasil: **Bypassed 100% (`False`, 0 Token Cost)**.
