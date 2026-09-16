"""ASEAN + Timor-Leste URL catalog for interactive analyze-url accuracy.

Counts in ``expect`` are evidence bounds from the source article, not dummy
KPI targets. Omit case/death bounds when the article does not state a number.
"""

COUNTRIES = (
    "Brunei",
    "Cambodia",
    "Indonesia",
    "Laos",
    "Malaysia",
    "Myanmar",
    "Philippines",
    "Singapore",
    "Thailand",
    "Vietnam",
    "Timor-Leste",
)

# Production regression from URL Analysis UI job 58588bfb-2caa-477b-a64e-e9b02f4f41cf.
NEWSWAV_JOHOR_DENGUE = (
    "https://newswav.com/article/"
    "dengue-surge-in-johor-hits-nearly-10-000-cases-13-deaths-A2609_5NN1zQ"
)

CASES = [
    # --- Brunei ---
    {
        "id": "brn-moh-ili-hmpv",
        "country": "Brunei",
        "url": "https://moh.gov.bn/news/situasi-jangkitan-penyakit-influenza-like-illness-ili-dan-human-metapneumovirus-hmpv-di-negara-brunei-darussalam/",
        "expect": {
            "disease_contains": ["influenza", "hmpv", "metapneumovirus"],
            "country": "Brunei",
        },
    },
    {
        "id": "brn-moh-hantavirus",
        "country": "Brunei",
        "url": "https://moh.gov.bn/news/situasi-terkini-mengenai-jangkitan-hantavirus-di-negara-brunei-darussalam-08mei2026/",
        "expect": {
            "disease_contains": ["hantavirus"],
            "country": "Brunei",
        },
    },
    {
        "id": "brn-moh-one-health",
        "country": "Brunei",
        "url": "https://moh.gov.bn/news/brunei-darussalam-convenes-one-health-workshop-to-prioritise-zoonotic-diseases-and-strengthen-multisectoral-preparedness/",
        "expect": {
            "country": "Brunei",
        },
    },
    # --- Cambodia ---
    {
        "id": "khm-cidrap-h5n1",
        "country": "Cambodia",
        "url": "https://www.cidrap.umn.edu/avian-influenza-bird-flu/cambodia-confirms-human-h5n1-avian-flu-case-h5n1-hits-more-utah-egg-farms",
        "expect": {
            "disease_contains": ["avian", "h5n1", "influenza"],
            "country": "Cambodia",
            "must_not_disease": ["measles"],
            "must_not_country": ["Indonesia"],
        },
    },
    {
        "id": "khm-who-h5n1-don575",
        "country": "Cambodia",
        "url": "https://www.who.int/emergencies/disease-outbreak-news/item/2025-DON575",
        "expect": {
            "disease_contains": ["avian", "h5n1", "influenza"],
            "country": "Cambodia",
            "case_count": {"min": 11, "max": 11},
            "death_count": {"min": 6, "max": 6},
        },
    },
    {
        "id": "khm-who-measles",
        "country": "Cambodia",
        "url": "https://www.who.int/japan/news/feature-stories/detail/a-race-against-measles--cambodia-s-response-to-the-outbreak",
        "expect": {
            "disease_contains": ["measles"],
            "country": "Cambodia",
            "case_count": {"min": 2000, "max": 2300},
        },
    },
    # --- Indonesia ---
    {
        "id": "idn-jakartapost-dengue",
        "country": "Indonesia",
        "url": "https://www.thejakartapost.com/indonesia/2026/05/19/watching-climate-patterns-may-help-bolster-dengue-response",
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Indonesia",
            "case_count": {"min": 30000, "max": 31000},
            "death_count": {"min": 79, "max": 79},
            "must_not_disease": ["measles", "polio"],
        },
    },
    {
        "id": "idn-jakartapost-measles",
        "country": "Indonesia",
        "url": "https://www.thejakartapost.com/indonesia/2025/09/01/jakarta-scales-up-vaccination-as-measles-cases-surge",
        "expect": {
            "disease_contains": ["measles"],
            "country": "Indonesia",
            "must_not_disease": ["dengue"],
        },
    },
    {
        "id": "idn-cidrap-measles-east-java",
        "country": "Indonesia",
        "url": "https://www.cidrap.umn.edu/measles/indonesia-reports-17-deaths-measles-outbreak-launches-vaccine-drive",
        "expect": {
            "disease_contains": ["measles"],
            "country": "Indonesia",
            "death_count": {"min": 17, "max": 17},
            "must_not_country": ["United States"],
        },
    },
    # --- Laos ---
    {
        "id": "lao-who-dengue-sitrep",
        "country": "Laos",
        "url": "https://cdn.who.int/media/docs/default-source/wpro---documents/emergency/surveillance/dengue/dengue_20260806.pdf?sfvrsn=6da2a49b_1",
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Laos",
        },
    },
    {
        "id": "lao-reliefweb-wolbachia",
        "country": "Laos",
        "url": "https://reliefweb.int/report/lao-peoples-democratic-republic/grown-lab-released-wild-laos-unleashes-over-130-million-disease-reducing-mosquitoes-after-global-dengue-surge",
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Laos",
        },
    },
    {
        "id": "lao-who-giant-mosquito",
        "country": "Laos",
        "url": "https://www.who.int/laos/news",
        "expect": {
            "country": "Laos",
        },
    },
    # --- Malaysia ---
    {
        "id": "mys-newswav-johor-dengue",
        "country": "Malaysia",
        "url": NEWSWAV_JOHOR_DENGUE,
        "regression": True,
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Malaysia",
            "case_count": {"min": 9000, "max": 11000},
            "death_count": {"min": 10, "max": 16},
            "must_not_disease": ["measles"],
            "must_not_country": ["Indonesia"],
        },
    },
    {
        "id": "mys-bernama-dengue-ew35",
        "country": "Malaysia",
        "url": "https://www.bernama.com/en/news.php?id=2605035",
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Malaysia",
            "case_count": {"min": 65000, "max": 67000},
            "death_count": {"min": 62, "max": 62},
        },
    },
    {
        "id": "mys-who-wpro-dengue",
        "country": "Malaysia",
        "url": "https://www.who.int/westernpacific/wpro-emergencies/surveillance/dengue",
        "expect": {
            "disease_contains": ["dengue"],
        },
    },
    # --- Myanmar ---
    {
        "id": "mmr-un-health-cluster-jun2026",
        "country": "Myanmar",
        "url": "https://myanmar.un.org/en/318595-myanmar-health-cluster-bulletin-june-2026",
        "expect": {
            "country": "Myanmar",
        },
    },
    {
        "id": "mmr-who-emergency-appeal-2026",
        "country": "Myanmar",
        "url": "https://www.who.int/publications/m/item/myanmar--who-health-emergency-appeal-2026",
        "expect": {
            "country": "Myanmar",
        },
    },
    {
        "id": "mmr-mimu-health-cluster-aug2026",
        "country": "Myanmar",
        "url": "https://themimu.info/sites/themimu.info/files/documents/Bulletin_Myanmar_Health_Cluster_Aug2026.pdf",
        "expect": {
            "country": "Myanmar",
        },
    },
    # --- Philippines ---
    {
        "id": "phl-gma-dengue",
        "country": "Philippines",
        "url": "https://www.gmanetwork.com/news/topstories/nation/1001460/doh-logs-over-15k-dengue-cases-from-aug-2-to-15-higher-than-previous-period/story/",
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Philippines",
            "must_not_disease": ["measles"],
        },
    },
    {
        "id": "phl-philstar-measles",
        "country": "Philippines",
        "url": "https://www.philstar.com/nation/2026/01/18/2501724/doh-notes-rise-measles-cases-pushes-vaccination",
        "expect": {
            "disease_contains": ["measles"],
            "country": "Philippines",
            "must_not_disease": ["dengue"],
        },
    },
    {
        "id": "phl-who-wpro-dengue-pdf",
        "country": "Philippines",
        "url": "https://cdn.who.int/media/docs/default-source/wpro---documents/emergency/surveillance/dengue/dengue_20260806.pdf?sfvrsn=6da2a49b_1",
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Philippines",
        },
    },
    # --- Singapore ---
    {
        "id": "sgp-mustshare-measles-2026",
        "country": "Singapore",
        "url": "https://mustsharenews.com/measles-cases-singapore-2026/",
        "expect": {
            "disease_contains": ["measles"],
            "country": "Singapore",
            "case_count": {"min": 43, "max": 43},
            "must_not_disease": ["dengue", "h5n1"],
        },
    },
    {
        "id": "sgp-cna-mpox",
        "country": "Singapore",
        "url": "https://www.channelnewsasia.com/singapore/mpox-clade-1b-infection-cases-communicable-diseases-agency-6033226",
        "expect": {
            "disease_contains": ["mpox", "monkeypox"],
            "country": "Singapore",
            "must_not_disease": ["measles", "dengue"],
        },
    },
    {
        "id": "sgp-cna-measles-isolation",
        "country": "Singapore",
        "url": "https://www.channelnewsasia.com/singapore/measles-cases-singapore-isolation-contact-tracing-quarantine-5912111",
        "expect": {
            "disease_contains": ["measles"],
            "country": "Singapore",
            "case_count": {"min": 11, "max": 11},
        },
    },
    # --- Thailand ---
    {
        "id": "tha-thaiger-dengue-2026",
        "country": "Thailand",
        "url": "https://thethaiger.com/guides/best-of/health/thailand-dengue-cases-21620-death-toll-31-2026",
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Thailand",
            "case_count": {"min": 21000, "max": 22000},
            "death_count": {"min": 31, "max": 31},
            "must_not_disease": ["measles"],
        },
    },
    {
        "id": "tha-bangkokpost-mpox-covid",
        "country": "Thailand",
        "url": "https://www.bangkokpost.com/thailand/general/3312564/mpox-covid19-cases-continue-to-rise",
        "expect": {
            "disease_contains": ["mpox", "monkeypox", "covid"],
            "country": "Thailand",
        },
    },
    {
        "id": "tha-who-searo-epi-bulletin",
        "country": "Thailand",
        "url": "https://cdn.who.int/media/docs/default-source/searo/whe/wherepib/2026_13_searo_epi_bulletin.pdf",
        "expect": {
            "country": "Thailand",
        },
    },
    # --- Vietnam ---
    {
        "id": "vnm-cidrap-h5n1-encephalitis",
        "country": "Vietnam",
        "url": "https://www.cidrap.umn.edu/avian-influenza-bird-flu/vietnam-reports-h5n1-avian-flu-case-encephalitis",
        "expect": {
            "disease_contains": ["avian", "h5n1", "influenza"],
            "country": "Vietnam",
            "case_count": {"min": 1, "max": 1},
            "must_not_disease": ["measles"],
            "must_not_country": ["Cambodia"],
        },
    },
    {
        "id": "vnm-cidrap-h5n1-death",
        "country": "Vietnam",
        "url": "https://www.cidrap.umn.edu/avian-influenza-bird-flu/vietnam-confirms-h5n1-mans-avian-flu-death",
        "expect": {
            "disease_contains": ["avian", "h5n1", "influenza"],
            "country": "Vietnam",
            "death_count": {"min": 1, "max": 1},
        },
    },
    {
        "id": "vnm-vietnamplus-dengue-hanoi",
        "country": "Vietnam",
        "url": "https://www.vietnamplus.vn/dich-sot-xuat-huyet-tai-ha-noi-co-xu-huong-gia-tang-post1126592.vnp",
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Vietnam",
        },
    },
    # --- Timor-Leste ---
    {
        "id": "tls-reliefweb-dengue-dref",
        "country": "Timor-Leste",
        "url": "https://reliefweb.int/report/timor-leste/timor-leste-dengue-outbreak-response-final-report-dref-ndeg-mdrtp005",
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Timor-Leste",
            "must_not_country": ["Indonesia"],
        },
    },
    {
        "id": "tls-who-searo-epi-bulletin",
        "country": "Timor-Leste",
        "url": "https://cdn.who.int/media/docs/default-source/searo/whe/wherepib/2026_13_searo_epi_bulletin.pdf",
        "expect": {
            "disease_contains": ["dengue"],
            "country": "Timor-Leste",
        },
    },
    {
        "id": "tls-who-country-news",
        "country": "Timor-Leste",
        "url": "https://www.who.int/timorleste",
        "expect": {
            "country": "Timor-Leste",
        },
    },
]


def catalog_cases():
    return list(CASES)


def cases_by_country():
    grouped = {country: [] for country in COUNTRIES}
    for case in CASES:
        grouped.setdefault(case["country"], []).append(case)
    return grouped


def regression_cases():
    return [case for case in CASES if case.get("regression")]


def validate_catalog():
    errors = []
    grouped = cases_by_country()
    for country in COUNTRIES:
        count = len(grouped.get(country, []))
        if count < 3:
            errors.append(f"{country} has {count} URLs; need at least 3")
    if len(CASES) < 33:
        errors.append(f"catalog has {len(CASES)} URLs; need at least 33")
    if not any(NEWSWAV_JOHOR_DENGUE in case["url"] for case in CASES):
        errors.append("Newswav Johor dengue regression URL is missing")
    urls = [case["url"] for case in CASES]
    if len(urls) != len(set(urls)) and len({(c["country"], c["url"]) for c in CASES}) != len(CASES):
        # Duplicate URLs across countries are allowed (multi-country PDFs);
        # duplicate country+url pairs are not.
        errors.append("duplicate country+url pairs in catalog")
    for case in CASES:
        if "url" not in case or not str(case["url"]).startswith("http"):
            errors.append(f"{case.get('id')} is missing an http(s) URL")
        expect = case.get("expect") or {}
        for key in ("case_count", "death_count"):
            bounds = expect.get(key)
            if bounds is None:
                continue
            if bounds.get("min") is None or bounds.get("max") is None:
                errors.append(f"{case['id']} {key} bounds must include min and max or be omitted")
    return errors
