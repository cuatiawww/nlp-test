import os
import json
import time

from . import config, pipeline
from . schemas import AnalyzeRequest

# MATIKAN DEEPSEEK & KOSONGKAN API KEY 
config.AGENT_ENABLED = False
config.DEEPSEEK_API_KEY = ""

print("=== TESTING 2 NEW URLs WITHDEEPSEEK DISABLED (AGENT_ENABLED=False) ===")
print(f"AGENT_ENABLED: {config.AGENT_ENABLED}")
print(f"DEEPSEEK_API_KEY: '{config.DEEPSEEK_API_KEY}'")

with open('/tmp/test_2_urls.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for key, item in data.items():
    url = item['url']
    title = item['title']
    text = item['text']
    
    print("\n==========================================================")
    print(f"--- TESTING {key.upper()}: {title[:70]} ---")
    print(f"URL: {url}")
    print(f"Content Length: {len(text)} chars")
    print("==========================================================")
    
    req = AnalyzeRequest(
        text=text,
        title=title,
        source_url=url,
        source_type="web",
        source_name="New URL Test",
        interactive=False,
        rules_only=False
    )
    
    start_time = time.time()
    try:
        res = pipeline.run(req)
        elapsed = time.time() - start_time
        print(f"Status                : SUCCESS (Elapsed: {elapsed:.2f}s)")
        print(f"Disease Classification : {res.disease_classification}")
        print(f"Extracted Diseases     : {res.disease_extracted}")
        print(f"Primary Location       : {res.location_name}")
        print(f"Case Count            : {res.case_count}")
        print(f"Death Count            : {res.death_count}")
        print(f"Overall Confidence     : {res.confidence}")
        print(f"Sub-events Count       : {len(res.sub_events or [])}")
        if res.sub_events:
            for idx, se in enumerate(res.sub_events, 1):
                se_dict = se.model_dump() if hasattr(se, 'model_dump') else dict(se)
                print(f"  Sub-event #{idx}: {json.dumps(se_dict, indent=2, ensure_ascii=False)}")
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"Status: ERROR ({elapsed:.2f}s): {e}")

print("\n=== TEST 2 NEW URLs COMPLETED ===")
