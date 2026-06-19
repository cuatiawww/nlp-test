import os

NLP_MODEL = os.getenv("NLP_MODEL", "xlm-roberta")

MODEL_MAP = {
    "xlm-roberta": "xlm-roberta-base",
    "indobert": "indolem/indobert-base-uncased",
}

DISEASE_LABELS = [
    s.strip()
    for s in os.getenv("DISEASE_LABELS", "dengue fever DBD,acute diarrhea,leptospirosis,influenza flu,COVID-19 coronavirus,malaria,tuberculosis TB,chikungunya,pneumonia,typhoid fever,no disease not health relevant").split(",")
    if s.strip()
]

SENTIMENT_LABELS = ["positive", "negative", "neutral"]

EVENT_TYPE_LABELS = [
    "flood banjir flash flood", "earthquake gempa", "landslide tanah longsor",
    "disease outbreak wabah", "fire kebakaran",
    "conflict konflik kerusuhan", "volcanic eruption gunung meletus",
    "tsunami", "extreme weather cuaca ekstrim",
    "industrial accident kecelakaan industri", "drought kekeringan",
]

RELEVANCE_LABELS = ["high relevance to health crisis", "medium relevance", "low relevance", "not relevant"]

SOURCE_CREDIBILITY_MAP = {
    "government": 0.95,
    "who": 0.95,
    "hospital": 0.90,
    "research": 0.85,
    "news": 0.70,
    "rss": 0.65,
    "web": 0.50,
    "social_media": 0.35,
    "csv": 0.60,
    "api": 0.55,
}

LOW_CONFIDENCE_THRESHOLD = float(os.getenv("LOW_CONFIDENCE_THRESHOLD", "0.5"))

LOCATION_COORDS = {
    "Kabupaten Bogor": (-6.5950, 106.8166),
    "Bandung": (-6.9175, 107.6191),
    "Kota Depok": (-6.4025, 106.7942),
    "Bekasi": (-6.2383, 106.9756),
    "Jakarta": (-6.2088, 106.8456),
}

SYMPTOM_DICT = {
    "demam tinggi": "HIGH_FEVER",
    "demam": "FEVER",
    "batuk": "COUGH",
    "pilek": "RUNNY_NOSE",
    "diare akut": "ACUTE_DIARRHEA",
    "diare": "DIARRHEA",
    "sesak": "SHORTNESS_OF_BREATH",
    "shortness of breath": "SHORTNESS_OF_BREATH",
    "fever": "FEVER",
    "cough": "COUGH",
}

DISEASE_DICT = {
    "demam berdarah": "DBD",
    "dbd": "DBD",
    "diare akut": "DIARE_AKUT",
    "leptospirosis": "LEPTOSPIROSIS",
    "influenza": "INFLUENZA",
    "covid": "COVID19",
}
