'use client'

import { useState, useEffect } from 'react'
import { MapPin, Users, Skull, AlertTriangle, Bug, TrendingUp, MessageSquare, Shield, Radio } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { fetchDashboardStats, fetchSummary } from '@/lib/api'
import type { DashboardStats } from '@/types'

const COLORS = ['#0d9488', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#65a30d', '#059669']
const SENTIMENT_COLORS: Record<string, string> = { negative: '#dc2626', neutral: '#94a3b8', positive: '#16a34a' }
const RELEVANCE_COLORS: Record<string, string> = { high: '#16a34a', medium: '#eab308', low: '#94a3b8' }

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-extrabold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-slate-400">{icon}</span>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">{title}</h3>
      </div>
      <div className="h-[280px]">{children}</div>
    </div>
  )
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-800">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [summaryData, setSummaryData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchDashboardStats(),
      fetchSummary(),
    ])
      .then(([s, sum]) => { setStats(s); setSummaryData(sum) })
      .catch(() => { setStats(null); setSummaryData([]) })
      .finally(() => setLoading(false))
  }, [])

  const total = stats
    ? {
        locations: stats.by_location.length,
        cases: stats.by_disease.reduce((s, d) => s + d.cases, 0),
        deaths: stats.by_disease.reduce((s, d) => s + d.deaths, 0),
        events: stats.by_sentiment.reduce((s, d) => s + d.count, 0),
      }
    : { locations: 0, cases: 0, deaths: 0, events: 0 }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-400">Memuat dashboard...</div>
      </div>
    )
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Beranda</h1>
          <p className="mt-1 text-sm text-slate-500">Ringkasan surveilans penyakit berbasis AI</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={<MapPin className="h-5 w-5" />} label="Lokasi Terdeteksi" value={total.locations} sub={`Dari ${stats?.by_disease.length || 0} penyakit`} />
        <KpiCard icon={<Bug className="h-5 w-5" />} label="Total Kasus" value={total.cases.toLocaleString()} sub={`${total.events} events diproses`} />
        <KpiCard icon={<Skull className="h-5 w-5" />} label="Total Kematian" value={total.deaths.toLocaleString()} sub="Yang tercatat dalam events" />
        <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Total Events" value={total.events.toLocaleString()} sub="Semua sumber & bahasa" />
      </div>

      {/* Row 1: Disease + Location */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Kasus per Penyakit (Top 10)" icon={<Bug className="h-4 w-4" />}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.by_disease || []} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="cases" fill="#0d9488" radius={[0, 4, 4, 0]} name="Kasus" />
              <Bar dataKey="deaths" fill="#dc2626" radius={[0, 4, 4, 0]} name="Meninggal" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Kasus per Lokasi (Top 10)" icon={<MapPin className="h-4 w-4" />}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.by_location || []} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="cases" fill="#0891b2" radius={[0, 4, 4, 0]} name="Kasus" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: Sentiment + Relevance + Source */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ChartCard title="Distribusi Sentimen" icon={<MessageSquare className="h-4 w-4" />}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={stats?.by_sentiment || []} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {(stats?.by_sentiment || []).map((entry, i) => (
                  <Cell key={i} fill={SENTIMENT_COLORS[entry.name] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribusi Relevansi" icon={<TrendingUp className="h-4 w-4" />}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={stats?.by_relevance || []} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {(stats?.by_relevance || []).map((entry, i) => (
                  <Cell key={i} fill={RELEVANCE_COLORS[entry.name] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Kasus per Sumber" icon={<Radio className="h-4 w-4" />}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.by_source || []} layout="vertical" margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 9 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="cases" fill="#7c3aed" radius={[0, 4, 4, 0]} name="Kasus" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Summary Table */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Ringkasan per Lokasi</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Lokasi</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Penyakit</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Kasus</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Kematian</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Confidence</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Alert</th>
              </tr>
            </thead>
            <tbody>
              {summaryData.map((row: any, idx: number) => (
                <tr key={idx} className="border-b border-slate-50 hover:bg-teal-50/40">
                  <td className="px-4 py-3 font-medium text-slate-800">{row.location_name || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.disease_classification || '-'}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{row.total_cases}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{row.total_deaths}</td>
                  <td className="px-4 py-3 text-right text-slate-500">
                    {row.max_confidence != null ? `${(row.max_confidence * 100).toFixed(0)}%` : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.has_alert
                      ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Ya</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Tidak</span>
                    }
                  </td>
                </tr>
              ))}
              {summaryData.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">Belum ada data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
