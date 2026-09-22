import unittest

from app import extractors, multilingual, pipeline
from app.schemas import AnalyzeRequest


class TestSlice6LanguageVocabulary(unittest.TestCase):
    def test_malay_vs_indonesian_detection(self):
        malay_text = (
            "Kementerian Kesihatan ingin memaklumkan kepada orang ramai mengenai nasihat kesihatan "
            "semasa musim banjir di Negara Brunei Darussalam. Terdapat 5 kes kolera yang telah "
            "dilaporkan di kawasan terjejas."
        )
        self.assertEqual(multilingual.detect_language_profile(malay_text)["language"], "ms")

        indo_text = (
            "Kementerian Kesehatan melaporkan 8.372 kasus campak di Indonesia sepanjang tahun 2026. "
            "Pasien telah mendapatkan perawatan intensif di rumah sakit rujukan pemerintah."
        )
        self.assertEqual(multilingual.detect_language_profile(indo_text)["language"], "id")

    def test_native_and_malay_disease_evidence(self):
        cases = {
            "Dengue": [
                "Kementerian Kesihatan mengesahkan peningkatan kes demam denggi di seluruh negara.",
                "\u101e\u103d\u1031\u1038\u101c\u103d\u1014\u103a\u1010\u102f\u1015\u103a\u1000\u103d\u1031\u1038",
                "\u1782\u17d2\u179a\u17bb\u1793\u1788\u17b6\u1798",
                "\u0ec4\u0e82\u0ec9\u0e8d\u0eb8\u0e87\u0ea5\u0eb2\u0e8d",
            ],
            "Tuberculosis": [
                "Seramai 15 pesakit telah disahkan menghidap penyakit tibi di hospital daerah.",
                "\u1010\u102e\u1018\u102e",
            ],
            "Leptospirosis": [
                "Orang ramai dinasihatkan berwaspada terhadap penyakit kencing tikus selepas banjir.",
            ],
        }
        for disease, texts in cases.items():
            for text in texts:
                extracted = extractors.extract_diseases(text)
                self.assertTrue(
                    extractors.disease_has_textual_evidence(disease, text),
                    f"{disease} has no evidence in {text!r}; extracted={extracted}",
                )

    def test_mys01_full_pipeline_extraction(self):
        text = (
            "PUTRAJAYA, 9 Sept (Bernama) -- Kes demam denggi di negara ini meningkat 66 peratus "
            "kepada 65,979 kes sehingga minggu epidemiologi ke-35 tahun ini, berbanding 39,616 kes "
            "dalam tempoh sama tahun lepas. Menteri Kesihatan berkata jumlah kematian bagi tahun "
            "2025 terdapat 32 kes dan bagi 2026 tempoh masa yang sama terdapat 62 kes."
        )
        request = AnalyzeRequest(
            text=text,
            url="https://www.bernama.com/bm/news.php?id=2605025",
            title="Kes demam denggi meningkat",
            source_country="MY",
            interactive=True,
            rules_only=True,
        )
        result = pipeline.run(request)
        self.assertEqual(result.language, "ms")
        self.assertEqual(result.disease_classification, "Dengue")
        self.assertEqual(result.case_count, 65979)
        self.assertEqual(result.death_count, 62)
        self.assertEqual(result.country, "Malaysia")
        self.assertEqual(result.country_iso3, "MYS")
        self.assertGreaterEqual(len(result.sub_events), 1)

    def test_pattaya_hfmd_counts_are_not_timeout_dependent(self):
        text = (
            "Thailand recorded 53,362 hand, foot and mouth disease cases and one death "
            "nationwide this year. From January 1 through September 1, 5,408 patients "
            "required hospital treatment."
        )
        facts = extractors.predict_surveillance_facts(text, source_country="Thailand")
        disease_text = " ".join(facts.get("diseases") or [facts.get("disease") or ""]).lower()
        self.assertTrue("hfmd" in disease_text or "hand" in disease_text)
        self.assertEqual(facts.get("case_count"), 53362)
        self.assertEqual(facts.get("death_count"), 1)

    def test_pattaya_pipeline_keeps_one_death(self):
        text = (
            "Thailand recorded 53,362 hand, foot and mouth disease cases and one death "
            "nationwide this year. From January 1 through September 1, 5,408 patients "
            "required hospital treatment."
        )
        result = pipeline.run(
            AnalyzeRequest(
                text=text,
                url="https://example.com/pattaya",
                rules_only=True,
                interactive=True,
            )
        )
        self.assertEqual(result.case_count, 53362)
        self.assertEqual(result.death_count, 1)


if __name__ == "__main__":
    unittest.main()
