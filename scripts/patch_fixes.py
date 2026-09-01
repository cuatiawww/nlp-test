import os
import re

print("=== Starting Patch Fixes ===")

# 1. Patch web_scraper.py
scraper_path = "/home/aspire_5/app/NLP-PENYAKIT/services/collector-python/app/collectors/web_scraper.py"
with open(scraper_path, "r", encoding="utf-8") as f:
    scraper_code = f.read()

target_scraper = '''    if not content:
        main_node = (
            soup.select_one("article")
            or soup.select_one("main")
            or soup.select_one('[role="main"]')
            or soup.select_one('.post-content, .entry-content, .article-content')
        )
        content = main_node.get_text(" ", strip=True) if main_node else ""
    content = " ".join((content or "").split())
    if len(content) < 80:
        raise ValueError("No sufficiently long main content found on page")'''

replacement_scraper = '''    if not content:
        main_node = (
            soup.select_one("article")
            or soup.select_one("main")
            or soup.select_one('[role="main"]')
            or soup.select_one('.post-content, .entry-content, .article-content, .content, .body, #content, #main-content')
        )
        content = main_node.get_text(" ", strip=True) if main_node else ""

    if not content or len(content) < 80:
        p_texts = [p.get_text(" ", strip=True) for p in soup.select("p, .teaser, .headline, .summary, .description, li") if len(p.get_text(" ", strip=True)) > 20]
        if p_texts:
            content = " ".join(p_texts)

    if not content or len(content) < 80:
        content = soup.get_text(" ", strip=True)

    content = " ".join((content or "").split())
    if len(content) < 30:
        raise ValueError("No sufficiently long main content found on page")'''

if target_scraper in scraper_code:
    scraper_code = scraper_code.replace(target_scraper, replacement_scraper, 1)
    with open(scraper_path, "w", encoding="utf-8") as f:
        f.write(scraper_code)
    print("✅ Successfully patched web_scraper.py")
else:
    print("⚠️ Target not found in web_scraper.py")

# 2. Patch collector main.py
main_path = "/home/aspire_5/app/NLP-PENYAKIT/services/collector-python/app/main.py"
with open(main_path, "r", encoding="utf-8") as f:
    main_code = f.read()

target_main = '''        try:
            import httpx
            import trafilatura
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            }
            async with httpx.AsyncClient(follow_redirects=True, timeout=25.0, headers=headers) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    text_content = trafilatura.extract(res.text) or ""
                    metadata = trafilatura.extract_metadata(res.text)
                    title = (metadata.title or "").strip() if metadata else ""
                    if text_content:
                        return {
                            "success": True,
                            "data": {
                                "url": url,
                                "title": title,
                                "content": text_content,
                                "fetch_mode": "http-fallback",
                                "http_status": 200,
                                "source_country": "Indonesia",
                                "published_at": metadata.date if metadata and metadata.date else "",
                            }
                        }
        except Exception as fb_err:
            logger.warning("HTTP direct fallback failed for %s: %s", url, fb_err)'''

replacement_main = '''        try:
            import urllib.request
            import trafilatura
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
                }
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                if resp.status == 200:
                    html_bytes = resp.read()
                    html_text = html_bytes.decode("utf-8", errors="replace")
                    text_content = trafilatura.extract(html_text) or ""
                    metadata = trafilatura.extract_metadata(html_text)
                    title = (metadata.title or "").strip() if metadata else ""
                    if text_content:
                        return {
                            "success": True,
                            "data": {
                                "url": url,
                                "title": title,
                                "content": text_content,
                                "fetch_mode": "http-fallback",
                                "http_status": 200,
                                "source_country": "Indonesia",
                                "published_at": metadata.date if metadata and metadata.date else "",
                            }
                        }
        except Exception as fb_err:
            logger.warning("HTTP direct fallback failed for %s: %s", url, fb_err)'''

if target_main in main_code:
    main_code = main_code.replace(target_main, replacement_main, 1)
    with open(main_path, "w", encoding="utf-8") as f:
        f.write(main_code)
    print("✅ Successfully patched collector main.py")
else:
    print("⚠️ Target not found in collector main.py")

# 3. Patch test_accuracy.py
test_path = "/home/aspire_5/app/NLP-PENYAKIT/test_accuracy.py"
with open(test_path, "r", encoding="utf-8") as f:
    test_code = f.read()

target_test_call = '''def call_api(url: str) -> dict:
    last_err = None
    for target in (API_URL, ALT_API_URL):
        req = urllib.request.Request(
            target,
            data=json.dumps({"url": url}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                return json.loads(resp.read())
        except Exception as e:
            last_err = e
            continue
    return {"success": False, "error": str(last_err)}'''

replacement_test_call = '''def call_api(url: str) -> dict:
    req = urllib.request.Request(
        API_URL,
        data=json.dumps({"url": url}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"success": False, "error": str(e)}'''

if target_test_call in test_code:
    test_code = test_code.replace(target_test_call, replacement_test_call, 1)
    with open(test_path, "w", encoding="utf-8") as f:
        f.write(test_code)
    print("✅ Successfully patched test_accuracy.py")
else:
    print("⚠️ Target not found in test_accuracy.py")

print("=== Patches completed ===")
