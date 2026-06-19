# Fine-Tuning Plan — XLM-RoBERTa untuk ASEAN Disease Surveillance

## 1. Masalah Saat Ini

Zero-shot XLM-RoBERTa memiliki akurasi rendah:

| Task | Akurasi Zero-shot | Target Fine-tuned |
|------|-------------------|-------------------|
| Klasifikasi penyakit | ~10-30% | >85% |
| Klasifikasi event type | ~8-15% | >80% |
| Sentimen | ~33% (flat) | >75% |
| Relevansi health crisis | ~25% | >80% |

Penyebab: label zero-shot tidak spesifik, model tidak pernah melihat data domain kesehatan Indonesia/ASEAN.

## 2. Data Collection — Tahap Paling Kritis

### 2.1. Labeled Dataset

Kumpulkan minimal **500 samples per label**:

| Label | Jumlah Target | Sumber Data |
|-------|---------------|-------------|
| DBD | 500+ | Berita DBD dari Antara, Kompas |
| DIARE_AKUT | 500+ | Berita wabah diare |
| LEPTOSPIROSIS | 300+ | Berita banjir + leptospirosis |
| INFLUENZA | 500+ | Berita flu musiman |
| COVID19 | 1000+ | Berita COVID 2020-2024 |
| BUKAN_PENYAKIT (negatif) | 1000+ | Berita non-kesehatan |
| flood / banjir | 500+ | Berita bencana banjir |
| earthquake / gempa | 300+ | |
| outbreak / wabah | 500+ | |
| fire / kebakaran | 300+ | |
| conflict / kerusuhan | 200+ | |

### 2.2. Strategi Labeling

**Option A: Manual (slow, akurat)**
```
Baca berita → tentukan disease label + event type + sentimen
Tools: LabelStudio (open source) atau spreadsheet
Estimasi: 1000 samples/hari per orang
```

**Option B: Semi-Auto (fast, perlu review)**
```
Gunakan zero-shot + LLM (ChatGPT/Gemini) untuk initial labeling
→ Review manual 20% samples
→ Iterate
```

**Option C: LLM-generated (tercepat)**
```
Prompt ChatGPT/Gemini:
  "Classify this Indonesian news into:
   - disease: [DBD/DIARE_AKUT/COVID19/...]
   - event_type: [flood/outbreak/...]
   - sentiment: [positive/negative/neutral]
   Text: {berita}"
→ Export JSON → validasi batch
```

### 2.3. Format Dataset

Simpan di `services/nlp-python/training/`:

```json
// training/dataset.jsonl
{"text": "25 warga di Jakarta terkena DBD, 3 dirawat", "disease": "DBD", "event_type": "outbreak", "sentiment": "negative", "relevance": "high"}
{"text": "Harga cabai naik di pasar tradisional", "disease": "NEGATIVE", "event_type": "other", "sentiment": "negative", "relevance": "low"}
```

## 3. Fine-Tuning Pipeline

### 3.1. Setup Environment

```bash
# Di WSL / Docker
pip install transformers datasets evaluate accelerate sentencepiece

# Clone model
git lfs install
git clone https://huggingface.co/xlm-roberta-base ./models/xlm-roberta-base
```

### 3.2. Training Script

Buat file `services/nlp-python/training/train.py`:

```python
from transformers import (
    AutoTokenizer, AutoModelForSequenceClassification,
    TrainingArguments, Trainer
)
from datasets import Dataset
import json
import torch

# Load dataset
with open("training/dataset.jsonl") as f:
    data = [json.loads(line) for line in f]

# Disease labels (sesuai config.py)
DISEASE_LABELS = ["DBD", "DIARE_AKUT", "LEPTOSPIROSIS", "INFLUENZA", 
                  "COVID19", "MALARIA", "CHIKUNGUNYA", "PNEUMONIA", "NEGATIVE"]

label2id = {l: i for i, l in enumerate(DISEASE_LABELS)}
id2label = {i: l for l, i in label2id.items()}

# Prepare dataset
dataset = Dataset.from_list([
    {"text": d["text"], "labels": label2id[d["disease"]]}
    for d in data
]).train_test_split(test_size=0.1)

# Load model
model = AutoModelForSequenceClassification.from_pretrained(
    "xlm-roberta-base",
    num_labels=len(DISEASE_LABELS),
    id2label=id2label,
    label2id=label2id,
)

tokenizer = AutoTokenizer.from_pretrained("xlm-roberta-base")

def tokenize(batch):
    return tokenizer(batch["text"], padding=True, truncation=True, max_length=256)

dataset = dataset.map(tokenize, batched=True)

# Train
training_args = TrainingArguments(
    output_dir="./models/fine-tuned",
    evaluation_strategy="epoch",
    save_strategy="epoch",
    learning_rate=2e-5,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    num_train_epochs=5,
    weight_decay=0.01,
    push_to_hub=False,
    logging_dir="./logs",
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    eval_dataset=dataset["test"],
    tokenizer=tokenizer,
)

trainer.train()
trainer.save_model("./models/fine-tuned")
```

### 3.3. Training Time Estimate

| Setup | RAM | 500 samples | 5000 samples |
|-------|-----|-------------|--------------|
| CPU (WSL2) | 8GB | ~30 menit | ~5 jam |
| GPU (CUDA) | 8GB VRAM | ~2 menit | ~15 menit |
| Google Colab (free) | 16GB TPU/GPU | ~5 menit | ~30 menit |

**Rekomendasi: Gunakan Google Colab T4 GPU untuk training.** Gratis, cukup cepat.

### 3.4. Multiple Tasks

Buat 3 model terpisah (atau 1 model multi-task):

```python
# Model 1: Klasifikasi Penyakit
model_disease = AutoModelForSequenceClassification.from_pretrained(
    "xlm-roberta-base", num_labels=len(DISEASE_LABELS)
)

# Model 2: Event Type
model_event = AutoModelForSequenceClassification.from_pretrained(
    "xlm-roberta-base", num_labels=len(EVENT_LABELS)
)

# Model 3: Relevansi
model_relevance = AutoModelForSequenceClassification.from_pretrained(
    "xlm-roberta-base", num_labels=3  # low/medium/high
)
```

## 4. Integrasi ke NLP Service

### 4.1. Model Loading

Update `app/models/classifier.py`:

```python
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification

class FineTunedClassifier:
    def __init__(self):
        self.pipe = pipeline(
            "text-classification",
            model="./models/fine-tuned",
            tokenizer="./models/fine-tuned",
            device=-1,  # CPU
        )

    def classify(self, text: str) -> tuple[str, float]:
        result = self.pipe(text, return_all_scores=False)[0]
        return result["label"], result["score"]
```

### 4.2. Fallback Strategy

```python
if os.path.exists("./models/fine-tuned"):
    classifier = FineTunedClassifier()
else:
    classifier = ZeroShotClassifier()  # existing
```

## 5. LLM Fine-Tuning (Advanced)

Untuk akurasi tertinggi, gunakan LLM kecil:

### Option A: LoRA on Llama 3.2 1B

```bash
pip install unsloth
# Colab:
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    "unsloth/Llama-3.2-1B-bnb-4bit",
    max_seq_length=512,
    dtype=None,
    load_in_4bit=True,
)

# LoRA adapters
model = FastLanguageModel.get_peft_model(
    model, r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_alpha=16,
    lora_dropout=0,
)

# Train...
```

### Option B: Ollama + Custom Modelfile

```dockerfile
FROM llama3.2:1b

PARAMETER temperature 0
PARAMETER num_ctx 2048

SYSTEM """
Klasifikasikan berita berikut ke dalam:
- disease: DBD, DIARE_AKUT, COVID19, INFLUENZA, atau TIDAK_ADA
- event: flood, outbreak, fire, atau other
- sentiment: positive, negative, neutral

Format output: JSON
"""
```

## 6. Evaluation Metrics

| Metrik | Target |
|--------|--------|
| Accuracy | >85% |
| Precision (per class) | >80% |
| Recall (per class) | >80% |
| F1 Score | >82% |
| Inference speed | <500ms per text |

## 7. Timeline

| Tahap | Aktivitas | Durasi |
|-------|-----------|--------|
| 1 | Collect + label 1000 samples | 2-3 hari |
| 2 | Training zero-shot → fine-tuned | 1 hari |
| 3 | Evaluation + iterate labels | 1 hari |
| 4 | Scale to 5000 samples | 3-5 hari |
| 5 | Multi-task training | 1 hari |
| 6 | Deploy + A/B test | 0.5 hari |

## 8. Rekomendasi Langkah Pertama

```bash
# 1. Generate initial dataset pakai ChatGPT/Gemini API
#    (dari berita RSS yang sudah di-crawl)

# 2. Upload ke Google Colab:
#    - Buka colab.research.google.com
#    - Pilih T4 GPU
#    - Install transformers + datasets
#    - Jalankan training script

# 3. Download model ke ./models/fine-tuned/

# 4. Update docker-compose mount biar model terbaca:
volumes:
  - ./services/nlp-python/models:/app/models

# 5. Restart NLP service
docker compose up -d nlp-python
```
