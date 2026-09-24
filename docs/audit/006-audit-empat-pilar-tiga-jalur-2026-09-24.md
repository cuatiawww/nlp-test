# Audit Empat Pilar Kualitas Data pada Tiga Jalur

Tanggal: 2026-09-24  
Status: audit kode read-only; tidak mengubah kode dan tidak melakukan push.

Dokumen acuan: [Audit 004](004-catatan-perjalanan-transformasi-sistem-2026-09-24.md:70)

## Kesimpulan

Keempat pilar sudah tersedia di shared core pipeline.run. Tiga jalur produksi juga sudah menggunakan kontrak NLP yang sama, yaitu /nlp/analyze/raw:

1. Crawling kontinu.
2. Analisis URL manual.
3. Crawl matrix.

Dari sisi ekstraksi NLP, ketiga jalur melewati filter kesehatan, resolver lokasi, multi-event, dan relasi metrik yang sama. Bentuk persistence akhirnya tidak sama karena setiap jalur memiliki adapter penyimpanan berbeda.

Kesamaan hasil hanya dapat diharapkan jika URL menghasilkan teks, metadata, konfigurasi model, dan registry yang sama. Ini belum merupakan pengukuran precision/recall karena belum diuji memakai golden dataset yang sama.

## Matriks implementasi

| Pilar | Crawling kontinu | URL manual | Crawl matrix | Kesimpulan |
|---|---|---|---|---|
| 1. Filter relevansi kesehatan | Ya | Ya | Ya | Shared pipeline |
| 2. Kasus dan hierarki lokasi | Ya | Ya | Ya | Gazetteer lokal |
| 3. Multi-penyakit dan multi-lokasi | Ya | Ya | Ya | sub_events[] |
| 4. Relasi penyakit-lokasi-angka | Ya | Ya | Ya | Relation extraction |

## Entry point tiga jalur

### Crawling kontinu

File: [worker.py:534](../../services/worker-python/app/worker.py:534)

~~~python
def call_nlp(...):
    url = f"{NLP_SERVICE_URL}/nlp/analyze/raw"

    payload = {
        "text": text,
        "source_type": source_type,
        "source_name": source_name,
        "published_at": published_at,
        "source_language": source_language,
        "source_country": source_country,
    }

    resp = requests.post(
        url,
        json=payload,
        timeout=NLP_REQUEST_TIMEOUT_SECONDS,
    )
~~~

Alur:

~~~text
scheduler -> collector -> RabbitMQ disease.raw -> worker.py
-> /nlp/analyze/raw -> pipeline.run
-> disease_events dan relation tables
~~~

### URL manual

File: [analysis_jobs.py:354](../../services/worker-python/app/analysis_jobs.py:354)

~~~python
def analyze_article(extracted, fallback=False):
    endpoint = os.getenv(
        "NLP_SERVICE_URL",
        "http://disease-nlp-python:8000",
    )

    response = requests.post(
        endpoint + "/nlp/analyze/raw",
        json={
            "text": text_payload,
            "source_type": "web",
            "source_name": "URL Analyzer",
            "rules_only": fallback,
            "source_url": extracted.get("url"),
        },
    )
~~~

Endpoint langsung /nlp/analyze/url juga memakai full pipeline:

File: [main.py:179](../../services/nlp-python/app/main.py:179)

~~~python
normalized = payload.model_copy(update={"interactive": False})
result = pipeline.run(normalized)
~~~

### Crawl matrix

File: [crawl_matrix_jobs.py:776](../../services/worker-python/app/crawl_matrix_jobs.py:776)

~~~python
def analyze_article(article: dict) -> dict:
    response = requests.post(
        NLP_SERVICE_URL + "/nlp/analyze/raw",
        json={
            "text": prepare_text_for_nlp(article),
            "source_type": article.get("source_type") or "news",
            "source_name": article.get("source_name"),
            "source_country": article.get("source_country") or "",
            "source_url": article.get("url"),
        },
    )

    return pipeline_analysis_to_matrix(response.json())
~~~

## Pilar 1: filter relevansi kesehatan

Implementasi:

- [pipeline.py:350](../../services/nlp-python/app/pipeline.py:350)
- [extractors.py:1603](../../services/nlp-python/app/extractors.py:1603)

~~~python
extracted = extractors.filter_diseases_to_evidence(
    extracted,
    text + " " + analysis_text,
)

has_keywords = bool(extracted or symptoms)
is_health_related = has_keywords and not non_health_topic

if non_health_topic:
    disease = "UNKNOWN"
    extracted = []
    has_keywords = False
    is_health_related = False
~~~

Model hanya dicoba jika artikel tidak dikategorikan sebagai non-health:

~~~python
if config.NLP_MODEL != "none" and not non_health_topic:
    ...
~~~

Filter topik non-kesehatan memakai sinyal surveilans:

~~~python
def is_clearly_non_health_topic(text, diseases=None):
    if not _NON_HEALTH_TOPIC.search(sample[:4000]):
        return False
    return not has_surveillance_signal(sample, diseases)
~~~

Status: aktif pada tiga jalur selama jalur tersebut menggunakan full /nlp/analyze/raw.

## Pilar 2: deteksi kasus dan hierarki lokasi

Resolver lokasi lokal:

File: [extractors.py:662](../../services/nlp-python/app/extractors.py:662)

~~~python
def resolve_location_hierarchy(location_name, country_hint=None):
    """locality -> admin2 -> admin1 -> country."""
    config.ensure_location_registry_loaded()
~~~

Hasil resolver meliputi negara, ISO3, admin1, admin2, level administrasi, koordinat, dan tanda review:

~~~python
return {
    "canonical_name": canonical,
    "country": country,
    "country_iso3": country_iso3,
    "admin1_name": admin1_name,
    "admin2_name": admin2_name,
    "admin_level": admin_level,
    "latitude": lat,
    "longitude": lon,
    "needs_review": country_conflict or not bool(country),
}
~~~

Struktur output lokasi:

File: [schemas.py:30](../../services/nlp-python/app/schemas.py:30)

~~~python
class LocationItem(BaseModel):
    name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    country: Optional[str] = None
    country_iso3: Optional[str] = None
    admin1: Optional[str] = None
    admin2: Optional[str] = None
    admin_level: Optional[int] = None
    geocode_confidence: Optional[float] = None
    geocode_needs_review: bool = False
~~~

Status: aktif pada tiga jalur. Jika lokasi tidak ditemukan di registry lokal, hasilnya dapat dibuat tetapi diberi needs_review.

## Pilar 3: multi-penyakit dan multi-lokasi

Composer multi-event:

File: [multi_event_extractor.py:746](../../services/nlp-python/app/multi_event_extractor.py:746)

~~~python
def compose_structured_events(...):
    events = extract_multi_events(
        text=text,
        primary_disease=primary_disease,
        primary_location=primary_location,
        diseases_extracted=diseases_extracted,
        locations=locations,
        case_count=case_count,
        death_count=death_count,
    )
~~~

Pipeline membentuk sub_events[]:

File: [pipeline.py:882](../../services/nlp-python/app/pipeline.py:882)

~~~python
multi_events = compose_structured_events(...)

sub_events = [
    SubEvent(
        disease=evt.get("disease", disease),
        location_name=evt.get("location_name", ""),
        country=evt.get("country"),
        case_count=evt.get("case_count", 0),
        death_count=evt.get("death_count", 0),
        evidence=evt.get("evidence", ""),
    )
    for evt in multi_events
]
~~~

Contoh:

~~~text
Dengue 361 kasus
Influenza 10 kasus
~~~

Menjadi dua event:

~~~json
{
  "sub_events": [
    {"disease": "Dengue", "case_count": 361},
    {"disease": "Influenza", "case_count": 10}
  ]
}
~~~

Tes terkait:

- [test_slice1_multi_event.py:39](../../services/nlp-python/app/tests/test_slice1_multi_event.py:39)
- [test_relation_attribution.py:31](../../services/nlp-python/app/tests/test_relation_attribution.py:31)

### Perbedaan persistence

| Jalur | Penyimpanan event |
|---|---|
| Crawling kontinu | Parent dan child disease_events dibuat jika terdapat beberapa sub_events ([worker.py:857](../../services/worker-python/app/worker.py:857)) |
| URL manual | sub_events[] tersimpan di JSON hasil job; disease_events utama masih collapsed parent ([analysis_jobs.py:946](../../services/worker-python/app/analysis_jobs.py:946)) |
| Crawl matrix | Setiap sub_event diproyeksikan menjadi crawl_matrix_row ([crawl_matrix_jobs.py:854](../../services/worker-python/app/crawl_matrix_jobs.py:854)) |

Ekstraksinya sudah sama, tetapi bentuk database belum identik.

## Pilar 4: pengikatan relasi penyakit-lokasi-angka

Extractor relasi metrik:

File: [surveillance_extraction.py:1893](../../services/nlp-python/app/surveillance_extraction.py:1893)

~~~python
def extract_metric_relations(...):
    """Extract explicit location↔metric relations from local evidence windows."""

    locations = _location_spans(source, linker)
    fallback_location = _source_scope_location(
        source,
        linker,
        source_country,
    )
~~~

Pipeline memisahkan total nasional dan breakdown regional:

File: [pipeline.py:1500](../../services/nlp-python/app/pipeline.py:1500)

~~~python
if country_sub_events and regional_sub_events:
    for c_evt in country_sub_events:
        c_evt.provenance["role"] = "aggregate_total"
        c_evt.provenance["is_aggregate"] = True

    for r_evt in regional_sub_events:
        r_evt.provenance["role"] = "regional_breakdown"
        r_evt.provenance["is_aggregate"] = False
~~~

Penyakit secondary tidak menerima angka primary secara otomatis:

File: [entity_relations.py:141](../../services/worker-python/app/entity_relations.py:141)

~~~python
is_primary = role == "primary"

rows.append({
    "disease_name": canonical,
    "role": role,
    "case_count": _as_int_or_none(nlp.get("case_count"))
        if is_primary else None,
    "death_count": _as_int_or_none(nlp.get("death_count"))
        if is_primary else None,
})
~~~

Strict relation pass dilewati hanya untuk payload interactive atau rules_only:

File: [pipeline.py:993](../../services/nlp-python/app/pipeline.py:993)

~~~python
if (payload.interactive or payload.rules_only):
    raise RuntimeError("interactive_skip_strict_surveillance")
~~~

Tiga jalur default mengirim full /nlp/analyze/raw dengan interactive=false dan rules_only=false. Strict relation pass dapat berjalan. Pengecualian terjadi jika caller secara eksplisit memakai fallback rules-only atau /nlp/analyze-bounded.

## Apakah satu URL pasti menghasilkan output sama?

### Nilai NLP dapat sama

Jika kondisi berikut sama:

~~~text
URL sama
+ teks hasil fetch sama
+ source_country sama
+ published_at sama
+ konfigurasi model sama
+ registry disease/location sama
~~~

Maka field inti seperti disease, country, case_count, death_count, sub_events, dan evidence seharusnya berasal dari pipeline yang sama.

### Nilai atau hasil akhir dapat berbeda

1. RSS, web scraper, manual extractor, dan matrix extractor dapat menghasilkan body artikel berbeda.
2. Panjang dan cara penyusunan input NLP dapat berbeda.
3. Metadata sumber dapat mempengaruhi atribusi negara dan waktu.
4. Crawl matrix dapat membuang hasil setelah NLP karena filter penyakit, negara, provinsi, atau tanggal.
5. Persistence setiap jalur berbeda.
6. /nlp/analyze-bounded mematikan model dan memotong teks sekitar 6.000 karakter; endpoint ini bukan default jalur full.

## Jalur legacy yang perlu diawasi

File [collector-python/app/crawl_jobs.py:196](../../services/collector-python/app/crawl_jobs.py:196) masih memanggil:

~~~python
config.NLP_SERVICE_URL.rstrip("/") + "/nlp/analyze/surveillance"
~~~

Endpoint tersebut tetap memanggil pipeline.run, tetapi hasilnya sudah diproyeksikan ke SurveillanceOutput, bukan raw AnalyzeResponse:

~~~python
return surveillance_from_analysis(pipeline.run(payload))
~~~

File: [main.py:151](../../services/nlp-python/app/main.py:151)

Kode ini diberi label legacy dan dokumentasi internal menyebut production memakai app.crawl_matrix_jobs. Jalur ini tidak boleh dianggap sebagai kontrak output yang identik dengan tiga jalur utama.

## Kesimpulan teknis

| Area | Status |
|---|---|
| Shared NLP core | Satu: pipeline.run |
| Pilar 1 | Sudah aktif pada tiga jalur full |
| Pilar 2 | Sudah aktif pada tiga jalur full |
| Pilar 3 | Sudah aktif melalui sub_events[] |
| Pilar 4 | Sudah aktif melalui metric/relation extraction |
| Response NLP | Dapat sama jika input dan konfigurasi sama |
| Database akhir | Tidak sama karena adapter berbeda |
| Akurasi statistik | Belum dapat diklaim tanpa golden dataset |

Golden test berikutnya: satu artikel yang sama berisi dua penyakit, dua lokasi, dan angka berbeda. Kirim melalui tiga trigger lalu bandingkan sub_events[], disease, lokasi, angka, evidence, dan needs_review. Persistence boleh berbeda bentuk, tetapi relasi inti harus sama.

