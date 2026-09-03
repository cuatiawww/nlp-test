# Social Media Ingestion & Live Crawling Feed

Panduan teknis ringkas mengenai modul ingestion media sosial berbasis CSV dan panel live feed crawling real-time.

---

## 1. Modul Social Media CSV Ingestion

Modul ini mengimpor dan memproses data postingan/komentar media sosial (Instagram, Facebook, TikTok, dll.) ke pipeline RabbitMQ & NLP.

- **Lokasi Collector**: `services/collector-python/app/collectors/social_csv_ingest.py`
- **Direktori Data**: `/app/data/social_media/` (dimount dari `./data/social_media/`)
- **Checkpoint Tracking**: `.state_checkpoints.json` (mencegah duplikasi data yang sudah pernah di-ingest)

### Konfigurasi `.env`:
```env
SOCIAL_MEDIA_CSV_DIR=/app/data/social_media
SOCIAL_MEDIA_CSV_INTERVAL_MINUTES=5
```

### Endpoint Manual & Scheduler:
- **Scheduler**: Berjalan otomatis setiap `SOCIAL_MEDIA_CSV_INTERVAL_MINUTES` menit.
- **Manual Trigger**:
  ```bash
  curl -X POST http://localhost:8002/collect/social-media-csv
  ```

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