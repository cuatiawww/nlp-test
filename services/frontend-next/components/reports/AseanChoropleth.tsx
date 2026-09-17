'use client'

import { useId, useMemo, useState } from 'react'
import { ASEAN_GEOJSON } from '@/data/asean-countries'
import { ASEAN11_ISO3, CHOROPLETH_BLUES, ISO3_DISPLAY, NO_DATA_FILL } from '@/lib/asean-iso3'
import { AMS_ISO3_ORDER, amsPopup } from '@/lib/asean-map.mjs'
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

function BurdenPopup({
  iso3,
  row,
  pinned,
  onClose,
}: {
  iso3: string
  row?: AmsKpiRow
  pinned: boolean
  onClose: () => void
}) {
  const pop = amsPopup(row, iso3)
  return (
    <div
      role="dialog"
      aria-label={`${pop.name} cases and deaths`}
      className="no-print absolute left-3 top-3 z-10 w-56 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">{pop.name}</p>
          <p className="font-mono text-[10px] text-slate-400">{pop.iso3}</p>
        </div>
        {pinned ? (
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100"
            onClick={onClose}
          >
            Close
          </button>
        ) : (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Hover</span>
        )}
      </div>
      {pop.has_data ? null : (
        <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
          {pop.status}
        </p>
      )}
      <dl className="mt-2 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Cases</dt>
          <dd className="font-mono font-bold text-slate-900">{pop.cases}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">Deaths</dt>
          <dd className="font-mono font-bold text-slate-900">{pop.deaths}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">CFR</dt>
          <dd className="font-mono font-bold text-slate-900">{pop.cfr}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[10px] leading-snug text-slate-400">
        Click a country to pin. Missing is never shown as zero.
      </p>
    </div>
  )
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
  const hatchUid = `nodata-hatch-${useId().replace(/:/g, '')}`
  const metric = indicator === 'deaths' ? 'deaths' : 'cases'
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const active = pinned || hover

  const byIso = useMemo(() => {
    const map = new Map<string, AmsKpiRow>()
    for (const row of rows || []) {
      if (row.iso3) map.set(row.iso3.toUpperCase(), row)
    }
    return map
  }, [rows])

  const valued = useMemo(
    () =>
      (rows || [])
        .filter((r) => r.has_data)
        .map((r) => Number(r[metric] ?? 0))
        .filter((v) => Number.isFinite(v)),
    [rows, metric],
  )
  const breaks = useMemo(() => quantileBreaks(valued, Math.min(6, Math.max(3, valued.length))), [valued])

  const features = (ASEAN_GEOJSON.features || []) as Feature[]
  const singapore = features.find((f) => iso3Of(f) === 'SGP')

  const fillFor = (iso3: string | null) => {
    if (!iso3) return NO_DATA_FILL
    const row = byIso.get(iso3)
    if (!row || !row.has_data) return NO_DATA_FILL
    const value = Number(row[metric] ?? 0)
    const idx = classIndex(value, breaks)
    return CHOROPLETH_BLUES[Math.min(idx, CHOROPLETH_BLUES.length - 1)]
  }

  const select = (iso3: string | null) => {
    if (!iso3) {
      setPinned(null)
      return
    }
    setPinned((current) => (current === iso3 ? null : iso3))
  }

  const directory = AMS_ISO3_ORDER.map((iso3) => {
    const row = byIso.get(iso3)
    return { iso3, row, pop: amsPopup(row, iso3), fill: fillFor(iso3) }
  })

  return (
    <figure className="sitrep-keep sitrep-choropleth break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <figcaption className="mb-3">
        <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">
          {epiLabel ? `${epiLabel} · ` : ''}
          Color = {metric} (quantile among AMS with data). Click a country for cases, deaths, and CFR.
        </p>
      </figcaption>
      <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
        <div className="relative overflow-hidden rounded-xl bg-slate-50">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label={title}
            onClick={() => setPinned(null)}
          >
            <defs>
              <pattern id={hatchUid} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#9aa3b2" strokeWidth="1.2" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="#f8fafc" />
            {features.map((feature, idx) => {
              const iso3 = iso3Of(feature)
              const row = iso3 ? byIso.get(iso3) : undefined
              const missing = !row || !row.has_data
              const selected = iso3 === active
              return (
                <path
                  key={`${iso3 || 'x'}-${idx}`}
                  d={geomPath(feature.geometry)}
                  fill={fillFor(iso3)}
                  stroke={selected ? '#0f172a' : '#1e3a5f'}
                  strokeWidth={selected ? 2.2 : 0.7}
                  onMouseEnter={() => iso3 && setHover(iso3)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(event) => {
                    event.stopPropagation()
                    select(iso3)
                  }}
                  className="cursor-pointer"
                >
                  <title>
                    {ISO3_DISPLAY[iso3 as keyof typeof ISO3_DISPLAY] || iso3}
                    {missing ? ' — No data / Not reported' : ''}
                  </title>
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
                  fill={`url(#${hatchUid})`}
                  fillOpacity={0.35}
                  pointerEvents="none"
                />
              )
            })}
            {singapore ? (
              <g
                transform={`translate(${WIDTH - 150}, ${HEIGHT - 150})`}
                className="cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation()
                  select('SGP')
                }}
                onMouseEnter={() => setHover('SGP')}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  x="0"
                  y="0"
                  width="140"
                  height="140"
                  fill="white"
                  stroke={active === 'SGP' ? '#0f172a' : '#94a3b8'}
                  strokeWidth={active === 'SGP' ? 2 : 1}
                  rx="8"
                />
                <text x="10" y="16" fontSize="10" fill="#334155" fontWeight="700">
                  Singapore inset
                </text>
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
          {active ? (
            <BurdenPopup
              iso3={active}
              row={byIso.get(active)}
              pinned={pinned === active}
              onClose={() => setPinned(null)}
            />
          ) : (
            <p className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-500">
              Click a country
            </p>
          )}
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
              {i === 0 ? `Lower ${metric}` : i === CHOROPLETH_BLUES.length - 1 ? `Higher ${metric}` : `Class ${i + 1}`}
            </div>
          ))}
          <p className="mt-3 mb-1 font-bold uppercase tracking-wide text-slate-500">AMS</p>
          <ul className="max-h-64 space-y-0.5 overflow-auto pr-1 print:max-h-none print:overflow-visible print:space-y-0">
            {directory.map((item) => (
              <li key={item.iso3}>
                <button
                  type="button"
                  onClick={() => select(item.iso3)}
                  className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50 print:p-0.5 print:text-[9.5px] ${
                    active === item.iso3 ? 'bg-slate-100 ring-1 ring-slate-300' : ''
                  }`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-300" style={{ background: item.fill }} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{item.pop.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">{item.pop.cases}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 leading-relaxed text-[11px] text-slate-500">
            Missing is never mapped as zero or as the lightest sequential class. Admin-0 polygons only — no event pins.
          </p>
        </div>
      </div>
    </figure>
  )
}
