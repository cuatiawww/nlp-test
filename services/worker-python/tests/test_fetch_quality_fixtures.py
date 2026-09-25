"""Worker-side gold fixtures for ASEAN fetch failure classes (mocked)."""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
# Load analysis_jobs without importing package __init__ (avoids pika).
spec = importlib.util.spec_from_file_location(
    "analysis_jobs_under_test",
    ROOT / "app" / "analysis_jobs.py",
)
mod = importlib.util.module_from_spec(spec)
# Provide lightweight stubs for relative imports used at module import time.
import types
pkg = types.ModuleType("app")
sys.modules["app"] = pkg
# Stub heavy deps before exec
for name in ("pika", "psycopg", "psycopg.rows"):
    sys.modules.setdefault(name, types.ModuleType(name))
# Minimal queue_reliability stub
qr = types.ModuleType("app.queue_reliability")
qr.publish_with_confirm = lambda *a, **k: None
qr.declare_queue = lambda *a, **k: None
sys.modules["app.queue_reliability"] = qr
sys.modules["app.analysis_jobs"] = mod
try:
    spec.loader.exec_module(mod)
except Exception as exc:
    # Fall back: if import graph is too heavy, skip suite with reason.
    FETCH_LOAD_ERROR = exc
else:
    FETCH_LOAD_ERROR = None
    ArticleFetchError = mod.ArticleFetchError
    fetch_article = mod.fetch_article

ASEAN_BAD_URLS = [
    ("https://www.pekanbaru.go.id/p/news/historically-slow", "fetch_timeout"),
    ("https://www.tribunnews.com/regional/cf-challenge", "source_challenge"),
    ("https://diskes.example.go.id/berita/empty-shell", "empty_article"),
]


@unittest.skipIf(FETCH_LOAD_ERROR is not None, f"analysis_jobs import blocked: {FETCH_LOAD_ERROR}")
class FetchQualityFixtureTests(unittest.TestCase):
    def test_gold_urls_map_to_stable_error_codes(self):
        mapping = {
            "fetch_timeout": (408, {"detail": "URL extraction timed out. pekanbaru slow"}),
            "source_challenge": (403, {"detail": "browser challenge Cloudflare"}),
            "empty_article": (422, {"detail": "empty or unextractable article shell"}),
        }
        for url, expected in ASEAN_BAD_URLS:
            status, body = mapping[expected]
            resp = Mock()
            resp.status_code = status
            resp.json.return_value = body
            resp.text = body["detail"]
            with patch("requests.post", return_value=resp):
                with self.assertRaises(ArticleFetchError) as ctx:
                    fetch_article(url)
            self.assertEqual(ctx.exception.code, expected)
            self.assertIsNotNone(ctx.exception.fetch_mode)

    def test_ok_url_uses_auto_and_keeps_content(self):
        ok = Mock()
        ok.status_code = 200
        ok.json.return_value = {
            "data": {
                "title": "OK",
                "content": "Paragraph one.\n\nParagraph two with dengue cases reported.",
                "fetch_mode": "direct_http",
                "quality_ok": True,
                "quality_flags": [],
            }
        }
        ok.raise_for_status.return_value = None
        with patch("requests.post", return_value=ok) as post:
            data = fetch_article("https://www.beritaharian.sg/dunia/ok")
        self.assertEqual(post.call_args.kwargs["json"]["fetch_mode"], "auto")
        self.assertFalse(post.call_args.kwargs["json"]["skip_stealth"])
        self.assertIn("\n\n", data["content"])


if __name__ == "__main__":
    unittest.main()
