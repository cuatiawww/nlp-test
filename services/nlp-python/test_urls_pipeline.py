import json
import urllib.request
import re
from app.pipeline import run as run_pipeline
from app.schemas import AnalyzePayload
from app.surveillance_extraction import pipeline_analysis_to_matrix

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
            # Simple text extraction from html tags
            text = re.sub(r'<script.*?>.*?</script>', ' ', html, flags=re.DOTALL)
            text = re.sub(r'<style.*?>.*?</style>', ' ', text, flags=re.DOTALL)
            text = re.sub(r'<.*?>', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()
            
            # Extract title if present
            title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else ""
            return title, text
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return "", ""

print("=== STARTING EMPIRICAL PIPELINE TEST ===\n")

for idx, url in enumerate(urls, 1):
    print(f"--------------------------------------------------------------------------------")
    print(f"[{idx}] TESTING URL: {url}")
    title, text = fetch_url(url)
    if not text:
        print("FAILED TO FETCH CONTENT")
        continue

    print(f"TITLE: {title[:120]}")
    print(f"CONTENT LENGTH: {len(text)} chars")

    payload = AnalyzePayload(
        text=text,
        url=url,
        title=title,
        interactive=False,
        rules_only=False
    )

    try:
        response = run_pipeline(payload)
        print(f"\n--- NLP PIPELINE RESPONSE ---")
        print(f"is_health_related       : {response.is_health_related}")
        print(f"disease_classification  : {response.disease_classification}")
        print(f"disease_mentions        : {response.disease_mentions}")
        print(f"primary location        : {response.location_name} (Country: {response.country}, ADM1: {response.admin1})")
        print(f"metrics (summary)       : Cases={response.case_count}, Deaths={response.death_count}, Confirmed={response.confirmed_cases}")
        print(f"SUB_EVENTS COUNT        : {len(response.sub_events)}")

        for s_idx, evt in enumerate(response.sub_events, 1):
            print(f"\n  [Sub-Event #{s_idx}]")
            print(f"    - Disease     : {evt.disease}")
            print(f"    - Country     : {evt.country}")
            print(f"    - Location    : {evt.location_name} (ADM1: {evt.admin1}, ADM2: {evt.admin2})")
            print(f"    - Case Count  : {evt.case_count} (New: {evt.new_cases}, Cum: {evt.cumulative_cases})")
            print(f"    - Death Count : {evt.death_count}")
            print(f"    - Evidence    : {evt.evidence[:150]}...")

        # Transform to Matrix rows
        matrix_rows = pipeline_analysis_to_matrix(
            analysis=response.model_dump(),
            raw_report_id="test-raw-id",
            crawl_job_id="test-job-id"
        )
        print(f"\n--- MATRIX ROWS PROJECTED ({len(matrix_rows)} rows) ---")
        for m_idx, m in enumerate(matrix_rows, 1):
            print(f"  Matrix Row #{m_idx}: Disease={m.get('disease')} | Region={m.get('region')} | Country={m.get('country')} | Loc={m.get('province_city_case')} | Cases={m.get('number_of_cases')} | Deaths={m.get('number_of_deaths')}")

    except Exception as e:
        import traceback
        print(f"ERROR RUNNING PIPELINE: {e}")
        traceback.print_exc()

print("\n=== TEST COMPLETED ===")
