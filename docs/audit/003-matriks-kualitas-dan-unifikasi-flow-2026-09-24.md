# Matriks kualitas ekstraksi dan unifikasi flow

Tanggal: 2026-09-24  
Status: audit + perubahan implementasi tahap awal  
Dokumen terkait: `001-alur-crawling-model-dan-akurasi-2026-09-24.md`, `002-perbandingan-tiga-jalur-url-2026-09-24.md`

## Kesimpulan

Prioritas kualitas data surveilans sebaiknya memakai satu profil NLP penuh untuk tiga jalur:

```text
discovery/fetch
  -> collector extraction
  -> canonical URL + deduplication
  -> raw article
  -> /nlp/analyze/raw
  -> pipeline.run(interactive=false, rules_only=false)
  -> disease + location + metric relation + sub_events
  -> persistence adapter masing-masing
```

Perbedaan entry point dan persistence masih boleh ada. Yang tidak boleh berbeda adalah profil analisis setelah artikel berhasil diambil. URL manual tidak lagi memakai mode bounded secara default. Endpoint `/nlp/analyze-bounded` tetap tersedia hanya untuk caller yang memang secara eksplisit memilih latensi rendah.

## Batas interpretasi skor

Skor di bawah adalah penilaian engineering berdasarkan flow dan kode saat ini, bukan hasil pengukuran precision/recall terhadap gold dataset. Angka statistik baru boleh disebut setelah golden set artikel yang sama diuji di tiga jalur.

| Skor | Arti |
|---|---|
| 5 | jalur paling lengkap dan memiliki bukti relasional yang kuat |
| 4 | lengkap, tetapi masih ada adapter/cache atau cakupan yang perlu diawasi |
| 3 | dapat menghasilkan sinyal, tetapi ada kehilangan informasi yang nyata |
| 2 | cocok untuk screening awal, tidak ideal sebagai sumber angka surveilans |
| 1 | tidak layak menjadi sumber keputusan |

## Matriks kualitas aktual sebelum penyamaan

| Dimensi kualitas | Crawling kontinu | URL manual | Crawl matrix | Risiko utama |
|---|---:|---:|---:|---|
| Fetch dan metadata artikel | 4 | 4 | 4 | source bisa mengembalikan shell/challenge atau body tidak lengkap |
| Teks panjang dan konteks multi-paragraf | 4 | 2 | 4 | URL manual dipotong sekitar 6.000 karakter |
| Deteksi multi-penyakit | 4 | 2 | 3 | manual mematikan model; matrix sebelumnya memilih satu penyakit utama saat persist |
| Disease-location relation | 4 | 2 | 4 | manual melewati strict surveillance relation pass |
| Case/death relation | 4 | 2 | 4 | angka dapat menjadi angka dokumen, bukan angka penyakit-lokasi |
| Multi-event / multi-country | 4 | 3 | 3 | adapter matrix sebelumnya dedup berdasarkan country saja |
| Outbreak / health relevance | 4 | 3 | 4 | manual hanya memakai rule/relation pada profil bounded |
| Evidence dan offset | 4 | 3 | 4 | evidence manual berasal dari teks yang sudah dicap |
| NLLB enrichment | 2 | 2 | 2 | NLLB asynchronous dan bukan authority keputusan |
| Bentuk output surveilans | 4 | 3 | 4 | matrix lebih siap untuk baris country/province, manual lebih ringkas |
| **Penilaian keseluruhan** | **4** | **2–3** | **3–4** | kualitas dibatasi oleh jalur dengan informasi paling sedikit |

### Arti matriks tersebut

- Crawling kontinu adalah baseline terbaik saat ini karena memakai `/nlp/analyze/raw`, model batch, dan strict relation pass.
- URL manual adalah yang paling tidak konsisten sebelum perubahan karena `interactive=true` memotong teks, mematikan model di bounded child process, dan melewati strict projection.
- Crawl matrix memiliki NLP batch yang baik, tetapi kualitas akhir dapat turun saat hasil diproyeksikan ke `crawl_matrix_rows`. Sebelum perubahan, pemilihan satu `disease` dan dedup country dapat menyembunyikan event lain.

## Flow target setelah perubahan

| Tahap | Tiga jalur setelah perubahan | Sumber authority |
|---|---|---|
| Discovery | scheduler source, URL job, atau matrix discovery | URL dan source catalog |
| Fetch/extract | collector `/extract-url` atau source collector | raw article + metadata |
| NLP entry | `/nlp/analyze/raw` | kontrak sama |
| Pipeline | `pipeline.run` dengan `interactive=false` | teks asli |
| Disease | alias, evidence, classifier bila aktif, multi-event composer | teks asli + evidence |
| Location | gazetteer dan hierarchy linker | teks asli + evidence |
| Metric | count/death/date relation dan strict surveillance pass | kalimat sumber |
| Translation | NLLB sebagai enrichment asynchronous/cache | bukan authority |
| Persistence | raw reports/events atau matrix rows | adapter, bukan re-analisis |

Perubahan implementasi:

- `services/worker-python/app/analysis_jobs.py` mengirim URL manual ke `/nlp/analyze/raw`, bukan profil interactive.
- `services/nlp-python/app/main.py` membuat `/nlp/analyze/url` memakai pipeline penuh; bounded tetap eksplisit di `/nlp/analyze-bounded`.
- `services/worker-python/app/worker.py`, `analysis_jobs.py`, dan `crawl_matrix_jobs.py` memakai timeout NLP berbasis `NLP_REQUEST_TIMEOUT_SECONDS`, minimal 120 detik dan default 270 detik.
- `pipeline_analysis_to_matrix` membawa penyakit, evidence, confidence, dan `needs_review` dari `sub_events`; matrix tidak lagi hanya bergantung pada satu label penyakit dokumen.

## Matriks field hasil yang harus sama

Untuk satu URL dan content hash yang sama, hasil ketiga jalur wajib dibandingkan pada field berikut:

| Kelompok | Field yang dibandingkan | Kriteria kualitas |
|---|---|---|
| Identitas | canonical URL, final URL, content hash, pipeline version | sama atau perbedaan dijelaskan oleh redirect |
| Bahasa | language, script, language confidence | sama untuk input yang sama |
| Penyakit | disease extracted, disease mentions, ICD-11, role | semua mention eksplisit dipertahankan; label tanpa evidence ditolak/review |
| Event | `sub_events[].disease`, location, date, metric | satu event atomik untuk satu relasi penyakit-lokasi-metrik |
| Lokasi | country, province/admin1, city/admin2, coordinates | evidence dan gazetteer confidence tersedia |
| Angka | case, new, cumulative, suspected, death, hospitalization | tidak mencampur angka historis, agregat, dan current |
| Wabah | outbreak alert, event type, relevance, epistemic status | berasal dari evidence relasional, bukan label model saja |
| Bukti | evidence, offsets, validation flags | kembali ke kalimat sumber asli |
| Review | needs_review dan alasan | ambigu tetap terlihat, tidak dipaksa menjadi processed |

## Kebijakan kualitas

1. Artikel tanpa body artikel, evidence, atau relasi angka-lokasi tidak dianggap gagal fetch saja; statusnya harus membedakan `empty_article`, `needs_review`, dan `processed`.
2. Penyakit kedua hanya dibuat sebagai event terpisah bila angka memang terikat eksplisit ke penyakit tersebut. Angka agregat yang menyebut dua penyakit tidak boleh disalin ke dua penyakit.
3. Translation tidak boleh mengganti evidence bahasa asli. NLLB boleh membantu enrichment atau review, tetapi keputusan outbreak, penyakit, lokasi, dan angka tetap source-first.
4. Timeout boleh lebih panjang, tetapi retry tetap bounded dan tidak boleh mengubah satu artikel menjadi duplikat event atau matrix row.
5. Model XLM-R membantu classification ketika checkpoint valid dan aktif. Rule, gazetteer, dan relation extraction tetap menjadi validator evidence; model tidak boleh membuat penyakit yang tidak muncul di teks.

## Status verifikasi

Berhasil:

- `py -3 -m py_compile` untuk file NLP, worker, matrix, dan test yang diubah.
- Perubahan test matrix menutup kasus dua `sub_events` penyakit berbeda.

Belum berhasil dijalankan penuh:

- `services/worker-python/tests/test_crawl_matrix_jobs.py` berhenti saat import karena environment host tidak memiliki modul `psycopg`.
- Uji integrasi Docker perlu dijalankan di container resmi setelah service/WSL tersedia stabil.

Golden test yang disarankan berikutnya adalah satu artikel multi-penyakit dengan dua lokasi dan angka berbeda, dikirim melalui tiga trigger. Lulus hanya jika `sub_events` identik, sementara bentuk row persistence boleh berbeda sesuai kontrak tabel.
