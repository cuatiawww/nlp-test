# ASEAN 22 URL terminal test

Tanggal uji: 19 September 2026, Asia/Jakarta
Stack: Docker lokal, frontend proxy `http://localhost:3010/nlp`, async `analyze-url`, Full NLP worker
Perintah:

```bash
python3 scripts/asean_22_terminal_test.py \
  --json-out /tmp/asean22-results.json \
  --poll-timeout 240
```

Runner melakukan login session lokal, memaksa fetch baru, menunggu job sampai `completed`, `partial`, atau `failed`, dan tidak memakai dummy data maupun rules-only fallback.

## Ringkasan

| Hasil | Jumlah |
|---|---:|
| URL diuji | 22 |
| HTTP fetch 200 | 22 |
| Full NLP completed | 14 |
| Partial atau weak | 7 |
| Failed | 1 |
| Full NLP rate | 63.6% |
| Negara | 11, masing-masing 2 URL |

Status `FULL` berarti job selesai dengan Full NLP. Status `WEAK` di bawah ini adalah `partial`, bukan keberhasilan penuh. `sub_events` adalah jumlah child fact/event yang dikembalikan hasil URL tersebut.

## Matriks hasil aktual

`Pub/Event` adalah tanggal publikasi dan tanggal event yang dikembalikan pipeline. Tanda `-` berarti field tidak ada, bukan angka nol yang dibuat oleh laporan.

| ID | Negara | Bahasa/aksara yang ditargetkan | Deteksi aktual | NLP | Disease | Location aktual | Cases | Deaths | Pub/Event | Translation | sub-events | Review |
|---|---|---|---|---|---|---|---:|---:|---|---|---:|---|
| BRN-01 | Brunei | Malay / Latin | `id` / Latin | WEAK / partial | Cholera | Brunei / Bali / Jembrana | 5 | 0 | 2026-01-12 / 2026-01-12 | unavailable | 1 | true |
| BRN-02 | Brunei | English / Latin | `en` / Latin | FULL | Nipah virus disease | Brunei | 0 | 0 | 2026-01-29 / - | none | 1 | false |
| KHM-01 | Cambodia | Khmer / Khmer | `en` / Latin | FULL | UNKNOWN | Cambodia / Phnom Penh | 0 | 0 | 2026-01-25 / - | none | 0 | true |
| KHM-02 | Cambodia | English / Latin | `en` / Latin | FULL | Avian influenza | Cambodia | 27 | 12 | 2025-07-05 / 2025-07-01 | none | 1 | true |
| IDN-01 | Indonesia | Indonesian / Latin | `id` / Latin | WEAK / partial | Measles | Indonesia | 8,372 | 6 | 2026-03-07 / 2026-02-22 | unavailable | 1 | true |
| IDN-02 | Indonesia | English / Latin | `id` / Latin | WEAK / partial | Measles | Indonesia | 8,224 | 69 | 2026-02-26 / 2026-02-15 | unavailable | 1 | true |
| LAO-01 | Laos | Lao / Lao | `lo` / Lao | WEAK / partial | Dengue | Laos | 1 | 0 | 2021-01-07 / 2021-01-06 | unavailable | 1 | true |
| LAO-02 | Laos | English / Latin | `lo` / Lao | WEAK / partial | Dengue | Laos | 214 | 0 | 2026-06-30 / - | unavailable | 1 | true |
| MYS-01 | Malaysia | Malay / Latin | `id` / Latin | WEAK / partial | UNKNOWN | Malaysia / Johor Bahru | 5 | 0 | 2026-09-09 / 2026-09-09 | unavailable | 0 | true |
| MYS-02 | Malaysia | English / Latin | `en` / Latin | FULL | Dengue | Malaysia / Johor Bahru | 65,979 | 62 | 2026-09-09 / 2026-08-30 | none | 1 | false |
| MMR-01 | Myanmar | Burmese / Myanmar | `my` / Myanmar | FULL | UNKNOWN | Myanmar | 0 | 0 | 2026-03-25 / - | nllb-local | 0 | true |
| MMR-02 | Myanmar | English / Latin | `en` / Latin | FULL | Cholera | Myanmar | 0 | 0 | 2026-02-03 / - | none | 1 | true |
| PHL-01 | Philippines | Filipino / Latin | `fr` / Latin | FULL | UNKNOWN | - | 0 | 0 | 2026-02-07 / - | none | 0 | true |
| PHL-02 | Philippines | English / Latin | - | FAILED | - | - | - | - | - / - | - | 0 | - |
| SGP-01 | Singapore | English / Latin | `en` / Latin | FULL | Measles | Singapore | 50 | 0 | 2026-07-30 / 2025-12-31 | none | 1 | true |
| SGP-02 | Singapore | English / Latin | `en` / Latin | FULL | Mpox | Singapore | 2 | 0 | 2026-04-02 / 2026-04-02 | none | 1 | false |
| THA-01 | Thailand | Thai / Thai | `th` / Thai | FULL | COVID-19 | Thailand | 99,691 | 15 | 2026-09-01 / 2026-08-31 | nllb-local-cache | 1 | true |
| THA-02 | Thailand | English / Latin | `en` / Latin | FULL | Dengue | Thailand | 19,000 | 17 | 2023-06-13 / 2023-06-13 | none | 1 | true |
| VNM-01 | Vietnam | Vietnamese / Latin | `vi` / Latin | WEAK / partial | Dengue | Vietnam / Hanoi | 146 | 0 | 2026-07-27 / - | unavailable | 1 | true |
| VNM-02 | Vietnam | English / Latin | `en` / Latin | FULL | Dengue | Vietnam / Hanoi | 11 | 0 | 2026-08-20 / - | none | 1 | false |
| TLS-01 | Timor-Leste | Portuguese / Latin | `pt` / Latin | FULL | Dengue | Timor-Leste | 0 | 0 | 2026-09-16 / - | unavailable | 1 | true |
| TLS-02 | Timor-Leste | English / Latin | `en` / Latin | FULL | Dengue; COVID-19 | Timor-Leste | 288 | 20 | 2022-12-01 / 2022-01-15 | none | 1 | false |

## URL yang diuji

### Brunei

1. [BRN-01, Malay, MOH Brunei: Nasihat Kesihatan Semasa Banjir](https://moh.gov.bn/news/nasihat-kesihatan-semasa-banjir/)
2. [BRN-02, English, No Nipah Virus Cases Detected in Brunei Darussalam](https://www.bruneitribune.com/no-nipah-virus-cases-detected-in-brunei-darussalam/)

### Cambodia

3. [KHM-01, Khmer content, Ministry of Health notice](https://moh.gov.kh/en/notice/detail/400)
4. [KHM-02, English, WHO Cambodia H5N1 DON](https://www.who.int/emergencies/disease-outbreak-news/item/2025-DON575)

### Indonesia

5. [IDN-01, Indonesian, Kemenkes campak menjelang libur Lebaran](https://www.kemkes.go.id/id/waspada-campak-jelang-libur-lebaran-kemenkes-percepat-imunisasi-anak-di-wilayah-risiko)
6. [IDN-02, English route, Kemenkes campak nasional dan global](https://www.kemkes.go.id/eng/kemenkes-waspadai-dinamika-campak-nasional-dan-global)

### Laos

7. [LAO-01, Lao, KPL article](https://kpl.gov.la/detail.aspx?id=57118)
8. [LAO-02, English route, KPL article](https://kpl.gov.la/EN/detail.aspx?id=101848)

### Malaysia

9. [MYS-01, Malay, Bernama](https://www.bernama.com/bm/news.php?id=2605025)
10. [MYS-02, English, Bernama](https://www.bernama.com/en/news.php?id=2605035)

### Myanmar

11. [MMR-01, Burmese, Ministry of Information](https://www.moi.gov.mm/news/81121)
12. [MMR-02, English, WHO Myanmar Health Emergency Appeal](https://www.who.int/publications/m/item/myanmar--who-health-emergency-appeal-2026)

### Philippines

13. [PHL-01, Filipino, Balita dengue](https://balita.mb.com.ph/2026/02/07/kaso-ng-dengue-sa-pagpasok-ng-2026-naitalang-nasa-higit-7k/)
14. [PHL-02, English, GMA dengue](https://www.gmanetwork.com/news/topstories/nation/1001460/doh-logs-over-15k-dengue-cases-from-aug-2-to-15-higher-than-previous-period/story/)

### Singapore

15. [SGP-01, English, Singapore MOH measles](https://www.moh.gov.sg/newsroom/update-on-measles-situation-and-vaccination-coverage/)
16. [SGP-02, English, CNA mpox](https://www.channelnewsasia.com/singapore/mpox-clade-1b-infection-cases-communicable-diseases-agency-6033226)

### Thailand

17. [THA-01, Thai, DDC COVID-19](https://www.ddc.moph.go.th/brc/news.php?deptcode=brc&news=59964)
18. [THA-02, English, Bangkok Post dengue](https://www.bangkokpost.com/thailand/general/2590549/dengue-cases-this-year-pass-19-000)

### Vietnam

19. [VNM-01, Vietnamese, VietnamPlus dengue Hanoi](https://www.vietnamplus.vn/dich-sot-xuat-huyet-tai-ha-noi-co-xu-huong-gia-tang-post1126592.amp)
20. [VNM-02, English, VietnamPlus dengue Hanoi](https://en.vietnamplus.vn/hanoi-steps-up-dengue-prevention-as-cases-rise-post350367.vnp)

### Timor-Leste

21. [TLS-01, Portuguese, Government of Timor-Leste dengue prevention](https://timor-leste.gov.tl/?lang=pt&p=47040)
22. [TLS-02, English, ReliefWeb dengue response report](https://reliefweb.int/report/timor-leste/timor-leste-dengue-outbreak-response-final-report-dref-ndeg-mdrtp005)

## Temuan penting dari hasil mentah

### 1. Angka dapat terbaca, tetapi atribusi konteks masih belum konsisten

- THA-01 berhasil mempertahankan `99,691` kasus dan `15` kematian dari aksara Thai. Ini bukti parser angka dan relasi metric dasar bekerja pada teks asli.
- IDN-01 mempertahankan tiga angka yang berbeda, tetapi output utama memilih `8,372` cases sementara evidence asli juga memuat `10,453 suspected cases`. Status `suspected` dan `review=true` sudah benar untuk mencegah angka tampil sebagai fakta tunggal tanpa konteks.
- IDN-02 menggabungkan data 2025 dan 2026: `8,224` cases dan `69` deaths muncul di output, walaupun `69` kematian adalah data 2025. Ini masih menjadi bug temporal/context attribution.
- VNM-02 mengembalikan `11` cases, padahal evidence utama menyebut `316 dengue cases`; angka `11` berasal dari “11 new outbreaks”. Ini adalah false metric-label association.
- MYS-01 hanya menghasilkan `5` cases dan `0` deaths dari artikel Malay yang menyebut `65,979` cases dan `62` deaths. Pasangan English MYS-02 pada berita yang sama menangkap angka dengan benar. Ini menunjukkan perbedaan preprocessing/translation dan bukan kekurangan data sumber.

### 2. Location intelligence masih bisa memaksakan lokasi yang salah

- BRN-01 menghasilkan `Brunei / Bali / Jembrana` dengan geocode confidence `0.0` dan `geocode_needs_review=true`. Lokasi Bali/Jembrana tidak kompatibel dengan country Brunei dan harus ditolak dari event attribution, bukan disimpan sebagai hierarchy utama.
- MYS-01 dan MYS-02 sama-sama memberi `Johor Bahru`, walaupun artikel Bernama yang diuji adalah laporan nasional Malaysia. Lokasi publisher atau byline tidak boleh otomatis menjadi lokasi event nasional.
- SGP-02 mempertahankan event Singapore, tetapi child fact memuat country lain dari konteks sumber. Relasi location-disease harus tetap terikat pada sentence/evidence yang menyebut kasus Singapore.

### 3. Native-script detection dan translation

- Thai THA-01: `th` / Thai terdeteksi benar; translation memakai `nllb-local-cache`; original evidence tetap menjadi offset space.
- Burmese MMR-01: `my` / Myanmar terdeteksi benar; translation memakai `nllb-local`, tetapi disease tetap `UNKNOWN` karena artikel yang dipilih berupa kegiatan Hari TB dan tidak menyatakan jumlah kasus surveillance yang koheren.
- Lao LAO-01 dan LAO-02: `lo` / Lao terdeteksi benar, tetapi kedua job `partial` karena translation tidak selesai dalam 20 detik. LAO-02 menggunakan URL English tetapi konten yang diambil tetap Lao, sehingga route `/EN/` tidak boleh dipercaya sebagai bahasa artikel.
- Khmer KHM-01: page yang diharapkan berisi Khmer dikembalikan sebagai halaman `Official Documents`, terdeteksi `en` / Latin dan disease `UNKNOWN`. Ini perlu dicatat sebagai masalah content extraction atau URL target, bukan dipoles menjadi keberhasilan Khmer.
- Malay MYS-01 terdeteksi `id`, yang secara script memang sama-sama Latin tetapi secara language perlu dibedakan dari Indonesian. Model language detector saat ini belum cukup stabil untuk pasangan Malay/Indonesian.
- PHL-01 mengembalikan judul `Just a moment...`, bahasa `fr`, dan tidak ada lokasi. Ini adalah Cloudflare challenge yang lolos sebagai HTML, bukan artikel Filipino yang berhasil dipahami.

### 4. Status Full NLP dan reliability

- Full NLP rate aktual adalah `14/22 = 63.6%`, di bawah gate 80% pada harness.
- Tujuh partial memiliki warning `Translation unavailable within 20s; original text used`. Pipeline tidak menghapus original text, tetapi URL dianggap weak karena semantic translation tidak selesai.
- PHL-02 mengembalikan `Analysis storage failed; please retry`. Ini bukan bukti artikel tidak dapat dipahami; ini kegagalan persistence/job dan perlu dilacak terpisah dari fetch, extraction, atau NLP.
- Tidak ada dummy data yang ditambahkan oleh runner. Nilai `0` hanya dicatat ketika response aplikasi memang mengembalikannya; nilai hilang tetap `-`.

## Kesimpulan pengujian

Pipeline sudah mampu menjalankan native-script Thai, Lao, Khmer, dan Burmese sampai tahap fetch, language/script, disease, country, metric, dan tanggal pada sebagian kasus. Namun, kualitas surveillance belum cukup dinilai dari `FULL` saja.

Prioritas perbaikan berdasarkan 22 hasil ini:

1. Tolak atau tandai konflik `country` dan hierarchy sebelum geocode/event persistence, terutama BRN-01.
2. Perbaiki relation attribution agar `cases`, `deaths`, outbreaks, suspected, confirmed, historical, dan comparator tetap memiliki evidence sentence masing-masing.
3. Tambahkan language disambiguation Malay versus Indonesian tanpa mengubah original text.
4. Perlakukan challenge page, empty article shell, dan storage failure sebagai status fetch/persistence yang berbeda, bukan artikel `UNKNOWN` biasa.
5. Naikkan translation budget atau lakukan language-specific preprocessing untuk Lao, Malay, Indonesian, dan Vietnamese sebelum semantic translation. Translation tetap bersifat tambahan; evidence dan angka asli harus tetap diambil dari original text.
6. Uji ulang pasangan native/local dan English dari sumber yang sama setelah perbaikan agar perbedaan MYS-01/MYS-02 dan LAO-01/LAO-02 dapat diukur.

## Batasan

- Set ini adalah smoke/regression sample 2 URL per negara, bukan gold-standard accuracy benchmark.
- Beberapa artikel adalah laporan historis atau artikel kebijakan, sehingga angka nol atau `UNKNOWN` dapat benar secara epistemik dan tidak otomatis berarti extractor gagal.
- Laporan ini tidak mengklaim sistem sempurna dan tidak melakukan koreksi manual terhadap response aplikasi.
- Tidak ada perubahan yang dipush ke Gitea pada pengujian ini.
