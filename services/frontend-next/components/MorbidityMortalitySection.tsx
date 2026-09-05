'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Filter,
  Flame,
  HelpCircle,
  Info,
  Layers,
  Percent,
  RefreshCw,
  Skull,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  fetchMorbidityMortality,
  MorbidityMortalityResponse,
  WeeklyMorbidityMortality,
  DiseaseMorbidityMortality,
} from '@/lib/api';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

const DISEASE_FILTER_OPTIONS = [
  { label: 'Semua Topik Kesehatan (All Health Topics)', value: 'all' },
  { label: 'Demam Berdarah (DBD)', value: 'dbd' },
  { label: 'Campak (Measles)', value: 'campak' },
  { label: 'HFMD (Flu Singapura)', value: 'hfmd' },
  { label: 'COVID-19', value: 'covid' },
  { label: 'Influenza', value: 'influenza' },
  { label: 'Rabies', value: 'rabies' },
  { label: 'Kolera (Cholera)', value: 'cholera' },
];

export default function MorbidityMortalitySection() {
  const [data, setData] = useState<MorbidityMortalityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDisease, setSelectedDisease] = useState<string>('all');
  const [selectedWeeks, setSelectedWeeks] = useState<number>(12);

  const loadData = async (disease: string, weeks: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMorbidityMortality({ disease, weeks });
      setData(res);
    } catch (err: any) {
      console.error('Failed to load morbidity and mortality:', err);
      setError(err?.message || 'Gagal memuat data kasus & kematian');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDisease, selectedWeeks);
  }, [selectedDisease, selectedWeeks]);

  const formatCompact = (num: number): string => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(num >= 10_000 ? 0 : 1) + 'K';
    return num.toLocaleString('id-ID');
  };

  // Max values for relative horizontal bars in top diseases list
  const maxCasesInList = useMemo(() => {
    if (!data?.top_diseases || data.top_diseases.length === 0) return 1;
    return Math.max(...data.top_diseases.map((d) => d.total_cases), 1);
  }, [data]);

  const maxDeathsInList = useMemo(() => {
    if (!data?.top_diseases || data.top_diseases.length === 0) return 1;
    return Math.max(...data.top_diseases.map((d) => d.total_deaths), 1);
  }, [data]);

  const latestWeekPoint = useMemo(() => {
    if (!data?.weekly_trends || data.weekly_trends.length === 0) return null;
    return data.weekly_trends[data.weekly_trends.length - 1];
  }, [data]);

  return (
    <section className="mt-6 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/50 p-5 lg:p-7 shadow-sm">
      {/* ?? Top Header Bar ?? */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-sky-700 uppercase">
              <Sparkles className="h-3 w-3 text-sky-600" />
              Surveillance & Impact Matrix
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Synchronized Real-Time Data
            </span>
          </div>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900 lg:text-2xl uppercase">
            Case & Fatality Overview
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 lg:text-sm">
            Provides an overview of reported cases and deaths, highlighting trends, impact, affected populations, and changes across monitored ASEAN countries over time.
          </p>
        </div>

        {/* ?? Controls: Health Topic Filter & Weeks Selector ?? */}
        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
          {/* Health Topic Selector Dropdown */}
          <div className="relative inline-flex items-center">
            <select
              value={selectedDisease}
              onChange={(e) => setSelectedDisease(e.target.value)}
              aria-label="Filter Topik Kesehatan"
              className="appearance-none rounded-xl border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-xs font-bold text-slate-700 shadow-xs hover:border-slate-300 focus:border-sky-500 focus:outline-none"
            >
              {DISEASE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-400" />
          </div>

          {/* Weeks Selector Pills */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs font-semibold">
            <button
              onClick={() => setSelectedWeeks(8)}
              className={`rounded-lg px-2.5 py-1 transition-all ${
                selectedWeeks === 8
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              8 Minggu
            </button>
            <button
              onClick={() => setSelectedWeeks(12)}
              className={`rounded-lg px-2.5 py-1 transition-all ${
                selectedWeeks === 12
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              12 Minggu
            </button>
            <button
              onClick={() => setSelectedWeeks(16)}
              className={`rounded-lg px-2.5 py-1 transition-all ${
                selectedWeeks === 16
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              16 Minggu
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadData(selectedDisease, selectedWeeks)}
            disabled={loading}
            title="Muat Ulang Morbiditas & Mortalitas"
            aria-label="Muat Ulang Morbiditas & Mortalitas"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ?? 3 Big Stat KPI Cards (Image format: TOTAL MORBIDITY, TOTAL MORTALITY, CFR) ?? */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-4">
        {/* Card 1: TOTAL MORBIDITY */}
        <div className="flex items-center gap-3.5 rounded-xl border border-sky-200/80 bg-gradient-to-br from-white to-sky-50/50 p-4 shadow-xs">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 shadow-2xs">
            <Activity className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-wider text-sky-800">
              Total Morbidity
            </div>
            <div className="text-2xl font-black text-slate-900 truncate">
              {data ? data.summary.total_morbidity.toLocaleString('id-ID') : '...'}
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              Total Kasus Sakit Terdeteksi
            </div>
          </div>
        </div>

        {/* Card 2: TOTAL MORTALITY */}
        <div className="flex items-center gap-3.5 rounded-xl border border-rose-200/80 bg-gradient-to-br from-white to-rose-50/50 p-4 shadow-xs">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 shadow-2xs">
            <Skull className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-wider text-rose-800">
              Total Mortality
            </div>
            <div className="text-2xl font-black text-slate-900 truncate">
              {data ? data.summary.total_mortality.toLocaleString('id-ID') : '...'}
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              Total Kematian Terlapor
            </div>
          </div>
        </div>

        {/* Card 3: CFR (Case Fatality Rate) */}
        <div className="flex items-center gap-3.5 rounded-xl border border-amber-200/80 bg-gradient-to-br from-white to-amber-50/50 p-4 shadow-xs">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 shadow-2xs">
            <Percent className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-wider text-amber-800">
              Case Fatality Rate (CFR)
            </div>
            <div className="text-2xl font-black text-amber-900">
              {data ? `${data.summary.cfr_pct.toFixed(2)}%` : '...'}
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              Rasio Kematian terhadap Kasus
            </div>
          </div>
        </div>
      </div>

      {/* ?? Main Dual Section: Weekly Case Trend (Center) & Top Health Topics Cases vs Deaths (Right) ?? */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* CENTER / LEFT: Weekly Trend of Morbidity & Mortality (Dual Y-Axis Area + Line) */}
        <div className="lg:col-span-7 flex flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700 font-bold">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">
                  Weekly Case & Fatality Trend
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Dinamika mingguan kasus (sumbu kiri) vs kematian (sumbu kanan)
              </p>
            </div>

            {/* Latest point indicators matching reference image */}
            {latestWeekPoint && (
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                  Kasus: {formatCompact(latestWeekPoint.morbidity)}
                </span>
                <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                  Wafat: {formatCompact(latestWeekPoint.mortality)}
                </span>
              </div>
            )}
          </div>

          {/* Dual Y-Axis Chart */}
          <div className="mt-4 h-80 w-full">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-sky-600" />
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center text-xs text-rose-600">
                {error}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={data?.weekly_trends || []}
                  margin={{ top: 15, right: 15, left: -5, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorMorbidity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="week_label"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  {/* Left Y-Axis for Morbidity (Cases) */}
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    tick={{ fontSize: 11, fill: '#0284c7' }}
                    axisLine={{ stroke: '#0284c7' }}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  {/* Right Y-Axis for Mortality (Deaths) */}
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#e11d48' }}
                    axisLine={{ stroke: '#e11d48' }}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      Number(val).toLocaleString('id-ID'),
                      name === 'morbidity' ? 'Morbiditas (Kasus)' : 'Mortalitas (Kematian)',
                    ]}
                    labelFormatter={(label) => `Periode: ${label}`}
                    contentStyle={{
                      borderRadius: '0.75rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="morbidity"
                    name="Morbiditas (Kasus)"
                    fill="url(#colorMorbidity)"
                    stroke="#0284c7"
                    strokeWidth={2.5}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="mortality"
                    name="Mortalitas (Wafat)"
                    stroke="#e11d48"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#e11d48' }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#0284c7]" />
              Sumbu Kiri (Biru): Volume Kasus
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#e11d48]" />
              Sumbu Kanan (Merah): Volume Kematian
            </span>
          </div>
        </div>

        {/* RIGHT: Top Health Topics by Total Cases and Deaths (Butterfly Comparative Bar Chart) */}
        <div className="lg:col-span-5 flex flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700 font-bold">
                  <Layers className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">
                  Top Health Topics by Cases & Deaths
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Rasio komparasi kasus vs kematian per topik kesehatan
              </p>
            </div>
          </div>

          {/* Table Header Columns */}
          <div className="mt-3 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400 px-1 border-b border-slate-100 pb-1.5">
            <span className="w-1/3">Topik Kesehatan</span>
            <span className="w-1/3 text-center text-sky-700 font-bold">Total Cases</span>
            <span className="w-1/3 text-right text-rose-700 font-bold">Total Deaths</span>
          </div>

          {/* Comparative Rows */}
          <div className="mt-2 flex flex-col divide-y divide-slate-100 overflow-y-auto max-h-[320px] pr-1">
            {data?.top_diseases.map((d) => {
              const casesPct = Math.max(Math.round((d.total_cases / maxCasesInList) * 100), 2);
              const deathsPct = Math.max(Math.round((d.total_deaths / maxDeathsInList) * 100), 2);

              return (
                <div
                  key={d.disease}
                  onClick={() => {
                    // Match to filter option if exists
                    const opt = DISEASE_FILTER_OPTIONS.find((o) =>
                      d.disease.toLowerCase().includes(o.value)
                    );
                    if (opt) setSelectedDisease(opt.value);
                  }}
                  className="py-2 px-1 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                  title="Klik untuk memfilter kurva mingguan ke penyakit ini"
                >
                  {/* Top row: Health topic name + CFR badge */}
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                    <span className="truncate max-w-[170px]">{d.disease}</span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-black ${
                        d.cfr_pct > 5
                          ? 'bg-rose-100 text-rose-700'
                          : d.cfr_pct > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      CFR: {d.cfr_pct.toFixed(2)}%
                    </span>
                  </div>

                  {/* Bottom comparative bars */}
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {/* Left Bar (Cases) */}
                    <div className="flex flex-col gap-0.5">
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${casesPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-sky-800 font-mono">
                        {d.total_cases.toLocaleString('id-ID')} kasus
                      </span>
                    </div>

                    {/* Right Bar (Deaths) */}
                    <div className="flex flex-col gap-0.5 text-right">
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex justify-end">
                        <div
                          className="h-full rounded-full bg-rose-500"
                          style={{ width: `${deathsPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-rose-800 font-mono">
                        {d.total_deaths.toLocaleString('id-ID')} wafat
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2">
            <span>?? Klik baris topik kesehatan untuk menyaring grafik mingguan.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
