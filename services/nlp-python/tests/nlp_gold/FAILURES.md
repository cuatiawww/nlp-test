# NLP gold failures

Official pack `nlp-gold-20.json` scored with title + evidence_quote (no live HTTP).

**Score: 14/20** (bar 18/20).


14/20 ready fixtures passed (bar 18/20)
- asean-003: cases: pred=0 expect=11
- asean-004: country: pred='Global' expect='Philippines'
- asean-005: country: pred=None expect='Philippines'
- asean-006: country: pred='Global' expect='Malaysia'
- asean-007: country: pred='Global' expect='Indonesia', deaths: pred=0 expect=79
- asean-013: cases: pred=1785 expect=21620

## asean-003
Prediction: `{'disease': 'Avian influenza', 'country': 'Cambodia', 'location': 'Kampong Cham', 'case_count': 0, 'case_count_unknown': True, 'death_count': 6}`
- cases: pred=0 expect=11

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
Prediction: `{'disease': 'Dengue', 'country': 'Global', 'location': 'Global', 'case_count': 30465, 'case_count_unknown': False, 'death_count': 0}`
- country: pred='Global' expect='Indonesia'
- deaths: pred=0 expect=79

## asean-013
Prediction: `{'disease': 'Dengue', 'country': 'Thailand', 'location': 'Thailand', 'case_count': 1785, 'case_count_unknown': False, 'death_count': 31}`
- cases: pred=1785 expect=21620
