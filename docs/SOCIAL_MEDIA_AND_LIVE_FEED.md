# Social Media Ingestion & Live Crawling Feed

Panduan teknis ringkas mengenai modul ingestion media sosial berbasis CSV dan panel live feed crawling real-time.

---

## 1. Modul Social Media CSV Ingestion

Modul ini mengimpor dan memproses data postingan/komentar media sosial (Instagram, Facebook, TikTok, dll.) ke pipeline RabbitMQ & NLP.

- **Lokasi Collector**: `services/collector-python/app/collectors/social_csv_ingest.py`
- **Direktori Data**: `/app/data/social_media/` (dimount dari `./data/social_media/`)
- **Checkpoint Tracking**: `.state_checkpoints.json` (mencegah duplikasi data yang sudah pernah di-ingest)

### Konfigurasi path:
```env
SOCIAL_MEDIA_CSV_DIR=/app/data/social_media
```

Interval watcher, mode loop, batas entri RSS, dan batas interval crawler ditetapkan
langsung sebagai konstanta di kode agar perilakunya konsisten antar environment.

### Endpoint Manual & Scheduler:
- **Scheduler**: Berjalan otomatis setiap 5 menit.
- **Loop mode**: Semua post unik dalam CSV diproses lalu diulang dari awal setelah satu
  siklus selesai. Checkpoint tetap dipakai
  sebagai cursor siklus, bukan sebagai daftar permanen yang menghentikan crawler.
- **Deduplikasi**: Re-play URL sosial memperbarui analisis URL yang sama di worker,
  sehingga tidak membuat `raw_reports`/`disease_events` baru pada setiap siklus.
- **Manual Trigger**:
  ```bash
  docker exec disease-collector-python python -c "import requests; print(requests.post('http://localhost:8002/collect/social-media-csv').json())"
  ```
  Port collector tidak dipublish ke host pada `docker-compose.yml`, sehingga
  `curl http://localhost:8002/...` dari host tidak dapat digunakan langsung.

---

## 2. Live Crawling Feed (Panel Sisi Kiri)

Komponen feed real-time di antarmuka Command Center (`/nlp/tv`) menampilkan sinyal crawling berita web dan media sosial terkini.

- **Komponen UI**: `services/frontend-next/components/CrawlingFeedPanel.tsx`
- **Hook Real-time**: `services/frontend-next/hooks/useCrawlingFeed.ts` (polling 3 detik)
- **Komponen Icon**: `services/frontend-next/components/SocialMediaIcon.tsx` (TikTok, Instagram, Facebook, X, Reddit, dll.)
- **Deteksi Platform**: `services/frontend-next/lib/crawling-feed.ts`

### Perbaikan Terbaru:
1. **Uncapped Stream**: Menghapus limit 2 item per-negara agar seluruh data crawling terbaru langsung tampil.
2. **Social Media Year Bypass**: Worker Python mengizinkan pemrosesan postingan media sosial tanpa pemblokiran tahun ketat.
3. **Tab Channel**: Tab *ALL*, *WEB*, dan *SOCIAL* untuk memfilter sumber informasi secara instan.
