"""Clause ownership: nationwide totals, regional subsets, hospital census."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import config, extractors
from app.admin_abbreviations import apply_admin_abbreviations, bind_document_admin_scope
from app.multi_event_extractor import compose_structured_events
from app.surveillance_extraction import (
    GazetteerLinker,
    _METRIC_PATTERN_CACHE,
    _RELATION_PATTERN_CACHE,
    extract_metric_relations,
)


VOV_HFMD = """
Vietnam scrambles to contain hand foot and mouth disease outbreak
VOV.VN - The Ministry of Health has ordered urgent measures to contain a
rapidly escalating outbreak of hand, foot and mouth disease (HFMD),
particularly in Ho Chi Minh City, where infections, severe cases and
fatalities are on the rise.

Hand, foot and mouth disease spread with over 25,000 cases logged in early
2026, while the vaccine is expected later this year.

In an official dispatch released on March 31, the MoH called on medical
facilities to enhance preparedness in order to minimise severe cases and
fatalities.

According to the ministry, more than 25,000 HFMD cases have been recorded
nationwide in the first three months of 2026, including deaths. Notably, the
southern region accounts for nearly 72% of total infections, with over
18,000 cases reported. The disease primarily affects children aged 1-5.

Hospitals, especially major pediatric facilities in southern Vietnam, have
reported a sharp increase in outpatient visits and hospital admissions,
including a number of severe cases. Surveillance data indicates the
circulation of Enterovirus 71 (EV71), a highly virulent strain that can
cause serious neurological complications and increase the risk of death.
"""

HOSPITAL_HFMD = """
Dr. Du Tuan Quy, Head of the Infectious Diseases and Neurology Department
at Children's Hospital 1 (Ho Chi Minh City), examines a child with hand,
foot, and mouth disease.

According to Dr. Du Tuan Quy, Head of the Infectious Diseases and Neurology
Department at Children's Hospital 1 (Ho Chi Minh City), the department is
currently treating more than 50 cases of Hand, Foot, and Mouth Disease
(HFMD), including 16 severe cases (grade 3 or higher); 6 cases require
intubation and mechanical ventilation. Each day, the department receives
approximately 40 additional cases transferred from the outpatient clinic.

Three-year-old Duong Ngo Gia Khang, residing in Hung Long ward, Ho Chi Minh
City, was admitted to Children's Hospital 1 with HFMD.
"""


class ClauseOwnedNationalCountTests(unittest.TestCase):
    def setUp(self):
        apply_admin_abbreviations()
        config.build_location_patterns()
        extractors.invalidate_location_alias_cache()
        GazetteerLinker._SHARED_FOLDED_COORDS = None
        GazetteerLinker._SHARED_MENTION_PATTERN = None
        GazetteerLinker._SHARED_SIG = None
        _RELATION_PATTERN_CACHE.clear()
        _METRIC_PATTERN_CACHE.clear()

    def _events(self, text, disease="Hand, Foot, and Mouth Disease (HFMD)", location="Vietnam"):
        bind_document_admin_scope(text)
        linker = GazetteerLinker(allow_remote=False)
        relations = extract_metric_relations(text, linker=linker, published_date="2026-03-31")
        return relations, compose_structured_events(
            text=text,
            primary_disease=disease,
            primary_location=location,
            diseases_extracted=[disease],
            locations=[],
            case_count=extractors.extract_case_count(text, disease=disease),
            death_count=0,
            primary_country="Vietnam",
            linker=linker,
            relations=relations,
            published_at="2026-03-31",
        )

    def test_vov_nationwide_25000_and_south_18000(self):
        relations, events = self._events(VOV_HFMD)
        counts = sorted(int(item.get("case_count") or 0) for item in events)
        self.assertIn(25000, counts, f"relations={[ (r.cases, r.location.name, r.evidence[:80]) for r in relations ]} events={[(e.get('case_count'), e.get('location_name'), (e.get('evidence') or '')[:80]) for e in events]}")
        self.assertIn(18000, counts)
        hcmc_events = [
            item for item in events
            if "ho chi minh" in str(item.get("location_name") or "").casefold()
        ]
        self.assertFalse(hcmc_events)
        national = next(item for item in events if int(item.get("case_count") or 0) == 25000)
        self.assertEqual(str(national.get("country") or ""), "Vietnam")
        loc = str(national.get("location_name") or "").casefold()
        self.assertTrue(loc in {"vietnam", "viet nam"})
        evidence = str(national.get("evidence") or "").casefold()
        self.assertIn("25000", evidence.replace(",", "").replace(" ", ""))
        self.assertIn("nationwide", evidence)
        south = next(item for item in events if int(item.get("case_count") or 0) == 18000)
        self.assertIn("south", str(south.get("location_name") or "").casefold())
        self.assertEqual(extractors.extract_case_count(VOV_HFMD, disease="Hand, Foot, and Mouth Disease (HFMD)"), 25000)

    def test_source_byline_does_not_drop_body_counts(self):
        from app.pipeline import _primary_article_boundary
        text = (
            "VOV.VN - The Ministry of Health ordered urgent measures in Ho Chi Minh City.\n"
            "Source: VOV\n\n"
            "According to the ministry, more than 25,000 HFMD cases have been recorded "
            "nationwide in the first three months of 2026."
        )
        self.assertIsNone(_primary_article_boundary(text))

    def test_hospital_census_not_severe_subset(self):
        relations, events = self._events(HOSPITAL_HFMD, location="Ho Chi Minh City")
        counts = sorted(int(item.get("case_count") or 0) for item in events)
        self.assertIn(50, counts, f"relations={[ (r.cases, r.location.name, r.qualifier, r.evidence[:90]) for r in relations ]} events={[(e.get('case_count'), e.get('location_name'), e.get('evidence')) for e in events]}")
        self.assertNotIn(16, counts)
        self.assertNotIn(6, counts)
        primary = next(item for item in events if int(item.get("case_count") or 0) == 50)
        evidence = str(primary.get("evidence") or "").casefold()
        self.assertIn("50", evidence)
        self.assertNotIn("three-year-old", evidence)
        self.assertNotIn("duong ngo", evidence)


if __name__ == "__main__":
    unittest.main()
