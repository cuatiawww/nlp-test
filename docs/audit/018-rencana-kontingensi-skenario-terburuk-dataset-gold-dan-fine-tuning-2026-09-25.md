# Audit 018: Rencana Kontingensi Skenario Terburuk & Fine-Tuning Dataset Gold (31 Master ASEAN)

**Tanggal Penyusunan:** 25 September 2026 WIB  
**Status:** Aktif & Siap Dieksekusi  
**Dokumen Terkait:** Audit 009 (Matriks Checklist), Audit 016 (Guardrail LLM), Audit 017 (Arsitektur & Roadmap System)

---

## 1. Latar Belakang & Trigger Skenario Terburuk

### 1.1 Problem Statement
Apabila hasil uji coba inferensi lokal (*rules-only* / regex) pada artikel berita nyata belum mencapai tingkat presisi & *recall* yang diharapkan untuk 31 Master Penyakit ASEAN (misal: terdapat penyakit yang luput terdeteksi, atau angka kasus luput karena frasa berita yang kompleks), maka sistem **TIDAK BOLEH** hanya bergantung pada *rules* mentah ataupun pemanggilan LLM terus menerus yang dapat membengkakkan biaya token & latensi.

### 1.2 Target & Solusi Kontingensi
Sesuai dengan kesepakatan tim, **Rencana Kontingensi Skenario Terburuk** adalah melakukan *fine-tuning* model *transformer* secara mandiri menggunakan **Gold Dataset** terverifikasi dengan target:
- **Macro-F1 Score $\ge 0.80$** di seluruh 31 kelas Master Penyakit ASEAN.
- **Kecepatan Inferensi Lokal < 50ms** per artikel di RunPod GPU (`NVIDIA RTX 2000 Ada`).

---

## 2. Strategi Pengumpulan Dataset Gold (Deva & Mas Asror)

### 2.1 Kuota & Pembagian Dataset Template
Telah dibuatkan 4 file template CSV di folder `docs/dataset_templates/` untuk mempermudah pembagian tugas pengumpulan data tanpa saling bertabrakan:

| File Template | Cakupan Penyakit | Target Jumlah Baris | Penanggung Jawab |
|---|---|:---:|:---:|
| `sheet1_penyakit_01_sampai_10.csv` | Anthrax, Avian Influenza, Chikungunya, COVID-19, Crimean-Congo, Dengue, Diphtheria, Ebola, HFMD (Flu Singapura), Hantavirus | 200 Baris | Tim Analyst (Deva / Asror) |
| `sheet2_penyakit_11_sampai_20.csv` | Henipaviral, HIV/AIDS, Lassa fever, Leptospirosis, Lymphatic Filariasis, Malaria, Marburg, Measles (Campak), Melioidosis, MERS | 200 Baris | Tim Analyst (Deva / Asror) |
| `sheet3_penyakit_21_sampai_31.csv` | Mpox, Nipah, Pertussis, Polio, Rabies, Rift Valley, Tuberculosis, Typhoid, Unknown Disease, West Nile, Zika | 220 Baris | Tim Analyst (Deva / Asror) |
| `sheet4_kontrol_non_kesehatan.csv` | Sampel Kontrol Non-Kesehatan (Skripsi, Pertanian, Judi Online, Militer/Politik) | 50 Baris | Tim Analyst (Deva / Asror) |
| **`dataset_master_combined_all.csv`** | **Gabungan Seluruh Sheet 1 s.d. Sheet 4 (Gold Dataset Full)** | **670 Baris** | **Siap Training Colab** |

### 2.2 Skema 10 Kolom Baku Dataset
Setiap baris artikel wajib diisi sesuai dengan 10 kolom standar backend NLP:
1. `article_id`: Kode unik artikel (`ART-0001`, `ART-0002`, dst).
2. `disease_label`: Nama resmi penyakit dari 31 Master ASEAN (`Dengue`, `Rabies`, `Mpox`, dll).
3. `title`: Judul berita asli.
4. `content`: Isi paragraf berita tempat informasi berada.
5. `location_name`: Nama Kabupaten/Kota/Provinsi spesifik kejadian.
6. `country_code`: Kode ISO-3 negara (`IDN`, `MYS`, `VNM`, `PHL`, `GLOBAL`, dll).
7. `cases`: Angka jumlah kasus (`0` jika tidak disebutkan angka).
8. `deaths`: Angka kematian (`0` jika tidak ada).
9. `is_health_outbreak`: `TRUE` (wabah manusia) / `FALSE` (skripsi/pertanian/judi online).
10. `url`: Link URL berita sumber.

---

## 3. Alur Fine-Tuning Model di Google Colab (`fine_tuned.ipynb`)

Telah disediakan skrip notebook Jupyter siap pakai di lokasi:
[services/nlp-python/fine_tuned.ipynb](file:///home/aspire_5/app/NLP-PENYAKIT/services/nlp-python/fine_tuned.ipynb)

### 3.1 Tahapan Eksekusi Training:
1. Upload file `dataset_master_combined_all.csv` ke Google Colab (dengan runtime T4 GPU gratis).
2. Jalankan notebook `fine_tuned.ipynb` yang akan otomatis:
   - Melakukan tokenisasi teks (`xlm-roberta-base` / `indobert-base-p1`).
   - Melakukan *stratified train-eval split* (85% train, 15% eval).
   - Menjalankan fine-tuning 5 epoch dengan HuggingFace `Trainer`.
   - Menghitung matriks evaluasi **Macro-F1, Accuracy, Precision, dan Recall**.
3. Mengunduh folder output `fine-tuned` (berisi `config.json`, `model.safetensors`, `tokenizer.json`).

### 3.2 Deployment Model Hasil Fine-Tuning ke RunPod / Local Docker:
1. Salin folder `fine-tuned` ke direktori proyek di RunPod / Docker local:
   `/workspace/nlp-penyakit-git/services/nlp-python/models/fine-tuned`
2. Di file `.env`, ubah model aktif menjadi:
   `NLP_MODEL=fine-tuned`
3. Restart service NLP: `uvicorn app.main:app` (service akan otomatis mendeteksi model fine-tuned lokal tanpa perlu men-download dari HuggingFace Hub).

---

## 4. Timeline & Target Eksekusi (Senin Deadline)

| Tanggal & Waktu | Milestone / Langkah Eksekusi | Output Target |
|---|---|---|
| **Jumat, 25 Sep 2026** | Pembuatan 4 file template CSV & notebook Colab `fine_tuned.ipynb` | ✅ Selesai (Folder `docs/dataset_templates/`) |
| **Sabtu–Minggu, 26–27 Sep** | Pengumpulan & pengisian 20 artikel/penyakit oleh Deva & Mas Asror | CSV terisi 670 baris data |
| **Minggu Malam, 27 Sep** | Training Colab `fine_tuned.ipynb` & evaluasi F1-score | Model `fine-tuned` ter-generate (F1 $\ge 0.80$) |
| **Senin Pagi, 28 Sep** | Deploy model ke RunPod GPU & verifikasi di Staging UI | Service NLP GPU aktif dengan model ter-tuning |

---

## 5. Ringkasan & Dokumentasi Audit
Dokumen ini resmi dicatat sebagai acuan kontingensi tim apabila performa inferensi lokal memerlukan akselerasi akurasi cepat berbasis data riil sebelum penyerahan hasil di hari Senin.
