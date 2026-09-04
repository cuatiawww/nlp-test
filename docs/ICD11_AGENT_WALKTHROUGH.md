# ICD-11 Agent Resolution Walkthrough

## Tujuan

Pipeline menjadikan WHO ICD-11 MMS sebagai validator canonical disease.
DeepSeek/OpenAI hanya mengekstrak istilah dan memilih penyakit utama; agent
tidak pernah boleh menciptakan kode ICD-11.

## Alur runtime

```text
URL
  -> collector membersihkan title/body dan mengambil country hint dari URL
  -> local keyword + disease_aliases mencari semua disease mention
  -> classifier lokal memberi kandidat awal
  -> agent mengurutkan primary/secondary berdasarkan title dan konteks
  -> WHO ICD-11 search memvalidasi canonical name + code
  -> concept tervalidasi disimpan ke disease_concepts/disease_aliases
  -> disease_events menyimpan disease_mentions sebagai audit evidence
```

Jika istilah tidak ditemukan oleh WHO, istilah tidak boleh langsung menjadi
konsep aktif. Istilah tersebut disiapkan untuk antrean `pending` pada
`disease_discovery_candidates` agar dapat ditinjau tanpa mencemari dashboard.

## Konfigurasi

```env
AGENT_ENABLED=true
AGENT_PROVIDER_ORDER=deepseek,openai
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=...
WHO_ICD_CLIENT_ID=...
WHO_ICD_CLIENT_SECRET=...
WHO_ICD_RELEASE=11/2026-01/mms
WHO_ICD_API_VERSION=v2
```

DeepSeek dicoba sesuai urutan konfigurasi. Jika timeout, response bukan JSON,
atau provider gagal, OpenAI dicoba. Jika semua provider gagal, sistem tetap
berjalan dengan hasil lokal dan menandai hasil yang perlu ditinjau.

## Contoh hasil yang diharapkan

Untuk artikel WMP tentang Laos:

```json
{
  "disease_classification": "dengue fever",
  "disease_mentions": [
    {
      "surface_form": "Dengue",
      "canonical_name": "dengue fever",
      "icd11_code": "<kode WHO>",
      "role": "primary",
      "resolution_source": "WHO ICD-11"
    },
    {
      "surface_form": "Zika",
      "canonical_name": "Zika virus disease",
      "role": "secondary"
    }
  ],
  "location_name": "Laos",
  "country": "Laos"
}
```

Zika tetap tercatat sebagai mention sekunder, tetapi tidak menggantikan
Dengue yang menjadi fokus judul dan isi utama.

## Deploy dan verifikasi

```bash
docker compose up -d --build disease-nlp-python disease-backend-rust disease-worker-python disease-collector-python

# Jalankan migration 039 melalui startup backend atau migration runner.
docker compose logs -f nlp-python

# Analisis satu URL dari dashboard atau API.
curl -X POST http://localhost:8081/api/v1/analyze-url \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.worldmosquitoprogram.org/en/news-stories/stories/wmp-expands-dengue-prevention-laos"}'
```

Periksa tiga hal: primary disease adalah Dengue, `country` adalah Laos, dan
`disease_mentions` berisi evidence serta status primary/secondary.

Untuk melihat istilah yang belum tervalidasi WHO:

```sql
SELECT surface_form, occurrences, confidence, status, sample_text
FROM disease_discovery_candidates
WHERE status = 'pending'
ORDER BY updated_at DESC;
```

Promosikan istilah hanya setelah operator memeriksa bukti dan hasil pencarian
WHO. Agent boleh mengusulkan istilah, tetapi tidak boleh menetapkan kode ICD
sendiri.

## Regression test

```bash
cd services/nlp-python
PYTHONPATH=. python3 -m unittest discover -s app/tests -v

cd ../collector-python
PYTHONPATH=. python3 -m unittest discover -s tests -v
```

Untuk menerapkan hasil pipeline baru ke data lama, jalankan dry-run terlebih
dahulu, lalu proses batch setelah hasil delapan URL contoh telah diverifikasi:

```bash
./scripts/reanalyze_health.sh --limit 8 --dry-run --skip-who-sync
./scripts/reanalyze_health.sh --limit 8 --skip-who-sync
```

`--skip-who-sync` bersifat opsional; hapus flag tersebut jika ingin sekaligus
mencoba menyelesaikan konsep UNKNOWN melalui WHO sebelum re-analysis.
