# ASEAN Disease NLP Gold Test Set (20 fixtures)
**Paths:** `/workspace/nlp-qa-r2/nlp-gold-20.json`, `/workspace/nlp-qa-r2/nlp-gold-20.md`  
**Target systems:** https://abvc-surveillance.org/nlp · https://github.com/cuatiawww/nlp-test  
**Fixtures completed:** 20

## Scoring rubric

**PASS** if all of:
- `disease` correct (canonical aliases OK: H5N1/avian influenza, mpox/monkeypox, Viet Nam/Vietnam, Lao PDR/Laos)
- `country` correct for ASEAN primary focus
- `cases` exact match when a number is present in expected (or an alternate scoped number explicitly allowed in notes)
- `deaths` exact match when a number is present; **null means do not invent**
- no `must_not_contain` violations

**FAIL** on: wrong country/disease; invented counts; province garbage tokens (e.g. `Were`); using vaccine doses/campaign targets as cases; leaking other-country figures from multi-country pages.

**Province rule:** use locality only if clearly stated; else `null`. Never English verbs.

---

## asean-001: Cambodia confirms human H5N1 avian flu case as H5N1 hits more Utah egg farms

- **URL:** https://www.cidrap.umn.edu/avian-influenza-bird-flu/cambodia-confirms-human-h5n1-avian-flu-case-h5n1-hits-more-utah-egg-farms
- **Source:** CIDRAP · 2026 (CIDRAP roundup; Cambodia fifth human H5N1 case this year)
- **Evidence:** “Earlier this week Cambodian officials announced the country's fifth human H5N1 avian flu case this year, this one involving a 9-month-old girl. ... Cambodia reported 19 human cases of H5N1 in 2025, eight of which were fatal.”
- **Expected JSON:**

```json
{
  "disease": "Avian influenza (H5N1)",
  "country": "Cambodia",
  "province_or_city": null,
  "cases": 1,
  "deaths": null,
  "notes": "Focal ASEAN event is 1 new human case (girl hospitalized). Cumulative 2025 context (19 cases / 8 deaths) is historical background, not the current focal count. Utah poultry outbreaks are secondary/non-ASEAN.",
  "must_not_contain": [
    "Measles",
    "Indonesia",
    "Were",
    "province Were"
  ]
}
```

- **Difficulty:** KNOWN BAD FIXTURE: multi-country headline (Cambodia + Utah). Models often mis-assign country to Indonesia, invent province 'Were' from verb text, or confuse with measles from adjacent CIDRAP measles blurb. Prefer Cambodia as ASEAN primary; do not invent Utah as ASEAN location.

## asean-002: S'pore sees highest number of measles cases in 6 years, vaccinated individuals among 2026 cases

- **URL:** https://mustsharenews.com/measles-cases-singapore-2026/
- **Source:** MustShareNews (citing CDA Weekly Infectious Diseases Bulletin) · 4 Aug 2026
- **Evidence:** “Singapore has recorded 43 cases of measles in 2026 so far, its highest number of cases since 2020. ... In contrast, 27 cases were recorded in 2025. However, this year's number falls well below the 152 cases logged in 2019.”
- **Expected JSON:**

```json
{
  "disease": "Measles",
  "country": "Singapore",
  "province_or_city": null,
  "cases": 43,
  "deaths": null,
  "notes": "Use 43 (2026 YTD), not 27 (2025), not 152 (2019), not Americas 43559 mentioned later in article.",
  "must_not_contain": [
    "802151",
    "43559",
    "43,559",
    "H5N1",
    "dengue"
  ]
}
```

- **Difficulty:** KNOWN BAD FIXTURE: numeric distractors (27, 152, 43559 Americas, Japan 100). Fail if cases != 43 when extracting 2026 Singapore total. Never invent large IDs/page noise as case counts (e.g. 802151).

## asean-003: Avian Influenza A(H5N1) - Cambodia

- **URL:** https://www.who.int/emergencies/disease-outbreak-news/item/2025-DON575
- **Source:** WHO Disease Outbreak News · 5 July 2025
- **Evidence:** “Between 1 January and 1 July 2025, the World Health Organization (WHO) was notified by Cambodia's International Health Regulations (IHR) National Focal Point (NFP) of 11 laboratory-confirmed cases of human infection with avian influenza A(H5N1) virus. ... including six deaths [CFR: 54%]. These cases are reported from the provinces of Siem Reap (4), Takeo (2), Kampong Cham (1), Kampong Speu (1), Kratie (1), Prey Veng (1), Svay Rieng (1).”
- **Expected JSON:**

```json
{
  "disease": "Avian influenza (H5N1)",
  "country": "Cambodia",
  "province_or_city": "Siem Reap",
  "cases": 11,
  "deaths": 6,
  "notes": "Primary period count: 11 cases / 6 deaths (Jan–1 Jul 2025). Multi-province; Siem Reap has highest share (4). Province field may be Siem Reap or null if multi-province aggregation preferred—accept either if country+disease+counts correct; do not invent a single false province.",
  "must_not_contain": [
    "Measles",
    "Indonesia",
    "Utah",
    "Were"
  ]
}
```

- **Difficulty:** Multi-province list; historical cumulative totals (83 cases / 49 deaths since 2003) are distractors—use the 2025 notification window (11/6).

## asean-004: DOH logs over 15k dengue cases from Aug 2 to 15, higher than previous period

- **URL:** https://www.gmanetwork.com/news/topstories/nation/1001460/doh-logs-over-15k-dengue-cases-from-aug-2-to-15-higher-than-previous-period/story/
- **Source:** GMA News (Philippines DOH) · 7 Sep 2026
- **Evidence:** “The Department of Health (DOH) said Monday that 15,763 dengue cases were recorded nationwide from August 2 to 15... So far, DOH has logged 128,634 dengue cases in 2026. The current number of dengue cases is 39% lower than the 209,631 cases in the same period in 2025.”
- **Expected JSON:**

```json
{
  "disease": "Dengue",
  "country": "Philippines",
  "province_or_city": null,
  "cases": 128634,
  "deaths": null,
  "notes": "Preferred gold cases = 128634 cumulative 2026. Alternate acceptable if extractor scopes to biweekly window: 15763 (Aug 2–15). Deaths not stated. Do not use 209631 (2025 comparator).",
  "must_not_contain": [
    "measles",
    "209631 as 2026 cases"
  ]
}
```

- **Difficulty:** Multiple case figures (15763 biweekly vs 128634 YTD vs 209631 prior year). Scorer: exact match on chosen scoped figure if clearly labeled; inventing deaths fails.

## asean-005: DOH notes rise in measles cases, pushes vaccination

- **URL:** https://www.philstar.com/nation/2026/01/18/2501724/doh-notes-rise-measles-cases-pushes-vaccination
- **Source:** Philstar / Philippine DOH · 18 Jan 2026
- **Evidence:** “From Jan. 1, 2025 to Jan. 3, 2026, measles and rubella cases reached 5,159. This is 32 percent higher compared to 3,901 cases posted in 2024... Of the total cases, 73 percent were unvaccinated.”
- **Expected JSON:**

```json
{
  "disease": "Measles",
  "country": "Philippines",
  "province_or_city": null,
  "cases": 5159,
  "deaths": null,
  "notes": "DOH reports combined measles and rubella (MR) = 5159. Accept disease=Measles or Measles/Rubella. Regions listed (Mindanao focus) are campaign targets, not a single province of all cases. 2.8 million is vaccination target, NOT cases.",
  "must_not_contain": [
    "2800000 as cases",
    "dengue"
  ]
}
```

- **Difficulty:** Combined MR reporting; large immunization target (2.8M) must not become cases. Country-wide, Mindanao is campaign geography.

## asean-006: Dengue Fever Cases Rise 66 Per Cent - Fahmi

- **URL:** https://www.bernama.com/en/news.php?id=2605035
- **Source:** BERNAMA (Malaysia) · 9 Sep 2026
- **Evidence:** “The number of dengue fever cases in the country rose 66 per cent to 65,979 as of epidemiological week 35 this year, compared with 39,616 cases recorded during the same period last year. ... cumulative number of deaths from dengue fever up to epidemiological week 35 in 2025 stood at 32, while in the same period in 2026, the figure was 62”
- **Expected JSON:**

```json
{
  "disease": "Dengue",
  "country": "Malaysia",
  "province_or_city": null,
  "cases": 65979,
  "deaths": 62,
  "notes": "EW35 2026: 65979 cases, 62 deaths. Comparators 39616 cases / 32 deaths are 2025 same period—do not use as current.",
  "must_not_contain": [
    "39616 as 2026 cases",
    "32 as 2026 deaths"
  ]
}
```

- **Difficulty:** Straightforward national totals with year-over-year distractors.

## asean-007: Watching climate patterns may help bolster dengue response

- **URL:** https://www.thejakartapost.com/indonesia/2026/05/19/watching-climate-patterns-may-help-bolster-dengue-response
- **Source:** The Jakarta Post · 19 May 2026
- **Evidence:** “As of mid-April alone, 30,465 cases and 79 deaths had been confirmed in 401 of 514 regencies and cities across the country.”
- **Expected JSON:**

```json
{
  "disease": "Dengue",
  "country": "Indonesia",
  "province_or_city": null,
  "cases": 30465,
  "deaths": 79,
  "notes": "National mid-April 2026 cumulative. Photo caption mentions Ternate, North Maluku (fogging) but that is illustrative local activity, not the national case geography for the headline numbers.",
  "must_not_contain": [
    "measles",
    "polio"
  ]
}
```

- **Difficulty:** Photo/location distractor (Ternate) vs national totals; province should stay null for the national figures.

## asean-008: Jakarta scales up vaccination as measles cases surge

- **URL:** https://www.thejakartapost.com/indonesia/2025/09/01/jakarta-scales-up-vaccination-as-measles-cases-surge
- **Source:** The Jakarta Post · 1 Sep 2025
- **Evidence:** “As of Sunday, nearly 1,900 suspected measles cases have been recorded since January, primarily in western and northern parts of the capital, according to data from the Jakarta Health Agency. This month alone, the city reported 361 new suspected cases... Cengkareng district in West Jakarta is among the areas reporting the highest number of infections with 25 suspected cases this month”
- **Expected JSON:**

```json
{
  "disease": "Measles",
  "country": "Indonesia",
  "province_or_city": "Jakarta",
  "cases": 1900,
  "deaths": null,
  "notes": "Cases are suspected (~1900 Jan–Aug 31). Accept ~1900 or 1900; do not treat 361 (monthly) or 25 (Cengkareng) as national/city YTD unless scoped. Deaths not stated.",
  "must_not_contain": [
    "dengue",
    "Were"
  ]
}
```

- **Difficulty:** Suspected vs confirmed; multiple nested counts (1900 / 361 / 25). City=Jakarta clearly stated.

## asean-009: Indonesia announces closure of polio outbreak

- **URL:** https://www.who.int/indonesia/news/detail/21-11-2025-indonesia-announces-closure-of-polio-outbreak
- **Source:** WHO Indonesia · 21 Nov 2025
- **Evidence:** “Indonesia has officially ended its outbreak of poliovirus type 2... The outbreak began in October 2022, when the first confirmed case was reported in Aceh province. ... The last confirmed cVDPV2 case was in South Papua on 27 June 2024. Since June 2024, no poliovirus has been detected in children or the environment.”
- **Expected JSON:**

```json
{
  "disease": "Polio (cVDPV2)",
  "country": "Indonesia",
  "province_or_city": "Aceh",
  "cases": null,
  "deaths": null,
  "notes": "Outbreak closure article: no total case count given in accessible text. First case Aceh; last case South Papua. Nearly 60 million vaccine doses is NOT cases. cases/deaths must be null.",
  "must_not_contain": [
    "60000000 as cases",
    "dengue",
    "measles"
  ]
}
```

- **Difficulty:** Closure/no active count—fail if model invents case totals from vaccine doses or lists multiple provinces as a single invented number.

## asean-010: Singapore confirms first two locally transmitted mpox cases; authorities say risk to public is low

- **URL:** https://www.channelnewsasia.com/singapore/mpox-clade-1b-infection-cases-communicable-diseases-agency-6033226
- **Source:** CNA / CDA Singapore · 2 Apr 2026
- **Evidence:** “Singapore has confirmed its first locally transmitted cases of mpox... The two cases – both men aged 30 and 34 - are also the country's first reported infections of the more serious clade 1b variant. ... there have been seven mpox cases this year, as of Mar 21. Twenty-three cases were reported in the whole of 2025.”
- **Expected JSON:**

```json
{
  "disease": "Mpox (clade Ib)",
  "country": "Singapore",
  "province_or_city": null,
  "cases": 2,
  "deaths": null,
  "notes": "Focal extraction: 2 locally transmitted clade Ib cases. YTD context 7 (as of Mar 21) and 2025 total 23 are secondary scopes—accept 2 for the headline event.",
  "must_not_contain": [
    "measles",
    "dengue",
    "H5N1"
  ]
}
```

- **Difficulty:** Nested counts (2 local clade Ib vs 7 YTD vs 23 prior year). Prefer headline focal=2.

## asean-011: Dengue Situation Update 751 (6 August 2026) — Lao PDR section

- **URL:** https://cdn.who.int/media/docs/default-source/wpro---documents/emergency/surveillance/dengue/dengue_20260806.pdf?sfvrsn=6da2a49b_1
- **Source:** WHO Western Pacific · 6 Aug 2026
- **Evidence:** “From 26 July to 1 August 2026, 179 dengue cases were reported, a decrease from 203 cases in the previous week (Figure 4). No deaths were reported in this reporting period. Cumulatively, a total of 3 029 cases have been reported in 2026, which is 35.7% lower than 4 712 cases reported during the same period in 2025.”
- **Expected JSON:**

```json
{
  "disease": "Dengue",
  "country": "Lao PDR",
  "province_or_city": null,
  "cases": 3029,
  "deaths": null,
  "notes": "Prefer cumulative 2026 = 3029. Weekly 179 is alternate scoped. Deaths null for reporting period (explicitly none); do not invent. 4712 is 2025 comparator.",
  "must_not_contain": [
    "Cambodia as country",
    "4712 as 2026 cases",
    "Measles"
  ]
}
```

- **Difficulty:** Same multi-country PDF as Cambodia/Viet Nam fixtures; section disambiguation + deaths explicitly none.

## asean-012: Singapore imposes mandatory isolation of measles cases, contact tracing, as infections rise

- **URL:** https://www.channelnewsasia.com/singapore/measles-cases-singapore-isolation-contact-tracing-quarantine-5912111
- **Source:** CNA / CDA Singapore · 6 Feb 2026
- **Evidence:** “Eleven measles cases were recorded in January, compared with two cases in the same month last year. There were 27 cases for the whole of 2025. Of the 11 cases, laboratory testing confirmed that three were genetically linked... All 11 cases in January were not fully vaccinated, including three infants under 12 months old”
- **Expected JSON:**

```json
{
  "disease": "Measles",
  "country": "Singapore",
  "province_or_city": null,
  "cases": 11,
  "deaths": null,
  "notes": "January 2026 = 11 cases. WHO global 11 million is distractor—never use as Singapore cases.",
  "must_not_contain": [
    "11000000",
    "11 million as Singapore cases",
    "27 as January 2026"
  ]
}
```

- **Difficulty:** Global WHO 11 million measles figure adjacent to local 11—classic invented-count trap.

## asean-013: Thailand dengue cases hit 21,620, death toll reaches 31 in 2026

- **URL:** https://thethaiger.com/guides/best-of/health/thailand-dengue-cases-21620-death-toll-31-2026
- **Source:** The Thaiger (citing DDC Thailand) · 26 Aug 2026
- **Evidence:** “Thailand has recorded 21,620 dengue cases and 31 deaths this year... figures cover January 1 to August 19. ... Bangkok has recorded 1,785 cases and four deaths”
- **Expected JSON:**

```json
{
  "disease": "Dengue",
  "country": "Thailand",
  "province_or_city": null,
  "cases": 21620,
  "deaths": 31,
  "notes": "National YTD preferred. Bangkok sub-total 1785/4 is secondary; Bang Kapi is control activity site not national province field.",
  "must_not_contain": [
    "measles",
    "H5N1"
  ]
}
```

- **Difficulty:** National vs Bangkok nested counts; province null unless extracting Bangkok-only split.

## asean-014: Indonesia reports 17 deaths in measles outbreak, launches vaccine drive

- **URL:** https://www.cidrap.umn.edu/measles/indonesia-reports-17-deaths-measles-outbreak-launches-vaccine-drive
- **Source:** CIDRAP (AP) · CIDRAP measles roundup (East Java outbreak)
- **Evidence:** “A measles outbreak centered in Indonesia's East Java has sickened more than 2,000 children, 17 of them fatally... 16 of the patients who died are from Sumenep district, according the report, which cited data from the Sumenep District Health Agency.”
- **Expected JSON:**

```json
{
  "disease": "Measles",
  "country": "Indonesia",
  "province_or_city": "East Java",
  "cases": 2000,
  "deaths": 17,
  "notes": "More than 2000 children sickened—accept cases>=2000 or 2000 with approx flag. Deaths=17 exact. Sumenep is district within East Java (16 of 17 deaths). Do not use New Jersey 7 cases from same page.",
  "must_not_contain": [
    "New Jersey",
    "screwworm",
    "Salmonella as disease"
  ]
}
```

- **Difficulty:** CIDRAP multi-story page: US measles/screwworm/Salmonella below—must keep Indonesia measles extraction only.

## asean-015: Vietnam reports H5N1 avian flu case with encephalitis

- **URL:** https://www.cidrap.umn.edu/avian-influenza-bird-flu/vietnam-reports-h5n1-avian-flu-case-encephalitis
- **Source:** CIDRAP · 2025 (first human case of 2025 in Viet Nam)
- **Evidence:** “Health officials in Vietnam have reported a severe H5N1 avian flu infection in an 8-year-old girl who is experiencing encephalitis symptoms... The girl is from Tay Ninh province... The patient remains hospitalized on a ventilator with stable vital signs.”
- **Expected JSON:**

```json
{
  "disease": "Avian influenza (H5N1)",
  "country": "Viet Nam",
  "province_or_city": "Tay Ninh",
  "cases": 1,
  "deaths": null,
  "notes": "Single severe case; hospitalized/ventilated but not reported dead. Mentions prior Dec 2024 fatal case in Long An—do not merge into current deaths=1.",
  "must_not_contain": [
    "Cambodia as country",
    "Measles",
    "Were"
  ]
}
```

- **Difficulty:** Prior fatal case mentioned; current case alive—deaths must be null for this event.

## asean-016: Vietnam confirms H5N1 in man's avian flu death

- **URL:** https://www.cidrap.umn.edu/avian-influenza-bird-flu/vietnam-confirms-h5n1-mans-avian-flu-death
- **Source:** CIDRAP · 2024 (Khanh Hoa province fatal case)
- **Evidence:** “The infection involved a 21-year-old college student... the patient died from his infection on March 23. ... No other cases have been detected during monitoring of the patient's contacts. ... six avian flu outbreaks have been reported across six provinces, including Khanh Hoa, where the man lived.”
- **Expected JSON:**

```json
{
  "disease": "Avian influenza (H5N1)",
  "country": "Viet Nam",
  "province_or_city": "Khanh Hoa",
  "cases": 1,
  "deaths": 1,
  "notes": "Single fatal human case. Poultry outbreaks (6) are animal events—do not count as human cases.",
  "must_not_contain": [
    "COVID",
    "Pemgarda",
    "6 as human cases"
  ]
}
```

- **Difficulty:** Multi-item CIDRAP page with COVID/Abx stories; poultry outbreak count ≠ human cases.

## asean-017: Dengue Situation Update 751 (6 August 2026) — Cambodia section

- **URL:** https://cdn.who.int/media/docs/default-source/wpro---documents/emergency/surveillance/dengue/dengue_20260806.pdf?sfvrsn=6da2a49b_1
- **Source:** WHO Western Pacific · 6 Aug 2026
- **Evidence:** “As of 26 July 2026, a total of 40 915 dengue cases, including 58 deaths (case fatality rate: 0.1%), have been reported through the National Dengue Surveillance System. This represents a 67.7% increase in the reported number of cases, compared to the same period in 2025, when 24 397 cases were reported.”
- **Expected JSON:**

```json
{
  "disease": "Dengue",
  "country": "Cambodia",
  "province_or_city": null,
  "cases": 40915,
  "deaths": 58,
  "notes": "Multi-country PDF: extract Cambodia block only for this fixture. 24397 is 2025 comparator.",
  "must_not_contain": [
    "Indonesia 75431 as Cambodia",
    "Viet Nam as country"
  ]
}
```

- **Difficulty:** Multi-country sitrep PDF—country leakage across sections is a common NLP failure mode.

## asean-018: Dengue Situation Update 751 (6 August 2026) — Viet Nam section

- **URL:** https://cdn.who.int/media/docs/default-source/wpro---documents/emergency/surveillance/dengue/dengue_20260806.pdf?sfvrsn=6da2a49b_1
- **Source:** WHO Western Pacific · 6 Aug 2026
- **Evidence:** “In July 2026, Viet Nam recorded 15 940 cases, including one death... From January to July 2026, a total of 73 828 cases, including nine deaths, were cumulatively reported nationwide, representing a 1.3-fold increase compared with the same period in 2025.”
- **Expected JSON:**

```json
{
  "disease": "Dengue",
  "country": "Viet Nam",
  "province_or_city": null,
  "cases": 73828,
  "deaths": 9,
  "notes": "Prefer Jan–Jul cumulative 73828/9. July-only 15940/1 is alternate scoped accept. Same PDF as asean-017—tests section disambiguation.",
  "must_not_contain": [
    "Cambodia as country",
    "40915 as Viet Nam cases"
  ]
}
```

- **Difficulty:** Same URL as Cambodia dengue fixture; requires country-section grounding.

## asean-019: Timor-Leste: Dengue Outbreak Response - Final Report, DREF n° MDRTP005

- **URL:** https://reliefweb.int/report/timor-leste/timor-leste-dengue-outbreak-response-final-report-dref-ndeg-mdrtp005
- **Source:** ReliefWeb / IFRC-CVTL · 2022 outbreak response final report (ASEAN+Timor-Leste coverage)
- **Evidence:** “There were 288 suspected cases of dengue in seven municipalities in the first week of 2022... The death toll reached 20 people by 31 January 2022... of the 20 fatalities, 11 had happened in Dili, the country's capital, along with four in Ermera, two in Covalima, and one each in Ainaro, Bobonaro, and Viqueque.”
- **Expected JSON:**

```json
{
  "disease": "Dengue",
  "country": "Timor-Leste",
  "province_or_city": "Dili",
  "cases": 288,
  "deaths": 20,
  "notes": "Early-outbreak snapshot: 288 suspected week-1; deaths=20 by 31 Jan 2022 (11 in Dili). Cases may be null if requiring nationwide cumulative (not fully stated as single total beyond early weeks)—prefer deaths=20 grounded; cases=288 if using week-1 figure with note suspected. Accept cases=288 or null; deaths must be 20 if extracted.",
  "must_not_contain": [
    "Indonesia as country",
    "Were"
  ]
}
```

- **Difficulty:** Older but trusted ReliefWeb Timor-Leste fixture; fragmented case totals vs clear death toll; Dili dominant among deaths.

## asean-020: A race against measles: Cambodia's response to the outbreak

- **URL:** https://www.who.int/japan/news/feature-stories/detail/a-race-against-measles--cambodia-s-response-to-the-outbreak
- **Source:** WHO Western Pacific / Japan news feature · 30 May 2025
- **Evidence:** “From January to April 2025, Cambodia reported 2,150 measles confirmed cases. This is a sharp increase compared to the 666 cases reported in all of 2024. The current outbreak has affected all 25 provinces, with Phnom Penh the hardest hit, reporting 394 cases, followed by Siem Reap with 208 and Kandal with 167.”
- **Expected JSON:**

```json
{
  "disease": "Measles",
  "country": "Cambodia",
  "province_or_city": "Phnom Penh",
  "cases": 2150,
  "deaths": null,
  "notes": "National confirmed Jan–Apr 2025 = 2150. Phnom Penh hardest hit (394). Russey Keo is vaccination scene setting. Deaths not stated in extracted text.",
  "must_not_contain": [
    "H5N1",
    "666 as 2025 cases",
    "Indonesia"
  ]
}
```

- **Difficulty:** Multi-province outbreak with clear primary city; 666 prior-year distractor.

