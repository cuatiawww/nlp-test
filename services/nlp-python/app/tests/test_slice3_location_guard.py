import unittest
from app.schemas import AnalyzeRequest
from app import pipeline, extractors, config


class TestSlice3LocationGuard(unittest.TestCase):
    def test_brunei_negara_leak_prevention(self):
        """BRN-01: 'Negara Brunei Darussalam' must NOT resolve to Negara/Bali/Indonesia."""
        text = (
            "Kementerian Kesihatan ingin memaklumkan kepada orang ramai mengenai nasihat kesihatan "
            "semasa musim banjir di Negara Brunei Darussalam. Terdapat 5 kes kolera yang telah dilaporkan "
            "di kawasan terjejas."
        )
        req = AnalyzeRequest(
            url="https://moh.gov.bn/news/nasihat-kesihatan-semasa-banjir/",
            text=text,
            rules_only=True,
        )
        resp = pipeline.run(req)
        self.assertEqual(resp.country, "Brunei")
        self.assertEqual(resp.country_iso3, "BRN")
        self.assertNotIn("Bali", str(resp.province or ""))
        self.assertNotIn("Jembrana", str(resp.city or ""))
        self.assertTrue(extractors.coords_in_country_bbox(resp.latitude, resp.longitude, "Brunei"))

        self.assertGreaterEqual(len(resp.sub_events), 1)
        for evt in resp.sub_events:
            self.assertEqual(evt.country, "Brunei")
            self.assertEqual(evt.country_iso3, "BRN")
            self.assertNotIn("Bali", str(evt.admin1 or ""))
            self.assertNotIn("Jembrana", str(evt.admin2 or ""))
            if evt.latitude is not None and evt.longitude is not None:
                self.assertTrue(
                    extractors.coords_in_country_bbox(evt.latitude, evt.longitude, "Brunei"),
                    f"Coords {evt.latitude}, {evt.longitude} must sit inside Brunei bbox",
                )

        for loc in resp.locations:
            self.assertNotEqual(
                loc.country,
                "Indonesia",
                f"Location matrix must not leak Indonesia when text only mentioned Brunei: {loc}",
            )
            if loc.latitude is not None and loc.longitude is not None and loc.country:
                self.assertTrue(
                    extractors.coords_in_country_bbox(loc.latitude, loc.longitude, loc.country),
                    f"Location item {loc.name} coords outside {loc.country} bbox",
                )

    def test_split_admin_place_country_conflict_guard(self):
        """split_admin_place must return None, None when entity belongs to another country."""
        prov, city = extractors.split_admin_place("Negara", "Brunei")
        self.assertIsNone(prov, "Foreign province (Bali) must not be returned for Brunei")
        self.assertIsNone(city, "Foreign city (Jembrana) must not be returned for Brunei")

        # Valid entity in Indonesia should still return its admin hierarchy
        prov_id, city_id = extractors.split_admin_place("Negara", "Indonesia")
        self.assertEqual(prov_id, "Bali")
        self.assertEqual(city_id, "Jembrana")

    def test_bbox_out_of_bounds_enforcement(self):
        """Events must enforce coords inside country bbox; out-of-bbox points reset to centroid."""
        text = "Malaysia melaporkan 100 kasus dengki di Kuala Lumpur. Situasi terkendali."
        req = AnalyzeRequest(
            url="https://example.com/malaysia-report",
            text=text,
            rules_only=True,
        )
        resp = pipeline.run(req)
        self.assertEqual(resp.country, "Malaysia")
        self.assertEqual(resp.country_iso3, "MYS")
        self.assertTrue(extractors.coords_in_country_bbox(resp.latitude, resp.longitude, "Malaysia"))

    def test_multi_country_roundup_isolation(self):
        """Genuine multi-country articles preserve distinct countries mentioned in text."""
        text = (
            "Regional health update: Cambodia reported 25 cases of avian influenza in Kampot. "
            "Meanwhile, Lao PDR confirmed 10 cases of dengue in Vientiane."
        )
        req = AnalyzeRequest(
            url="https://example.com/asean-roundup",
            text=text,
            rules_only=True,
        )
        resp = pipeline.run(req)
        event_countries = {evt.country for evt in resp.sub_events if evt.country}
        self.assertTrue("Cambodia" in event_countries)
        self.assertTrue("Lao PDR" in event_countries or "Laos" in event_countries)
        for evt in resp.sub_events:
            if evt.country:
                self.assertTrue(
                    extractors.coords_in_country_bbox(evt.latitude, evt.longitude, evt.country),
                    f"Sub-event {evt.location_name} coords must be inside {evt.country} bbox",
                )


if __name__ == "__main__":
    unittest.main()
