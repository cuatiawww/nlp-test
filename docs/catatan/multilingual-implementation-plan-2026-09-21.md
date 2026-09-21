# Multilingual ASEAN implementation plan

## Scope

The source article remains the evidence authority. NLLB is an auxiliary semantic
view only. It must not overwrite `original_text`, source-language evidence,
metric values, dates, locations, or their source offsets.

## Implemented in this increment

1. Translation policy is explicit through `TRANSLATION_NATIVE_FIRST_LANGS`.
   Indonesian is source-first by default and does not incur a translation stage
   for every article. English remains not-required. Other configured languages
   may still use lazy NLLB as an optional semantic aid.
2. NLP responses now expose `translation_status` separately from the NLP/job
   status. A translation timeout keeps `translation_status=timeout`, marks the
   result for review, and does not discard a completed source-language
   extraction.
3. Collector URL extraction rejects a Cloudflare/browser challenge, non-200
   fallback response, or unrendered SPA shell before article parsing. This
   prevents challenge HTML from becoming an UNKNOWN surveillance article.
4. Latin language markers use word boundaries. Substrings such as `kes` inside
   another word can no longer win Malay detection accidentally.
5. A number followed by a non-case noun such as `outbreaks` or `clusters` is
   no longer converted into a patient-case total. The exclusion vocabulary is
   stored in `language_markers` as `metric_non_case`, not in a new Python list.
6. Docker keeps NLLB lazy and cache-backed. No new model or microservice was
   added; the compose environment now makes the Indonesian source-first policy
   explicit.
7. Translation is now deferred by default. The source-first pipeline returns
   `translation_status=pending` without loading NLLB; cached translations remain
   usable immediately. The existing analysis worker publishes pending URL jobs
   to `disease.translation` and consumes them on a separate thread, so a slow
   NLLB call cannot block the URL-analysis queue.
8. Added `/nlp/translate` as an explicit background enrichment endpoint. It
   never participates in disease, metric, location, date, or event decisions.
   Missing offline model snapshots fail fast instead of waiting for a network
   lookup. External LLM review is opt-in and disabled by default on the crawl
   path.
9. Classifier model-load failures are cached for a cooldown window. A missing
   or incomplete local XLM-R snapshot therefore falls back to source rules
   without repeating the same Hugging Face lookup for every article.
10. The runtime now rejects a base masked-language-model checkpoint when it is
    configured for zero-shot classification. This prevents an untrained random
    classification head from contaminating surveillance decisions.

## Next increments

1. Add a language quality report to the terminal harness for all 22 ASEAN URLs:
   detected language, script, translation status/provider, source evidence,
   disease/location/metric/period relations, event count, and review flags.
2. Add article-level country compatibility validation to every location result:
   preserve the original mention and hierarchy, but null coordinates and mark
   review when the candidate's gazetteer country conflicts with explicit event
   geography.
3. Expand DB lexicons from reviewed multilingual failures only. Keep grammar in
   reusable code and keep words, aliases, months, metric labels, and context
   terms in master tables.
4. Add relation-level regression cases for exact versus approximate counts,
   historical versus current periods, aggregate versus regional breakdowns, and
   multiple diseases/countries before changing event decomposition.
5. Re-run the 22-URL matrix after each increment and compare intelligence
   fields, not translation success alone.

## Validation in this increment

- NLP unit suite: 168 tests passed.
- Worker unit suite: 67 tests passed.
- Thai source-first smoke test: returned in about 2–3 seconds with original
  evidence, disease, cases, deaths, country, and coordinates while translation
  was `pending`.
- Explicit cached NLLB endpoint smoke test completed without blocking source
  NLP. The cached translation was intentionally not allowed to replace source
  disease or metric facts.
- Focused translation/count/language suite: 37 tests passed.
- Collector challenge helper executed inside the running collector container.
- Full collector suite could not run from the host because the host Python
  environment lacks the collector dependencies, and the running collector
  image does not mount the host `tests/` directory. The collector code path
  still requires an image-level test/rebuild before production rollout.

## Remaining risks

- Malay/Vietnamese/Tagalog Latin articles can still need more DB disease and
  location vocabulary; translation cannot compensate for missing source
  evidence relations.
- Lao/Myanmar/Khmer translation remains resource- and model-cache-dependent.
- Translation enrichment may remain `unavailable` when the configured NLLB
  snapshot is absent; this is visible and does not invalidate the source-first
  event.
- A 99% accuracy claim is not yet justified: the repository still needs a
  reviewed multilingual gold set and field-level precision/recall gates.
- The mounted `xlm-roberta-base` checkpoint is an encoder/masked-LM checkpoint,
  not an NLI classifier. It is therefore intentionally not used for zero-shot
  decisions until a compatible NLI or fine-tuned checkpoint is supplied.
- Existing relation attribution needs the country-compatibility increment
  before all multi-country articles can be considered production-safe.
- This increment does not claim perfect multilingual extraction or complete
  event decomposition.
