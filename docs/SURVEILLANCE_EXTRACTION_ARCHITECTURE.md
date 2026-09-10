# High-precision surveillance extraction

The strict article contract is implemented in
`services/nlp-python/app/surveillance_extraction.py` and exposed at:

```text
POST /nlp/analyze/surveillance
```

The existing `/nlp/analyze` endpoint remains backward-compatible for the
worker and database schema used by the application.

## Processing flow

```text
article + metadata
        |
        v
contextual candidates (gazetteer spans + optional spaCy GPE/LOC)
        |
        v
strict entity linking ── local DB gazetteer first ── optional Nominatim
        |
        v
relation extraction in the same evidence window
        (location <-> cases/deaths <-> time frame)
        |
        v
country aggregation + province grouping
        |
        v
regional alert/relevance decision + domain reliability score
        |
        v
Pydantic SurveillanceOutput.model_dump(exclude_none=True)
```

The LLM path uses the existing JSON-mode client in `app.agent`. Its response
is validated with `RawLLMRelation` and still has to resolve through the local
gazetteer. It cannot create coordinates, accept a free-form location, or
replace a stronger deterministic metric relation.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `SURVEILLANCE_SPACY_MODEL` | empty | Optional spaCy NER model; empty means deterministic gazetteer mode |
| `SURVEILLANCE_GEOCODER_ENABLED` | `false` | Enable optional Nominatim fallback |
| `SURVEILLANCE_GEOCODER_URL` | OSM Nominatim | Geocoder endpoint |
| `REGIONAL_SPIKE_CASE_THRESHOLD` | `65000` | Regional ASEAN spike threshold |
| `LOCAL_OUTBREAK_CASE_THRESHOLD` | `25` | Minimum explicit local outbreak count |
| `SURVEILLANCE_LLM_RELATIONS` | `true` | Enable bounded JSON-mode LLM supplementation |

The output uses `reported_cases` per country, not the first number found in an
article. If a country total and province counts both appear, the explicit
country total wins; province counts are retained for geographic context.
