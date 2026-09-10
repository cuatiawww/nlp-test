import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.collectors.pdf_document import is_pdf, extract_pdf, try_pdf, PDFExtractionError

class PdfRoutingTests(unittest.TestCase):
    def test_detection_content_type_extension_and_magic(self):
        self.assertTrue(is_pdf("https://example.org/download", "application/pdf; charset=binary", b""))
        self.assertTrue(is_pdf("https://example.org/REPORT.PDF?id=1", "", b""))
        self.assertTrue(is_pdf("https://example.org/download", "", b"%PDF-1.4"))
        self.assertFalse(is_pdf("https://example.org/news", "text/html", b"<html>"))

    def test_flag_off_preserves_html_path_without_new_request(self):
        with patch("requests.get") as get:
            self.assertIsNone(try_pdf("https://example.org/news", enabled=False))
            get.assert_not_called()

    def test_original_uploaded_before_parse_failure(self):
        upload = Mock()
        with patch("pdfplumber.open", side_effect=ValueError("corrupt")):
            with self.assertRaises(PDFExtractionError) as result:
                extract_pdf(b"%PDF-corrupt", "https://example.org/a.pdf", upload)
        self.assertIn("pdf/", result.exception.object_path)
        self.assertEqual(upload.call_args_list[0].args[1], b"%PDF-corrupt")

    def test_tables_are_separate_from_narrative(self):
        page = Mock()
        table = Mock(bbox=(0, 10, 100, 50))
        table.extract.return_value = [["Disease", "Cases"], ["Dengue", "10"]]
        page.find_tables.return_value = [table]
        page.filter.return_value.extract_text.return_value = "Situation report"
        document = Mock(pages=[page], metadata={"Title": "Report"})
        context = Mock()
        context.__enter__ = Mock(return_value=document)
        context.__exit__ = Mock(return_value=False)
        with patch("pdfplumber.open", return_value=context):
            result = extract_pdf(b"%PDF", "https://example.org/a.pdf", Mock())
        self.assertEqual(result["content"], "Situation report")
        self.assertEqual(result["pdf_tables"][0]["rows"][1], ["Dengue", "10"])
        self.assertNotIn("10", result["content"])

    def test_scanned_pdf_requires_ocr_not_non_health(self):
        document = Mock(pages=[], metadata={})
        context = Mock()
        context.__enter__ = Mock(return_value=document)
        context.__exit__ = Mock(return_value=False)
        with patch("pdfplumber.open", return_value=context):
            with self.assertRaisesRegex(PDFExtractionError, "OCR"):
                extract_pdf(b"%PDF", "https://example.org/scan.pdf", Mock())

    def test_section_detection(self):
        page1 = Mock()
        page1.find_tables.return_value = []
        page1.extract_text.return_value = (
            "1. Situasi Penyakit Influenza\n"
            "Kasus terdeteksi di berbagai wilayah.\n\n"
            "2. Situasi Penyakit Mpox\n"
            "Sebanyak 12 kasus dilaporkan di Jakarta."
        )
        document = Mock(pages=[page1], metadata={"Title": "Laporan Surveilans"})
        context = Mock()
        context.__enter__ = Mock(return_value=document)
        context.__exit__ = Mock(return_value=False)
        with patch("pdfplumber.open", return_value=context):
            result = extract_pdf(b"%PDF", "https://example.org/surveilans.pdf", Mock())
        self.assertIn("sections", result)
        self.assertGreaterEqual(len(result["sections"]), 2)
        titles = [s["title"] for s in result["sections"]]
        self.assertTrue(any("Influenza" in t for t in titles))
        self.assertTrue(any("Mpox" in t for t in titles))
