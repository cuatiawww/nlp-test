# Production fine-tuning dan self-training

## Prinsip

Model tidak dilatih ulang dari semua prediksi mentah secara buta. Data yang
masuk ke pipeline self-training harus memiliki confidence minimal (default
`0.90`), kemudian kandidat model wajib melewati evaluation split dan macro-F1
minimum sebelum dipromosikan. Model lama tidak dihapus; tetap disimpan sebagai
`fine-tuned.previous.<timestamp>` atau di folder `models/releases/`.

Untuk jutaan baris, exporter membaca PostgreSQL secara streaming dan hanya
menyimpan reservoir berimbang per label. `TRAINING_MAX_PER_LABEL` dapat dinaikkan
sesuai kapasitas GPU. Jumlah data besar tidak otomatis berarti akurasi tinggi:
label yang salah, duplikat berita, dan data leakage harus tetap dikendalikan.

## Google Colab Pro

Di komputer/server yang menjalankan NLP, ekspor dataset ke JSONL:

```bash
python3 -m pip install -r scripts/requirements-training.txt
TRAINING_DATABASE_URL='postgres://postgres:PASSWORD@localhost:5435/disease_ai' \
  python3 scripts/export_training_data.py \
  --output-dir /tmp/disease-training \
  --min-confidence 0.90 \
  --max-per-label 100000
```

Upload `/tmp/disease-training/train.jsonl` dan `test.jsonl` ke Google Drive.
Di Colab, clone/upload repository lalu jalankan:

```bash
pip install -r scripts/requirements-training.txt
python scripts/train_classifier.py \
  --train /content/drive/MyDrive/disease-nlp/train.jsonl \
  --eval /content/drive/MyDrive/disease-nlp/test.jsonl \
  --label-field disease \
  --model-name xlm-roberta-base \
  --output-dir /content/disease-model \
  --max-per-label 100000 \
  --epochs 3 \
  --train-batch-size 16 \
  --gradient-accumulation-steps 2 \
  --fp16
```

Untuk jutaan data, gunakan `--max-steps` agar durasi dan biaya terkendali,
misalnya `--max-steps 30000`. Mulai dari `xlm-roberta-base`; gunakan batch
efektif yang lebih besar melalui gradient accumulation jika VRAM tidak cukup.
Model XLM-R cocok untuk bahasa ASEAN, tetapi akurasi tetap bergantung pada
label canonical yang konsisten. Jangan memasukkan data test lama ke training.

Script yang sama dapat melatih task lain:

```bash
python scripts/train_classifier.py ... --label-field event_type --output-dir /content/event-model
python scripts/train_classifier.py ... --label-field relevance_score --output-dir /content/relevance-model
```

Runtime production saat ini mempromosikan model `disease` ke path
`services/nlp-python/models/fine-tuned`. Task lain memerlukan mapping runtime
terpisah sebelum digunakan sebagai model production.

Export training secara default membaca semua tahun. Gunakan `--year 2026`
hanya jika ingin membatasi dataset training. Filter `CURRENT_YEAR_ONLY=true`
tetap berlaku pada collector dan worker production, sehingga berita lama tidak
masuk antrean pemrosesan berjalan.

## Menambahkan arsip `bencana_ai_live`

Database `bencana_ai_live` dapat dipakai sebagai corpus tambahan. Artikel mentah
disalin idempoten ke `disease_ai` dan diproses melalui queue historis terpisah;
label penyakit tidak disalin dari classifier bencana karena keduanya berbeda
task. Untuk arsip besar, prioritaskan artikel yang event sumbernya mengandung
penyakit/epidemi/wabah/keracunan:

```bash
make import-bencana-live
make import-bencana-live-health
```

`import-bencana-live` menyimpan seluruh artikel dan mempublish seluruhnya ke
queue historis. `import-bencana-live-health` mempublish kandidat kesehatan yang
belum selesai diproses dan aman dijalankan ulang. Keduanya tidak memakai queue
`disease.raw` dan tidak mengubah kebijakan worker production tahun berjalan.

## Self-host retraining bulanan

Pastikan environment training host telah memiliki dependencies, lalu jalankan
dry-run terlebih dahulu:

```bash
python3 -m pip install -r scripts/requirements-training.txt
TRAINING_DATABASE_URL='postgres://postgres:PASSWORD@localhost:5435/disease_ai' \
  python3 scripts/retrain_from_db.py --dry-run
```

Training dan promosi aman:

```bash
TRAINING_DATABASE_URL='postgres://postgres:PASSWORD@localhost:5435/disease_ai' \
  python3 scripts/retrain_from_db.py \
  --task disease \
  --min-confidence 0.90 \
  --max-per-label 100000 \
  --min-macro-f1 0.80 \
  --min-eval-samples 100 \
  --max-steps 30000 \
  --fp16 \
  --restart-service
```

`--restart-service` memuat model baru ke NLP container setelah promosi. Tanpa
flag itu, model aktif tidak berubah sampai service direstart. Scheduler cron
contoh, tanggal 1 setiap bulan pukul 02:00:

```cron
0 2 1 * * cd /home/mci/app/SCRIPT/NLP && \
  TRAINING_DATABASE_URL='postgres://postgres:PASSWORD@localhost:5435/disease_ai' \
  /usr/bin/python3 scripts/retrain_from_db.py --task disease --max-steps 30000 --fp16 --restart-service \
  >> /var/log/disease-nlp-retrain.log 2>&1
```

Command ini adalah trigger yang sama yang dapat dipanggil oleh tombol admin
nanti. Jangan membuat endpoint training tanpa authentication karena training
dapat menghabiskan GPU/CPU dan storage.

## Deploy model dari Colab

Salin isi folder model hasil training ke host, misalnya:

```bash
mkdir -p services/nlp-python/models/fine-tuned
rsync -a /path/to/disease-model/ services/nlp-python/models/fine-tuned/
docker compose -f docker-compose-prod.yml up -d --force-recreate nlp-python
curl -fsS http://127.0.0.1:8003/health
```

Untuk deployment tanpa menimpa model aktif, salin ke
`services/nlp-python/models/releases/<version>` lalu ubah symlink `fine-tuned`
setelah evaluation. Script `retrain_from_db.py` melakukan pola ini otomatis.
