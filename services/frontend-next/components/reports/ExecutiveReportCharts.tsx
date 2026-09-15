"use client"

import React, { useRef } from "react"
import { Download } from "lucide-react"
import { PUBLIC_BASE_PATH } from "@/lib/public-path"

export function exportSvgToPng(svgElement: SVGSVGElement | null, filename: string, scale = 2) {
  if (!svgElement) return
  try {
    const svgData = new XMLSerializer().serializeToString(svgElement)
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
    const blobURL = typeof window !== "undefined" && window.URL ? window.URL.createObjectURL(svgBlob) : ""

    const img = new Image()
    const bbox = svgElement.getBoundingClientRect()
    const width = (bbox.width || 800) * scale
    const height = (bbox.height || 400) * scale

    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob((blob) => {
        if (!blob) return
        const a = document.createElement("a")
        a.download = `${filename}.png`
        a.href = window.URL.createObjectURL(blob)
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        if (window.URL) window.URL.revokeObjectURL(blobURL)
      }, "image/png")
    }
    img.src = blobURL
  } catch (err) {
    console.error("Failed to export SVG to PNG:", err)
  }
}

export type HotspotLocation = {
  id: string
  name: string
  country: string
  cases: number
  deaths: number
  cfr: number
  x: number
  y: number
  severity: "low" | "medium" | "high" | "critical"
}

interface SpatialHotspotMapProps {
  hotspots: HotspotLocation[]
  title?: string
}

export const SpatialHotspotMap: React.FC<SpatialHotspotMapProps> = ({
  hotspots,
  title = "Spatial Hotspot Mapping & Outbreak Clusters (WGS84 GIS)",
}) => {
  const [downloading, setDownloading] = React.useState(false)

  const handleDownload = async () => {
    try {
      setDownloading(true)
      const svgUrl = `${PUBLIC_BASE_PATH}/generated_charts/spatial_geomap_asean.svg`
      const res = await fetch(svgUrl).catch(() => fetch("/generated_charts/spatial_geomap_asean.svg"))
      if (!res.ok) throw new Error("Gagal memuat SVG peta")
      const svgText = await res.text()
      const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" })
      const blobURL = URL.createObjectURL(svgBlob)
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = 1920
        canvas.height = 840
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.fillStyle = "#f8fafc"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (!blob) return
          const a = document.createElement("a")
          a.download = "peta_spasial_hotspot_gis_asean.png"
          a.href = URL.createObjectURL(blob)
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(blobURL)
          setDownloading(false)
        }, "image/png")
      }
      img.src = blobURL
    } catch (err) {
      console.error("Gagal export geomap:", err)
      setDownloading(false)
    }
  }

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div>
            <h4 className="text-sm sm:text-base font-bold text-[#004b87]">{title}</h4>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
              Geographic distribution of reported infectious disease clusters and cross-border transmission corridors across ASEAN member states
            </p>
          </div>
        </div>
        <div className="no-print flex items-center gap-2">
          <a
            href={`${PUBLIC_BASE_PATH}/generated_charts/spatial_geomap_asean.svg`}
            download="peta_spasial_geomap_asean.svg"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            title="Download Original Vector SVG"
          >
            <Download className="h-3 w-3 text-slate-500" />
            <span>Download SVG</span>
          </a>
          <button
            type="button"
            disabled={downloading}
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0060A9] px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer shadow-xs disabled:opacity-50"
            title="Download Map as High-Resolution PNG Image (300 DPI)"
          >
            <Download className="h-3.5 w-3.5 text-white" />
            <span>{downloading ? "Processing..." : "Download PNG (300 DPI)"}</span>
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#f8fafc] shadow-2xs">
        <img
          src={`${PUBLIC_BASE_PATH}/generated_charts/spatial_geomap_asean.svg`}
          alt="Python GIS Spatial Hotspot Map (ASEAN Region &amp; Indonesia)"
          className="w-full h-auto block select-none"
          onError={(e) => {
            const target = e.currentTarget
            if (!target.dataset.fallback) {
              target.dataset.fallback = "1"
              target.src = "/generated_charts/spatial_geomap_asean.svg"
            }
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] font-semibold text-slate-500">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700">Proyeksi:</span> Equirectangular GIS Kartografis
          <span className="text-slate-300">•</span>
          <span className="font-bold text-slate-700">Datum:</span> WGS84
          <span className="text-slate-300">•</span>
          <span className="font-bold text-slate-700">Coverage:</span> 91.5°E – 142.5°E | 11.5°S – 28.5°N (ASEAN Region)
        </div>
        <div className="font-black text-[#0060A9]">
          Terverifikasi Otomatis Pipeline Python GIS
        </div>
      </div>
    </div>
  )
}

export type TrendDataPoint = {
  label: string
  cases: number
  deaths: number
}

interface TrendEpiCurveChartProps {
  data: TrendDataPoint[]
  title?: string
  subtitle?: string
}

export const TrendEpiCurveChart: React.FC<TrendEpiCurveChartProps> = ({
  data,
  title = "Epidemiological Curve: Confirmed Cases & Fatalities Trend",
  subtitle = "Temporal trend of confirmed communicable disease cases across the surveillance timeline",
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null)

  const handleDownload = () => {
    exportSvgToPng(svgRef.current, "asean_epidemiological_trend_curve")
  }

  const maxCases = Math.max(...data.map((d) => d.cases), 10)
  const maxDeaths = Math.max(...data.map((d) => d.deaths), 1)

  const width = 800
  const height = 260
  const paddingLeft = 60
  const paddingRight = 60
  const paddingTop = 30
  const paddingBottom = 40

  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom

  const pointsCases = data.map((d, i) => {
    const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * plotWidth
    const y = paddingTop + plotHeight - (d.cases / maxCases) * plotHeight
    return { x, y, val: d.cases, label: d.label }
  })

  const pointsDeaths = data.map((d, i) => {
    const x = paddingLeft + (i / Math.max(data.length - 1, 1)) * plotWidth
    const y = paddingTop + plotHeight - (d.deaths / Math.max(maxDeaths, 1)) * plotHeight
    return { x, y, val: d.deaths, label: d.label }
  })

  const casesPathD =
    pointsCases.length > 0
      ? `M ${pointsCases.map((p) => `${p.x},${p.y}`).join(" L ")}`
      : ""

  const deathsPathD =
    pointsDeaths.length > 0
      ? `M ${pointsDeaths.map((p) => `${p.x},${p.y}`).join(" L ")}`
      : ""

  const casesAreaD =
    pointsCases.length > 0
      ? `M ${pointsCases[0].x},${paddingTop + plotHeight} L ${pointsCases
          .map((p) => `${p.x},${p.y}`)
          .join(" L ")} L ${pointsCases[pointsCases.length - 1].x},${
          paddingTop + plotHeight
        } Z`
      : ""

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm sm:text-base font-bold text-[#004b87]">{title}</h4>
          <p className="text-[11px] font-medium text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="no-print inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          title="Download Chart as PNG Image"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          <span>Download PNG</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block"
          style={{
            background: "#ffffff",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          <defs>
            <linearGradient id="casesAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0060A9" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#0060A9" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((step, idx) => {
            const y = paddingTop + plotHeight * (1 - step)
            const valCase = Math.round(maxCases * step)
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="0.7"
                  strokeDasharray="4,3"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  fontSize="7.5"
                  fontWeight="600"
                  fill="#64748b"
                  textAnchor="end"
                >
                  {valCase.toLocaleString()}
                </text>
              </g>
            )
          })}

          {casesAreaD && <path d={casesAreaD} fill="url(#casesAreaGrad)" />}
          {casesPathD && (
            <path
              d={casesPathD}
              fill="none"
              stroke="#0060A9"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {deathsPathD && (
            <path
              d={deathsPathD}
              fill="none"
              stroke="#e11d48"
              strokeWidth="2"
              strokeDasharray="5,4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {pointsCases.map((p, idx) => (
            <g key={`c-${idx}`}>
              <circle cx={p.x} cy={p.y} r="4" fill="#0060A9" stroke="#ffffff" strokeWidth="1.5" />
              <text
                x={p.x}
                y={paddingTop + plotHeight + 18}
                fontSize="8"
                fontWeight="700"
                fill="#475569"
                textAnchor="middle"
              >
                {p.label}
              </text>
            </g>
          ))}

          {pointsDeaths.map((p, idx) => (
            <circle
              key={`d-${idx}`}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill="#e11d48"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          ))}

          <g transform={`translate(${width - 250}, 16)`}>
            <rect x="0" y="0" width="10" height="10" rx="2" fill="#0060A9" />
            <text x="16" y="8.5" fontSize="7.5" fontWeight="700" fill="#0f172a">
              Confirmed Cases Count
            </text>
            <line x1="120" y1="5" x2="135" y2="5" stroke="#e11d48" strokeWidth="2" strokeDasharray="4,2" />
            <circle cx="127" cy="5" r="2.5" fill="#e11d48" />
            <text x="142" y="8.5" fontSize="7.5" fontWeight="700" fill="#e11d48">
              Cumulative Deaths
            </text>
          </g>
        </svg>
      </div>
    </div>
  )
}

export type DiseaseShare = {
  name: string
  cases: number
  color: string
}

interface DiseaseDistributionDonutProps {
  shares: DiseaseShare[]
  title?: string
}

export const DiseaseDistributionDonut: React.FC<DiseaseDistributionDonutProps> = ({
  shares,
  title = "Dominant Monitored Diseases Distribution (ICD-11)",
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null)

  const handleDownload = () => {
    exportSvgToPng(svgRef.current, "dominant_disease_distribution")
  }

  const totalCases = shares.reduce((sum, s) => sum + s.cases, 0)
  const defaultColors = ["#0060A9", "#0d9488", "#ea580c", "#e11d48", "#8b5cf6", "#059669", "#64748b"]

  const cx = 110
  const cy = 110
  const rOuter = 85
  const rInner = 52

  let accumulatedAngle = -Math.PI / 2
  const arcs = shares.map((s, idx) => {
    const color = s.color || defaultColors[idx % defaultColors.length]
    const fraction = totalCases > 0 ? s.cases / totalCases : 0
    const angle = fraction * 2 * Math.PI

    const startAngle = accumulatedAngle
    const endAngle = accumulatedAngle + angle
    accumulatedAngle += angle

    const x1Outer = cx + rOuter * Math.cos(startAngle)
    const y1Outer = cy + rOuter * Math.sin(startAngle)
    const x2Outer = cx + rOuter * Math.cos(endAngle)
    const y2Outer = cy + rOuter * Math.sin(endAngle)

    const x1Inner = cx + rInner * Math.cos(endAngle)
    const y1Inner = cy + rInner * Math.sin(endAngle)
    const x2Inner = cx + rInner * Math.cos(startAngle)
    const y2Inner = cy + rInner * Math.sin(startAngle)

    const largeArcFlag = angle > Math.PI ? 1 : 0

    const pathData =
      fraction >= 0.999
        ? `M ${cx},${cy - rOuter} A ${rOuter},${rOuter} 0 1,1 ${cx},${cy + rOuter} A ${rOuter},${rOuter} 0 1,1 ${cx},${cy - rOuter} Z`
        : `M ${x1Outer},${y1Outer} A ${rOuter},${rOuter} 0 ${largeArcFlag},1 ${x2Outer},${y2Outer} L ${x1Inner},${y1Inner} A ${rInner},${rInner} 0 ${largeArcFlag},0 ${x2Inner},${y2Inner} Z`

    return {
      name: s.name,
      cases: s.cases,
      fraction,
      percentage: (fraction * 100).toFixed(1),
      color,
      pathData,
    }
  })

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm sm:text-base font-bold text-[#004b87]">{title}</h4>
          <p className="text-[11px] font-medium text-slate-500 mt-0.5">
            Proportional disease burden breakdown by ICD-11 diagnostic category
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="no-print inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          title="Download Donut Chart as PNG"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          <span>Download PNG</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 rounded-xl border border-slate-100 bg-slate-50/40 p-3">
        <div className="w-[220px] shrink-0">
          <svg
            ref={svgRef}
            viewBox="0 0 220 220"
            className="w-full h-auto block"
            style={{
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            {arcs.map((arc, idx) => (
              <path
                key={idx}
                d={arc.pathData}
                fill={arc.color}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            ))}
            <circle cx={cx} cy={cy} r={rInner - 2} fill="#ffffff" />
            <text
              x={cx}
              y={cy - 4}
              fontSize="14"
              fontWeight="900"
              fill="#0f172a"
              textAnchor="middle"
            >
              {totalCases.toLocaleString()}
            </text>
            <text
              x={cx}
              y={cy + 12}
              fontSize="7.5"
              fontWeight="700"
              fill="#64748b"
              textAnchor="middle"
              letterSpacing="0.3"
            >
              TOTAL KASUS
            </text>
          </svg>
        </div>

        <div className="flex-1 space-y-2 w-full">
          {arcs.map((arc, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-white px-3 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: arc.color }}
                />
                <span className="font-bold text-slate-800 truncate">{arc.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono font-black text-slate-900">
                  {arc.cases.toLocaleString()}
                </span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {arc.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export type CountryBurden = {
  country: string
  cases: number
  deaths: number
  cfr: number
}

interface CountryCfrBarChartProps {
  data: CountryBurden[]
  title?: string
}

export const CountryCfrBarChart: React.FC<CountryCfrBarChartProps> = ({
  data,
  title = "Case Fatality Rate (CFR) & Regional Burden Analysis",
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null)

  const handleDownload = () => {
    exportSvgToPng(svgRef.current, "asean_country_cases_and_cfr")
  }

  const topCountries = [...data].sort((a, b) => b.cases - a.cases).slice(0, 6)
  const maxCases = Math.max(...topCountries.map((c) => c.cases), 10)

  const rowHeight = 36
  const width = 800
  const height = topCountries.length * rowHeight + 40
  const labelWidth = 140
  const rightPad = 120
  const barMaxWidth = width - labelWidth - rightPad

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="text-sm sm:text-base font-bold text-[#004b87]">{title}</h4>
          <p className="text-[11px] font-medium text-slate-500 mt-0.5">
            Comparison of outbreak mortality and disease severity across member states
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="no-print inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          title="Download Bar Chart as PNG"
        >
          <Download className="h-3.5 w-3.5 text-slate-500" />
          <span>Download PNG</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block"
          style={{
            background: "#ffffff",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          {topCountries.map((c, i) => {
            const y = 20 + i * rowHeight
            const barW = maxCases > 0 ? (c.cases / maxCases) * barMaxWidth : 0
            const cfrColor =
              c.cfr > 1.0 ? "#dc2626" : c.cfr > 0.4 ? "#ea580c" : "#059669"

            return (
              <g key={c.country}>
                <text
                  x={labelWidth - 14}
                  y={y + 14}
                  fontSize="8.5"
                  fontWeight="800"
                  fill="#1e293b"
                  textAnchor="end"
                >
                  {c.country}
                </text>
                <rect
                  x={labelWidth}
                  y={y}
                  width={barMaxWidth}
                  height="20"
                  rx="4"
                  fill="#f1f5f9"
                />
                <rect
                  x={labelWidth}
                  y={y}
                  width={Math.max(barW, 6)}
                  height="20"
                  rx="4"
                  fill="#0060A9"
                />
                <text
                  x={labelWidth + barW + 10}
                  y={y + 14}
                  fontSize="8"
                  fontWeight="700"
                  fill="#334155"
                >
                  {c.cases.toLocaleString()} cases ({c.deaths} deaths)
                </text>
                <rect
                  x={width - 80}
                  y={y + 1}
                  width="65"
                  height="18"
                  rx="4"
                  fill={cfrColor}
                  opacity="0.9"
                />
                <text
                  x={width - 48}
                  y={y + 13}
                  fontSize="7.5"
                  fontWeight="800"
                  fill="#ffffff"
                  textAnchor="middle"
                >
                  CFR: {c.cfr.toFixed(2)}%
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
