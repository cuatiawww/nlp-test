#!/usr/bin/env python3
"""Generate synthetic training samples for fine-tuning."""

import json
import os
import random

# ─── Configuration ────────────────────────────────
OUTPUT_DIR = "training"
SAMPLES_PER_LABEL = 80
NEGATIVE_SAMPLES = 100

LOCATIONS = [
    "Jakarta", "Bandung", "Bogor", "Depok", "Bekasi", "Surabaya", "Medan",
    "Semarang", "Yogyakarta", "Makassar", "Palembang", "Tangerang",
    "Manila", "Bangkok", "Kuala Lumpur", "Singapore", "Hanoi",
    "Phnom Penh", "Vientiane", "Yangon", "Bandar Seri Begawan",
]

DISEASE_TEMPLATES = {
    "dengue fever DBD": [
        "Di {loc} terdapat {n} warga terkena DBD setelah banjir.",
        "Kasus demam berdarah meningkat di {loc}, {n} pasien dirawat.",
        "Wabah DBD melanda {loc}, {n} warga positif dengue.",
        "{n} warga {loc} dirawat karena demam berdarah dengue.",
        "DBD merebak di {loc}, total kasus mencapai {n} orang.",
        "Peningkatan kasus DBD di {loc} sebanyak {n} orang dalam sepekan.",
        "{n} pasien DBD dirawat di RSUD {loc}.",
        "Demam berdarah masih mengancam warga {loc}, {n} kasus baru.",
        "Lonjakan DBD di {loc}, {n} warga terinfeksi virus dengue.",
        "Kewaspadaan DBD di {loc} ditingkatkan, {n} kasus tercatat.",
    ],
    "acute diarrhea": [
        "Di {loc} terdapat {n} warga mengalami diare akut.",
        "Wabah diare melanda {loc}, {n} warga dirawat.",
        "Peningkatan kasus diare di {loc} mencapai {n} orang.",
        "Air bersih langka di {loc}, {n} warga terkena diare.",
        "KLB diare terjadi di {loc}, {n} orang terinfeksi.",
        "{n} warga {loc} mengalami diare akut setelah banjir.",
        "Sanitasi buruk sebabkan {n} kasus diare di {loc}.",
        "Diare akut melanda pemukiman padat di {loc}, {n} orang sakit.",
        "Krisis air bersih di {loc} sebabkan {n} warga diare.",
        "Puskesmas {loc} tangani {n} pasien diare akut.",
    ],
    "leptospirosis": [
        "Banjir di {loc} sebabkan {n} warga terkena leptospirosis.",
        "Leptospirosis muncul di {loc}, {n} warga terinfeksi.",
        "{n} warga {loc} positif leptospirosis setelah banjir.",
        "Wabah leptospirosis di {loc}, sebanyak {n} kasus dilaporkan.",
        "Airbanjir terkontaminasi urine tikus di {loc} sebabkan {n} kasus leptospirosis.",
        "Kewaspadaan leptospirosis di {loc}, {n} warga dirawat.",
        "{n} warga {loc} menderita leptospirosis akibat banjir.",
        "Leptospirosis mewabah di {loc} pasca banjir, {n} kasus.",
        "Dinkes {loc} laporkan {n} kasus leptospirosis.",
        "Genangan air di {loc} sebabkan {n} warga terkena leptospirosis.",
    ],
    "influenza flu": [
        "Flu musiman melanda {loc}, {n} warga terserang influenza.",
        "Peningkatan kasus influenza di {loc} mencapai {n} orang.",
        "{n} warga {loc} terkena flu burung.",
        "Wabah influenza di {loc}, {n} kasus dilaporkan.",
        "Flu musiman meningkat di {loc}, {n} orang dirawat.",
        "Kasus influenza di {loc} sebanyak {n} orang dalam sebulan.",
        "Penyebaran flu di {loc} meluas, {n} warga terinfeksi.",
        "Kewaspadaan flu musiman di {loc}, {n} kasus tercatat.",
        "IMT {loc} catat {n} kasus influenza.",
        "Flu burung H5N1 muncul di {loc}, {n} warga terinfeksi.",
    ],
    "COVID-19 coronavirus": [
        "Kasus COVID-19 di {loc} meningkat {n} kasus.",
        "Varian baru COVID-19 terdeteksi di {loc}, sebanyak {n} kasus.",
        "{n} warga {loc} positif COVID-19 varian Omicron.",
        "Peningkatan kasus COVID-19 di {loc} capai {n} orang.",
        "COVID-19 subvarian JN.1 menyebar di {loc}, {n} kasus.",
        "Kewaspadaan COVID-19 di {loc} diperketat, {n} kasus baru.",
        "{n} warga {loc} diisolasi karena positif COVID-19.",
        "Lonjakan kasus COVID-19 di {loc}, {n} orang terinfeksi.",
        "Vaksinasi COVID-19 di {loc} capai {n}% target.",
        "Pandemi COVID-19 di {loc} masih terkendali, {n} kasus aktif.",
    ],
    "malaria": [
        "Kasus malaria meningkat di {loc}, {n} warga terinfeksi.",
        "{n} warga {loc} terkena malaria setelah musim hujan.",
        "Malaria masih endemis di {loc}, {n} kasus tercatat.",
        "Peningkatan kasus malaria di {loc} sebanyak {n} orang.",
        "Nyamuk anopheles penyebab malaria di {loc}, {n} kasus.",
        "Daerah endemis malaria di {loc} capai {n} kasus.",
        "Program eliminasi malaria di {loc}, {n} kasus tersisa.",
        "{n} warga {loc} positif malaria plasmodium falciparum.",
        "Malaria tersebar di {loc}, sebanyak {n} orang terinfeksi.",
        "Dinkes {loc} catat {n} kasus malaria pada tahun ini.",
    ],
    "tuberculosis TB": [
        "Kasus TBC di {loc} meningkat, {n} warga terinfeksi.",
        "Tuberkulosis masih jadi masalah di {loc}, {n} kasus.",
        "{n} warga {loc} positif TBC paru.",
        "Peningkatan kasus TBC di {loc} capai {n} orang.",
        "TBC resisten obat ditemukan di {loc} pada {n} pasien.",
        "Program penanggulangan TBC di {loc} temukan {n} kasus.",
        "Tuberkulosis menyebar di {loc}, {n} warga diobati.",
        "Kasus TBC di {loc} meningkat pasca pandemi, {n} orang.",
        "Skrining TBC di {loc} temukan {n} kasus baru.",
        "Pengobatan TBC di {loc} capai {n}% keberhasilan.",
    ],
    "chikungunya": [
        "Wabah chikungunya melanda {loc}, {n} warga terkena.",
        "Chikungunya muncul di {loc}, {n} warga mengalami demam sendi.",
        "{n} warga {loc} terkena chikungunya setelah musim hujan.",
        "Kasus chikungunya di {loc} capai {n} orang.",
        "Demam chikungunya menyebar di {loc}, {n} kasus.",
        "{n} warga {loc} menderita chikungunya dengan gejala nyeri sendi.",
        "Nyamuk aedes penyebab chikungunya di {loc}, {n} kasus.",
        "Chikungunya mewabah di {loc}, sebanyak {n} orang terinfeksi.",
        "Kasus chikungunya meningkat di {loc} sebanyak {n} orang.",
        "Dinkes {loc} tangani {n} kasus chikungunya.",
    ],
    "pneumonia": [
        "Kasus pneumonia meningkat di {loc}, {n} warga dirawat.",
        "Pneumonia melanda anak-anak di {loc}, {n} kasus.",
        "{n} warga {loc} terkena pneumonia akibat cuaca ekstrem.",
        "Infeksi paru-paru pneumonia di {loc} capai {n} kasus.",
        "Pneumonia komunitas di {loc} sebanyak {n} orang.",
        "Wabah pneumonia di {loc}, {n} warga dirawat intensif.",
        "Kasus pneumonia pada balita di {loc} capai {n}.",
        "Pneumonia akibat bakteri mycoplasma di {loc}, {n} kasus.",
        "Peningkatan kasus pneumonia di {loc} sebanyak {n} orang.",
        "RS {loc} tangani {n} pasien pneumonia.",
    ],
    "typhoid fever": [
        "Demam tifoid melanda {loc}, {n} warga terkena tifus.",
        "Kasus tifus meningkat di {loc}, {n} warga dirawat.",
        "{n} warga {loc} terkena demam tifoid akibat makanan terkontaminasi.",
        "Tifus menyebar di {loc}, sebanyak {n} kasus dilaporkan.",
        "Wabah demam tifoid di {loc} capai {n} orang.",
        "Kebersihan makanan di {loc} sebabkan {n} kasus tifus.",
        "Kasus demam tifoid di {loc} sebanyak {n} orang.",
        "Puskesmas {loc} tangani {n} pasien demam tifoid.",
        "Tifus masih endemis di {loc}, {n} kasus tercatat.",
        "Demam tifoid akibat salmonella typhi di {loc}, {n} kasus.",
    ],
    "measles campak": [
        "Wabah campak melanda {loc}, {n} anak terkena campak.",
        "Kasus campak meningkat di {loc}, {n} anak dirawat.",
        "{n} balita di {loc} terkena campak.",
        "Campak merebak di {loc}, {n} kasus dilaporkan.",
        "KLB campak di {loc} capai {n} kasus pada anak-anak.",
        "Imunisasi campak di {loc} capai {n}% target.",
        "Cakupan vaksin campak rendah di {loc}, {n} anak terinfeksi.",
        "Campak menyebar di {loc}, sebanyak {n} warga terkena.",
        "Puskesmas {loc} catat {n} kasus campak bulan ini.",
        "Wabah campak di {loc} sebabkan {n} anak dirawat intensif.",
    ],
    "hantavirus": [
        "Hantavirus muncul di {loc}, {n} warga terinfeksi.",
        "Wabah hantavirus di {loc}, {n} warga dirawat dengan gejala parah.",
        "Kasus hantavirus dilaporkan di {loc} sebanyak {n} orang.",
        "Hantavirus pulmonary syndrome ditemukan di {loc} pada {n} pasien.",
        "Virus hanta menyebar di {loc} melalui tikus, {n} kasus.",
        "{n} warga {loc} positif hantavirus setelah kontak dengan hewan pengerat.",
        "Kewaspadaan hantavirus di {loc}, {n} kasus terdeteksi.",
        "Hantavirus hemorrhagic fever di {loc}, {n} warga kritis.",
        "Dinkes {loc} konfirmasi {n} kasus hantavirus.",
        "Wabah hantavirus di {loc} sebabkan {n} korban jiwa.",
    ],
    "coronavirus MERS": [
        "Kasus MERS-CoV ditemukan di {loc}, {n} warga terinfeksi.",
        "Middle East Respiratory Syndrome menyebar di {loc}, {n} kasus.",
        "MERS corona muncul di {loc}, {n} warga diisolasi.",
        "Virus MERS-CoV terdeteksi di {loc} pada {n} pasien.",
        "Wabah MERS di {loc} capai {n} kasus dengan tingkat kematian tinggi.",
        "{n} warga {loc} positif MERS-CoV setelah kontak dengan unta.",
        "Kewaspadaan MERS-CoV di {loc}, {n} kasus dilaporkan.",
        "MERS corona menyebar di fasilitas kesehatan {loc}, {n} kasus.",
        "WHO pantau penyebaran MERS-CoV di {loc}, {n} kasus.",
        "Kasus MERS di {loc} meningkat, {n} warga dirawat intensif.",
    ],
}

NEGATIVE_TEMPLATES = [
    "Pertandingan sepak bola {a} vs {b} berakhir dengan skor 2-1.",
    "Indeks harga saham gabungan ditutup menguat {n} poin.",
    "Presiden menghadiri KTT ASEAN di {loc} hari ini.",
    "Harga cabai rawit di pasar tradisional {loc} naik {n}%.",
    "DPR menggelar rapat paripurna membahas anggaran kesehatan.",
    "Timnas Indonesia bertanding melawan Thailand di final.",
    "Gunung {loc} mengalami erupsi, warga diimbau waspada.",
    "Hujan lebat mengguyur {loc} sejak pukul 14.00 WIB.",
    "Konser musik artis internasional digelar di {loc}.",
    "Pemerintah resmi membuka kembali jalur penerbangan internasional.",
    "Pembangunan jalan tol {loc} diperkirakan selesai tahun depan.",
    "Pendaftaran sekolah negeri di {loc} dibuka mulai pekan depan.",
    "Gempa bumi berkekuatan {n} SR mengguncang {loc}.",
    "Pameran teknologi terbaru digelar di {loc} convention center.",
    "Kebakaran hutan dan lahan di {loc} meluas {n} hektar.",
    "Pilkada serentak 2026 digelar di {n} provinsi.",
    "Tim ekspedisi mendaki gunung {loc} berhasil capai puncak.",
    "Pelatihan digital marketing gratis untuk UMKM di {loc}.",
    "KPUD {loc} tetapkan DPT pemilu sebanyak {n} pemilih.",
    "Sosialisasi vaksinasi hewan ternak di {loc} dihadiri {n} peternak.",
]


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    random.seed(42)
    samples = []

    # Generate positive samples
    for disease, templates in DISEASE_TEMPLATES.items():
        for i in range(SAMPLES_PER_LABEL):
            template = templates[i % len(templates)]
            text = template.format(
                loc=random.choice(LOCATIONS),
                n=random.randint(1, 200),
                a=random.choice(["Persija", "Persib", "Arema", "Bali United"]),
                b=random.choice(["Persebaya", "PSM", "Borneo FC", "Persis"]),
            )
            samples.append({"text": text, "disease": disease})

    # Generate negative samples
    for i in range(NEGATIVE_SAMPLES):
        template = NEGATIVE_TEMPLATES[i % len(NEGATIVE_TEMPLATES)]
        text = template.format(
            loc=random.choice(LOCATIONS),
            n=random.randint(10, 5000),
            a=random.choice(["Persija", "Persib", "Arema"]),
            b=random.choice(["Persebaya", "PSM", "Borneo FC"]),
        )
        samples.append({"text": text, "disease": "NEGATIVE - not health related"})

    random.shuffle(samples)

    # Split
    split = int(len(samples) * 0.9)
    train = samples[:split]
    test = samples[split:]

    def save_jsonl(data, path):
        with open(path, "w") as f:
            for item in data:
                f.write(json.dumps(item) + "\n")

    save_jsonl(train, f"{OUTPUT_DIR}/train.jsonl")
    save_jsonl(test, f"{OUTPUT_DIR}/test.jsonl")

    print(f"✅ Synthetic training data generated:")
    print(f"   Train: {len(train)} samples → {OUTPUT_DIR}/train.jsonl")
    print(f"   Test:  {len(test)} samples → {OUTPUT_DIR}/test.jsonl")

    from collections import Counter
    dist = Counter(s["disease"] for s in samples)
    print("\nDistribution:")
    for label, count in sorted(dist.items(), key=lambda x: -x[1]):
        print(f"  {label:35s} {count}")


if __name__ == "__main__":
    main()
