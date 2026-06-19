#!/usr/bin/env python3
"""
Scraper & Data Generator untuk Dashboard Laporan KIE
- Scrape surkarkes.kemkes.go.id untuk semua minggu tersedia
- Ekstrak 3 tabel aktivitas + Poin Utama
- Generate dashboard-data.json
- Generate Excel backup (.xlsx)

Usage:
    python3 update-data.py          # scrape + generate semua
    python3 update-data.py --fetch  # hanya scrape
    python3 update-data.py --gen    # hanya generate dari raw yang sudah ada
"""

import requests
import re
import json
import os
import sys
import math
from bs4 import BeautifulSoup
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, numbers
from openpyxl.utils import get_column_letter

BASE_URL = "https://surkarkes.kemkes.go.id/ringkasan-kasus"
RAW_FILE = "/tmp/dashboard-raw-data.json"
DATA_FILE = "src/components/dashboard-campus/dashboard-data.json"
EXCEL_FILE = "dashboard-data-backup.xlsx"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

INDONESIA_PROVINCES = [
    "Semua Provinsi", "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau",
    "Kepulauan Riau", "Jambi", "Sumatera Selatan", "Bangka Belitung", "Bengkulu",
    "Lampung", "DKI Jakarta", "Jawa Barat", "Banten", "Jawa Tengah",
    "DI Yogyakarta", "Jawa Timur", "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur",
    "Kalimantan Barat", "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur",
    "Kalimantan Utara", "Sulawesi Utara", "Sulawesi Tengah", "Sulawesi Selatan",
    "Sulawesi Tenggara", "Sulawesi Barat", "Gorontalo", "Maluku",
    "Maluku Utara", "Papua", "Papua Barat", "Papua Selatan", "Papua Tengah",
    "Papua Pegunungan", "Papua Barat Daya"
]


def fetch_page(week, year):
    url = f"{BASE_URL}/{week:02d}/{year}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            return resp.text
        return None
    except Exception as e:
        print(f"  Error fetching {url}: {e}")
        return None


def is_not_found(html):
    return "HALAMAN TIDAK DITEMUKAN" in html or "Page Not Found" in html


def extract_title(html):
    m = re.search(r'<title>(.*?)</title>', html, re.DOTALL)
    if m:
        return m.group(1).strip()
    return ""


def extract_date_from_title(title):
    """Extract date range and week number from title."""
    # e.g., "Laporan Pengawasan Kasus Influenza dan COVID-19: 13 Jul (minggu ke 28)"
    m = re.search(r':\s*(.*?)\s*\(minggu\s*ke\s*(\d+)\)', title)
    if m:
        return m.group(1).strip(), int(m.group(2))
    return title, 0


def extract_tables(html):
    """Extract 3 activity tables from HTML."""
    soup = BeautifulSoup(html, 'html.parser')
    tables = soup.find_all('table')
    
    result = {
        "influenza": [],
        "covid19": [],
        "rsv": [],
    }
    
    table_idx = 0
    for table in tables:
        rows = table.find_all('tr')
        data_rows = []
        for row in rows:
            cells = row.find_all(['td', 'th'])
            row_data = []
            for cell in cells:
                text = cell.get_text(strip=True)
                text = re.sub(r'\s+', ' ', text).strip()
                row_data.append(text)
            if row_data:
                data_rows.append(row_data)
        
        # Skip header-only tables (like if only 1 row which is header)
        if len(data_rows) <= 1:
            continue
        
        # Check header to identify table
        header = data_rows[0] if data_rows else []
        if len(header) >= 1:
            first_header = header[0].lower() if header[0] else ""
        else:
            continue
        
        # Identify table type by content
        table_text = " ".join([" ".join(r) for r in data_rows]).lower()
        
        if table_idx == 0:
            # First table is Influenza Activity
            for row in data_rows[1:]:
                if len(row) >= 4:
                    result["influenza"].append({
                        "indikator": row[0],
                        "tren": row[1],
                        "level": row[2],
                        "keterangan": row[3]
                    })
                elif len(row) >= 3:
                    result["influenza"].append({
                        "indikator": row[0],
                        "tren": row[1],
                        "level": row[2],
                        "keterangan": ""
                    })
            table_idx += 1
        elif table_idx == 1:
            # Second table is COVID-19 Activity
            for row in data_rows[1:]:
                if len(row) >= 2:
                    result["covid19"].append({
                        "indikator": row[0],
                        "tren": row[1] if len(row) > 1 else "",
                        "level": row[2] if len(row) > 2 else "",
                        "keterangan": row[3] if len(row) > 3 else ""
                    })
            table_idx += 1
        elif table_idx == 2:
            # Third table is RSV ACTIVITY
            for row in data_rows[1:]:
                if len(row) >= 2:
                    result["rsv"].append({
                        "indikator": row[0],
                        "tren": row[1] if len(row) > 1 else "",
                        "level": row[2] if len(row) > 2 else "",
                        "keterangan": row[3] if len(row) > 3 else ""
                    })
            table_idx += 1
    
    # If no tables found via BeautifulSoup, try regex fallback
    if table_idx == 0:
        result = extract_tables_regex(html)
    
    return result, table_idx > 0


def extract_tables_regex(html):
    """Fallback: regex-based table extraction."""
    result = {"influenza": [], "covid19": [], "rsv": []}
    
    tables = re.findall(r'<table[^>]*>.*?</table>', html, re.DOTALL)
    
    for ti, table_html in enumerate(tables):
        rows = re.findall(r'<tr[^>]*>.*?</tr>', table_html, re.DOTALL)
        data_rows = []
        for row_html in rows:
            cells = re.findall(r'<t[dh][^>]*>.*?</t[dh]>', row_html, re.DOTALL)
            texts = []
            for c in cells:
                text = re.sub(r'<[^>]+>', '', c).strip()
                text = re.sub(r'&nbsp;', ' ', text).strip()
                text = re.sub(r'\s+', ' ', text).strip()
                texts.append(text)
            if texts:
                data_rows.append(texts)
        
        if len(data_rows) <= 1:
            continue
        
        if ti == 0:
            for row in data_rows[1:]:
                entry = {"indikator": row[0] if len(row) > 0 else "",
                         "tren": row[1] if len(row) > 1 else "",
                         "level": row[2] if len(row) > 2 else "",
                         "keterangan": row[3] if len(row) > 3 else ""}
                if not any(e.get("indikator") == entry["indikator"] for e in result["influenza"]):
                    result["influenza"].append(entry)
        elif ti == 1:
            for row in data_rows[1:]:
                entry = {"indikator": row[0] if len(row) > 0 else "",
                         "tren": row[1] if len(row) > 1 else "",
                         "level": row[2] if len(row) > 2 else "",
                         "keterangan": row[3] if len(row) > 3 else ""}
                if not any(e.get("indikator") == entry["indikator"] for e in result["covid19"]):
                    result["covid19"].append(entry)
        elif ti == 2:
            for row in data_rows[1:]:
                entry = {"indikator": row[0] if len(row) > 0 else "",
                         "tren": row[1] if len(row) > 1 else "",
                         "level": row[2] if len(row) > 2 else "",
                         "keterangan": row[3] if len(row) > 3 else ""}
                if not any(e.get("indikator") == entry["indikator"] for e in result["rsv"]):
                    result["rsv"].append(entry)
    
    return result


def extract_poin_utama(html):
    """Extract Poin Utama paragraph text — the narrative content right after
    the 'Poin Utama' heading. Uses increasingly broader strategies."""
    soup = BeautifulSoup(html, 'html.parser')
    
    # Strategy A: govspeak div → <h2 id="poin_utama"> → collect text from
    # ALL sibling elements (any tag) until we hit another heading or table.
    govspeak = soup.find('div', class_='govspeak')
    if govspeak:
        h2 = govspeak.find('h2', id='poin_utama')
        if not h2:
            h2 = govspeak.find('h2', string=re.compile(r'Poin\s+Utama', re.IGNORECASE))
        if h2:
            texts = []
            nxt = h2.find_next_sibling()
            for _ in range(20):  # safety cap
                if nxt is None or nxt.name in ['h1', 'h2', 'h3', 'h4', 'table']:
                    break
                # Content may be in <p>, <div>, <span>, <ul>, <li>, etc.
                t = nxt.get_text(separator=' ', strip=True)
                if t and len(t) > 20:
                    texts.append(t)
                    if len(texts) >= 3:
                        break
                nxt = nxt.find_next_sibling()
            if texts:
                return " ".join(texts)
    
    # Strategy B: find content between <h2 id="poin_utama"> and the next <h2>,
    # but truncate at section title words to avoid bleeding into table sections.
    for pattern in [
        r'<h2[^>]*id="poin_utama"[^>]*>.*?</h2>(.*?)(?=<h2)',
        r'<h2[^>]*>\s*Poin\s+Utama\s*</h2>(.*?)(?=<h2)',
    ]:
        m = re.search(pattern, html, re.DOTALL | re.IGNORECASE)
        if m:
            text = re.sub(r'<[^>]+>', ' ', m.group(1))
            text = re.sub(r'&nbsp;', ' ', text)
            text = re.sub(r'\s+', ' ', text).strip()
            # Truncate at the first section heading-like word
            for stop in ['Influenza Activity', 'COVID-19 Activity', 'RSV ACTIVITY',
                          'Ringkasan Kasus', 'Surveilans', 'Cakupan Vaksin',
                          'Metodologi', 'Kontak', 'Informasi', 'Grafik']:
                idx = text.find(stop)
                if idx > 0:
                    text = text[:idx]
            text = text.strip()
            if len(text) > 50:
                return text
    
    # Strategy C: find "Poin Utama" text area (up to ~2000 chars)
    for m in re.finditer(r'Poin\s+Utama.{0,2500}', html, re.DOTALL | re.IGNORECASE):
        raw = m.group(0)
        text = re.sub(r'<[^>]+>', ' ', raw)
        text = re.sub(r'&nbsp;', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        # Keep only up to known section titles
        for stop in ['Influenza Activity', 'COVID-19 Activity', 'RSV ACTIVITY',
                      'Ringkasan Kasus', 'Surveilans', 'Cakupan Vaksin',
                      'Metodologi', 'Kontak', 'Informasi']:
            idx = text.find(stop)
            if idx > 0:
                text = text[:idx]
        text = text.strip()
        if len(text) > 50:
            return text
    
    # Strategy D: just find "Influenza dan COVID-19 dipantau" text
    m = re.search(r'Influenza\s+dan\s+COVID-19\s+dipantau.{0,1500}', html, re.DOTALL)
    if m:
        text = re.sub(r'<[^>]+>', ' ', m.group(0))
        text = re.sub(r'&nbsp;', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        text = re.split(r'(?:Influenza Activity|COVID-19)', text)[0]
        text = text.strip()
        if len(text) > 50:
            return text
    
    return ""


def extract_poin_numbers(poin_text):
    """Extract structured numbers from Poin Utama text.
    Looks for patterns like:
    - "dari X pemeriksaan"
    - "terdapat Y kasus positif"
    - "positivity rate sebesar Z%"
    - "JKJ varian dominan..."
    Uses LAST match to handle duplicate text from copy-paste errors.
    """
    result = {}
    
    matches = re.findall(r'dari\s+([\d.,]+)\s*pemeriksaan', poin_text)
    if matches:
        result["examinations"] = parse_number(matches[-1])
    
    matches = re.findall(r'terdapat\s+([\d.,]+)\s*kasus\s*positif', poin_text)
    if matches:
        result["positive_cases"] = parse_number(matches[-1])
    
    matches = re.findall(r'positivity\s*rate\s*(?:sebesar|yakni|yaitu)?\s*([\d.,]+)%?', poin_text, re.IGNORECASE)
    if matches:
        result["positivity_rate"] = parse_number(matches[-1])
    
    # Sentinel counts
    m = re.search(r'(\d+)\s*Puskesmas', poin_text)
    if m:
        result["puskesmas"] = int(m.group(1))
    m = re.search(r'(\d+)\s*Rumah\s*Sakit', poin_text)
    if m:
        result["rs"] = int(m.group(1))
    m = re.search(r'(\d+)\s*Balai\s*Karantina', poin_text)
    if m:
        result["balai_karantina"] = int(m.group(1))
    
    return result


def clean_full_page_text(html):
    """Convert HTML to plain text: &nbsp;→space, strip tags, collapse whitespace."""
    text = html
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def extract_exams_from_full_page(html):
    """Scan full page for 'dari X pemeriksaan' — uses LAST match (handles copy-paste)."""
    text = clean_full_page_text(html)
    exams = re.findall(r'dari\s+([\d.,]+)\s*pemeriksaan', text)
    pos = re.findall(r'terdapat\s+([\d.,]+)\s*kasus\s*positif', text)
    pr = re.findall(r'positivity\s*rate\s*(?:sebesar|yakni|yaitu)?\s*([\d.,]+)%?', text, re.IGNORECASE)
    return {
        'examinations': parse_number(exams[-1]) if exams else 0,
        'positive_cases': parse_number(pos[-1]) if pos else 0,
        'positivity_rate': parse_number(pr[-1]) if pr else 0,
    }


def parse_number(s):
    """Parse Indonesian number format (e.g., 4,68 -> 4.68, 1.234 -> 1234)."""
    s = s.strip().replace(' ', '')
    if ',' in s and '.' in s:
        # Mixed format like 1.234,56 -> 1234.56
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        # European style like 4,68 -> 4.68
        # But need to check if it's a thousands separator
        # If only one comma and it's followed by exactly 2 digits, it's decimal
        parts = s.split(',')
        if len(parts) == 2 and len(parts[1]) <= 3:
            s = s.replace(',', '.')
        else:
            s = s.replace(',', '')
    try:
        return float(s)
    except ValueError:
        return 0.0


def get_table_value(tables, table_name, indikator_keyword, field='level'):
    """Get a specific value from the scraped tables."""
    table = tables.get(table_name, [])
    for row in table:
        if indikator_keyword.lower() in row.get('indikator', '').lower():
            if field == 'level':
                return row.get('level', '')
            elif field == 'tren':
                return row.get('tren', '')
            elif field == 'keterangan':
                return row.get('keterangan', '')
    return ''


def extract_pr_from_keterangan(keterangan):
    """Extract percentage from keterangan text like 'menjadi 4% dari 20%'."""
    m = re.search(r'menjadi\s*([\d.,]+)%', keterangan)
    if m:
        return parse_number(m.group(1))
    return 0.0


def scrape_all_weeks():
    """Scrape all available weeks from surkarkes.kemkes.go.id."""
    raw_data = {}
    
    years = [2025, 2026]
    
    for year in years:
        raw_data[str(year)] = {}
        # Scan full range (epi year may have gaps). Max week = 55 to be safe.
        max_weeks = 55
        
        for week_num in range(1, max_weeks + 1):
            sys.stdout.write(f"\r  {year} M{week_num:02d}... ")
            sys.stdout.flush()
            
            html = fetch_page(week_num, year)
            if not html:
                continue
            
            if is_not_found(html):
                continue
            
            title = extract_title(html)
            date_str, week_from_title = extract_date_from_title(title)
            
            tables, has_tables = extract_tables(html)
            poin_utama = extract_poin_utama(html)
            poin_numbers = extract_poin_numbers(poin_utama)
            
            # Full-page scan untuk pemeriksaan (lebih akurat, handle &nbsp; + copypaste)
            full_page = extract_exams_from_full_page(html)
            if full_page['examinations'] > 0:
                poin_numbers['examinations'] = full_page['examinations']
            if full_page['positive_cases'] > 0:
                poin_numbers['positive_cases'] = full_page['positive_cases']
            if full_page['positivity_rate'] > 0 and not poin_numbers.get('positivity_rate'):
                poin_numbers['positivity_rate'] = full_page['positivity_rate']
            
            week_key = f"M{week_num:02d}"
            
            # Only store if there's actual data (tables or Poin Utama)
            if has_tables or poin_utama:
                entry = {
                    "week": week_num,
                    "year": year,
                    "date": date_str,
                    "title": title,
                    "has_tables": has_tables,
                    "influenza": tables["influenza"],
                    "covid19": tables["covid19"],
                    "rsv": tables["rsv"],
                    "poin_utama": poin_utama,
                    "poin_numbers": poin_numbers
                }
                raw_data[str(year)][week_key] = entry
                print(f"✓ {'T' if has_tables else 'N'} ({len(tables['influenza'])} + {len(tables['covid19'])} + {len(tables['rsv'])} tables, poin={poin_utama[:80]})")
    
    print()
    return raw_data


def compute_metrics(raw_data):
    """Compute all dashboard metrics from raw scraped data."""
    
    # Flatten all weeks into a sorted list
    all_weeks = []
    for year in sorted(raw_data.keys()):
        for week_key in sorted(raw_data[year].keys(), key=lambda w: int(w.replace('M',''))):
            entry = raw_data[year][week_key]
            all_weeks.append(entry)
    
    if not all_weeks:
        print("ERROR: No data found!")
        return None
    
    latest = all_weeks[-1]
    
    # --- Collect per-indicator values ---
    pr_influenza_vals = []
    pr_covid_vals = []
    rsv_vals = []
    multipatogen_vals = []
    ili_vals = []
    sari_vals = []
    level_counts = {"rendah": 0, "luar musim": 0, "sedang": 0, "tinggi": 0}
    
    total_examinations = 0
    total_positive = 0
    
    for entry in all_weeks:
        pn = entry.get("poin_numbers", {})
        if pn.get("examinations"):
            total_examinations += int(pn["examinations"])
        if pn.get("positive_cases"):
            total_positive += int(pn["positive_cases"])
        
        # Extract PR COVID from tables or Poin Utama
        covid_rows = entry.get("covid19", [])
        for row in covid_rows:
            if "positiv" in row.get("indikator", "").lower():
                keterangan = row.get("keterangan", "")
                pr = extract_pr_from_keterangan(keterangan)
                if pr > 0:
                    pr_covid_vals.append(pr)
                break
        
        if not covid_rows and pn.get("positivity_rate"):
            pr_covid_vals.append(pn["positivity_rate"])
        
        # Extract influenza data
        flu_rows = entry.get("influenza", [])
        
        # Count level once per week (first row with a level, or default Rendah)
        week_level_found = ''
        for row in flu_rows:
            level = row.get("level", "").lower().strip()
            if level:
                week_level_found = level
                break
        # Normalize variants
        wk_lvl = week_level_found.replace('diuar', 'di luar').replace('diluar', 'di luar')
        if not wk_lvl or "rendah" in wk_lvl:
            level_counts["rendah"] += 1
        elif "luar musim" in wk_lvl:
            level_counts["luar musim"] += 1
        elif "sedang" in wk_lvl:
            level_counts["sedang"] += 1
        elif "tinggi" in wk_lvl:
            level_counts["tinggi"] += 1
        else:
            level_counts["rendah"] += 1  # fallback
        
        for row in flu_rows:
            ind = row.get("indikator", "").lower()
            keterangan = row.get("keterangan", "")
            
            if "ili" in ind:
                pr = extract_pr_from_keterangan(keterangan)
                if pr > 0:
                    ili_vals.append(pr)
            elif "sari" in ind:
                pr = extract_pr_from_keterangan(keterangan)
                if pr > 0:
                    sari_vals.append(pr)
            elif "positiv" in ind and "influenza" in ind:
                pr = extract_pr_from_keterangan(keterangan)
                if pr > 0:
                    pr_influenza_vals.append(pr)
        
        # Extract RSV data
        rsv_rows = entry.get("rsv", [])
        for row in rsv_rows:
            ind = row.get("indikator", "").lower()
            keterangan = row.get("keterangan", "")
            if "rsv" in ind:
                pr = extract_pr_from_keterangan(keterangan)
                if pr > 0:
                    rsv_vals.append(pr)
            elif "multipatogen" in ind:
                pr = extract_pr_from_keterangan(keterangan)
                if pr > 0:
                    multipatogen_vals.append(pr)
    
    # --- Compute metrics ---
    def avg(lst):
        return round(sum(lst) / len(lst), 1) if lst else 0.0
    
    # Latest values
    latest_pr_covid = pr_covid_vals[-1] if pr_covid_vals else 0
    latest_pr_influenza = pr_influenza_vals[-1] if pr_influenza_vals else 0
    latest_examinations = latest.get("poin_numbers", {}).get("examinations", 0)
    latest_positive = latest.get("poin_numbers", {}).get("positive_cases", 0)
    
    # Determine latest influenza level
    latest_flu_rows = latest.get("influenza", [])
    latest_flu_level = "Rendah"
    for row in latest_flu_rows:
        if "positiv" in row.get("indikator", "").lower():
            lvl = row.get("level", "")
            if lvl:
                latest_flu_level = lvl
            break
    
    # Normalize to just the category word
    lvl_lower = latest_flu_level.lower()
    if 'rendah' in lvl_lower:
        latest_flu_level = 'Rendah'
    elif 'sedang' in lvl_lower:
        latest_flu_level = 'Sedang'
    elif 'tinggi' in lvl_lower:
        latest_flu_level = 'Tinggi'
    elif 'luar musim' in lvl_lower:
        latest_flu_level = 'Di Luar Musim'
    else:
        latest_flu_level = 'Rendah'
    
    # --- Build trend data ---
    # Build PR COVID trend — all weeks
    trend_data = []
    seen_years_weeks = set()
    for entry in all_weeks:
        wk = entry["week"]
        yr = entry["year"]
        
        # Find PR COVID-19 for this week
        covid_rows = entry.get("covid19", [])
        pr_val = 0
        for row in covid_rows:
            if "positiv" in row.get("indikator", "").lower():
                pr_val = extract_pr_from_keterangan(row.get("keterangan", ""))
                break
        if not pr_val:
            pn = entry.get("poin_numbers", {})
            pr_val = pn.get("positivity_rate", 0)
        
        label = f"M{wk:02d}/{yr}"
        if label not in seen_years_weeks:
            seen_years_weeks.add(label)
            trend_data.append({
                "year": label,
                "value": round(pr_val, 1)
            })
    
    # Ensure latest week is included
    latest_label = f"M{latest['week']:02d}/{latest['year']}"
    if not trend_data or trend_data[-1]["year"] != latest_label:
        trend_data.append({
            "year": latest_label,
            "value": round(latest_pr_covid, 1)
        })
    
    # --- Build aspectScores (6 indicators) ---
    aspect_scores = [
        {"label": "Positivity Rate Influenza", "value": avg(pr_influenza_vals), "tone": "bg-teal-600"},
        {"label": "Positivity Rate COVID-19", "value": avg(pr_covid_vals), "tone": "bg-cyan-600"},
        {"label": "Proporsi RSV", "value": avg(rsv_vals), "tone": "bg-lime-500"},
        {"label": "Multipatogen Lainnya", "value": avg(multipatogen_vals), "tone": "bg-green-600"},
        {"label": "Proporsi ILI", "value": avg(ili_vals), "tone": "bg-pink-600"},
        {"label": "Proporsi SARI", "value": avg(sari_vals), "tone": "bg-sky-500"}
    ]
    
    # --- Build starDistribution ---
    total_level = sum(level_counts.values()) or 1
    star_dist = [
        {"label": "Aktivitas Rendah", "total": level_counts["rendah"] + level_counts["tinggi"],
         "percent": round((level_counts["rendah"] + level_counts["tinggi"]) / total_level * 100, 1),
         "tone": "bg-emerald-500"},
        {"label": "Di Luar Musim", "total": level_counts["luar musim"],
         "percent": round(level_counts["luar musim"] / total_level * 100, 1),
         "tone": "bg-lime-500"},
        {"label": "Aktivitas Sedang", "total": level_counts["sedang"],
         "percent": round(level_counts["sedang"] / total_level * 100, 1),
         "tone": "bg-yellow-500"}
    ]
    
    # --- Build metrics (5 cards) ---
    prev_week_pr_covid = pr_covid_vals[-2] if len(pr_covid_vals) >= 2 else 0
    delta_pr = latest_pr_covid - prev_week_pr_covid
    delta_str = f"Naik {abs(delta_pr):.1f}% dari minggu lalu" if delta_pr > 0 else \
                (f"Turun {abs(delta_pr):.1f}% dari minggu lalu" if delta_pr < 0 else "Tetap dari minggu lalu")
    
    # Calculate delta for PR Influenza
    prev_pr_flu = pr_influenza_vals[-2] if len(pr_influenza_vals) >= 2 else 0
    delta_flu = latest_pr_influenza - prev_pr_flu
    delta_flu_str = f"Naik {abs(delta_flu):.1f}% dari minggu lalu" if delta_flu > 0 else \
                    (f"Turun {abs(delta_flu):.1f}% dari minggu lalu" if delta_flu < 0 else "Tetap dari minggu lalu")
    
    metrics = [
        {"title": "Total Pemeriksaan COVID-19", "value": str(int(total_examinations)),
         "delta": f"Minggu {latest['week']}: {int(latest_examinations)} pemeriksaan",
         "iconKey": "school", "iconTone": "bg-teal-100 text-teal-700"},
        {"title": "Positivity Rate COVID-19", "value": f"{latest_pr_covid:.1f}%",
         "delta": delta_str,
         "iconKey": "submit", "iconTone": "bg-sky-100 text-sky-700"},
        {"title": "Kasus Positif COVID-19", "value": str(int(latest_positive)),
         "delta": f"Dari {int(latest_examinations)} spesimen diperiksa",
         "iconKey": "verify", "iconTone": "bg-violet-100 text-violet-700"},
        {"title": "Positivity Rate Influenza", "value": f"{latest_pr_influenza:.0f}%",
         "delta": delta_flu_str,
         "iconKey": "award", "iconTone": "bg-yellow-100 text-yellow-700"},
        {"title": "Aktivitas Influenza", "value": latest_flu_level,
         "delta": "Aktivitas influenza masih terkendali",
         "iconKey": "award", "iconTone": "bg-emerald-100 text-emerald-700"}
    ]
    
    # --- Build summary ---
    overall_avg_pr_covid = avg(pr_covid_vals)
    summary = {
        "average": f"{overall_avg_pr_covid:.1f}",
        "latest": f"{latest_pr_covid:.1f}",
        "category": "RENDAH",
        "delta": "Positivity rate COVID-19 minggu ini"
    }
    
    # --- Build topCampuses (top 5 indikator values) ---
    all_indikators = [
        ("Positivity Rate COVID-19", latest_pr_covid),
        ("Positivity Rate Influenza", latest_pr_influenza),
        ("Proporsi ILI", ili_vals[-1] if ili_vals else 0),
        ("Proporsi SARI", sari_vals[-1] if sari_vals else 0),
        ("Proporsi RSV", rsv_vals[-1] if rsv_vals else 0),
        ("Multipatogen", multipatogen_vals[-1] if multipatogen_vals else 0)
    ]
    all_indikators.sort(key=lambda x: x[1])
    top_campuses = [
        {"name": name, "stars": 5 if v == 0 else (4 if v < 5 else 3), "score": f"{v:.2f}%".replace('.', ',') if v < 10 else f"{v:.1f}%"}
        for name, v in all_indikators[:5]
    ]
    
    # --- Build processStatus (6 indicators) ---
    process_status = [
        {"stage": "PR COVID-19", "total": f"{latest_pr_covid:.1f}%", "percent": f"{latest_pr_covid:.1f}%",
         "tone": "bg-teal-500"},
        {"stage": "PR Influenza", "total": f"{latest_pr_influenza:.0f}%", "percent": f"{latest_pr_influenza:.0f}%",
         "tone": "bg-sky-500"},
        {"stage": "Proporsi ILI", "total": f"{ili_vals[-1]:.2f}%" if ili_vals else "0%",
         "percent": f"{ili_vals[-1]:.2f}%" if ili_vals else "0%", "tone": "bg-amber-500"},
        {"stage": "Proporsi SARI", "total": f"{sari_vals[-1]:.2f}%" if sari_vals else "0%",
         "percent": f"{sari_vals[-1]:.2f}%" if sari_vals else "0%", "tone": "bg-blue-600"},
        {"stage": "Proporsi RSV", "total": f"{rsv_vals[-1]:.0f}%" if rsv_vals else "0%",
         "percent": f"{rsv_vals[-1]:.0f}%" if rsv_vals else "0%", "tone": "bg-violet-500"},
        {"stage": "Multipatogen", "total": f"{multipatogen_vals[-1]:.0f}%" if multipatogen_vals else "0%",
         "percent": f"{multipatogen_vals[-1]:.0f}%" if multipatogen_vals else "0%", "tone": "bg-emerald-600"}
    ]
    
    # --- Build lowestAspects (bottom 5) ---
    all_with_avg = [
        ("Proporsi RSV", avg(rsv_vals)),
        ("Proporsi ILI", avg(ili_vals)),
        ("PR COVID-19", avg(pr_covid_vals)),
        ("PR Influenza", avg(pr_influenza_vals)),
        ("Proporsi SARI", avg(sari_vals)),
        ("Multipatogen", avg(multipatogen_vals))
    ]
    all_with_avg.sort(key=lambda x: x[1])
    tones = ["bg-emerald-500", "bg-lime-500", "bg-amber-500", "bg-yellow-500", "bg-orange-500", "bg-red-500"]
    lowest_aspects = [
        {"name": name, "score": int(v) if v == int(v) else round(v, 1),
         "percent": int(v) if v == int(v) else round(v, 1), "tone": tones[i]}
        for i, (name, v) in enumerate(all_with_avg[:5])
    ]
    
    # --- Build notifications ---
    notifications = []
    
    # Look at the 3 most recent entries for delta info
    recent = all_weeks[-3:] if len(all_weeks) >= 3 else all_weeks
    
    # Check what the latest keterangan says about changes
    if recent:
        latest = recent[-1]
        for table_name, label, tone in [
            ("influenza", "PR Influenza", "bg-amber-500"),
            ("covid19", "PR COVID-19", "bg-violet-500"),
        ]:
            for row in latest.get(table_name, []):
                if "positiv" in row.get("indikator", "").lower():
                    tren = row.get("tren", "").lower()
                    if "meningkat" in tren or "naik" in tren:
                        notifications.append({
                            "text": f"{label} meningkat minggu ini",
                            "total": 0,
                            "tone": tone
                        })
                    elif "menurun" in tren or "turun" in tren:
                        notifications.append({
                            "text": f"{label} menurun minggu ini",
                            "total": 0,
                            "tone": "bg-teal-500"
                        })
        
        # Check RSV/Multipatogen trend
        for row in latest.get("rsv", []):
            ind = row.get("indikator", "").lower()
            tren = row.get("tren", "").lower()
            if "multipatogen" in ind:
                if "meningkat" in tren:
                    notifications.append({
                        "text": f"Multipatogen meningkat minggu ini",
                        "total": 0,
                        "tone": "bg-amber-500"
                    })
                elif "menurun" in tren:
                    notifications.append({
                        "text": f"Multipatogen menurun minggu ini",
                        "total": 0,
                        "tone": "bg-emerald-600"
                    })
    
    # Add cumulative stats
    if total_examinations > 0:
        notifications.append({
            "text": f"Total {int(total_examinations)} pemeriksaan (50 minggu)",
            "total": int(total_examinations),
            "tone": "bg-sky-500"
        })
    
    if total_positive > 0:
        notifications.append({
            "text": f"{int(total_positive)} kasus positif kumulatif",
            "total": int(total_positive),
            "tone": "bg-indigo-500"
        })
    
    # Deduplicate by text prefix, keep unique
    seen = set()
    deduped = []
    for n in notifications:
        key = n["text"].split("(")[0].strip()
        if key not in seen:
            seen.add(key)
            deduped.append(n)
    notifications = deduped[:4]
    
    # Ensure at least 2 notifications
    if len(notifications) < 2:
        notifications.append({
            "text": "Pemantauan influenza dan COVID-19 berjalan rutin",
            "total": 0,
            "tone": "bg-teal-500"
        })
        notifications.append({
            "text": f"Data per {latest_date} ({len(all_weeks)} minggu)",
            "total": len(all_weeks),
            "tone": "bg-sky-500"
        })
    
    # --- Build sourceInfo ---
    # Find date from latest week's title
    latest_date = latest.get("date", "")
    source_info = {
        "sourceLabel": "Sumber Data",
        "sourceValue": "Surkarkes Kemkes - Laporan Pengawasan Kasus Influenza dan COVID-19",
        "dateLabel": "Data per",
        "dateValue": f"{latest_date} (Minggu {latest['week']})"
    }
    
    # --- Build greeting ---
    greeting = {
        "title": "Selamat datang di Dashboard Rekapitulasi Influenza & COVID-19",
        "subtitle": "Pemantauan tren pengawasan kasus Influenza, COVID-19, RSV, dan Multipatogen lainnya secara mingguan."
    }
    
    # --- Build sidebarMenu (preserved from original) ---
    sidebar_menu = [
        {
            "title": "Menu Utama",
            "items": [
                {"label": "Beranda", "iconKey": "home", "active": True, "section": "beranda"},
                {"label": "Rekapitulasi Mingguan & Tahunan", "iconKey": "fileSheet", "section": "rekapitulasi"},
                {"label": "Tren Epidemiologi", "iconKey": "chart", "section": "tren-epidemiologi"},
                {"label": "Tingkat Positivitas & CFR", "iconKey": "trend", "section": "positivitas"},
                {"label": "Peta Distribusi Provinsi/Kabupaten", "iconKey": "map", "section": "peta-nasional"},
                {"label": "Perbandingan YoY", "iconKey": "fileCheck", "section": "perbandingan-tahunan"}
            ]
        },
        {
            "title": "Integrasi API",
            "items": [
                {"label": "Surkarkes", "iconKey": "globe", "url": "https://surkarkes.kemkes.go.id/dashboard-sinkarkes-dev"},
                {"label": "SKDR", "iconKey": "globe", "url": "https://surkarkes.kemkes.go.id/dashboard-skdr-dev"},
                {"label": "Infeksi Emerging", "iconKey": "globe", "url": "https://surkarkes.kemkes.go.id/dashboard-infem-dev"},
            ]
        }
    ]
    
    # --- Build weeklyLevels (for timeline chart) ---
    LEVEL_MAP = {
        'rendah': 'Rendah',
        'aktifitas influenza rendah': 'Rendah',
        'aktivitas influenza rendah': 'Rendah',
        'di luar musim influenza': 'Di Luar Musim',
        'di luar musim': 'Di Luar Musim',
        'diluar musim influenza': 'Di Luar Musim',
        'diluar musim': 'Di Luar Musim',
        'diuar musim influenza': 'Di Luar Musim',
        'diuar musim': 'Di Luar Musim',
        'sedang': 'Sedang',
        'aktivitas influenza sedang': 'Sedang',
        'aktifitas influenza sedang': 'Sedang',
        'tinggi': 'Tinggi',
    }
    weekly_levels = []
    for entry in all_weeks:
        flu_rows = entry.get("influenza", [])
        level_text = ''
        # Level ada di baris ILI (Kasus ILI dari total kunjungan...)
        for row in flu_rows:
            lv = row.get("level", "").lower().strip()
            if lv:
                level_text = lv
                break
        normalized = LEVEL_MAP.get(level_text, 'Rendah')
        level_idx = 0 if normalized == 'Di Luar Musim' else 1 if normalized == 'Rendah' else 2 if normalized == 'Sedang' else 3
        weekly_levels.append({
            "minggu": f"M{entry['week']:02d}/{entry['year']}",
            "level": normalized,
            "levelIdx": level_idx,
        })

    # --- Build weeklyPositives (per-week positive case counts) ---
    weekly_positives = []
    for entry in all_weeks:
        pn = entry.get("poin_numbers", {})
        pos = pn.get("positive_cases", 0)
        exam = pn.get("examinations", 0)
        weekly_positives.append({
            "minggu": f"M{entry['week']:02d}/{entry['year']}",
            "kasus": int(pos),
            "pemeriksaan": int(exam),
        })

    # --- Build weeklyPR_Influenza (per-week PR Influenza from tables) ---
    weekly_pr_influenza = []
    for entry in all_weeks:
        pr_val = 0
        for row in entry.get("influenza", []):
            if "positiv" in row.get("indikator", "").lower() and "influenza" in row.get("indikator", "").lower():
                pr_val = extract_pr_from_keterangan(row.get("keterangan", ""))
                break
        weekly_pr_influenza.append({
            "minggu": f"M{entry['week']:02d}/{entry['year']}",
            "value": round(pr_val, 1),
        })

    # --- Build weeklyRSV (per-week RSV proportion from tables) ---
    weekly_rsv = []
    for entry in all_weeks:
        rsv_val = 0
        for row in entry.get("rsv", []):
            if "rsv" in row.get("indikator", "").lower():
                rsv_val = extract_pr_from_keterangan(row.get("keterangan", ""))
                break
        weekly_rsv.append({
            "minggu": f"M{entry['week']:02d}/{entry['year']}",
            "value": round(rsv_val, 1),
        })

    # --- Build weeklyMultipatogen (per-week Multipatogen proportion from tables) ---
    weekly_multipatogen = []
    for entry in all_weeks:
        multi_val = 0
        for row in entry.get("rsv", []):
            if "multipatogen" in row.get("indikator", "").lower():
                multi_val = extract_pr_from_keterangan(row.get("keterangan", ""))
                break
        weekly_multipatogen.append({
            "minggu": f"M{entry['week']:02d}/{entry['year']}",
            "value": round(multi_val, 1),
        })
    
    # --- Build per-year averages ---
    def avg_year(yr, field, source):
        vals = []
        for entry in all_weeks:
            if entry['year'] != yr:
                continue
            if source == 'aspect':
                for row in entry.get("influenza", []):
                    if field == 'pr_influenza' and "positiv" in row.get("indikator","").lower() and "influenza" in row.get("indikator","").lower():
                        v = extract_pr_from_keterangan(row.get("keterangan",""))
                        if v > 0: vals.append(v)
                for row in entry.get("covid19", []):
                    if field == 'pr_covid' and "positiv" in row.get("indikator","").lower():
                        v = extract_pr_from_keterangan(row.get("keterangan",""))
                        if v > 0: vals.append(v)
                for row in entry.get("rsv", []):
                    ind = row.get("indikator","").lower()
                    if field == 'rsv' and "rsv" in ind:
                        v = extract_pr_from_keterangan(row.get("keterangan",""))
                        if v > 0: vals.append(v)
                    elif field == 'multipatogen' and "multipatogen" in ind:
                        v = extract_pr_from_keterangan(row.get("keterangan",""))
                        if v > 0: vals.append(v)
                for row in entry.get("influenza", []):
                    ind = row.get("indikator","").lower()
                    if field == 'ili' and "ili" in ind:
                        v = extract_pr_from_keterangan(row.get("keterangan",""))
                        if v > 0: vals.append(v)
                    elif field == 'sari' and "sari" in ind:
                        v = extract_pr_from_keterangan(row.get("keterangan",""))
                        if v > 0: vals.append(v)
        return round(sum(vals) / len(vals), 1) if vals else 0.0

    field_labels = ['pr_covid', 'pr_influenza', 'ili', 'sari', 'rsv', 'multipatogen']
    field_names = ['PR COVID-19', 'PR Influenza', 'Proporsi ILI', 'Proporsi SARI', 'Proporsi RSV', 'Multipatogen Lainnya']
    y2025_avg = []
    y2026_avg = []
    for fl, fn in zip(field_labels, field_names):
        v25 = avg_year(2025, fl, 'aspect')
        v26 = avg_year(2026, fl, 'aspect')
        y2025_avg.append({"name": fn, "value": v25})
        y2026_avg.append({"name": fn, "value": v26})

    # --- Compute summary ---
    total_weeks = len(all_weeks)
    
    return {
        "greeting": greeting,
        "metrics": metrics,
        "summary": summary,
        "aspectScores": aspect_scores,
        "starDistribution": star_dist,
        "trend": trend_data,
        "topCampuses": top_campuses,
        "processStatus": process_status,
        "lowestAspects": lowest_aspects,
        "notifications": notifications,
        "provinces": INDONESIA_PROVINCES,
        "sourceInfo": source_info,
        "sidebarMenu": sidebar_menu,
        "weeklyLevels": weekly_levels,
        "weeklyPositives": weekly_positives,
        "weeklyPR_Influenza": weekly_pr_influenza,
        "weeklyRSV": weekly_rsv,
        "weeklyMultipatogen": weekly_multipatogen,
        "y2025avg": y2025_avg,
        "y2026avg": y2026_avg,
    }, all_weeks


def generate_excel(all_weeks, filepath):
    """Generate Excel backup with all raw data."""
    wb = Workbook()
    
    # === Sheet 1: Ringkasan ===
    ws = wb.active
    ws.title = "Ringkasan"
    
    header_font = Font(bold=True, color="FFFFFF", size=12)
    header_fill = PatternFill(start_color="0D9488", end_color="0D9488", fill_type="solid")
    sub_header_fill = PatternFill(start_color="CCFBF1", end_color="CCFBF1", fill_type="solid")
    thin_border = None
    
    headers = ["Minggu", "Tahun", "Tanggal", "Tipe",
               "ILI%", "Tren ILI", "Level ILI",
               "SARI%", "Tren SARI", "Level SARI",
               "PR Influenza", "Tren PR Influenza", "Level PR Influenza",
               "PR COVID-19", "Tren COVID-19",
               "RSV%", "Tren RSV",
               "Multipatogen%", "Tren Multipatogen",
               "Pemeriksaan", "Kasus Positif", "PR (Poin Utama)",
               "Sumber Data", "Source URL",
               "Poin Utama Text"]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(wrap_text=True, horizontal="center")
    
    for i, entry in enumerate(all_weeks):
        row = i + 2
        ws.cell(row=row, column=1, value=f"M{entry['week']:02d}")
        ws.cell(row=row, column=2, value=entry['year'])
        ws.cell(row=row, column=3, value=entry.get('date', ''))
        ws.cell(row=row, column=4, value="TABEL" if entry.get('has_tables') else "NARASI")
        
        # Influenza table
        flu = entry.get('influenza', [])
        for r in flu:
            ind = r.get('indikator', '').lower()
            if 'ili' in ind:
                ws.cell(row=row, column=5, value=extract_pr_from_keterangan(r.get('keterangan', '')))
                ws.cell(row=row, column=6, value=r.get('tren', ''))
                ws.cell(row=row, column=7, value=r.get('level', ''))
            elif 'sari' in ind:
                ws.cell(row=row, column=8, value=extract_pr_from_keterangan(r.get('keterangan', '')))
                ws.cell(row=row, column=9, value=r.get('tren', ''))
                ws.cell(row=row, column=10, value=r.get('level', ''))
            elif 'positiv' in ind and 'influenza' in ind:
                ws.cell(row=row, column=11, value=extract_pr_from_keterangan(r.get('keterangan', '')))
                ws.cell(row=row, column=12, value=r.get('tren', ''))
                ws.cell(row=row, column=13, value=r.get('level', ''))
        
        # COVID-19 table
        covid = entry.get('covid19', [])
        for r in covid:
            if 'positiv' in r.get('indikator', '').lower():
                ws.cell(row=row, column=14, value=extract_pr_from_keterangan(r.get('keterangan', '')))
                ws.cell(row=row, column=15, value=r.get('tren', ''))
        
        # RSV table
        rsv = entry.get('rsv', [])
        for r in rsv:
            ind = r.get('indikator', '').lower()
            if 'rsv' in ind:
                ws.cell(row=row, column=16, value=extract_pr_from_keterangan(r.get('keterangan', '')))
                ws.cell(row=row, column=17, value=r.get('tren', ''))
            elif 'multipatogen' in ind:
                ws.cell(row=row, column=18, value=extract_pr_from_keterangan(r.get('keterangan', '')))
                ws.cell(row=row, column=19, value=r.get('tren', ''))
        
        # Poin Utama numbers
        pn = entry.get('poin_numbers', {})
        ws.cell(row=row, column=20, value=pn.get('examinations', ''))
        ws.cell(row=row, column=21, value=pn.get('positive_cases', ''))
        ws.cell(row=row, column=22, value=pn.get('positivity_rate', ''))
        
        # Source data & URL
        wk_num = entry['week']
        yr = entry['year']
        source_url = f"{BASE_URL}/{wk_num:02d}/{yr}"
        ws.cell(row=row, column=23, value="Poin Utama (full page scan)" if entry.get('has_tables') else "Poin Utama (narasi)")
        ws.cell(row=row, column=24, value=source_url)
        
        poin_text = entry.get('poin_utama', '')[:500]
        ws.cell(row=row, column=25, value=poin_text)

        # Alternate row coloring
        if i % 2 == 0:
            for col in range(1, len(headers) + 1):
                ws.cell(row=row, column=col).fill = PatternFill(
                    start_color="F0FDFA", end_color="F0FDFA", fill_type="solid"
                )

    # Auto-fit column widths
    for col in range(1, len(headers) + 1):
        max_len = len(str(headers[col - 1]))
        for row in range(2, len(all_weeks) + 2):
            val = ws.cell(row=row, column=col).value
            if val:
                max_len = max(max_len, min(len(str(val)), 50))
        ws.column_dimensions[get_column_letter(col)].width = max_len + 2
    
    # === Sheet 2: Detail Tabel ===
    ws2 = wb.create_sheet("Detail Tabel")
    detail_headers = ["Minggu", "Tahun", "Tabel", "Indikator", "Tren", "Level", "Keterangan"]
    for col, header in enumerate(detail_headers, 1):
        cell = ws2.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
    
    row_idx = 2
    for entry in all_weeks:
        for table_name in ["influenza", "covid19", "rsv"]:
            for item in entry.get(table_name, []):
                ws2.cell(row=row_idx, column=1, value=f"M{entry['week']:02d}")
                ws2.cell(row=row_idx, column=2, value=entry['year'])
                ws2.cell(row=row_idx, column=3, value=table_name.upper())
                ws2.cell(row=row_idx, column=4, value=item.get('indikator', ''))
                ws2.cell(row=row_idx, column=5, value=item.get('tren', ''))
                ws2.cell(row=row_idx, column=6, value=item.get('level', ''))
                ws2.cell(row=row_idx, column=7, value=item.get('keterangan', ''))
                row_idx += 1
    
    for col in range(1, len(detail_headers) + 1):
        ws2.column_dimensions[get_column_letter(col)].width = 25
    
    # === Freeze panes ===
    ws.freeze_panes = "A2"
    ws2.freeze_panes = "A2"
    
    wb.save(filepath)
    print(f"\nExcel saved: {filepath}")


def main():
    do_fetch = "--fetch" in sys.argv or True  # default fetch
    do_gen = "--gen" in sys.argv or True     # default gen
    
    if "--fetch" not in sys.argv and "--gen" not in sys.argv and len(sys.argv) > 1:
        print("Usage: python3 update-data.py [--fetch] [--gen]")
        print("  --fetch  : scrape website only")
        print("  --gen    : generate JSON + Excel from existing raw data")
        print("  (no args): scrape + generate")
        sys.exit(0)
    
    if "--gen" in sys.argv:
        do_fetch = False
    
    raw_data = {}
    all_weeks = []
    
    if do_fetch:
        print("=== SCRAPING SURKARKES.KEMKES.GO.ID ===")
        raw_data = scrape_all_weeks()
        
        # Save raw data
        with open(RAW_FILE, 'w') as f:
            json.dump(raw_data, f, indent=2, ensure_ascii=False)
        print(f"Raw data saved: {RAW_FILE}")
        
        # Count total weeks
        total = sum(len(v) for v in raw_data.values())
        print(f"Total weeks scraped: {total}")
        
    if do_gen:
        print("\n=== GENERATING DASHBOARD DATA ===")
        
        if not raw_data:
            try:
                with open(RAW_FILE) as f:
                    raw_data = json.load(f)
                print(f"Loaded raw data from {RAW_FILE}")
            except FileNotFoundError:
                print(f"ERROR: No raw data file found. Run with --fetch first.")
                sys.exit(1)
        
        metrics_data, all_weeks = compute_metrics(raw_data)
        
        if metrics_data:
            # Write dashboard-data.json
            json_path = os.path.join(os.getcwd(), DATA_FILE)
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(metrics_data, f, indent=2, ensure_ascii=False)
            print(f"dashboard-data.json written: {json_path}")
            
            # Generate Excel
            excel_path = os.path.join(os.getcwd(), EXCEL_FILE)
            generate_excel(all_weeks, excel_path)
            
            # Summary
            print(f"\n=== SUMMARY ===")
            print(f"Weeks: {len(all_weeks)}")
            print(f"Latest: M{all_weeks[-1]['week']}/{all_weeks[-1]['year']} ({all_weeks[-1].get('date','')})")
            print(f"Dashboard metrics generated: {len(metrics_data['metrics'])} cards")
            print(f"Aspect scores: {len(metrics_data['aspectScores'])} items")
            print(f"Trend points: {len(metrics_data['trend'])}")
            
            # Show which weeks are covered
            years_summary = {}
            for e in all_weeks:
                y = str(e['year'])
                if y not in years_summary:
                    years_summary[y] = []
                years_summary[y].append(f"M{e['week']:02d}")
            
            for y in sorted(years_summary.keys()):
                weeks = years_summary[y]
                print(f"  {y}: {weeks[0]} - {weeks[-1]} ({len(weeks)} weeks)")


if __name__ == "__main__":
    main()
