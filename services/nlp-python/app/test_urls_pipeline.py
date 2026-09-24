import json
import urllib.request
import re
from app.pipeline import run as run_pipeline
from app.schemas import AnalyzeRequest
from app.surveillance_extraction import build_surveillance_output

urls = [
    "https://www.nationthailand.com/health-wellness/40069034",
    "https://vietnamnews.vn/society/1694618/heightened-awareness-required-as-viet-nam-s-measles-cases-top-42-000.html",
    "https://en.sggp.org.vn/ministry-urges-preventive-measures-as-dengue-and-hfmd-cases-surge-post124960.html",
    "https://www.beritaharian.sg/malaysia/kes-denggi-johor-melonjak-150-6-cecah-11403-kes"
]

def fetch_url(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
            # Clean HTML to plain text
            text = re.sub(r'<script.*?>.*?</script>', ' ', html, flags=re.DOTALL)
            text = re.sub(r'<style.*?>.*?</style>', ' ', text, flags=re.DOTALL)
            text = re.sub(r'<.*?>', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()
            
            # Extract title
            title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else ""
            return title, text
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return "", ""

print("=== EMPIRICAL PIPELINE ANALYSIS OF 4 REAL-WORLD URLS ===\n")

for idx, url in enumerate(urls, 1):
    print(f"=================================================================================")
    print(f"[{idx}] URL: {url}")
    title, text = fetch_url(url)
    if not text:
        print("STATUS: FAILED TO FETCH CONTENT")
        continue

    print(f"TITLE: {title[:120]}")
    print(f"CONTENT LENGTH: {len(text)} chars")

    payload = AnalyzeRequest(
        text=text,
        url=url,
        title=title,
        interactive=False,
        rules_only=False
    )

    try:
        response = run_pipeline(payload)
        print(f"\n--- 1. ANALYSIS RESPONSE ---")
        print(f"  - is_health_related     : {response.is_health_related}")
        print(f"  - disease_classification: {response.disease_classification}")
        print(f"  - primary location      : {response.location_name} (Country: {response.country})")
        print(f"  - metrics (summary)     : Cases={response.case_count}, Deaths={response.death_count}, Confirmed={response.confirmed_cases}")
        print(f"  - SUB_EVENTS COUNT      : {len(response.sub_events)}")

        for s_idx, evt in enumerate(response.sub_events, 1):
            print(f"\n  [Sub-Event #{s_idx}]")
            print(f"    - Disease     : {evt.disease}")
            print(f"    - Country     : {evt.country}")
            print(f"    - Location    : {evt.location_name} (ADM1: {evt.admin1}, ADM2: {evt.admin2})")
            print(f"    - Case Count  : {evt.case_count} (New: {evt.new_cases}, Cum: {evt.cumulative_cases})")
            print(f"    - Death Count : {evt.death_count}")
            print(f"    - Evidence    : {evt.evidence[:160] if evt.evidence else 'None'}...")

        # Build matrix representation
        surv_output = build_surveillance_output(response.model_dump())
        print(f"\n--- 2. PROJECTED MATRIX DATA ---")
        print(f"  - Primary Disease : {surv_output.get('primary_disease')}")
        print(f"  - Country         : {surv_output.get('country')}")
        print(f"  - Location        : {surv_output.get('location_name')}")
        print(f"  - Cases           : {surv_output.get('case_count')}")
        print(f"  - Deaths          : {surv_output.get('death_count')}")

    except Exception as e:
        import traceback
        print(f"ERROR RUNNING PIPELINE: {e}")
        traceback.print_exc()

print("\n=== TEST COMPLETED ===")
