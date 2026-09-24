# Audit Checkpoint XLM-R Runtime dan Task Model

**Tanggal:** 2026-09-25 WIB  
**Ruang lingkup:** pemeriksaan read-only checkpoint, konfigurasi model, tokenizer, kode inference, dan checkpoint lain di project.  
**Perubahan:** tidak ada kode, konfigurasi, model, database, atau pipeline yang diubah.

## A. Model runtime sebenarnya

Container runtime yang diperiksa:

```text
disease-nlp-python
NLP_MODEL=fine-tuned
```

Pemetaan model di `services/nlp-python/app/config.py`:

```python
MODEL_MAP = {
    "xlm-roberta": "xlm-roberta-base",
    "indobert": "indolem/indobert-base-uncased",
    "fine-tuned": "/app/models/fine-tuned",
}
```

Docker me-mount:

```text
services/nlp-python/models -> /app/models
```

Checkpoint runtime:

```text
/app/models/fine-tuned
services/nlp-python/models/fine-tuned
```

## B. File checkpoint yang tersedia

| File | Ukuran | Status |
|---|---:|---|
| `config.json` | 1,924 bytes | tersedia |
| `model.safetensors` | 1,112,269,604 bytes | tersedia |
| `tokenizer.json` | 17,082,832 bytes | tersedia |
| `tokenizer_config.json` | 1,178 bytes | tersedia |
| `sentencepiece.bpe.model` | 5,069,051 bytes | tersedia |
| `special_tokens_map.json` | 280 bytes | tersedia |
| `pytorch_model.bin` | - | tidak ditemukan |

## C. Bukti dari `config.json`

Path:

```text
services/nlp-python/models/fine-tuned/config.json
```

Field penting:

```json
{
  "architectures": [
    "XLMRobertaForSequenceClassification"
  ],
  "model_type": "xlm-roberta",
  "id2label": { "...": "..." },
  "label2id": { "...": "..." }
}
```

`config.json` tidak memiliki field literal `"num_labels"`. Namun `id2label` memiliki 23 entri dan inference langsung menghasilkan tensor logits berukuran `[1, 23]`. Dengan demikian jumlah label efektif model adalah **23**.

Task yang dapat dibuktikan dari checkpoint:

```text
sequence classification
```

Bukan:

```text
token classification
NER
span extraction
relation extraction
sequence-to-sequence
```

## D. Daftar label lengkap

| ID | Label |
|---:|---|
| 0 | Acute diarrhea |
| 1 | COVID-19 |
| 2 | Chikungunya |
| 3 | Cholera |
| 4 | Cyclosporiasis |
| 5 | Dengue |
| 6 | Diarrhoea |
| 7 | Ebola disease, virus unspecified |
| 8 | Hand, foot and mouth disease |
| 9 | Influenza |
| 10 | Leptospirosis |
| 11 | Malaria |
| 12 | Measles |
| 13 | NEGATIVE - not health related |
| 14 | Nipah virus disease |
| 15 | Other specified lung infections |
| 16 | Pneumonia |
| 17 | RARE_DISEASE_REVIEW |
| 18 | Rabies |
| 19 | Rubella |
| 20 | Tetanus |
| 21 | hantavirus |
| 22 | typhoid fever |

`label2id` merupakan mapping terbalik dari tabel tersebut. Contoh:

```json
"Dengue": 5,
"COVID-19": 1,
"NEGATIVE - not health related": 13
```

## E. Kode inference XLM-R

Path:

```text
services/nlp-python/app/models/classifier.py
```

Untuk checkpoint `fine-tuned`, kode membuat Hugging Face pipeline `text-classification`:

```python
_pipes[model_key] = pipeline(
    "text-classification",
    model=resolved_model_id,
    tokenizer=resolved_model_id,
    device=-1,
    truncation=True,
    max_length=max_length,
)
```

Inference kemudian mengambil satu hasil:

```python
if key == "fine-tuned":
    result = pipe(text)[0]
    return result["label"], result["score"]
```

Output model berbentuk:

```python
{
    "label": "Dengue",
    "score": 0.99
}
```

Tidak ada output token, offset, BIO tag, lokasi, tanggal, angka kasus, atau angka kematian.

## F. Input yang dikirim ke XLM-R

Di `services/nlp-python/app/pipeline.py`, input classifier dibatasi sebagai berikut:

```python
if translated_text:
    clf_sample = f"{text[:600]}\n{translated_text[:600]}"
else:
    clf_sample = (text or "")[:1200]
```

Kemudian input tersebut diberikan ke `classify_disease(clf_sample)` hanya jika extractor sebelumnya belum menemukan disease:

```python
if extracted:
    disease = extracted[0]
    confidence = 0.85
else:
    disease, confidence = classify_disease(clf_sample)
```

Artinya, pada artikel yang sudah memiliki bukti disease dari keyword, alias, atau disease master, hasil akhir disease berasal dari extractor, bukan dari XLM-R.

## G. Contoh konkret inference

Input:

```text
The Ministry of Health reported 12 dengue cases in Bangkok on 24 September 2026, with 1 death.
```

Tokenizer yang digunakan:

```text
XLMRobertaTokenizer
```

Model yang dimuat:

```text
XLMRobertaForSequenceClassification
```

Token hasil tokenizer antara lain:

```text
<s> ▁The ▁Ministry ▁of ▁Health ▁reported ▁12 ▁den gue
▁cases ▁in ▁Bangkok ▁on ▁24 ▁September ▁20 26 ,
▁with ▁1 ▁death . </s>
```

Ukuran input:

```text
[1, 23]
```

Logits yang dihasilkan:

```text
[
 -0.870186,  0.163088, -0.222396,  0.642315,
 -1.469135,  8.822311, -0.653387,  0.186197,
 -0.203348, -0.467390, -1.137075, -1.040659,
  0.539536,  1.316161, -0.849143, -0.310445,
 -0.632734, -0.768683, -0.266007, -0.684153,
 -0.995554, -0.943155,  0.087671
]
```

Hasil:

```text
argmax index: 5
label: Dengue
probabilitas softmax: sekitar 0.997
```

Namun pada pipeline normal, teks tersebut kemungkinan sudah terdeteksi sebagai `Dengue` oleh extractor. Dalam kondisi itu pipeline menetapkan:

```text
disease = hasil extractor
confidence = 0.85
```

Jadi hasil classifier langsung dan hasil akhir pipeline tidak selalu berasal dari tahap yang sama.

## H. Apa yang XLM-R lakukan sekarang

XLM-R fine-tuned saat ini melakukan:

```text
artikel/teks -> satu label disease/article classification -> score
```

Contoh keluaran:

```text
artikel -> Dengue
artikel -> Ebola disease, virus unspecified
artikel -> NEGATIVE - not health related
```

Untuk `NLP_MODEL=fine-tuned`, auxiliary classifier tidak dijalankan karena `skip_aux_models` aktif. Relevance dan event type kemudian diisi melalui rules/pipeline lain.

## I. Apa yang tidak dilakukan XLM-R

| Field | Dilakukan XLM-R? | Komponen aktual |
|---|---|---|
| Disease class | Ya, satu class | classifier atau extractor |
| Disease entity/span | Tidak | keyword, alias, disease master, rules |
| Location | Tidak | gazetteer dan location resolver |
| Date | Tidak | date/period extractor |
| Cases | Tidak | case-count extractor |
| Deaths | Tidak | death-count extractor |
| Disease-location relation | Tidak | surveillance relation logic |
| Multi-event | Tidak | `multi_event_extractor.py` |

Bukti pipeline:

```python
# pipeline.py
location = facts.get("location") or extractors.extract_location(...)
all_locations = facts.get("locations") or extractors.extract_all_locations(...)

source_extracted_cases = extractors.extract_case_count(...)
source_extracted_deaths = extractors.extract_death_count(...)

period = extract_event_period(...)
event_date = period.get("event_date") or extract_event_date(text)
```

Dengan demikian, Disease, Location, Date, Cases, dan Deaths bukan lima output dari XLM-R. Field tersebut dibentuk oleh beberapa extractor dan rule terpisah.

## J. Perbandingan label model dan label database

Log runtime menunjukkan label database:

```text
disease labels from DB: 75
```

Checkpoint XLM-R memiliki:

```text
labels in checkpoint: 23
```

Kode memanggil `get_labels("disease")`, tetapi pada cabang `fine-tuned` daftar label tersebut tidak diberikan sebagai kandidat ke model. Model membaca mapping tetap dari `config.json`.

Kesimpulannya, database memiliki registry disease yang lebih besar, tetapi checkpoint fine-tuned belum memiliki head 75 kelas.

## K. Pemeriksaan model NER atau token-classification lain

Pencarian project tidak menemukan:

```text
AutoModelForTokenClassification
XLMRobertaForTokenClassification
token-classification pipeline
NER checkpoint Hugging Face
```

Model/cache lain yang tersedia:

| Cache | Arsitektur | Fungsi |
|---|---|---|
| `models--xlm-roberta-base` | `XLMRobertaForMaskedLM` | base masked language model |
| `models--indolem--indobert-base-uncased` | `BertForMaskedLM` | base masked language model |
| `models--facebook--nllb-200-distilled-600M` | `M2M100ForConditionalGeneration` | translation |

Tidak satu pun dari cache tersebut merupakan token-classification/NER checkpoint.

Terdapat kode opsional spaCy di `services/nlp-python/app/surveillance_extraction.py`, tetapi environment runtime tidak mengaktifkan `SURVEILLANCE_SPACY_MODEL`. Kode tersebut juga hanya berkontribusi terhadap kandidat lokasi, bukan disease, date, cases, atau deaths.

## Kesimpulan

Checkpoint runtime yang benar-benar digunakan adalah:

```text
XLMRobertaForSequenceClassification
23-class disease/article classifier
```

Model ini tidak melakukan ekstraksi terstruktur:

```text
Disease + Location + Date + Cases + Deaths
```

Ekstraksi terstruktur tersebut saat ini berasal dari rules, keyword/alias, disease master, gazetteer, metric extractor, date extractor, dan surveillance pipeline.

Secara teknis model ini cocok untuk klasifikasi satu artikel ke salah satu dari 23 label checkpoint, tetapi tidak cocok dianggap sebagai extractor NER atau extractor epidemiologi lengkap.
