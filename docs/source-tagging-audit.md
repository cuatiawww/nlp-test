# Source tagging audit: ASEAN vs outside (ABVC NLP)

**Site:** https://abvc-surveillance.org/nlp  
**Audit date:** 2026-09-15  
**Method:** Public GET only (`/nlp/api/v1/sources/summary`, `/nlp/api/v1/sources?page=&per_page=50`). No auth.

---

## Plain-language summary (for stakeholders)

### What the dashboard numbers mean today

| Summary field | Value (at audit) | Meaning in practice |
|---|---|---|
| `total_sources` | 1,498 | All registered sources |
| `asean_sources` | **27** | Sources whose **top-level** country is an ASEAN member (or Timor-Leste) |
| `outside_sources` | **1,471** | Everything else (1,498 − 27) |
| `enabled_sources` / `scheduled_sources` | 40 | Only these are actively scheduled to crawl |
| `credible_sources` | 514 | Sources with credibility **≥ 0.7** (threshold exposed as `credibility_threshold`) |
| `needs_review_sources` | 984 | Sources below that threshold |

**ASEAN vs outside is not based on “does this outlet cover ASEAN?”**  
It is based on a **country label on the source record**, and only a small set of labels count as ASEAN.

### The important gotcha

There are **two different country fields**:

1. **Top-level `country`** (on the source object) — this is what the summary uses for `asean_sources` / `asean_by_country` / `outside_sources`.
2. **`config.country`** (inside the JSON config) — often filled for catalog/master-list imports (e.g. hundreds of Indonesia/Vietnam sites), but **ignored** for the ASEAN/outside summary counts when top-level `country` is blank.

Today, **top-level `country` is filled only on the 40 enabled sources**. The other ~1,458 imported catalog sources have `country: null` at the top level, so they are all counted as **outside**, even when `config.country` says Indonesia, Vietnam, etc.

So:

- Stakeholders looking at **“27 ASEAN sources”** are seeing almost entirely the **enabled RSS feeds** tagged with member-country names (Kompas, VNExpress, CNA, Google News ID, language-specific ASEAN health RSS, etc.).
- Stakeholders looking at the **master catalog** will see many ASEAN *outlets* in `config.country`, but those still sit in the **outside** bucket in the summary until top-level `country` is set.

### ASEAN country set used by the summary

Matches `asean_by_country` exactly (sums to 27):

| Country | Count |
|---|---|
| Indonesia | 8 |
| Malaysia | 3 |
| Thailand | 3 |
| Vietnam | 3 |
| Cambodia | 2 |
| Philippines | 2 |
| Singapore | 2 |
| Brunei | 1 |
| Laos | 1 |
| Myanmar | 1 |
| Timor-Leste | 1 |

Timor-Leste is included in ASEAN counts here (aspirant / listed alongside members).

### What is *not* counted as ASEAN

- Blank / null top-level `country` (vast majority of catalog imports)
- Literal label **`Outside ASEAN`**
- Label **`ASEAN / Asia`** (regional Google News Asia feed) — **counted as outside**
- `config.country = "Regional"` (e.g. ACPHEED) — top-level still null → outside
- Catalog type **Google** by itself does not decide ASEAN vs outside

### Credibility in plain terms

- API exposes `credibility_threshold: 0.7`.
- **Credible** = `source_credibility >= 0.7`.
- Scores look **pre-assigned by catalog type**, not live quality scores from crawling. They appear static / migrated with the catalog import.

---

## Technical findings (for engineers)

### Endpoints used

```http
GET /nlp/api/v1/sources/summary
GET /nlp/api/v1/sources?page={n}&per_page=50
```

List response shape:

```json
{
  "success": true,
  "data": [ /* source objects */ ],
  "total": 1498,
  "page": 1,
  "per_page": 50,
  "total_pages": 30
}
```

Relevant source fields:

| Field | Role |
|---|---|
| `country` | **Discriminator for ASEAN vs outside in summary** |
| `config.country` | Catalog geography (ASEAN member name, `Outside ASEAN`, `Regional`, …) |
| `config.source_country_original` | Finer origin (e.g. United States, Brunei Darussalam, Timor Leste) |
| `catalog_type` | Google / Local News / web / rss / Official Government Sites / … |
| `source_credibility` | Float; compared to 0.7 |
| `enabled` | Only 40 true; these alone have non-null top-level `country` |
| `source_origin` | `Main Source` / `Other Source` / null |
| `validity_status` | `Official` / `Unofficial` / null |
| `config.url` | Feed or site URL |

No `region` field observed on sources.

### How ASEAN vs outside is counted (confirmed)

**Rule (empirically exact against summary):**

```text
asean_sources     = count(sources where country ∈ ASEAN_SET)
outside_sources   = total_sources - asean_sources
asean_by_country  = group-by top-level country for those ASEAN rows
```

Where:

```text
ASEAN_SET = {
  Indonesia, Malaysia, Thailand, Vietnam, Cambodia,
  Philippines, Singapore, Brunei, Laos, Myanmar, Timor-Leste
}
```

**Not used for the summary split:**

- `config.country` (even when it is an ASEAN member name)
- `config.source_country_original`
- `catalog_type` (Google vs Local News vs rss)
- Whether the URL/name mentions ASEAN

**Evidence:** Among all 1,498 listed sources, exactly **27** have top-level `country` in `ASEAN_SET`, matching `asean_sources: 27`. Those 27 are a subset of the **40 enabled** sources. All disabled sources have `country: null` → outside.

Top-level `country` distribution (list crawl):

| `country` | Count | Summary bucket |
|---|---|---|
| `null` | 1,458 | outside |
| ASEAN member / Timor-Leste | 27 | **asean** |
| `Outside ASEAN` | 12 | outside |
| `ASEAN / Asia` | 1 | outside |

`config.country` distribution (different story):

| `config.country` | Count |
|---|---|
| Outside ASEAN | ~694 |
| Indonesia | ~291 |
| Vietnam | ~168 |
| Thailand / Malaysia / … | hundreds more ASEAN members |
| Regional | 10 |
| (missing) | ~17 |

→ **~777 sources have ASEAN member names in `config.country`, but only 27 count as ASEAN in the summary.**

### Catalog type vs ASEAN

`by_catalog_type` from summary (snapshot):

| catalog_type | source_count |
|---|---|
| Google | 761 |
| Local News | 442 |
| web | 208 |
| rss | 39 |
| Official Government Sites | 32 |
| Chart | 10 |
| HTML | 3 |
| Facebook | 2 |
| JSON | 1 |

Note: paginated list totals for some catalog types differed slightly from summary during the audit (e.g. Google 756 vs 761, Local News 417 vs 442, web 241 vs 208). Totals still 1,498. Treat summary as the authoritative aggregate; list `catalog_type` may lag or be dual-written during import.

**Google is not “outside by definition.”** Many `catalog_type: Google` rows have `config.country` set to Vietnam/Indonesia/etc. They are outside only because top-level `country` is null. Conversely, several **enabled** ASEAN rows are `catalog_type: rss` pointing at `news.google.com` search feeds — those *are* ASEAN because top-level `country` is set.

---

## Examples

### (a) Clearly ASEAN-tagged (top-level `country` in ASEAN_SET)

All 27 are **enabled**, mostly `catalog_type: rss`, credibility **0.78**. Sample:

| country | name | url (abbrev.) |
|---|---|---|
| Indonesia | Kompas.com | https://rss.kompas.com/ |
| Indonesia | Antara News | https://www.antaranews.com/rss/terkini.xml |
| Indonesia | CNN Indonesia | https://www.cnnindonesia.com/nasional/rss |
| Indonesia | Google News Health ID | news.google.com … hl=id&gl=ID |
| Indonesia | ASEAN Bahasa Indonesia — Health RSS | news.google.com search (penyakit/wabah) |
| Malaysia | Malay Mail — Health | https://www.malaymail.com/feed/rss/health |
| Singapore | Channel News Asia | CNA RSS |
| Singapore | ASEAN English — Singapore CNA RSS | CNA outbound feed |
| Vietnam | VNExpress — Health | https://vnexpress.net/rss/suc-khoe.rss |
| Thailand | The Nation Thailand | https://www.nationthailand.com/rss/all |
| Philippines | Rappler | https://www.rappler.com/rss |
| Cambodia | Phnom Penh Post | https://www.phnompenhpost.com/rss |
| Brunei | ASEAN Bahasa Melayu — Brunei RSS | news.google.com … gl=BN |
| Timor-Leste | ASEAN Tetum — SBS RSS | https://feeds.sbs.com.au/sbs-tetum |

Full set of 27 = enabled RSS (plus naming variants) covering the 11 countries in `asean_by_country`.

### (b) ASEAN-relevant / Google-global style sources counted **outside**

**1. Master-catalog ASEAN outlets with null top-level country** (config says ASEAN member, summary says outside):

| name | catalog_type | config.country | top country | credibility |
|---|---|---|---|---|
| Demokratis.id | web | Indonesia | null | 0.65 |
| Astro Awani | Google | Malaysia | null | 0.65 |
| 24h | Google | Vietnam | null | 0.65 |
| KKMNOW - Health Data Portal MOH Malaysia | web | Malaysia | null | 0.65 |
| Drug Administration of Vietnam (DAV) | web | Vietnam | null | 0.65 |
| Bao Chinh Phu | Official Government Sites | Vietnam | null | **0.95** |
| DDC MOPH Thailand | Official Government Sites | Thailand | null | **0.95** |
| Antara News — Babel | Local News | Indonesia | null | **0.84** |

Hundreds of similar rows (roughly **766** with `config.country ∈ ASEAN_SET` but top-level not in ASEAN_SET).

**2. Enabled feeds that discuss Asia/ASEAN but labeled outside:**

| name | top `country` | notes |
|---|---|---|
| Google News Asia Disease | **ASEAN / Asia** | Explicit Asia/SE search; **not** in ASEAN_SET → outside |
| Google News Outbreak | Outside ASEAN | EN Google News |
| Google News Health EN | Outside ASEAN | EN Google News |
| WHO Disease Outbreak News | Outside ASEAN | International |
| ReliefWeb Health Updates | Outside ASEAN | International |
| CDC Outbreaks | Outside ASEAN | International |

**3. `config.country = Regional` (outside):** e.g. ASEAN Centre for Public Health Emergencies (ACPHEED) — name is ASEAN-regional, but top-level `country` null → outside.

### (c) Country literally containing “ASEAN”

| Value | Where | Counted as |
|---|---|---|
| **`ASEAN / Asia`** | top-level `country` on “Google News Asia Disease” | **outside** (not in ASEAN_SET) |
| **`Outside ASEAN`** | top-level on 12 enabled feeds; also massively in `config.country` (~694) | outside |
| Exact country string **`ASEAN`** alone | **Not found** on `country`, `config.country`, or `source_country_original` | — |

No source was found with country literally equal to `"ASEAN"`.

---

## Credibility

### API meaning of “credible”

From summary:

- `credibility_threshold`: **0.7**
- `credible_sources`: count of sources with `source_credibility >= 0.7`
- `needs_review_sources`: count below threshold
- `average_credibility`: mean of all `source_credibility` values

At summary snapshot: 514 credible + 984 needs_review = 1,498.

### Score distribution (list crawl)

Only **six distinct** values observed:

| Score | Approx. count | Typical `catalog_type` |
|---|---|---|
| **0.95** | 30 | Official Government Sites |
| **0.84** | 417 | Local News |
| **0.78** | 39 | rss (all enabled RSS feeds) |
| **0.70** | 1 | JSON |
| **0.65** | ~1009 | Google, web, Chart, HTML |
| **0.35** | 2 | Facebook |

Each `(validity_status, source_origin, catalog_type, source_catalog)` combo mapped to a **single** credibility value (0 multi-score combos). Strong signal that scores are **static / rule- or catalog-assigned**, not per-source dynamic reputation.

### High / low samples

**High**

| Score | Example | catalog_type |
|---|---|---|
| 0.95 | Bao Chinh Phu, DDC MOPH Thailand, Philippine Information Agency | Official Government Sites |
| 0.84 | Antara regional Local News, Kompas city editions, many “Main Source” locals | Local News |
| 0.78 | Kompas.com RSS, VNExpress, ASEAN language Google News RSS | rss |

**Low / below threshold**

| Score | Example | catalog_type |
|---|---|---|
| 0.65 | CNN.com, BBC, Astro Awani, Demokratis.id, WHO Disease Outbreak News (enabled web) | Google / web |
| 0.35 | Facebook-catalog sources | Facebook |

Notable: **WHO Disease Outbreak News** is enabled but scored **0.65** (below threshold) because its `catalog_type` is `web`, while peer enabled RSS feeds sit at 0.78.

### Static / migrated?

Yes — evidence:

1. Discrete buckets tightly aligned to `catalog_type`.
2. Bulk create timestamps: **1,458** sources created `2026-09-15` (ABVC Master Source import hour); **40** older (`2026-08-19`) matching the enabled set.
3. No per-source score drift within the same catalog type.
4. Summary `credible_sources` (514) equals Official(32) + Local News(442) + rss(39) + JSON(1) under summary’s `by_catalog_type` — i.e. catalog-driven ≥0.7 math.

---

## Implications / recommendations

1. **Do not treat `asean_sources = 27` as “ASEAN media coverage inventory.”** It is “enabled sources with top-level ASEAN country label.”
2. If product intent is “sources based in ASEAN,” engineers should either:
   - populate top-level `country` from `config.country` / `source_country_original` for catalog rows, **or**
   - change summary aggregation to use `config.country ∈ ASEAN_SET` (and decide how to treat `Regional`, `ASEAN / Asia`, Timor-Leste, Brunei Darussalam vs Brunei).
3. Clarify product treatment of **`ASEAN / Asia`** and **ACPHEED / Regional** — currently outside.
4. Credibility is a **catalog-type prior**, not an observed quality metric; UI copy should say so if stakeholders assume live scoring.
5. Normalize naming: `Brunei` vs `Brunei Darussalam`, `Timor-Leste` vs `Timor Leste` between `config.country` and `source_country_original`.

---

## Raw artifacts on box

| Path | Contents |
|---|---|
| `/workspace/phase-compare/sources-summary.json` | Summary API response |
| `/workspace/phase-compare/sources-page{1..30}.json` | Paginated list pages |
| `/workspace/phase-compare/sources-all.json` | Concatenated 1,498 sources |
| `/workspace/phase-compare/source-tagging-audit.md` | This report |
