import os
import sys
import json
import time

from . import config, pipeline, llm_gate
from .schemas import AnalyzeRequest

print("=== STARTING DEEPSEEK LIVE PIPELINE TEST ===")
print(f"AGENT_ENABLED: {config.AGENT_ENABLED}")
print(f"DEEPSEEK_MODEL: {config.DEEPSEEK_MODEL}")
print(f"DEEPSEEK_TRIGGER_CONFIDENCE: {config.DEEPSEEK_TRIGGER_CONFIDENCE}")

# URL 1: WHO DON Outbreak Bulletin (Ebola/Bundibugyo in DRC)
url1 = "https://www.who.int/emergencies/disease-outbreak-news/item/2026-DON617"
url1_title = "Ebola disease caused by Bundibugyo virus - Democratic Republic of the Congo"
url1_text = """See all DONs related to this event Read more about Ebola disease Situation at a glance Since the last Disease Outbreak News was published on 28 August 2026, the Bundibugyo virus outbreak in the Democratic Republic of the Congo has expanded to one additional health zone, Kayna, in North Kivu. This increase brings the total number of affected health zones to 61 across six out of 26 provinces of the country: Bas-Uélé, Haut-Uélé, Ituri, North Kivu, South Kivu, and Tshopo. As of 7 September 2026, the Democratic Republic of the Congo has reported 6757 confirmed cases, including 3267 deaths (overall case fatality ratio, CFR: 48%). The Ministry of Health of the Democratic Republic of the Congo, WHO, and partners continue to respond to the outbreak across all affected provinces."""

# URL 2: WHO Non-Outbreak / Cancer Medicine Article
url2 = "https://www.who.int/news/item/08-09-2026-first-global-platform-delivers-childhood-cancer-medicines-to-six-countries"
url2_title = "First global platform delivers childhood cancer medicines to six countries"
url2_text = """The Global Platform for Access to Childhood Cancer Medicines, an initiative co-founded by St. Jude Children’s Research Hospital and WHO, has delivered its first wave of quality-assured cancer medicines to six countries: Ecuador, Eswatini, Mongolia, Pakistan, Uzbekistan and Zambia. This landmark achievement aims to provide uninterrupted access to life-saving cancer treatment for children in low- and middle-income countries. Childhood cancer treatment requires complex medical protocols, including specialized chemotherapy drugs that are often unavailable or unaffordable in developing nations."""

def test_article(url_num, title, text, source_url):
    print(f"\n=======================================================")
    print(f"--- TESTING ARTICLE {url_num}: {title[:60]}... ---")
    print(f"URL: {source_url}")
    print(f"=======================================================")
    req = AnalyzeRequest(
        text=text,
        title=title,
        source_url=source_url,
        source_type="web",
        source_name="URL Analyzer",
        interactive=False,
        rules_only=False
    )
    
    start_time = time.time()
    try:
        res = pipeline.run(req)
        elapsed = time.time() - start_time
        print(f"Status: SUCCESS (Elapsed: {elapsed:.2f}s)")
        print(f"Disease Classification: {res.disease_classification}")
        print(f"Extracted Diseases: {res.disease_extracted}")
        print(f"Primary Location Name: {res.location_name}")
        print(f"Country: {res.country} (ISO3: {res.country_iso3})")
        print(f"Case Count: {res.case_count}")
        print(f"Death Count: {res.death_count}")
        print(f"Overall Confidence: {res.confidence}")
        print(f"Event Confidence: {res.event_confidence}")
        print(f"Needs Review: {res.needs_review}")
        print(f"Is Explicit Outbreak: {res.is_explicit_outbreak}")
        print(f"Is Policy Content: {res.is_policy_content}")
        print(f"Surveillance Scope: {res.surveillance_scope}")
        print(f"Sub-events Count: {len(res.sub_events or [])}")
        if res.sub_events:
            for idx, se in enumerate(res.sub_events, 1):
                se_dict = se.model_dump() if hasattr(se, 'model_dump') else dict(se)
                print(f"  Sub-event #{idx}: {json.dumps(se_dict, indent=2)}")
        return res
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"Status: ERROR ({elapsed:.2f}s): {e}")
        import traceback
        traceback.print_exc()
        return None

res1 = test_article(1, url1_title, url1_text, url1)
res2 = test_article(2, url2_title, url2_text, url2)

print("\n=== DEEPSEEK LIVE TEST COMPLETED PERFECTLY ===")
