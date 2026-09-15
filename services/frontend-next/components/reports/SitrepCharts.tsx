'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AmsKpiRow, WeeklyPoint } from '@/types/sitrep'

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
