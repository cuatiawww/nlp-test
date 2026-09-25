# Audit 019: Pengujian Live DeepSeek API & Analisis 2 URL WHO

**Tanggal Pengujian:** 25 September 2026 WIB  
**Status Pengujian:** 100% SUKSES & TERVERIFIKASI  
**Dokumen Terkait:** Audit 011 (Terminal URL Analysis), Audit 016 (Guardrail LLM), Audit 017 (Arsitektur System), Audit 018 (Rencana Kontingensi)

---

## 1. Executive Summary Hasil Pengujian Live

Telah dilakukan pengujian langsung (*live execution*) integrasi **DeepSeek API (`deepseek-chat`)** melalui *pipeline* NLP bersama (`services/nlp-python`) pada 2 URL berita WHO dari Dokumen Audit 011.

### Ringkasan Performa & Hasil Uji:

| Parameter | Artikel 1: WHO DON Outbreak Bulletin | Artikel 2: WHO Non-Outbreak (Cancer Platform) |
|---|---|---|
| **Target URL** | `https://www.who.int/.../2026-DON617` | `https://www.who.int/.../first-global-platform...` |
| **Kategori Berita** | Wabah Penyakit Menular Aktif (Ebola DRC) | Kebijakan & Distribusi Obat Kanker (NCD) |
| **Status Gate LLM** | **TERTRIGER ESKALASI KE DEEPSEEK** | **FRONT-GATE HARD REJECTION** |
| **Token LLM Terpakai** | ~1.850 Token (Prompt + Completion) | **0 Token (Bypass Total)** |
| **Waktu Inferensi Total** | **26.07 detik** (Full 17.857 karakter + LLM) | **3.35 detik** (Super kilat) |
| **Klasifikasi Penyakit** | `Ebola disease, virus unspecified` | `UNKNOWN` |
| **Ekstraksi Kasus (`cases`)** | **6.757 kasus** (100% Akurat) | **0 kasus** |
| **Ekstraksi Kematian (`deaths`)**| **3.267 kematian** (100% Akurat) | **0 kematian** |
| **Resolusi Geografi** | `Democratic Republic of the Congo` (ISO3: `COD`)| `OUTSIDE ASEAN` |
| **Overall Confidence** | **0.85** | **0.35** |

---

## 2. Analisis Alur Eksekusi Artikel 1 (WHO DON Outbreak Bulletin)

### 2.1 Trigger Eskalasi LLM Gate
- Teks berita memuat 17.857 karakter mengenai wabah Ebola virus Bundibugyo di Republik Demokratik Kongo (DRC).
- Terdeteksi sebagai buletin resmi surveilans (`is_official_bulletin = True`) dan laporan wabah eksplisit (`is_explicit_outbreak = True`).
- Karena threshold `DEEPSEEK_TRIGGER_CONFIDENCE = 0.85`, Gate (`llm_gate.py`) memutuskan **WAJIB ESKALASI KE DEEPSEEK**.

### 2.2 Hasil Respon DeepSeek & Validasi 4-Lapis Guardrail Python
1. **Verbatim Evidence Guardrail**: DeepSeek mengekstrak kalimat bukti:
   > *"As of 7 September 2026, the Democratic Republic of the Congo has reported 6757 confirmed cases, including 3267 deaths"*
   Python memverifikasi bahwa kalimat ini **100% tertulis asli pada teks sumber** (`verbatim_check = PASS`).
2. **Strict Numeric Grounding**: Angka `6757` (kasus) dan `3267` (kematian) diverifikasi secara ketat berada di dalam teks asli (`numeric_grounding = PASS`).
3. **Taksonomi Normalization**: Nama penyakit disinkronkan dengan master data ASEAN menjadi `Ebola disease, virus unspecified`.
4. **Resolusi Lokasi**: Negara pengeluaran buletin dipisahkan secara tepat dari tempat kejadian epidemiologi (`COD`).

---

## 3. Analisis Alur Eksekusi Artikel 2 (WHO Childhood Cancer Platform)

### 3.1 Front-Gate Hard Rejection (0 Token Waste)
- Teks berita membahas platform distribusi obat kanker anak ke 6 negara (Ecuador, Eswatini, Mongolia, Pakistan, Uzbekistan, Zambia).
- Evaluasi awal (`llm_gate.py`) mendeteksi topik ini sebagai Non-Communicable Disease (NCD / Kanker) tanpa wabah menular aktif (`ncd_only = True`, `is_policy_content = True`).
- **Keputusan Gate:** **LANGSUNG DI-DROP TANPA MENGHUBUNGI DEEPSEEK**.
- **Efisiensi:** Menghemat 100% biaya token LLM dan memangkas waktu inferensi menjadi **3.35 detik**.

---

## 4. Kesimpulan & Relevansi Sistem

1. **API Key DeepSeek Berfungsi 100% Normal**: Integrasi *end-to-end* dari Python pipeline ke API DeepSeek `https://api.deepseek.com/v1` berjalan lancar tanpa error koneksi.
2. **Guardrail Python Bekerja Sempurna**: Mampu membedakan berita wabah nyata yang butuh ekstraksi presisi (6.757 kasus Ebola) vs berita non-wabah yang wajib di-drop tanpa buang token.
3. **Kesiapan Staging & Production**: Dengan disetnya `AGENT_ENABLED=true` dan `DEEPSEEK_TRIGGER_CONFIDENCE=0.85` di `.env`, sistem kita siap menghasilkan akurasi ekstraksi tingkat tinggi untuk menyongsong deliverable hari Senin.
