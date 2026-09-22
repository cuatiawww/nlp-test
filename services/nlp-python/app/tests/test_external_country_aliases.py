"""EXTERNAL_COUNTRY_ALIASES + org-HQ place rejection (pilot-50 geo residuals)."""
from __future__ import annotations

import unittest

from app import extractors


class ExternalCountryAliasTests(unittest.TestCase):
    def test_external_aliases_include_pilot_residuals(self):
        aliases = extractors.EXTERNAL_COUNTRY_ALIASES
        self.assertEqual(aliases.get("yemen"), "Yemen")
        self.assertEqual(aliases.get("colombia"), "Colombia")
        self.assertEqual(aliases.get("panama"), "Panama")
        self.assertEqual(aliases.get("jordan"), "Jordan")
        self.assertEqual(aliases.get("sudan"), "Sudan")
        self.assertEqual(aliases.get("brazil"), "Brazil")

    def test_country_aliases_seeded_before_db(self):
        self.assertEqual(extractors.COUNTRY_ALIASES.get("colombia"), "Colombia")
        self.assertEqual(extractors.COUNTRY_ALIASES.get("yemen"), "Yemen")

    def test_org_hq_affiliation_rejects_place(self):
        text = (
            "WHO Regional Office for the Western Pacific in Manila, Philippines "
            "issued guidance on cholera response in Colombia."
        )
        manila_at = text.lower().index("manila")
        self.assertFalse(
            extractors.is_usable_place_name("Manila", text, manila_at)
        )

    def test_genuine_outbreak_place_still_accepted(self):
        text = "Health officials in Manila confirmed 12 cholera cases this week."
        manila_at = text.lower().index("manila")
        self.assertTrue(
            extractors.is_usable_place_name("Manila", text, manila_at)
        )

    def test_messi_sports_is_non_health(self):
        text = "Lionel Messi scored a hat-trick as Inter Miami won the football match."
        self.assertTrue(extractors.is_clearly_non_health_topic(text))

    def test_drought_food_security_is_non_health_without_disease(self):
        text = "Severe drought threatens food security and crop failure across Sudan."
        self.assertTrue(extractors.is_clearly_non_health_topic(text))

    def test_outbreak_not_flagged_non_health(self):
        text = (
            "A cholera outbreak with 120 confirmed cases was reported in Sudan this week."
        )
        self.assertFalse(
            extractors.is_clearly_non_health_topic(text, diseases=["Cholera"])
        )


if __name__ == "__main__":
    unittest.main()
