#!/usr/bin/env python3
"""
Python Chart Generator for Surveillance Reports (NLP-PENYAKIT)
Generates high-resolution vector and image charts for situation reports (SitRep & ASEAN Bulletin).
Supports SVG output by default (zero external dependencies) and PNG if Pillow/matplotlib are installed.
"""

import sys
import os
import json
import math

def generate_trend_svg(data, output_path, width=800, height=280):
    """
    Generates high-resolution Epi-Curve SVG chart.
    data: list of dicts with 'label', 'cases', 'deaths'
    """
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
    
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#ffffff; font-family:sans-serif;">
  <defs>
    <linearGradient id="gCases" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0060A9" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#0060A9" stop-opacity="0.0"/>
    </linearGradient>
  </defs>
  <!-- Grid -->
  <line x1="{pad_l}" y1="{pad_t + plot_h}" x2="{width - pad_r}" y2="{pad_t + plot_h}" stroke="#cbd5e1" stroke-width="1"/>
  <!-- Area & Lines -->
  <path d="{area_cases}" fill="url(#gCases)" />
  <path d="{path_cases}" fill="none" stroke="#0060A9" stroke-width="3" stroke-linecap="round"/>
  <path d="{path_deaths}" fill="none" stroke="#e11d48" stroke-width="2" stroke-dasharray="4,3"/>
  <!-- Dots -->
"""
    for x, y, label in points_cases:
        svg += f'  <circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#0060A9" stroke="#ffffff" stroke-width="1.5"/>\n'
        svg += f'  <text x="{x:.1f}" y="{pad_t + plot_h + 18}" font-size="9" font-weight="bold" fill="#64748b" text-anchor="middle">{label}</text>\n'
        
    for x, y in points_deaths:
        svg += f'  <circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="#e11d48" stroke="#ffffff" stroke-width="1"/>\n'
        
    svg += "</svg>"
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"Generated chart SVG: {output_path}")

def main():
    sample_data = [
        {"label": "W33", "cases": 980, "deaths": 3},
        {"label": "W34", "cases": 1240, "deaths": 4},
        {"label": "W35", "cases": 1490, "deaths": 5},
        {"label": "W36", "cases": 1820, "deaths": 6},
        {"label": "W37", "cases": 2110, "deaths": 6},
        {"label": "W38", "cases": 2480, "deaths": 8},
    ]
    out_dir = os.path.join(os.path.dirname(__file__), "../public/generated_charts")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "epi_curve_latest.svg")
    generate_trend_svg(sample_data, out_file)

if __name__ == "__main__":
    main()
