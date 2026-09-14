#!/usr/bin/env python3
"""
Python Chart & Spatial Geomap Generator for Surveillance Reports (NLP-PENYAKIT)
Generates high-resolution cartographic GIS maps and charts for situation reports (SitRep & ASEAN Bulletin).
Zero external dependencies (uses standard library math, json, os).
"""

import sys
import os
import json
import math

def rdp(pts, epsilon):
    """Ramer-Douglas-Peucker algorithm for polyline simplification."""
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

def generate_trend_svg(data, output_path, width=800, height=280):
    """Generates high-resolution Epi-Curve SVG chart."""
    max_cases = max([d.get("cases", 0) for d in data] + [10])
    max_deaths = max([d.get("deaths", 0) for d in data] + [1])
    
    pad_l, pad_r, pad_t, pad_b = 60, 60, 30, 40
    plot_w = width - pad_l - pad_r
    plot_h = height - pad_t - pad_b
    
    points_cases = []
    points_deaths = []
    n = max(len(data) - 1, 1)
    
    for i, d in enumerate(data):
        x = pad_l + (i / n) * plot_w
        y_c = pad_t + plot_h - (d.get("cases", 0) / max_cases) * plot_h
        y_d = pad_t + plot_h - (d.get("deaths", 0) / max_deaths) * plot_h
        points_cases.append((x, y_c, d.get("label", "")))
        points_deaths.append((x, y_d))
        
    path_cases = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y, _ in points_cases)
    path_deaths = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in points_deaths)
    area_cases = f"M {points_cases[0][0]:.1f},{pad_t + plot_h} " + " ".join(f"L {x:.1f},{y:.1f}" for x, y, _ in points_cases) + f" L {points_cases[-1][0]:.1f},{pad_t + plot_h} Z"
    
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#ffffff; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <linearGradient id="gCases" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0060A9" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#0060A9" stop-opacity="0.0"/>
    </linearGradient>
  </defs>
  <line x1="{pad_l}" y1="{pad_t + plot_h}" x2="{width - pad_r}" y2="{pad_t + plot_h}" stroke="#cbd5e1" stroke-width="1"/>
  <path d="{area_cases}" fill="url(#gCases)" />
  <path d="{path_cases}" fill="none" stroke="#0060A9" stroke-width="3" stroke-linecap="round"/>
  <path d="{path_deaths}" fill="none" stroke="#e11d48" stroke-width="2" stroke-dasharray="4,3"/>
'''
    for x, y, label in points_cases:
        svg += f'  <circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#0060A9" stroke="#ffffff" stroke-width="1.5"/>\n'
        svg += f'  <text x="{x:.1f}" y="{pad_t + plot_h + 18}" font-size="9" font-weight="bold" fill="#64748b" text-anchor="middle">{label}</text>\n'
        
    for x, y in points_deaths:
        svg += f'  <circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#e11d48" stroke="#ffffff" stroke-width="1"/>\n'
        
    svg += "</svg>"
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"Generated chart SVG: {output_path}")

def generate_spatial_geomap(geojson_path, output_svg_path, output_json_path=None, width=960, height=420):
    """
    Parses real Indonesia 38 Provinces GeoJSON, applies RDP simplification,
    projects accurately into cartographic SVG with ocean bathymetry, equator,
    coordinate graticule, scale bar, compass rose, and active outbreak hotspots.
    """
    if not os.path.exists(geojson_path):
        print(f"GeoJSON file not found: {geojson_path}")
        return
        
    with open(geojson_path, "r", encoding="utf-8") as f:
        gj = json.load(f)
        
    min_lon, max_lon = 94.0, 142.0
    min_lat, max_lat = -12.0, 8.5
    pad_x, pad_y = 40, 35
    plot_w = width - 2 * pad_x
    plot_h = height - 2 * pad_y
    
    def project(lon, lat):
        x = pad_x + ((lon - min_lon) / (max_lon - min_lon)) * plot_w
        y = pad_y + ((max_lat - lat) / (max_lat - min_lat)) * plot_h
        return round(x, 1), round(y, 1)

    epsilon = 0.04
    province_paths = []
    
    for feat in gj.get("features", []):
        props = feat.get("properties", {})
        prov_name = props.get("provinsi", "Wilayah")
        geom = feat.get("geometry", {})
        gtype = geom.get("type")
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
            province_paths.append({
                "name": prov_name,
                "d": " ".join(d_list)
            })

    # Neighboring ASEAN Regional Outlines for context (Malaysia, Singapore, Brunei, S. Philippines)
    asean_context_paths = [
        # Semenanjung Malaysia
        "M 65,115 L 75,95 L 85,75 L 115,100 L 125,120 L 120,135 L 90,145 L 75,130 Z",
        # Sabah & Sarawak (Borneo Utara)
        "M 265,115 L 290,105 L 340,90 L 370,105 L 360,120 L 320,130 L 275,135 Z",
        # Filipina Selatan (Mindanao)
        "M 450,80 L 485,70 L 500,100 L 475,125 L 450,110 Z",
        # Singapura
        "M 124,142 L 129,141 L 130,145 L 125,146 Z"
    ]

    hotspots = [
        {"name": "Palembang (Sumsel)", "lon": 104.75, "lat": -2.99, "cases": 2841, "deaths": 19, "cfr": 0.67, "disease": "Dengue", "severity": "critical"},
        {"name": "DKI Jakarta & Bodetabek", "lon": 106.84, "lat": -6.21, "cases": 1540, "deaths": 2, "cfr": 0.13, "disease": "Mpox / Dengue", "severity": "high"},
        {"name": "Bandung (Jawa Barat)", "lon": 107.61, "lat": -6.91, "cases": 980, "deaths": 1, "cfr": 0.10, "disease": "HFMD", "severity": "medium"},
        {"name": "Surabaya (Jawa Timur)", "lon": 112.75, "lat": -7.25, "cases": 860, "deaths": 2, "cfr": 0.23, "disease": "Dengue", "severity": "medium"},
        {"name": "Denpasar (Bali)", "lon": 115.21, "lat": -8.67, "cases": 450, "deaths": 0, "cfr": 0.00, "disease": "Dengue", "severity": "low"},
        {"name": "Balikpapan (Kaltim)", "lon": 116.83, "lat": -1.26, "cases": 320, "deaths": 0, "cfr": 0.00, "disease": "Malaria", "severity": "low"},
        {"name": "Makassar (Sulsel)", "lon": 119.43, "lat": -5.14, "cases": 410, "deaths": 0, "cfr": 0.00, "disease": "Dengue", "severity": "low"},
        {"name": "Jayapura (Papua)", "lon": 140.71, "lat": -2.54, "cases": 240, "deaths": 0, "cfr": 0.00, "disease": "Malaria", "severity": "low"},
    ]

    y_eq = project(100.0, 0.0)[1]

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#f8fafc; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <defs>
    <linearGradient id="oceanGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0f9ff"/>
      <stop offset="100%" stop-color="#e0f2fe"/>
    </linearGradient>
    <pattern id="cartoGrid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#bae6fd" stroke-width="0.5" opacity="0.5"/>
    </pattern>
    <filter id="pulseGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Ocean & Grid -->
  <rect width="100%" height="100%" fill="url(#oceanGrad)"/>
  <rect width="100%" height="100%" fill="url(#cartoGrid)"/>

  <!-- Equator (0? Khatulistiwa) -->
  <line x1="{pad_x}" y1="{y_eq}" x2="{width - pad_x}" y2="{y_eq}" stroke="#0284c7" stroke-width="1" stroke-dasharray="5,4" opacity="0.75"/>
  <text x="{pad_x + 8}" y="{y_eq - 6}" font-size="8.5" font-weight="800" fill="#0369a1" letter-spacing="0.5">GARIS KHATULISTIWA (0\u00b0 EQUATOR \u2014 SEKTOR SURVEILANS NASIONAL & ASEAN)</text>

  <!-- Meridian Longitude Lines -->
'''
    for lon in [100, 110, 120, 130, 140]:
        x_m, _ = project(lon, 0.0)
        svg += f'  <line x1="{x_m}" y1="{pad_y}" x2="{x_m}" y2="{height - pad_y}" stroke="#cbd5e1" stroke-width="0.6" stroke-dasharray="3,3" opacity="0.6"/>\n'
        svg += f'  <text x="{x_m + 3}" y="{height - pad_y + 14}" font-size="8" font-weight="700" fill="#64748b">{lon}\u00b0 BT</text>\n'

    # Neighboring ASEAN context
    svg += '  <g id="asean-neighbors" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="0.8" opacity="0.65">\n'
    for ap in asean_context_paths:
        svg += f'    <path d="{ap}"/>\n'
    svg += '  </g>\n'

    # Real Indonesia Provinces
    svg += '  <g id="indonesia-provinces" fill="#d1fae5" stroke="#059669" stroke-width="0.85">\n'
    for p in province_paths:
        svg += f'    <path d="{p["d"]}">\n      <title>{p["name"]}</title>\n    </path>\n'
    svg += '  </g>\n'

    # Hotspot Markers
    svg += '  <g id="hotspots">\n'
    sev_colors = {
        "critical": ("#e11d48", "#ffe4e6", "rgba(225, 29, 72, 0.25)"),
        "high": ("#f97316", "#ffedd5", "rgba(249, 115, 22, 0.25)"),
        "medium": ("#0284c7", "#e0f2fe", "rgba(2, 132, 199, 0.25)"),
        "low": ("#10b981", "#d1fae5", "rgba(16, 185, 129, 0.25)")
    }
    
    for h in hotspots:
        hx, hy = project(h["lon"], h["lat"])
        c_main, c_bg, c_ring = sev_colors.get(h["severity"], sev_colors["medium"])
        r = 5 if h["severity"] == "critical" else 4
        
        svg += f'''    <g transform="translate({hx},{hy})">
      <circle cx="0" cy="0" r="{r * 3.5}" fill="{c_ring}" opacity="0.6"/>
      <circle cx="0" cy="0" r="{r * 2.2}" fill="{c_main}" opacity="0.2"/>
      <circle cx="0" cy="0" r="{r}" fill="{c_main}" stroke="#ffffff" stroke-width="1.5" filter="url(#pulseGlow)"/>
      <rect x="8" y="-14" width="135" height="24" rx="4" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.8" opacity="0.94"/>
      <text x="14" y="-2" font-size="7.5" font-weight="900" fill="#0f172a">{h["name"]}</text>
      <text x="14" y="6" font-size="6.5" font-weight="700" fill="{c_main}">{h["disease"]} | {h["cases"]:,} kss (CFR {h["cfr"]}%)</text>
    </g>\n'''
    svg += '  </g>\n'

    # Compass Rose & Legend
    svg += f'''  <!-- Compass Rose -->
  <g transform="translate({width - 45}, 45)">
    <circle cx="0" cy="0" r="15" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.8" opacity="0.95"/>
    <polygon points="0,-12 3,-2 0,0 -3,-2" fill="#0060A9"/>
    <polygon points="0,12 3,2 0,0 -3,2" fill="#94a3b8"/>
    <polygon points="12,0 2,3 0,0 2,-3" fill="#94a3b8"/>
    <polygon points="-12,0 -2,3 0,0 -2,-3" fill="#94a3b8"/>
    <text x="0" y="-13" font-size="6" font-weight="900" fill="#0060A9" text-anchor="middle">U</text>
  </g>

  <!-- Scale Bar & Legend -->
  <g transform="translate({pad_x + 10}, {height - 40})">
    <rect x="-6" y="-6" width="220" height="28" rx="6" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.8" opacity="0.95"/>
    <text x="0" y="4" font-size="7" font-weight="800" fill="#475569">SKALA KARTOGRAFIS GIS</text>
    <line x1="0" y1="12" x2="100" y2="12" stroke="#0f172a" stroke-width="2.5"/>
    <line x1="0" y1="9" x2="0" y2="15" stroke="#0f172a" stroke-width="1.5"/>
    <line x1="50" y1="9" x2="50" y2="15" stroke="#0f172a" stroke-width="1.5"/>
    <line x1="100" y1="9" x2="100" y2="15" stroke="#0f172a" stroke-width="1.5"/>
    <text x="0" y="21" font-size="6" font-weight="700" fill="#64748b">0</text>
    <text x="45" y="21" font-size="6" font-weight="700" fill="#64748b">500 km</text>
    <text x="92" y="21" font-size="6" font-weight="700" fill="#64748b">1000 km</text>
    
    <!-- Status Dots -->
    <circle cx="125" cy="8" r="3" fill="#e11d48"/>
    <text x="131" y="10" font-size="6.5" font-weight="700" fill="#334155">Kritis</text>
    <circle cx="155" cy="8" r="3" fill="#f97316"/>
    <text x="161" y="10" font-size="6.5" font-weight="700" fill="#334155">Waspada</text>
    <circle cx="190" cy="8" r="3" fill="#10b981"/>
    <text x="196" y="10" font-size="6.5" font-weight="700" fill="#334155">Terkendali</text>
  </g>
</svg>'''

    os.makedirs(os.path.dirname(output_svg_path), exist_ok=True)
    with open(output_svg_path, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"Generated Spatial GIS Geomap SVG: {output_svg_path}")

    if output_json_path:
        os.makedirs(os.path.dirname(output_json_path), exist_ok=True)
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump({
                "viewport": {"width": width, "height": height},
                "bounds": {"min_lon": min_lon, "max_lon": max_lon, "min_lat": min_lat, "max_lat": max_lat},
                "provinces": province_paths,
                "asean_context": asean_context_paths
            }, f, indent=2)
        print(f"Exported simplified GIS paths JSON: {output_json_path}")

def main():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    geojson_path = os.path.join(root_dir, "services/frontend-next/public/indonesia-38-provinces.geojson")
    
    # 1. Epi-Curve
    sample_data = [
        {"label": "W33", "cases": 980, "deaths": 3},
        {"label": "W34", "cases": 1240, "deaths": 4},
        {"label": "W35", "cases": 1490, "deaths": 5},
        {"label": "W36", "cases": 1820, "deaths": 6},
        {"label": "W37", "cases": 2110, "deaths": 6},
        {"label": "W38", "cases": 2480, "deaths": 8},
    ]
    out_dir_1 = os.path.join(root_dir, "public/generated_charts")
    out_dir_2 = os.path.join(root_dir, "services/frontend-next/public/generated_charts")
    
    generate_trend_svg(sample_data, os.path.join(out_dir_1, "epi_curve_latest.svg"))
    generate_trend_svg(sample_data, os.path.join(out_dir_2, "epi_curve_latest.svg"))
    
    # 2. Spatial GIS Geomap
    out_svg_1 = os.path.join(out_dir_1, "spatial_geomap_indonesia.svg")
    out_svg_2 = os.path.join(out_dir_2, "spatial_geomap_indonesia.svg")
    out_json = os.path.join(root_dir, "services/frontend-next/public/data/indonesia_simplified_geomap.json")
    
    generate_spatial_geomap(geojson_path, out_svg_1, output_json_path=out_json)
    generate_spatial_geomap(geojson_path, out_svg_2)

if __name__ == "__main__":
    main()
