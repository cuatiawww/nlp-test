# ASEAN URL Gold Pack (2026-09)

**File:** `nlp-gold-asean-urls-2026-09.json`  
**Created:** 2026-09-26  
**Fixtures:** 27 (chat URL list; WHO dengue PDF deduped once)  
**Relation to official pack:** Additive companion to `nlp-gold-20.json` — do **not** overwrite the official 20.

## Scoring

Same contract as `nlp-gold-20`: score **title + evidence_quote only** (no live HTTP at test time).

**PASS** if all of:
- `disease` correct (aliases OK)
- `country` correct for ASEAN primary focus
- `cases` exact match when expected is a number
- `deaths` exact match when expected is a number; **null = do not invent**
- no `must_not_contain` hits

## How to run

`tests/nlp_gold/runner.py` defaults to `nlp-gold-20.json`. Thin additive override: set env `NLP_GOLD_PACK=nlp-gold-asean-urls-2026-09.json` (relative to `tests/nlp_gold/` or absolute path).

Options:
1. **Preferred:** `NLP_GOLD_PACK=nlp-gold-asean-urls-2026-09.json python -m tests.nlp_gold.runner` (or whatever entrypoint calls `run_gold_set`/`load_fixtures`).
2. **Manual score:** load fixtures and call `tests.nlp_gold.runner.predict_fixture` / score helpers.
3. **Do not** replace `nlp-gold-20.json` in-place for CI gate (`test_gold_set.py` expects ≥18/20 on the official pack when env unset).

```bash
# from services/nlp-python
NLP_GOLD_PACK=nlp-gold-asean-urls-2026-09.json python - <<'PY'
from tests.nlp_gold.runner import load_fixtures, predict_fixture
for fx in load_fixtures():
    pred = predict_fixture(fx)
    print(fx["id"], pred.get("disease"), pred.get("country"), pred.get("case_count"), pred.get("death_count"))
PY
```

## Related files (not wired)

- `fixtures.json` — older list-shaped harness fixtures (different schema: `text`/`expect`). **Separate**; not updated.
- `tests/qa_teammate/gold.json` — Sheet10 teammate QA harness. **Separate**; not analyze-url gold pack.

## Fetch notes

| id | fetch | note |
|----|-------|------|
| asean-url-006 | CloudFront 403 from WSL IP | filled via alternate fetch (GMA) |
| asean-url-009 | PDF; pdftotext missing on WSL | text extracted on agent box with pypdf/pdftotext |
| asean-url-027 | OK | non-ASEAN historic HIV paper |
| others | HTTP 200 | grounded from article body/meta |

## Fixture index

| id | country | disease | cases | deaths |
|----|---------|---------|------:|-------:|
| asean-url-001 | Indonesia | Dengue | 161752 | 673 |
| asean-url-002 | Indonesia | Measles | 3282 | null |
| asean-url-003 | Indonesia | Measles | 2035 | 17 |
| asean-url-004 | Indonesia | Mumps | null | null |
| asean-url-005 | Philippines | Dengue | 76425 | null |
| asean-url-006 | Philippines | Mpox | 911 | null |
| asean-url-007 | Malaysia | Dengue | 51046 | 43 |
| asean-url-008 | Malaysia | Mpox | 4 | null |
| asean-url-009 | Cambodia | Dengue | 28074 | 38 |
| asean-url-010 | Thailand | Hand, foot and mouth disease | 53362 | 1 |
| asean-url-011 | Thailand | Leptospirosis | 2190 | 30 |
| asean-url-012 | Vietnam | Measles | 42000 | 5 |
| asean-url-013 | Vietnam | Dengue | 31927 | 4 |
| asean-url-014 | Vietnam | Dengue | 190040 | null |
| asean-url-015 | Singapore | Measles | 40 | null |
| asean-url-016 | Singapore | Dengue | 600 | null |
| asean-url-017 | Singapore | Dengue | 13600 | null |
| asean-url-018 | Cambodia | Dengue | 18987 | 46 |
| asean-url-019 | Cambodia | Avian influenza (H5N1) | 11 | null |
| asean-url-020 | Laos | Dengue | 20115 | 11 |
| asean-url-021 | Laos | Dengue | 16458 | 10 |
| asean-url-022 | Myanmar | Cholera | 3421 | null |
| asean-url-023 | Myanmar | Dengue | 30 | null |
| asean-url-024 | Brunei | Tuberculosis | 235 | null |
| asean-url-025 | Brunei | Influenza | 207 | 0 |
| asean-url-026 | Timor-Leste | Malaria | 0 | null |
| asean-url-027 | Australia | HIV | 116 | null |

## asean-url-001: Sepanjang 2025, Indonesia Catat Lebih Dari 161 Ribu Kasus Dengue

- **URL:** https://www.cnnindonesia.com/gaya-hidup/20260204174440-255-1324619/sepanjang-2025-indonesia-catat-lebih-dari-161-ribu-kasus-dengue
- **Source:** CNN Indonesia · 2026-02-04
- **Evidence:** “Sepanjang tahun 2025, Indonesia kembali dihadapkan pada ancaman serius penyakit dengue. Data menunjukkan, tercatat sebanyak 161.752 kasus dengue dengan 673 kematian yang tersebar di hampir seluruh wilayah Tanah Air.”
- **Expected:** disease=Dengue; country=Indonesia; locality=None; cases=161752; deaths=673
- **Notes:** Use 2025 national total 161752/673. Do not use 2024 peak distractors 257271 cases / 1461 deaths mentioned later.
- **Difficulty:** Indonesian source; thousand-separator dots (161.752).

## asean-url-002: Campak Merebak, 3.282 Kasus Telah Dilaporkan Sepanjang 2025

- **URL:** https://www.kompas.id/artikel/campak-merebak-3282-kasus-telah-dilaporkan-sepanjang-2025
- **Source:** Kompas.id · 2025-08 (week 32 MoH data)
- **Evidence:** “Data Kementerian Kesehatan sampai minggu ke-32 atau sekitar awal Agustus 2025 mencatat, 40 kejadian luar biasa telah dilaporkan di 37 kabupaten/kota di Indonesia. Secara nasional, kasus suspek yang tercatat mencapai 22.074 kasus dengan kasus yang terkonfirmasi positif sebanyak 3.…”
- **Expected:** disease=Measles; country=Indonesia; locality=None; cases=3282; deaths=None
- **Notes:** Focal count is confirmed measles 3282, not suspect 22074. Province breakdowns (Jatim 842, Aceh 623, Sumut 450, Jabar 371) are subnational distractors.
- **Difficulty:** Confirmed vs suspect distractor; Indonesian campak alias.

## asean-url-003: Sumenep darurat campak, penderita tembus 2035 orang, 17 meninggal

- **URL:** https://www.cna.id/indonesia/sumenep-darurat-campak-penderita-tembus-2035-orang-17-meninggal-37051
- **Source:** CNA.id · 2025-08-25
- **Evidence:** “Data terbaru periode 17–21 Agustus 2025 mencatat 2.035 kasus suspek campak dengan 17 orang meninggal dunia. Kasus ini tersebar di 26 kecamatan dan berpotensi meluas jika tidak segera ditangani.”
- **Expected:** disease=Measles; country=Indonesia; locality=Sumenep; cases=2035; deaths=17
- **Notes:** Focal is Sumenep outbreak 2035 suspek / 17 deaths. Do not confuse R0-style '17–18 orang' transmission phrase with death count.
- **Difficulty:** Local outbreak; vaccine dose count 9825 is not cases.

## asean-url-004: Penyakit mumps: Ribuan anak terinfeksi penyakit gondongan – Apa itu gondongan, bagaimana cara penularannya?

- **URL:** https://www.bbc.com/indonesia/articles/cly2kemnggeo
- **Source:** BBC News Indonesia · 2024-11-01
- **Evidence:** “Di Jakarta, tercatat 1.234 kasus gondongan dari Januari hingga Juni 2024. Kasus ini juga dilaporkan terjadi di beberapa sekolah di Bandung dan Cimahi, Jawa Barat. Virus ini juga menyebar di Jawa Timur, dengan 2.001 kasus di Kabupaten Malang, 215 kasus di Kota Kediri, 907 kasus di…”
- **Expected:** disease=Mumps; country=Indonesia; locality=None; cases=None; deaths=None
- **Notes:** MULTI-CITY mumps (gondongan) explainer; no single national total. Do not invent a national sum. Adjacent campak/Papua 13 deaths and polio KLB mentions are distractors. Article states no deaths from mumps ('Tidak ada kematian karena penyakit ini').
- **Difficulty:** Multi-city; cases null by design. Alias gondongan↔mumps.

## asean-url-005: DoH logs over 76,000 dengue cases

- **URL:** https://tribune.net.ph/2025/03/29/doh-logs-over-76000-dengue-cases-2
- **Source:** Daily Tribune (Philippines) · 2025-03-30
- **Evidence:** “The Department of Health (DoH) logged 76,425 dengue cases from 1 January to 15 March. This represents a 78 percent increase from the same period in 2024 (48,822).”
- **Expected:** disease=Dengue; country=Philippines; locality=None; cases=76425; deaths=None
- **Notes:** Use YTD dengue 76425. Deaths mentioned qualitatively but no dengue death total given — leave null. Later measles-rubella national 1185 / NCR 295 are distractors.
- **Difficulty:** Same-page MR distractor.

## asean-url-006: DOH: Mpox cases actually dipped in May 2025; total cases 911 since 2024

- **URL:** https://www.gmanetwork.com/news/topstories/nation/947931/doh-more-mpox-cases-in-april-2025-than-in-may-total-cases-911-since-2024/story/
- **Source:** GMA News Online · 2025-05-31
- **Evidence:** “More cases of monkeypox (mpox) were detected in April 2025 as compared to May, and the total cases have so far reached 911 since 2024, the Department of Health (DOH) said Saturday. "Simula 2024, nasa 911 na ang kaso..."”
- **Expected:** disease=Mpox; country=Philippines; locality=None; cases=911; deaths=None
- **Notes:** Cumulative mpox since 2024 is 911. Fatalities discussed are attributed to advanced HIV, not mpox — do not invent mpox deaths. Monthly April/May ~50 figures are secondary.
- **Difficulty:** FETCH_FAILED from WSL IP (CloudFront 403); filled via alternate fetch. Clade II only.

## asean-url-007: Dengue deaths plunge 61.3pc in Malaysia, cases drop by more than half, says health minister

- **URL:** https://www.malaymail.com/news/malaysia/2025/12/15/dengue-deaths-plunge-613pc-in-malaysia-cases-drop-by-more-than-half-says-health-minister/202011
- **Source:** Malay Mail · 2025-12-15
- **Evidence:** “Deaths due to dengue in the country have dropped by 61.3 per cent to 43 cases compared with 111 recorded last year, Health Minister Datuk Seri Dr Dzulkefly Ahmad said. He said dengue cases nationwide also declined by 56.5 per cent to 51,046 cases as of December 6, compared with 1…”
- **Expected:** disease=Dengue; country=Malaysia; locality=None; cases=51046; deaths=43
- **Notes:** Use 2025 YTD 51046 cases / 43 deaths (as of Dec 6). Prior-year 118291/111 are comparators only.
- **Difficulty:** Prior-year comparator distractors.

## asean-url-008: [TERKINI] Kluster baharu mpox babit empat sekeluarga dikesan - KKM

- **URL:** https://www.astroawani.com/berita-malaysia/terkini-kluster-baharu-mpox-babit-empat-sekeluarga-dikesan-kkm-547830
- **Source:** Astro Awani (Bernama) · 2025-11-16
- **Evidence:** “KKM dalam kenyataan hari ini memaklumkan pesakit mula bergejala pada 20 Okt lepas dan disahkan positif mpox (Clade II) pada 12 Nov. Susulan pengesanan kes indeks, menurut kenyataan itu tiga ahli keluarga serumah turut mula bergejala bermula 30 Okt dan disahkan positif mpox (Clade…”
- **Expected:** disease=Mpox; country=Malaysia; locality=None; cases=4; deaths=None
- **Notes:** Focal new household cluster = 4 (index + 3 family). Cumulative Malaysia 23 since Jul 2023 and YTD 12 (ME46) are context; prefer 4 for this cluster story.
- **Difficulty:** Cluster-vs-cumulative ambiguity; Malay source.

## asean-url-009: Dengue Situation Update 750 — 23 July 2026 (WHO WPRO)

- **URL:** https://cdn.who.int/media/docs/default-source/wpro---documents/emergency/surveillance/dengue/dengue_20260723.pdf?sfvrsn=b98c1b75_1
- **Source:** WHO Western Pacific Region · 2026-07-23
- **Evidence:** “Cambodia. As of 12 July 2026, a total of 28 074 dengue cases, including 38 deaths (case fatality rate: 0.1%), have been reported through the National Dengue Surveillance System. This represents a 58.1% increase in the reported number of cases, compared to the same period in 2025,…”
- **Expected:** disease=Dengue; country=Cambodia; locality=None; cases=28074; deaths=38
- **Notes:** MULTI-COUNTRY WPRO dengue sitrep. ASEAN primary for this fixture = Cambodia lead section (28074/38). Other ASEAN figures in same PDF (e.g. Indonesia 58357/150; Malaysia 33697/24; Viet Nam 41684/8; Singapore 1428) must not overwrite Cambodia focal.
- **Difficulty:** MULTI-COUNTRY PDF; pick Cambodia as primary. Deduped (appeared 3× in chat).

## asean-url-010: Thailand records 53,362 hand, foot and mouth disease cases this year

- **URL:** https://www.pattayamail.com/news/thailand-records-53362-hand-foot-and-mouth-disease-cases-this-year-564293
- **Source:** Pattaya Mail · 2026-09-08
- **Evidence:** “The Department of Disease Control (DDC) has urged parents, guardians, schools, and childcare centers to watch for hand, foot, and mouth disease (HFMD) after 53,362 cases and one death were recorded nationwide this year.”
- **Expected:** disease=Hand, foot and mouth disease; country=Thailand; locality=None; cases=53362; deaths=1
- **Notes:** National HFMD YTD 53362 cases / 1 death.

## asean-url-011: Thailand DDC Issues Warning as Rainy Season Bacterial Infections Claim Over 100 Lives

- **URL:** https://www.nationthailand.com/health-wellness/40069034
- **Source:** The Nation Thailand · 2026-07-25
- **Evidence:** “Thailand's Department of Disease Control has issued a warning after over 100 deaths were recorded this year from two rainy season bacterial infections: leptospirosis and melioidosis. ... recorded 2,190 cases of leptospirosis between 1 January and 21 July 2026. The outbreak result…”
- **Expected:** disease=Leptospirosis; country=Thailand; locality=None; cases=2190; deaths=30
- **Notes:** MULTI-DISEASE: leptospirosis 2190/30 and melioidosis 1654/77 (combined deaths >100). Primary for scoring = leptospirosis (first detailed). Do not sum diseases into one case count.
- **Difficulty:** Multi-disease bacterial co-article.

## asean-url-012: Heightened awareness required as Việt Nam's measles cases top 42,000

- **URL:** https://vietnamnews.vn/society/1694618/heightened-awareness-required-as-viet-nam-s-measles-cases-top-42-000.html
- **Source:** Việt Nam News · 2025-03-27
- **Evidence:** “HÀ NỘI — Việt Nam has recorded more than 42,000 cases of measles and five deaths related to the disease since the beginning of 2025.”
- **Expected:** disease=Measles; country=Vietnam; locality=None; cases=42000; deaths=5
- **Notes:** Article says 'more than 42,000'; gold asserts 42000 as the headline floor figure used in title/lede.
- **Difficulty:** 'More than' wording; use 42000.

## asean-url-013: Ministry urges preventive measures as dengue and HFMD cases surge

- **URL:** https://en.sggp.org.vn/ministry-urges-preventive-measures-as-dengue-and-hfmd-cases-surge-post124960.html
- **Source:** SGGP English Edition · 2026-03-27
- **Evidence:** “From the beginning of 2026 to the present, the country has recorded 31,927 cases of dengue fever and 4 fatalities. Compared to the same period in 2025, the number of dengue fever cases has increased by 2.2 times, with fatalities remaining the same. ... Regarding HFMD, in the firs…”
- **Expected:** disease=Dengue; country=Vietnam; locality=None; cases=31927; deaths=4
- **Notes:** MULTI-DISEASE dengue+HFMD. Primary = dengue 31927/4. HFMD 25094/4 is secondary — list in must_not_contain numeric distractors for cases field.
- **Difficulty:** Dengue+HFMD dual surge.

## asean-url-014: The Ministry of Health provides information on the dengue fever and hand, foot, and mouth disease situation

- **URL:** https://www.vietnam.vn/en/bo-y-te-thong-tin-ve-tinh-hinh-benh-sot-xuat-huyet-va-tay-chan-mieng
- **Source:** Vietnam.vn · 2025 year-end MoH stats (page accessed 2026)
- **Evidence:** “According to statistics for the whole year of 2025, the whole country recorded 190,040 cases of dengue fever (an increase of 28.4% compared to 2024) and 107,249 cases of hand, foot and mouth disease (an increase of 28.9% compared to 2024).”
- **Expected:** disease=Dengue; country=Vietnam; locality=None; cases=190040; deaths=None
- **Notes:** Full-year 2025 dengue 190040 primary; HFMD 107249 secondary. Deaths not stated — null.
- **Difficulty:** Dual dengue+HFMD annual totals.

## asean-url-015: Singapore's measles cases reach six-year high, three vaccinated cases among 40 infections

- **URL:** https://www.channelnewsasia.com/singapore/measles-infectious-diseases-health-moh-6287746
- **Source:** Channel NewsAsia · 2026 (CDA bulletin year)
- **Evidence:** “Singapore has recorded 40 measles cases so far this year, the highest annual total since 2020, according to the Communicable Diseases Agency.”
- **Expected:** disease=Measles; country=Singapore; locality=None; cases=40; deaths=None
- **Notes:** Focal YTD measles = 40. Distinct from other Singapore measles fixtures that cite 43.
- **Difficulty:** Near-duplicate topic vs asean-002 (different count).

## asean-url-016: Singapore Enters Peak Dengue Season; Public Urged To Stay Vigilant To Prevent Surge In Cases

- **URL:** https://www.nea.gov.sg/media/news/news/index/singapore-enters-peak-dengue-season-public-urged-to-stay-vigilant-to-prevent-surge-in-cases
- **Source:** National Environment Agency (Singapore) · 2026-05-16
- **Evidence:** “Over 600 dengue cases were reported as of 15 May 2026, a decrease of 66 per cent as compared to the same period last year. ... Over 4,000 dengue cases were reported in 2025, a decrease of 70 per cent compared with 2024's 13,651 cases.”
- **Expected:** disease=Dengue; country=Singapore; locality=None; cases=600; deaths=None
- **Notes:** Focal is 2026 YTD 'over 600' as of 15 May 2026. Prior-year 4000+ (2025) and 13651 (2024) are comparators.
- **Difficulty:** 'Over 600' floor; inspection counts are not cases.

## asean-url-017: More than 13,600 dengue cases reported in Singapore in 2024, up 36% from 2023

- **URL:** https://www.straitstimes.com/singapore/health/more-than-13600-local-dengue-cases-reported-in-2024-a-rise-of-over-36-from-2023
- **Source:** The Straits Times · 2025-01-08
- **Evidence:** “There were more than 13,600 cases of dengue locally in 2024, ... there were 9,949 cases in 2023.”
- **Expected:** disease=Dengue; country=Singapore; locality=None; cases=13600; deaths=None
- **Notes:** ST gives 'more than 13,600' for 2024 (NEA elsewhere cites 13651). Gold asserts 13600 from this article's wording. Do not use 9949 (2023) or weekly 110.
- **Difficulty:** 'More than 13,600' vs exact 13651 elsewhere.

## asean-url-018: Cambodia records significant drop in dengue fever cases, with 46 deaths in 2024

- **URL:** https://english.news.cn/20250112/8e6b76618b3548308130458b6b37f258/c.html
- **Source:** Xinhua · 2025-01-12
- **Evidence:** “Cambodia had reported 18,987 dengue fever cases in 2024, a sharp decline of 46 percent from 35,390 cases in the year before, said a Ministry of Health's report on Sunday. "The disease killed 46 people last year, down 53.5 percent from 99 deaths in a year earlier," the report said…”
- **Expected:** disease=Dengue; country=Cambodia; locality=None; cases=18987; deaths=46
- **Notes:** Full-year 2024 Cambodia dengue 18987/46. Prior-year 35390/99 are comparators.

## asean-url-019: Avian Influenza A(H5N1) - Cambodia

- **URL:** https://www.who.int/emergencies/disease-outbreak-news/item/2025-DON575
- **Source:** WHO Disease Outbreak News · 2025-07-05
- **Evidence:** “National Focal Point (NFP) of 11 laboratory-confirmed cases of human infection with avian influenza A(H5N1) virus. Seven of the 11 cases were reported in June, an unusual monthly increase. ... Since the re-emergence of human A(H5N1) infections in Cambodia in 2023, a total of 27 c…”
- **Expected:** disease=Avian influenza (H5N1); country=Cambodia; locality=None; cases=11; deaths=None
- **Notes:** Focal DON event = 11 lab-confirmed cases in 2025 to date. Historical cumulative 83 cases/49 deaths since 2003 and post-2023 cumulative 27/12 are background — do not use as focal deaths for the 11.
- **Difficulty:** Cumulative vs focal year count.

## asean-url-020: Laos: Dengue cases top 20,000 in 2024

- **URL:** https://outbreaknewstoday.substack.com/p/laos-dengue-cases-top-20000-in-2024
- **Source:** Outbreak News Today (Substack) · 2024-12-27
- **Evidence:** “According to the data, Laos has seen 20,115 total cases, including 11 deaths year to date. The capital city of Vientiane leads all areas with 5,775 cases and three deaths.”
- **Expected:** disease=Dengue; country=Laos; locality=None; cases=20115; deaths=11
- **Notes:** National YTD 20115/11. Vientiane 5775/3 and Luang Prabang fatality lead are subnational.

## asean-url-021: Laos Reports 16,458 Dengue Fever Cases Amid Global Surge in 2024

- **URL:** https://kpl.gov.la/EN/detail.aspx?id=86392
- **Source:** KPL (Lao News Agency) · 2024-10-07
- **Evidence:** “Laos has recorded 16,458 cases of dengue fever so far in 2024, with 10 related deaths, according to the Centre of Information and Education for Health. These numbers reflect a significant decrease compared to the same period last year—when 29,032 cases and 17 deaths were reported…”
- **Expected:** disease=Dengue; country=Laos; locality=None; cases=16458; deaths=10
- **Notes:** Earlier 2024 snapshot than asean-url-020 (16458/10). Prior-year 29032/17 are comparators. Vientiane 4669 is subnational.
- **Difficulty:** Same country/disease as 020 with different YTD snapshot.

## asean-url-022: Myanmar Acute Watery Diarrhea / Cholera Outbreak - External Situation Report 4th edition (2024)

- **URL:** https://reliefweb.int/report/myanmar/myanmar-acute-watery-diarrhea-cholera-outbreak-external-situation-report-4th-edition-2024-published-25-september-2024
- **Source:** ReliefWeb / WHO · 2024-09-25
- **Evidence:** “A total of 3 421 hospitalized cases of acute watery diarrhea (AWD) including 160 cases with severe dehydration were reported in Yangon Region from 24 June to 25 August 2024, by the ministerial authorities for health.”
- **Expected:** disease=Cholera; country=Myanmar; locality=Yangon; cases=3421; deaths=None
- **Notes:** Focal Yangon hospitalized AWD/cholera 3421 (24 Jun–25 Aug 2024). Deaths not clearly stated in public excerpt — null. Rakhine 235 hospitalized is secondary.
- **Difficulty:** AWD/cholera alias; multi-region sitrep.

## asean-url-023: Dengue outbreak infects over 30 Myanmar children in Sittwe relief camps

- **URL:** https://www.bnionline.net/en/news/dengue-outbreak-infects-over-30-myanmar-children-sittwe-relief-camps
- **Source:** Burma News International / Mizzima · 2025-07-18
- **Evidence:** “At least 30 children sheltering in monasteries and relief camps in Sittwe, Rakhine State, have contracted dengue. ... the number of infected children has reached over 30.”
- **Expected:** disease=Dengue; country=Myanmar; locality=Sittwe; cases=30; deaths=None
- **Notes:** 'Over/at least 30' children — assert 30. Historical dengue deaths in 2023 mentioned without count — null.
- **Difficulty:** Small camp outbreak; 'over 30'.

## asean-url-024: Brunei sees decline in tuberculosis cases as prevention efforts bolstered

- **URL:** https://www.thestar.com.my/aseanplus/aseanplus-news/2025/03/24/brunei-sees-decline-in-tuberculosis-cases-as-prevention-efforts-bolstered
- **Source:** The Star (ASEAN+) · 2025-03-24
- **Evidence:** “He revealed that in 2024, the country recorded 235 TB cases, a 9.62 per cent decrease from 2023, which saw 260 cases.”
- **Expected:** disease=Tuberculosis; country=Brunei; locality=None; cases=235; deaths=None
- **Notes:** Brunei 2024 TB = 235. Global WHO 10.8 million / 1.25 million deaths are worldwide distractors — must not use.
- **Difficulty:** Global TB stats distractors.

## asean-url-025: No increase in influenza cases in Brunei in 2025: health ministry

- **URL:** https://www.thestar.com.my/aseanplus/aseanplus-news/2025/10/22/no-increase-in-influenza-cases-in-brunei-in-2025-health-ministry
- **Source:** The Star (ASEAN+) · 2025-10-22
- **Evidence:** “There has been no increase in influenza cases reported in Brunei in 2025, the Ministry of Health said on Tuesday (Oct 21). According to the ministry's press release, a total of 207 confirmed influenza cases were detected between January to October 15 in 2025, compared to 259 case…”
- **Expected:** disease=Influenza; country=Brunei; locality=None; cases=207; deaths=0
- **Notes:** 2025 YTD confirmed influenza 207; explicit no deaths → 0. Prior-year same-period 259 is comparator.
- **Difficulty:** Explicit zero deaths.

## asean-url-026: Timor-Leste certified malaria-free by WHO

- **URL:** https://www.who.int/news/item/24-07-2025-timor-leste-certified-malaria-free-by-who
- **Source:** WHO News · 2025-07-24
- **Evidence:** “Since gaining independence in 2002, Timor-Leste has made remarkable strides in the fight against malaria reducing cases from a peak of more than 223 000 clinically diagnosed cases in 2006 to zero indigenous cases from 2021 onwards.”
- **Expected:** disease=Malaria; country=Timor-Leste; locality=None; cases=0; deaths=None
- **Notes:** Certification story: zero indigenous malaria cases from 2021 onwards is the focal current status. Historical peak >223000 (2006) is background only.
- **Difficulty:** Elimination / zero-case certificate.

## asean-url-027: Validation of reported risk exposure in persons with newly diagnosed HIV infection

- **URL:** https://ojs.cdi.cdc.gov.au/index.php/cdi/article/view/119
- **Source:** Communicable Diseases Intelligence (Australia) · 1996 (CDI Vol.20)
- **Evidence:** “Of the 116 notifications of HIV followed up for 1994, 63 cases were available for analysis. Twenty cases (32%) had risk exposure categories reassigned of which nine were revised to male homosexual contact.”
- **Expected:** disease=HIV; country=Australia; locality=None; cases=116; deaths=None
- **Notes:** OUT_OF_SCOPE for ASEAN gold: historic NSW/Australia HIV methods paper (1994 notifications). Included because URL was in the chat list; not an ASEAN outbreak article. Prefer 116 followed-up notifications (63 analysed is subset).
- **Difficulty:** NON_ASEAN / OUT_OF_SCOPE historic CDI paper — keep for URL coverage, expect ASEAN runners may flag country.

