'use client'

import { useMemo, useState } from 'react'
import { ASEAN_GEOJSON } from '@/data/asean-countries'
import { ASEAN11_ISO3, CHOROPLETH_BLUES, ISO3_DISPLAY, NO_DATA_FILL } from '@/lib/asean-iso3'
import type { AmsKpiRow } from '@/types/sitrep'

type Feature = {
  type: string
  properties: { name?: string; ISO_A3?: string }
  geometry: { type: string; coordinates: any }
}

const VIEW = { minLon: 92, maxLon: 142, minLat: -12, maxLat: 29 }
const WIDTH = 720
const HEIGHT = 520

function project(lon: number, lat: number, box = VIEW, w = WIDTH, h = HEIGHT) {
  const x = ((lon - box.minLon) / (box.maxLon - box.minLon)) * w
  const y = ((box.maxLat - lat) / (box.maxLat - box.minLat)) * h
  return [x, y]
}

function ringPath(ring: number[][], box = VIEW, w = WIDTH, h = HEIGHT) {
  return (
    ring
      .map((pt, i) => {
        const [x, y] = project(pt[0], pt[1], box, w, h)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ') + ' Z'
  )
}

function geomPath(geometry: Feature['geometry'], box = VIEW, w = WIDTH, h = HEIGHT) {
  const parts: string[] = []
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) parts.push(ringPath(ring, box, w, h))
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) parts.push(ringPath(ring, box, w, h))
    }
  }
  return parts.join(' ')
}

function quantileBreaks(values: number[], classes = 6) {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b)
  if (!sorted.length) return []
  const breaks: number[] = []
  for (let i = 1; i < classes; i += 1) {
    const idx = Math.floor((i * sorted.length) / classes)
    breaks.push(sorted[Math.min(idx, sorted.length - 1)])
  }
  return breaks
}

function classIndex(value: number, breaks: number[]) {
  let i = 0
  while (i < breaks.length && value > breaks[i]) i += 1
  return i
}

function iso3Of(feature: Feature) {
  if (feature.properties?.ISO_A3) return feature.properties.ISO_A3
  const name = feature.properties?.name || ''
  return ASEAN11_ISO3[name as keyof typeof ASEAN11_ISO3] || null
}

export default function AseanChoropleth({
  rows,
  indicator = 'cases',
  epiLabel,
  title = 'ASEAN-11 choropleth (Admin-0)',
}: {
  rows: AmsKpiRow[]
  indicator?: 'events' | 'cases' | 'deaths'
  epiLabel?: string
  title?: string
}) {
  const [hover, setHover] = useState<string | null>(null)
  const byIso = useMemo(() => {
    const map = new Map<string, AmsKpiRow>()
    for (const row of rows || []) {
      if (row.iso3) map.set(row.iso3, row)
    }
    return map
  }, [rows])

  const valued = useMemo(
    () =>
      (rows || [])
        .filter((r) => r.has_data)
        .map((r) => Number(r[indicator] ?? 0))
        .filter((v) => Number.isFinite(v)),
    [rows, indicator],
  )
  const breaks = useMemo(() => quantileBreaks(valued, Math.min(6, Math.max(3, valued.length))), [valued])

  const features = (ASEAN_GEOJSON.features || []) as Feature[]
  const singapore = features.find((f) => iso3Of(f) === 'SGP')

  const fillFor = (iso3: string | null) => {
    if (!iso3) return NO_DATA_FILL
    const row = byIso.get(iso3)
    if (!row || !row.has_data) return NO_DATA_FILL
    const value = Number(row[indicator] ?? 0)
    const idx = classIndex(value, breaks)
    return CHOROPLETH_BLUES[Math.min(idx, CHOROPLETH_BLUES.length - 1)]
  }

  const hovered = hover ? byIso.get(hover) : null

  return (
    <figure className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-3">
        <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">
          {epiLabel ? `${epiLabel} · ` : ''}
          Unit: {indicator} · Classification: quantile among AMS with data · Join: ISO 3166-1 alpha-3
        </p>
      </figcaption>
      <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
        <div className="relative overflow-hidden rounded-xl bg-slate-50">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={title}>
            <defs>
              <pattern id="nodata-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#9aa3b2" strokeWidth="1.2" />
              </pattern>
            </defs>
            {features.map((feature, idx) => {
              const iso3 = iso3Of(feature)
              const row = iso3 ? byIso.get(iso3) : undefined
              const missing = !row || !row.has_data
              return (
                <path
                  key={`${iso3 || 'x'}-${idx}`}
                  d={geomPath(feature.geometry)}
                  fill={fillFor(iso3)}
                  stroke="#1e3a5f"
                  strokeWidth={iso3 === hover ? 1.8 : 0.7}
                  onMouseEnter={() => iso3 && setHover(iso3)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-pointer"
                >
                  {missing ? <title>{ISO3_DISPLAY[iso3 as keyof typeof ISO3_DISPLAY] || iso3} — No data / Not reported</title> : null}
                </path>
              )
            })}
            {features.map((feature, idx) => {
              const iso3 = iso3Of(feature)
              const row = iso3 ? byIso.get(iso3) : undefined
              if (row && row.has_data) return null
              return (
                <path
                  key={`hatch-${iso3 || idx}`}
                  d={geomPath(feature.geometry)}
                  fill="url(#nodata-hatch)"
                  fillOpacity={0.35}
                  pointerEvents="none"
                />
              )
            })}
            {singapore ? (
              <g transform={`translate(${WIDTH - 150}, ${HEIGHT - 150})`}>
                <rect x="0" y="0" width="140" height="140" fill="white" stroke="#94a3b8" rx="8" />
                <text x="10" y="16" fontSize="10" fill="#334155" fontWeight="700">Singapore inset</text>
                <g transform="translate(8, 24)">
                  <path
                    d={geomPath(singapore.geometry, { minLon: 103.6, maxLon: 104.05, minLat: 1.22, maxLat: 1.48 }, 124, 100)}
                    fill={fillFor('SGP')}
                    stroke="#1e3a5f"
                    strokeWidth="1"
                  />
                </g>
              </g>
            ) : null}
          </svg>
          {hover ? (
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-sm">
              <p className="font-bold text-slate-900">{ISO3_DISPLAY[hover as keyof typeof ISO3_DISPLAY] || hover}</p>
              {hovered?.has_data ? (
                <p className="text-slate-600">
                  {indicator}: {hovered[indicator] ?? 0}
                  {hovered.cfr != null ? ` · CFR ${hovered.cfr}%` : ''}
                </p>
              ) : (
                <p className="text-slate-500">No data / Not reported</p>
              )}
            </div>
          ) : null}
        </div>
        <div className="text-xs text-slate-600">
          <p className="mb-2 font-bold uppercase tracking-wide text-slate-500">Legend</p>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-4 w-6 rounded border border-slate-300" style={{ background: `repeating-linear-gradient(45deg,#d0d5dd,#d0d5dd 3px,#9aa3b2 3px,#9aa3b2 5px)` }} />
            No data / Not reported
          </div>
          {CHOROPLETH_BLUES.slice(0, Math.max(breaks.length + 1, 3)).map((color, i) => (
            <div key={color} className="mb-1 flex items-center gap-2">
              <span className="h-4 w-6 rounded border border-slate-300" style={{ background: color }} />
              {i === 0 ? 'Lower' : i === CHOROPLETH_BLUES.length - 1 ? 'Higher' : `Class ${i + 1}`}
            </div>
          ))}
          <p className="mt-3 leading-relaxed text-[11px] text-slate-500">
            Missing is never mapped as zero or as the lightest sequential class. Admin-0 polygons only — no event pins.
          </p>
        </div>
      </div>
    </figure>
  )
}
