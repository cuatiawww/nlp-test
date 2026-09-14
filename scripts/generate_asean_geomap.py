import json
import math
import os
import re

def rdp(pts, epsilon):
    if len(pts) < 3:
        return pts
    x1, y1 = pts[0][0], pts[0][1]
    x2, y2 = pts[-1][0], pts[-1][1]
    dx, dy = x2 - x1, y2 - y1
    line_len = math.hypot(dx, dy)
    max_d = 0.0
    index = 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i][0], pts[i][1]
        d = math.hypot(x - x1, y - y1) if line_len == 0 else abs(dy * x - dx * y + x2 * y1 - y2 * x1) / line_len
        if d > max_d:
            max_d = d
            index = i
    if max_d > epsilon:
        res1 = rdp(pts[:index+1], epsilon)
        res2 = rdp(pts[index:], epsilon)
        return res1[:-1] + res2
    else:
        return [pts[0], pts[-1]]

# Load ASEAN GEOJSON
with open('/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/data/asean-countries.ts', 'r', encoding='utf-8') as f:
    ts_content = f.read()

m = re.search(r'export const ASEAN_GEOJSON\s*=\s*(\{.*\});?', ts_content, re.DOTALL)
asean_data = json.loads(m.group(1))

# Load Indonesia 38 Provinces GEOJSON for detailed Indonesian interior
indo_prov_path = '/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/public/data/geojson/indonesia-38-provinces.geojson'
indo_data = None
if os.path.exists(indo_prov_path):
    with open(indo_prov_path, 'r', encoding='utf-8') as f:
        indo_data = json.load(f)

# Dimensions & Bounding Box for Full ASEAN Region
# 92°E (western Myanmar) to 142°E (eastern Papua)
# -11.5°S (southern Indonesia/Timor) to 28.5°N (northern Myanmar)
width = 1000
height = 540
pad_x = 40
pad_y = 40
plot_w = width - (2 * pad_x)
plot_h = height - (2 * pad_y)

min_lon = 91.5
max_lon = 142.5
min_lat = -11.5
max_lat = 28.5

def project(lon, lat):
    x = pad_x + ((lon - min_lon) / (max_lon - min_lon)) * plot_w
    y = pad_y + ((max_lat - lat) / (max_lat - min_lat)) * plot_h
    return round(x, 1), round(y, 1)

# Country Colors (professional soft cartographic palette)
country_styles = {
    "Indonesia": {"fill": "#d1fae5", "stroke": "#059669", "text": "INDONESIA", "label_pt": (118.0, -3.0)},
    "Malaysia": {"fill": "#fef3c7", "stroke": "#d97706", "text": "MALAYSIA", "label_pt": (102.5, 3.8)},
    "Thailand": {"fill": "#e0e7ff", "stroke": "#4f46e5", "text": "THAILAND", "label_pt": (100.5, 15.5)},
    "Vietnam": {"fill": "#fee2e2", "stroke": "#dc2626", "text": "VIET NAM", "label_pt": (107.5, 16.0)},
    "Philippines": {"fill": "#ffedd5", "stroke": "#ea580c", "text": "PHILIPPINES", "label_pt": (122.5, 12.5)},
    "Myanmar": {"fill": "#f3e8ff", "stroke": "#9333ea", "text": "MYANMAR", "label_pt": (96.0, 20.5)},
    "Cambodia": {"fill": "#fce7f3", "stroke": "#db2777", "text": "CAMBODIA", "label_pt": (104.8, 12.5)},
    "Laos": {"fill": "#ecfdf5", "stroke": "#047857", "text": "LAOS", "label_pt": (102.5, 19.5)},
    "Singapore": {"fill": "#f87171", "stroke": "#b91c1c", "text": "SINGAPORE", "label_pt": (103.8, 1.35)},
    "Brunei": {"fill": "#fde047", "stroke": "#ca8a04", "text": "BRUNEI", "label_pt": (114.8, 4.6)},
    "Timor-Leste": {"fill": "#fed7aa", "stroke": "#c2410c", "text": "TIMOR-LESTE", "label_pt": (125.8, -8.7)},
}

country_paths = []
epsilon = 0.06  # RDP simplification

for feat in asean_data.get("features", []):
    c_name = feat.get("properties", {}).get("name", "Unknown")
    # If it's Indonesia and we have provinces, we'll draw provinces separately or draw both
    geom = feat.get("geometry", {})
    gtype = geom.get("type", "")
    coords = geom.get("coordinates", [])
    
    rings = []
    if gtype == "Polygon":
        for r in coords:
            sr = rdp(r, epsilon)
            if len(sr) >= 3:
                rings.append(sr)
    elif gtype == "MultiPolygon":
        for poly in coords:
            for r in poly:
                sr = rdp(r, epsilon)
                if len(sr) >= 3:
                    rings.append(sr)
                    
    d_list = []
    for ring in rings:
        pts = [project(pt[0], pt[1]) for pt in ring]
        d_list.append("M " + " L ".join(f"{x},{y}" for x, y in pts) + " Z")
        
    if d_list:
        country_paths.append({
            "name": c_name,
            "d": " ".join(d_list),
            "style": country_styles.get(c_name, {"fill": "#f1f5f9", "stroke": "#64748b", "text": c_name, "label_pt": (100, 10)})
        })

# Indonesia province interior borders
indo_prov_paths = []
if indo_data:
    for feat in indo_data.get("features", []):
        p_name = feat.get("properties", {}).get("Propinsi", "") or feat.get("properties", {}).get("PROVINSI", "")
        geom = feat.get("geometry", {})
        gtype = geom.get("type", "")
        coords = geom.get("coordinates", [])
        
        rings = []
        if gtype == "Polygon":
            for r in coords:
                sr = rdp(r, 0.05)
                if len(sr) >= 3:
                    rings.append(sr)
        elif gtype == "MultiPolygon":
            for poly in coords:
                for r in poly:
                    sr = rdp(r, 0.05)
                    if len(sr) >= 3:
                        rings.append(sr)
                        
        d_list = []
        for ring in rings:
            pts = [project(pt[0], pt[1]) for pt in ring]
            d_list.append("M " + " L ".join(f"{x},{y}" for x, y in pts) + " Z")
            
        if d_list:
            indo_prov_paths.append({
                "name": p_name,
                "d": " ".join(d_list)
            })

# Regional ASEAN Hotspots
hotspots = [
    # Indonesia
    {"name": "Palembang (Sumsel)", "country": "Indonesia", "lon": 104.75, "lat": -2.99, "cases": 2841, "deaths": 19, "cfr": 0.67, "disease": "Dengue", "severity": "critical"},
    {"name": "DKI Jakarta & Bodetabek", "country": "Indonesia", "lon": 106.84, "lat": -6.21, "cases": 1540, "deaths": 2, "cfr": 0.13, "disease": "Mpox / Dengue", "severity": "high"},
    {"name": "Surabaya (Jawa Timur)", "country": "Indonesia", "lon": 112.75, "lat": -7.25, "cases": 860, "deaths": 2, "cfr": 0.23, "disease": "Dengue", "severity": "medium"},
    {"name": "Denpasar (Bali)", "country": "Indonesia", "lon": 115.21, "lat": -8.67, "cases": 450, "deaths": 0, "cfr": 0.00, "disease": "Dengue", "severity": "low"},
    {"name": "Makassar (Sulsel)", "country": "Indonesia", "lon": 119.43, "lat": -5.14, "cases": 410, "deaths": 0, "cfr": 0.00, "disease": "Dengue", "severity": "low"},
    {"name": "Jayapura (Papua)", "country": "Indonesia", "lon": 140.71, "lat": -2.54, "cases": 240, "deaths": 0, "cfr": 0.00, "disease": "Malaria", "severity": "low"},
    
    # Thailand
    {"name": "Bangkok", "country": "Thailand", "lon": 100.50, "lat": 13.75, "cases": 154, "deaths": 0, "cfr": 0.00, "disease": "Dengue / HFMD", "severity": "high"},
    
    # Viet Nam
    {"name": "Dak Lak (Highlands)", "country": "Viet Nam", "lon": 108.03, "lat": 12.66, "cases": 6112, "deaths": 2, "cfr": 0.03, "disease": "Dengue Outbreak", "severity": "critical"},
    {"name": "Ho Chi Minh City", "country": "Viet Nam", "lon": 106.62, "lat": 10.82, "cases": 1820, "deaths": 1, "cfr": 0.05, "disease": "Dengue", "severity": "high"},
    
    # Malaysia
    {"name": "Selangor & KL", "country": "Malaysia", "lon": 101.68, "lat": 3.13, "cases": 1420, "deaths": 0, "cfr": 0.00, "disease": "HFMD Klaster", "severity": "high"},
    {"name": "Johor Bahru", "country": "Malaysia", "lon": 103.74, "lat": 1.49, "cases": 580, "deaths": 0, "cfr": 0.00, "disease": "Dengue", "severity": "medium"},
    
    # Philippines
    {"name": "Metro Manila", "country": "Philippines", "lon": 120.98, "lat": 14.59, "cases": 2100, "deaths": 4, "cfr": 0.19, "disease": "Dengue / Lepto", "severity": "high"},
    {"name": "Cebu City", "country": "Philippines", "lon": 123.89, "lat": 10.31, "cases": 730, "deaths": 1, "cfr": 0.14, "disease": "Dengue", "severity": "medium"},
    
    # Singapore
    {"name": "Central Singapore", "country": "Singapore", "lon": 103.82, "lat": 1.35, "cases": 430, "deaths": 0, "cfr": 0.00, "disease": "Dengue Alert", "severity": "medium"},

    # Cambodia
    {"name": "Phnom Penh", "country": "Cambodia", "lon": 104.92, "lat": 11.55, "cases": 180, "deaths": 0, "cfr": 0.00, "disease": "Avian Flu Screen", "severity": "low"},
    
    # Laos
    {"name": "Vientiane", "country": "Laos", "lon": 102.63, "lat": 17.97, "cases": 290, "deaths": 0, "cfr": 0.00, "disease": "Dengue", "severity": "low"},

    # Timor-Leste
    {"name": "Dili", "country": "Timor-Leste", "lon": 125.57, "lat": -8.55, "cases": 160, "deaths": 0, "cfr": 0.00, "disease": "Dengue", "severity": "low"},
]

y_eq = project(100.0, 0.0)[1]
y_tropic = project(100.0, 23.43)[1]

# Build SVG
svg_parts = []
svg_parts.append(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <linearGradient id="oceanGradAsean" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0f9ff"/>
      <stop offset="50%" stop-color="#e0f2fe"/>
      <stop offset="100%" stop-color="#dbeafe"/>
    </linearGradient>
    <pattern id="cartoGridAsean" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#bae6fd" stroke-width="0.5" opacity="0.45"/>
    </pattern>
    <filter id="glowAsean" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Ocean & Grid -->
  <rect width="100%" height="100%" fill="url(#oceanGradAsean)"/>
  <rect width="100%" height="100%" fill="url(#cartoGridAsean)"/>

  <!-- Equator Line (0° Khatulistiwa) -->
  <line x1="{pad_x}" y1="{y_eq}" x2="{width - pad_x}" y2="{y_eq}" stroke="#0284c7" stroke-width="1.2" stroke-dasharray="6,4" opacity="0.8"/>
  <text x="{pad_x + 8}" y="{y_eq - 6}" font-size="9" font-weight="900" fill="#0369a1" letter-spacing="0.5">GARIS KHATULISTIWA (0° EQUATOR — SEKTOR SURVEILANS KAWASAN ASEAN)</text>

  <!-- Tropic of Cancer (23.4° LU) -->
  <line x1="{pad_x}" y1="{y_tropic}" x2="{width - pad_x}" y2="{y_tropic}" stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="4,4" opacity="0.6"/>
  <text x="{pad_x + 8}" y="{y_tropic - 5}" font-size="8" font-weight="700" fill="#64748b">23.5° LU (TROPIC OF CANCER)</text>
''')

# Meridians
for lon in [95, 100, 105, 110, 115, 120, 125, 130, 135, 140]:
    x_m, _ = project(lon, 0.0)
    svg_parts.append(f'  <line x1="{x_m}" y1="{pad_y}" x2="{x_m}" y2="{height - pad_y}" stroke="#cbd5e1" stroke-width="0.6" stroke-dasharray="3,3" opacity="0.6"/>\n')
    svg_parts.append(f'  <text x="{x_m + 3}" y="{height - pad_y + 14}" font-size="8" font-weight="700" fill="#64748b">{lon}° BT</text>\n')

# Parallels
for lat in [-10, -5, 5, 10, 15, 20, 25]:
    _, y_p = project(min_lon, lat)
    svg_parts.append(f'  <line x1="{pad_x}" y1="{y_p}" x2="{width - pad_x}" y2="{y_p}" stroke="#cbd5e1" stroke-width="0.5" stroke-dasharray="2,3" opacity="0.5"/>\n')
    label_lat = f"{abs(lat)}° LS" if lat < 0 else f"{lat}° LU"
    svg_parts.append(f'  <text x="{pad_x + 4}" y="{y_p - 3}" font-size="7.5" font-weight="700" fill="#94a3b8">{label_lat}</text>\n')

# ASEAN Countries Boundaries
svg_parts.append('  <!-- ASEAN Member States Boundaries -->\n')
for c in country_paths:
    style = c["style"]
    svg_parts.append(f'  <path d="{c["d"]}" fill="{style["fill"]}" stroke="{style["stroke"]}" stroke-width="1.0" opacity="0.95">\n    <title>{c["name"]}</title>\n  </path>\n')

# Indonesia Detailed Provincial Boundaries
if indo_prov_paths:
    svg_parts.append('  <!-- Indonesia 38 Provinces Sub-Borders -->\n  <g id="indo-provinces-sub" fill="none" stroke="#059669" stroke-width="0.6" opacity="0.75">\n')
    for p in indo_prov_paths:
        svg_parts.append(f'    <path d="{p["d"]}">\n      <title>{p["name"]}</title>\n    </path>\n')
    svg_parts.append('  </g>\n')

# Country Name Labels
svg_parts.append('  <!-- Country Labels -->\n')
for c in country_paths:
    c_name = c["name"]
    style = c["style"]
    lp = style.get("label_pt")
    if lp:
        lx, ly = project(lp[0], lp[1])
        svg_parts.append(f'  <text x="{lx}" y="{ly}" font-size="9" font-weight="900" fill="{style["stroke"]}" text-anchor="middle" opacity="0.8" letter-spacing="1.2">{style["text"]}</text>\n')

# Hotspots
svg_parts.append('  <!-- Epidemic Hotspot Clusters -->\n')
sev_colors = {
    "critical": ("#e11d48", "#ffe4e6", "rgba(225, 29, 72, 0.3)"),
    "high": ("#ea580c", "#ffedd5", "rgba(234, 88, 12, 0.3)"),
    "medium": ("#0284c7", "#e0f2fe", "rgba(2, 132, 199, 0.25)"),
    "low": ("#10b981", "#d1fae5", "rgba(16, 185, 129, 0.25)")
}

for h in hotspots:
    hx, hy = project(h["lon"], h["lat"])
    sev = h["severity"]
    main_c, bg_c, glow_c = sev_colors[sev]
    r = 7 if sev == "critical" else (6 if sev == "high" else 5)
    
    svg_parts.append(f'''  <g id="hotspot-{h['name'].replace(' ', '_')}">
    <!-- Pulse Ring -->
    <circle cx="{hx}" cy="{hy}" r="{r + 7}" fill="{glow_c}" filter="url(#glowAsean)"/>
    <circle cx="{hx}" cy="{hy}" r="{r + 3}" fill="{bg_c}" stroke="{main_c}" stroke-width="1.2"/>
    <circle cx="{hx}" cy="{hy}" r="{r}" fill="{main_c}"/>
    <circle cx="{hx}" cy="{hy}" r="2" fill="#ffffff"/>
    
    <!-- Hotspot Label Tag -->
    <rect x="{hx + 8}" y="{hy - 14}" width="150" height="26" rx="4" fill="#ffffff" fill-opacity="0.95" stroke="#cbd5e1" stroke-width="0.8" filter="url(#glowAsean)"/>
    <text x="{hx + 14}" y="{hy - 2}" font-size="8.5" font-weight="900" fill="#0f172a">{h['name']} ({h['disease']})</text>
    <text x="{hx + 14}" y="{hy + 8}" font-size="7.5" font-weight="700" fill="{main_c}">{h['cases']:,} Kasus | {h['deaths']} Meninggal (CFR: {h['cfr']}%)</text>
  </g>
''')

# Map Header & Legend Box
svg_parts.append(f'''
  <!-- Cartographic Header Banner -->
  <rect x="{pad_x}" y="10" width="380" height="24" rx="5" fill="#0060A9" opacity="0.95"/>
  <text x="{pad_x + 12}" y="26" font-size="9.5" font-weight="900" fill="#ffffff" letter-spacing="0.5">PETA SPASIAL HOTSPOT & KORIDOR EPIDEMIOLOGI ASEAN</text>
  <text x="{pad_x + 295}" y="25" font-size="8" font-weight="700" fill="#93c5fd">11 NEGARA ANGGOTA</text>

  <!-- Legend Box (Bottom Left) -->
  <g transform="translate({pad_x + 5}, {height - 85})">
    <rect width="260" height="70" rx="6" fill="#ffffff" fill-opacity="0.94" stroke="#cbd5e1" stroke-width="0.9"/>
    <text x="10" y="15" font-size="8.5" font-weight="900" fill="#0f172a">LEGENDA STATUS RISIKO SPASIAL</text>
    
    <circle cx="16" cy="30" r="4.5" fill="#e11d48"/>
    <text x="26" y="33" font-size="7.5" font-weight="700" fill="#334155">Kritis / Outbreak Aktif (CFR &gt; 0.5%)</text>
    
    <circle cx="16" cy="45" r="4" fill="#ea580c"/>
    <text x="26" y="48" font-size="7.5" font-weight="700" fill="#334155">Waspada Tinggi (&gt; 1,000 Kasus)</text>
    
    <circle cx="150" cy="30" r="3.5" fill="#0284c7"/>
    <text x="160" y="33" font-size="7.5" font-weight="700" fill="#334155">Pemantauan Berkala</text>
    
    <circle cx="150" cy="45" r="3.5" fill="#10b981"/>
    <text x="160" y="48" font-size="7.5" font-weight="700" fill="#334155">Terkendali / Sporadis</text>
    
    <line x1="10" y1="58" x2="40" y2="58" stroke="#0284c7" stroke-width="1.2" stroke-dasharray="4,3"/>
    <text x="46" y="61" font-size="7" font-weight="700" fill="#64748b">Ekuator (0°)</text>

    <line x1="150" y1="58" x2="180" y2="58" stroke="#059669" stroke-width="1"/>
    <text x="186" y="61" font-size="7" font-weight="700" fill="#64748b">Batas Yurisdiksi</text>
  </g>

  <!-- Scale & North Compass (Bottom Right) -->
  <g transform="translate({width - pad_x - 110}, {height - 65})">
    <rect width="105" height="50" rx="5" fill="#ffffff" fill-opacity="0.92" stroke="#cbd5e1" stroke-width="0.8"/>
    <text x="52" y="14" font-size="7.5" font-weight="900" fill="#0f172a" text-anchor="middle">SKALA KARTOGRAFIS</text>
    <line x1="15" y1="24" x2="90" y2="24" stroke="#0f172a" stroke-width="2"/>
    <line x1="15" y1="21" x2="15" y2="27" stroke="#0f172a" stroke-width="2"/>
    <line x1="52.5" y1="21" x2="52.5" y2="27" stroke="#0f172a" stroke-width="1.5"/>
    <line x1="90" y1="21" x2="90" y2="27" stroke="#0f172a" stroke-width="2"/>
    <text x="15" y="36" font-size="6.5" font-weight="700" fill="#475569" text-anchor="middle">0</text>
    <text x="52.5" y="36" font-size="6.5" font-weight="700" fill="#475569" text-anchor="middle">500 km</text>
    <text x="90" y="36" font-size="6.5" font-weight="700" fill="#475569" text-anchor="middle">1,000 km</text>
    <text x="52" y="45" font-size="6" font-weight="600" fill="#64748b" text-anchor="middle">Datum WGS84</text>
  </g>
</svg>''')

svg_str = "".join(svg_parts)

# Write to public generated_charts
out_dirs = [
    '/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/public/generated_charts',
    '/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/.next/standalone/public/generated_charts'
]

for d in out_dirs:
    if os.path.exists(os.path.dirname(d)):
        os.makedirs(d, exist_ok=True)
        # Write ASEAN geomap
        with open(os.path.join(d, 'spatial_geomap_asean.svg'), 'w', encoding='utf-8') as f:
            f.write(svg_str)
        # Also write as spatial_geomap_indonesia.svg for backward compatibility
        with open(os.path.join(d, 'spatial_geomap_indonesia.svg'), 'w', encoding='utf-8') as f:
            f.write(svg_str)

print("Generated ASEAN spatial geomap SVG successfully!")