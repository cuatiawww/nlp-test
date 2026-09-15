'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { buildAmsWeekHeatmap, uniqueEpiWeeks } from '@/lib/report-templates'
import type { AmsKpiRow, AmsWeekPoint, DiseaseSeries, WeeklyPoint } from '@/types/sitrep'

const BLUES = ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c']

export function EpiCurveChart({
  series,
  title = 'Weekly epidemic curve (ASEAN-11)',
  epiLabel,
}: {
  series: WeeklyPoint[]
  title?: string
  epiLabel?: string
}) {
  const data = (series || []).map((p) => ({
    ...p,
    label: `W${p.week}`,
  }))
  return (
    <figure className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-3">
        <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{epiLabel ? `${epiLabel} · ` : ''}Unit: extracted cases and events · Source: materialized KPI snapshot</p>
      </figcaption>
      <div className="h-64">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="cases" name="Cases" fill="#3182bd" radius={[3, 3, 0, 0]} />
              <Bar dataKey="events" name="Events" fill="#08519c" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">No weekly series in this snapshot.</p>
        )}
      </div>
    </figure>
  )
}

export function AmsBarChart({
  rows,
  indicator = 'events',
  title = 'AMS comparison',
  epiLabel,
}: {
  rows: AmsKpiRow[]
  indicator?: 'events' | 'cases' | 'deaths'
  title?: string
  epiLabel?: string
}) {
  const data = (rows || [])
    .filter((r) => r.has_data)
    .map((r) => ({
      name: r.display_name,
      value: Number(r[indicator] ?? 0),
    }))
    .sort((a, b) => a.value - b.value)
  const missing = (rows || []).filter((r) => !r.has_data).map((r) => r.display_name)

  return (
    <figure className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-3">
        <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">
          {epiLabel ? `${epiLabel} · ` : ''}Unit: {indicator} · AMS with no matching events omitted from bars (listed as no data)
        </p>
      </figcaption>
      <div className="h-72">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, left: 16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" name={indicator} fill="#3182bd" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">No AMS reported {indicator} in this window.</p>
        )}
      </div>
      {missing.length ? (
        <p className="mt-2 text-[11px] text-slate-500">No data / Not reported: {missing.join(', ')}</p>
      ) : null}
    </figure>
  )
}

export function WeeklyLineChart({
  series,
  title = 'Weekly trend (ASEAN-11)',
  epiLabel,
}: {
  series: WeeklyPoint[]
  title?: string
  epiLabel?: string
}) {
  const data = (series || []).map((p) => ({ ...p, label: `W${p.week}` }))
  return (
    <figure className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-3">
        <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">
          {epiLabel ? `${epiLabel} · ` : ''}Line = extracted cases; bars in companion figures use events. Missing AMS are omitted, not zero-filled.
        </p>
      </figcaption>
      <div className="h-64">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cases" name="Cases" stroke="#3182bd" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="events" name="Events" stroke="#08519c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-full items-center justify-center text-sm text-slate-500">No weekly series in this snapshot.</p>
        )}
      </div>
    </figure>
  )
}

export function DiseaseSmallMultiples({
  series,
  title = 'Disease signals (small multiples)',
}: {
  series: DiseaseSeries[]
  title?: string
}) {
  const items = (series || []).slice(0, 8)
  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-3">
        <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">Top diseases by event count. Empty panes mean no matching events for that disease-week, not a plotted zero series.</p>
      </figcaption>
      {items.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => {
            const data = (item.series || []).map((p) => ({ ...p, label: `W${p.week}` }))
            return (
              <div key={item.disease_code} className="break-inside-avoid rounded-xl border border-slate-100 p-2">
                <p className="mb-1 truncate text-[11px] font-bold text-slate-700">{item.name}</p>
                <div className="h-24">
                  {data.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
                        <Bar dataKey="events" fill="#3182bd" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="flex h-full items-center justify-center text-[11px] text-slate-400">No data</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No disease-week series in this snapshot.</p>
      )}
    </figure>
  )
}

function cellFill(value: number | null, max: number) {
  if (value == null || max <= 0) return null
  const t = value / max
  const idx = Math.min(BLUES.length - 1, Math.max(0, Math.floor(t * (BLUES.length - 1))))
  return BLUES[idx]
}

export function AmsWeekHeatmap({
  rows,
  fallbackWeeks,
  title = 'AMS × week heatmap (events)',
}: {
  rows?: AmsWeekPoint[]
  fallbackWeeks?: { year: number; week: number }[]
  title?: string
}) {
  const weeks = uniqueEpiWeeks(rows, fallbackWeeks).slice(-12)
  const grid = buildAmsWeekHeatmap(rows, weeks)
  const max = Math.max(
    0,
    ...grid.flatMap((row) => row.cells.map((c) => (c.isMissing ? 0 : c.value || 0))),
  )

  return (
    <figure className="break-inside-avoid overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-3">
        <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">
          Hatched gray cells are No data / Not reported. They are not encoded as zero and do not use the lightest sequential class.
        </p>
      </figcaption>
      {weeks.length ? (
        <table className="min-w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-2 py-1 text-left font-bold text-slate-500">AMS</th>
              {weeks.map((w) => (
                <th key={`${w.year}-${w.week}`} className="px-1 py-1 text-center font-mono text-slate-500">
                  {w.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => (
              <tr key={row.iso3}>
                <th className="sticky left-0 bg-white px-2 py-1 text-left font-semibold text-slate-700">{row.display_name}</th>
                {row.cells.map((cell, i) => (
                  <td
                    key={`${row.iso3}-${weeks[i].year}-${weeks[i].week}`}
                    title={cell.label}
                    className="h-7 w-8 border border-white text-center font-mono"
                    style={
                      cell.isMissing
                        ? {
                            backgroundImage:
                              'repeating-linear-gradient(45deg, #e2e8f0, #e2e8f0 2px, #cbd5e1 2px, #cbd5e1 4px)',
                            color: '#64748b',
                          }
                        : { backgroundColor: cellFill(cell.value, max) || '#eff3ff', color: (cell.value || 0) > max * 0.6 ? '#fff' : '#0f172a' }
                    }
                  >
                    {cell.isMissing ? '—' : cell.value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-500">No AMS-week cells in this snapshot.</p>
      )}
    </figure>
  )
}
