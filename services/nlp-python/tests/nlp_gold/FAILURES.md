# NLP gold failures

Official pack `nlp-gold-20.json` scored with title + evidence_quote (no live HTTP).

**Score: 16/20** (bar 18/20).


16/20 ready fixtures passed (bar 18/20)
- asean-004: country: pred='Global' expect='Philippines'
- asean-005: country: pred=None expect='Philippines'
- asean-006: country: pred='Global' expect='Malaysia'
- asean-007: country: pred='Global' expect='Indonesia'

## asean-004
Prediction: `{'disease': 'Dengue', 'country': 'Global', 'location': 'Global', 'case_count': 128634, 'case_count_unknown': False, 'death_count': 0}`
- country: pred='Global' expect='Philippines'

## asean-005
Prediction: `{'disease': 'Measles', 'country': None, 'location': None, 'case_count': 5159, 'case_count_unknown': False, 'death_count': 0}`
- country: pred=None expect='Philippines'

## asean-006
Prediction: `{'disease': 'Dengue', 'country': 'Global', 'location': 'Global', 'case_count': 65979, 'case_count_unknown': False, 'death_count': 62}`
- country: pred='Global' expect='Malaysia'

## asean-007
Prediction: `{'disease': 'Dengue', 'country': 'Global', 'location': 'Global', 'case_count': 30465, 'case_count_unknown': False, 'death_count': 79}`
- country: pred='Global' expect='Indonesia'
