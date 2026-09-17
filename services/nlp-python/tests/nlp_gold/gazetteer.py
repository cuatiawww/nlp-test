"""ASEAN gazetteer seed for gold tests when the locations table is not loaded."""

ASEAN_GAZETTEER = {
    "Brunei": ("Brunei", 4.5353, 114.7277),
    "Bandar Seri Begawan": ("Brunei", 4.9031, 114.9398),
    "Cambodia": ("Cambodia", 12.5657, 104.9910),
    "Phnom Penh": ("Cambodia", 11.5564, 104.9282),
    "Kampot": ("Cambodia", 10.6104, 104.1819),
    "Banteay Meanchey": ("Cambodia", 13.7533, 103.0324),
    "Kampong Thom": ("Cambodia", 12.7111, 104.8889),
    "Siem Reap": ("Cambodia", 13.3633, 103.8564),
    "Takeo": ("Cambodia", 10.9908, 104.7850),
    "Kampong Cham": ("Cambodia", 11.9934, 105.4635),
    "Kampong Speu": ("Cambodia", 11.4534, 104.5200),
    "Kratie": ("Cambodia", 12.4881, 106.0188),
    "Prey Veng": ("Cambodia", 11.4850, 105.3250),
    "Svay Rieng": ("Cambodia", 11.0876, 105.7992),
    "Kandal": ("Cambodia", 11.4136, 105.0000),
    "Indonesia": ("Indonesia", -2.5489, 118.0149),
    "Jakarta": ("Indonesia", -6.2088, 106.8456),
    "Java": ("Indonesia", -7.6145, 110.7122),
    "East Java": ("Indonesia", -7.5361, 112.2384),
    "West Java": ("Indonesia", -6.9175, 107.6191),
    "West Jakarta": ("Indonesia", -6.1674, 106.7580),
    "Cengkareng": ("Indonesia", -6.1481, 106.7350),
    "Semarang": ("Indonesia", -6.9667, 110.4167),
    "Bima": ("Indonesia", -8.4606, 118.7272),
    "Aceh": ("Indonesia", 4.6951, 96.7494),
    "South Papua": ("Indonesia", -4.2699, 138.0804),
    "Sumenep": ("Indonesia", -7.0167, 113.8667),
    "Ternate": ("Indonesia", 0.7889, 127.3818),
    "North Maluku": ("Indonesia", 1.5700, 127.8090),
    "Were": ("Indonesia", -8.8725, 121.0602),
    "Laos": ("Laos", 19.8563, 102.4955),
    "Lao PDR": ("Laos", 19.8563, 102.4955),
    "Vientiane": ("Laos", 17.9757, 102.6331),
    "Malaysia": ("Malaysia", 4.2105, 101.9758),
    "Kuala Lumpur": ("Malaysia", 3.1390, 101.6869),
    "Selangor": ("Malaysia", 3.0738, 101.5183),
    "Putrajaya": ("Malaysia", 2.9264, 101.6964),
    "Klang": ("Malaysia", 3.0333, 101.4500),
    "Petaling": ("Malaysia", 3.1667, 101.6500),
    "Myanmar": ("Myanmar", 21.9162, 95.9560),
    "Yangon": ("Myanmar", 16.8409, 96.1735),
    "Philippines": ("Philippines", 12.8797, 121.7740),
    "Manila": ("Philippines", 14.5995, 120.9842),
    "Singapore": ("Singapore", 1.3521, 103.8198),
    "Thailand": ("Thailand", 15.8700, 100.9925),
    "Bangkok": ("Thailand", 13.7563, 100.5018),
    "Long": ("Thailand", 18.0748, 99.8313),
    "Timor-Leste": ("Timor-Leste", -8.8742, 125.7275),
    "Dili": ("Timor-Leste", -8.5569, 125.5603),
    "Ermera": ("Timor-Leste", -8.7524, 125.3960),
    "Vietnam": ("Vietnam", 14.0583, 108.2772),
    "Viet Nam": ("Vietnam", 14.0583, 108.2772),
    "Hanoi": ("Vietnam", 21.0278, 105.8342),
    "Ho Chi Minh": ("Vietnam", 10.8231, 106.6297),
    "Tay Ninh": ("Vietnam", 11.3350, 106.1090),
    "Khanh Hoa": ("Vietnam", 12.2585, 109.0526),
    "Long An": ("Vietnam", 10.5439, 106.4050),
    "Utah": ("United States", 39.3210, -111.0937),
    "United States": ("United States", 39.8283, -98.5795),
    "New Jersey": ("United States", 40.0583, -74.4057),
}

DISEASE_SEED = {
    "dengue": "Dengue",
    "dbd": "Dengue",
    "demam berdarah": "Dengue",
    "measles": "Measles",
    "campak": "Measles",
    "rubella": "Measles",
    "h5n1": "Avian influenza",
    "avian influenza": "Avian influenza",
    "bird flu": "Avian influenza",
    "flu burung": "Avian influenza",
    "nipah": "Nipah virus disease",
    "rsv": "Respiratory syncytial virus infection",
    "influenza": "Influenza",
    "malaria": "Malaria",
    "chikungunya": "Chikungunya",
    "hfmd": "HFMD",
    "hand foot and mouth": "HFMD",
    "mpox": "Mpox",
    "monkeypox": "Mpox",
    "covid-19": "COVID-19",
    "covid": "COVID-19",
    "pertussis": "Pertussis",
    "whooping cough": "Pertussis",
    "cholera": "Cholera",
    "kolera": "Cholera",
    "rabies": "Rabies",
    "polio": "Poliomyelitis",
    "poliovirus": "Poliomyelitis",
    "cvdpv2": "Poliomyelitis",
    "cvdpv": "Poliomyelitis",
    "poliomyelitis": "Poliomyelitis",
    "zika": "Zika virus disease",
    "leptospirosis": "Leptospirosis",
    "tuberculosis": "Tuberculosis",
    "tb": "Tuberculosis",
}


def seed_gold_gazetteer():
    from app import config, extractors

    config.LOCATION_COORDS = {
        name: (lat, lon) for name, (_country, lat, lon) in ASEAN_GAZETTEER.items()
    }
    config.LOCATION_COUNTRIES = {
        name: country for name, (country, _lat, _lon) in ASEAN_GAZETTEER.items()
    }
    config.LOCATION_STOPWORDS.update({
        "were", "was", "been", "have", "has", "had", "did", "does",
        "asia", "africa", "europe",
        "confirms", "hits", "monitoring",
        "harian", "persen", "tak", "pesisir", "long",
    })
    config.DISEASE_DICT = dict(DISEASE_SEED)
    config.build_location_patterns()
    extractors.is_usable_place_name("Were")  # import side-effect free
    return config
