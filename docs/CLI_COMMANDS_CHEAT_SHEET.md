# 📖 Panduan Lengkap Perintah CLI (Cheat Sheet) — NLP-PENYAKIT

Dokumentasi ini berisi kumpulan perintah CLI praktis untuk operasional, re-analisis database, pengujian NLP & Scraper, pengelolaan container Docker, serta pemeliharaan database di lingkungan **Lokal** maupun **Server Production**.

---

## 📑 Daftar Isi
1. [🔄 1. Re-analyze Data Kesehatan (Batch Processing)](#-1-re-analyze-data-kesehatan-batch-processing)
2. [🌐 2. Analisis 1 URL Tertentu (Interactive URL Analyzer)](#-2-analisis-1-url-tertentu-interactive-url-analyzer)
3. [🐳 3. Manajemen & Log Container Docker](#-3-manajemen--log-container-docker)
4. [🗄️ 4. Pengelolaan & Query Database PostgreSQL](#-4-pengelolaan--query-database-postgresql)
5. [🧪 5. Menjalankan Automated Unit Test](#-5-menjalankan-automated-unit-test)
6. [🛠️ 6. Troubleshooting Error Umum](#-6-troubleshooting-error-umum)

---

## 🔄 1. Re-analyze Data Kesehatan (Batch Processing)

Perintah ini digunakan untuk memproses ulang seluruh data riwayat di database menggunakan rule NLP, scoring lokasi, dan regex kasus terbaru.

### A. Perintah Standar (Seluruh Database)
* **WSL / Linux:**
  ```bash
  docker exec -it disease-worker-python python -m app.reanalyze_health --skip-who-sync --batch-size 50 --stop-on-error
  ```
* **PowerShell (Windows):**
  ```powershell
  wsl -d Ubuntu -e docker exec -it disease-worker-python python -m app.reanalyze_health --skip-who-sync --batch-size 50 --stop-on-error
  ```

### B. Mode Simulasi / Uji Coba (`--dry-run`)
*(Menampilkan hasil analisis di terminal tanpa mengubah isi database)*
```bash
docker exec -it disease-worker-python python -m app.reanalyze_health --skip-who-sync --batch-size 50 --limit 10 --dry-run
```

### C. Membatasi Jumlah Baris Tertentu (`--limit` dan `--offset`)
```bash
# Memproses hanya 25 data teratas:
docker exec -it disease-worker-python python -m app.reanalyze_health --skip-who-sync --limit 25

# Memproses data ke-51 sampai ke-100 (lewati 50 data pertama):
docker exec -it disease-worker-python python -m app.reanalyze_health --skip-who-sync --offset 50 --limit 50
```

### D. Re-analyze dengan Sinkronisasi WHO ICD-11
```bash
docker exec -it disease-worker-python python -m app.reanalyze_health --batch-size 50 --who-limit 200
```

---

## 🌐 2. Analisis 1 URL Tertentu (Interactive URL Analyzer)

### A. Menggunakan cURL (HTTP POST)

* **Windows PowerShell:**
  ```powershell
  curl.exe -X POST http://localhost:3010/nlp/api/v1/analyze-url `
    -H "Content-Type: application/json" `
    -d '{"url":"https://www.vietnamplus.vn/dich-sot-xuat-huyet-tai-ha-noi-co-xu-huong-gia-tang-post1126592.vnp"}'
  ```

* **WSL / Linux:**
  ```bash
  curl -X POST http://localhost:3010/nlp/api/v1/analyze-url     -H "Content-Type: application/json"     -d '{"url":"https://www.vietnamplus.vn/dich-sot-xuat-huyet-tai-ha-noi-co-xu-huong-gia-tang-post1126592.vnp"}'
  ```

### B. Menggunakan Script Python CLI Cepat
```bash
docker exec -i disease-collector-python python -c "
import urllib.request, json
req = urllib.request.Request(
    'http://disease-backend-rust:8081/api/v1/analyze-url',
    data=json.dumps({'url': 'https://www.vietnamplus.vn/dich-sot-xuat-huyet-tai-ha-noi-co-xu-huong-gia-tang-post1126592.vnp'}).encode(),
    headers={'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req, timeout=30) as resp:
    d = json.loads(resp.read().decode()).get('data', {})
    print('Disease :', d.get('disease_classification'))
    print('Location:', d.get('location_name'), f'({d.get("country")})')
    print('Cases   :', d.get('case_count'), '| Deaths:', d.get('death_count'))
"
```

---

## 🐳 3. Manajemen & Log Container Docker

### A. Melihat Status Container
```bash
docker ps --format "table {{.Names}}	{{.Status}}	{{.Ports}}"
```

### B. Melihat Log Service
```bash
# Log Backend Rust:
docker logs --tail 50 -f disease-backend-rust

# Log NLP Python:
docker logs --tail 50 -f disease-nlp-python

# Log Scraper / Collector:
docker logs --tail 50 -f disease-collector-python

# Log Worker:
docker logs --tail 50 -f disease-worker-python
```

### C. Restart Service Tertentu
```bash
# Restart NLP:
docker restart disease-nlp-python

# Restart Backend:
docker restart disease-backend-rust

# Restart Collector:
docker restart disease-collector-python
```

### D. Rebuild Container (Setelah Perubahan Kode Backend / Frontend)
```bash
# Rebuild Backend Rust:
docker compose build disease-backend-rust && docker compose up -d disease-backend-rust

# Rebuild Frontend Next.js:
docker compose build disease-frontend-next && docker compose up -d disease-frontend-next
```

---

## 🗄️ 4. Pengelolaan & Query Database PostgreSQL

### A. Masuk ke Shell Database PostgreSQL
```bash
docker exec -it db-postgres psql -U postgres -d disease_ai
```

### B. Menjalankan File Migrasi SQL Baru
```bash
docker exec -i db-postgres psql -U postgres -d disease_ai < database/init/033_add_multilingual_asean_disease_aliases.sql
```

### C. Cek Kata Kunci & Alias Penyakit
```sql
-- Cek kata kunci DBD / Dengue:
SELECT * FROM nlp_keywords WHERE target_label = 'DBD';

-- Cek alias bahasa ASEAN yang terdaftar di database:
SELECT da.alias, da.language, dc.canonical_name 
FROM disease_aliases da
JOIN disease_concepts dc ON da.concept_id = dc.id
WHERE dc.canonical_name ILIKE '%dengue%';
```

### D. Cek Lokasi Kota / Negara ASEAN
```sql
SELECT id, name, country, latitude, longitude 
FROM locations 
WHERE name IN ('Hà Nội', 'Kuala Lumpur', 'Chiang Mai', 'Jakarta');
```

### E. Membersihkan Cache URL Spesifik (Jika Perlu Reset Manual)
```sql
DELETE FROM disease_events WHERE raw_report_id IN (SELECT id FROM raw_reports WHERE url LIKE '%vietnamplus%');
DELETE FROM raw_reports WHERE url LIKE '%vietnamplus%';
```

---

## 🧪 5. Menjalankan Automated Unit Test

Seluruh test suite TDD dapat dijalankan secara instan dengan perintah berikut:

### A. Test Ekstraksi Angka Kasus, Kematian, dan Lokasi
```bash
python3 services/nlp-python/tests/test_extraction_counts.py
```

### B. Test Outbreak Rules & Disease Disambiguation
```bash
python3 services/nlp-python/tests/test_rules.py
```

### C. Test Filter Kualitas Konten & Anti-Spam
```bash
python3 services/nlp-python/tests/test_content_quality.py
```

### D. Test Web Scraper & SPA Stealth Crawler
```bash
docker exec -i disease-collector-python python -c "import unittest; loader = unittest.TestLoader(); suite = loader.discover('/app/tests'); unittest.TextTestRunner(verbosity=2).run(suite)"
```

---

## 🛠️ 6. Troubleshooting Error Umum

| Gejala Error | Penyebab | Solusi |
| :--- | :--- | :--- |
| `500: NLP service tidak dapat dijangkau` | Container `disease-nlp-python` sedang warming-up / reload | Tunggu 5-10 detik atau cek log dengan `docker logs --tail 20 disease-nlp-python` |
| `HTTP 504 Gateway Timeout` | Crawler tersangkut di website lambat (> 25s) | Scraper sudah otomatis memakai timeout 12s dan failover ke mode HTTP |
| `Location salah / tertukar` | Muncul nama negara pembanding di footer | Location scoring otomatis memberi bobot +4 untuk judul & paragraf pembuka, dan penalti -3 untuk komparasi |
| `Hasil analisis lama tidak berubah` | Cache database mengunci hasil `UNKNOWN` | Sistem `backend-rust` kini otomatis mem-bypass cache jika record lama berstatus `UNKNOWN` / low confidence |
| `requests.exceptions.ConnectionError: [Errno 111] Connection refused` | Container NLP belum selesai warmup atau crash saat batch besar | 1. Cek `docker ps` dan `docker logs --tail 30 disease-nlp-python`<br>2. Jalankan `docker compose up -d disease-nlp-python`<br>3. Gunakan batch size lebih kecil: `--batch-size 25` |
