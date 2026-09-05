'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Flame,
  Globe,
  HelpCircle,
  Layers,
  MapPin,
  RefreshCw,
  Skull,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import CountryFlag from './CountryFlag';
import {
  fetchSpatialHeatmap,
  SpatialHeatmapResponse,
  HeatmapCountryData,
  HeatmapMonthData,
} from '@/lib/api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Line,
  ComposedChart,
} from 'recharts';

export type HeatmapMetric = 'cases' | 'deaths' | 'cfr' | 'events';

export default function CaseLocationHeatmap() {
  const [data, setData] = useState<SpatialHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [activeMetric, setActiveMetric] = useState<HeatmapMetric>('cases');
  const [selectedCountry, setSelectedCountry] = useState<HeatmapCountryData | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    country: HeatmapCountryData;
    month: HeatmapMonthData;
  } | null>(null);

  const loadData = async (year: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSpatialHeatmap(year);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load spatial heatmap:', err);
      setError(err?.message || 'Gagal memuat data heatmap spasial');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedYear);
  }, [selectedYear]);

  // Calculate maximum values for relative coloring
  const metricStats = useMemo(() => {
    if (!data || !data.countries) {
      return { maxCases: 1, maxDeaths: 1, maxCfr: 10, maxEvents: 1 };
    }

    let maxCases = 1;
    let maxDeaths = 1;
    let maxCfr = 1;
    let maxEvents = 1;
    let peakMonthName = 'September';
    let peakMonthVal = 0;
    const monthTotals: Record<string, number> = {};

    data.countries.forEach((c) => {
      c.months.forEach((m) => {
        if (m.cases > maxCases) maxCases = m.cases;
        if (m.deaths > maxDeaths) maxDeaths = m.deaths;
        if (m.events > maxEvents) maxEvents = m.events;
        const cfr = m.cases > 0 ? (m.deaths / m.cases) * 100 : 0;
        if (cfr > maxCfr && cfr <= 100) maxCfr = cfr;

        monthTotals[m.month_name] = (monthTotals[m.month_name] || 0) + m.cases;
      });
    });

    Object.entries(monthTotals).forEach(([mName, val]) => {
      if (val > peakMonthVal) {
        peakMonthVal = val;
        peakMonthName = mName;
      }
    });

    return { maxCases, maxDeaths, maxCfr, maxEvents, peakMonthName, peakMonthVal };
  }, [data]);

  // Compact number formatting
  const formatCompact = (num: number): string => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(num >= 10_000 ? 0 : 1) + 'K';
    return num.toLocaleString('id-ID');
  };

  // Get cell display value and relative intensity 0..1
  const getCellDetails = (m: HeatmapMonthData) => {
    let rawVal = 0;
    let displayVal = '';
    let ratio = 0;

    if (activeMetric === 'cases') {
      rawVal = m.cases;
      displayVal = m.cases > 0 ? formatCompact(m.cases) : '?';
      ratio = metricStats.maxCases > 0 ? m.cases / metricStats.maxCases : 0;
    } else if (activeMetric === 'deaths') {
      rawVal = m.deaths;
      displayVal = m.deaths > 0 ? formatCompact(m.deaths) : '?';
      ratio = metricStats.maxDeaths > 0 ? m.deaths / metricStats.maxDeaths : 0;
    } else if (activeMetric === 'cfr') {
      const cfr = m.cases > 0 ? (m.deaths / m.cases) * 100 : 0;
      rawVal = cfr;
      displayVal = cfr > 0 ? `${cfr.toFixed(1)}%` : '?';
      ratio = metricStats.maxCfr > 0 ? Math.min(cfr / 15, 1) : 0;
    } else {
      rawVal = m.events;
      displayVal = m.events > 0 ? String(m.events) : '?';
      ratio = metricStats.maxEvents > 0 ? m.events / metricStats.maxEvents : 0;
    }

    return { rawVal, displayVal, ratio };
  };

  // Color mapping based on ratio and metric
  const getCellColorClass = (m: HeatmapMonthData) => {
    const { rawVal, ratio } = getCellDetails(m);
    if (rawVal === 0) {
      return 'bg-slate-100/70 border-slate-200/40 text-slate-400 hover:bg-slate-200/70';
    }

    if (ratio < 0.05) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100 font-medium';
    }
    if (ratio < 0.20) {
      return 'bg-amber-100/80 text-amber-800 border-amber-300 hover:bg-amber-200 font-semibold';
    }
    if (ratio < 0.55) {
      return 'bg-orange-200/90 text-orange-950 border-orange-400 hover:bg-orange-300 font-bold';
    }
    return 'bg-gradient-to-br from-rose-500 to-red-600 text-white border-rose-600 shadow-sm shadow-rose-500/30 hover:brightness-110 font-black';
  };

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  return (
    <section className="mt-6 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/50 p-5 lg:p-7 shadow-sm">
      {/* ?? Top Header Bar ?? */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-sky-700 uppercase">
              <Sparkles className="h-3 w-3 text-sky-600" />
              Spatial-Temporal Surveillance Matrix
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Published Date Synchronized
            </span>
          </div>
          <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900 lg:text-2xl">
            Surveillance Location Summary
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 lg:text-sm">
            Provides a concise overview of mapped signal locations, geographic distribution, affected areas, and emerging spatial patterns across monitored ASEAN countries based on source publication timestamps.
          </p>
        </div>

        {/* ?? Controls: Metric Tabs & Year Selector ?? */}
        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
          {/* Metric Selector Pills */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs font-semibold">
            <button
              onClick={() => setActiveMetric('cases')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                activeMetric === 'cases'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Kasus
            </button>
            <button
              onClick={() => setActiveMetric('deaths')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                activeMetric === 'deaths'
                  ? 'bg-white text-rose-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Skull className="h-3.5 w-3.5" />
              Kematian
            </button>
            <button
              onClick={() => setActiveMetric('cfr')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                activeMetric === 'cfr'
                  ? 'bg-white text-amber-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              CFR (%)
            </button>
            <button
              onClick={() => setActiveMetric('events')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                activeMetric === 'events'
                  ? 'bg-white text-purple-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              Sinyal
            </button>
          </div>

          {/* Year Selector */}
          <div className="relative inline-flex items-center">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              aria-label="Filter Tahun Heatmap"
              className="appearance-none rounded-xl border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-xs font-bold text-slate-700 shadow-xs hover:border-slate-300 focus:border-sky-500 focus:outline-none"
            >
              <option value={2026}>Tahun 2026</option>
              <option value={2025}>Tahun 2025</option>
              <option value={2024}>Tahun 2024</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-400" />
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadData(selectedYear)}
            disabled={loading}
            title="Muat Ulang Data Heatmap"
            aria-label="Muat Ulang Data Heatmap"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ?? KPI Stat Highlights Bar (Reference Image style: 11 ASEAN Countries, 54 Locations) ?? */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
        {/* Card 1: 11 ASEAN Countries */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900">
              11 Negara
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              ASEAN Coverage
            </div>
          </div>
        </div>

        {/* Card 2: 54 Monitored Locations */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900">
              54 Wilayah
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              Sub-national Points
            </div>
          </div>
        </div>

        {/* Card 3: Peak Month Detection */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900">
              {metricStats.peakMonthName} {selectedYear}
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              Puncak {formatCompact(metricStats.peakMonthVal)} Kasus
            </div>
          </div>
        </div>

        {/* Card 4: Total ASEAN Cases in Year */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900">
              {data ? formatCompact(data.summary.total_cases) : '...'}
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              Total Kasus ({data ? formatCompact(data.summary.total_deaths) : '0'} Wafat)
            </div>
          </div>
        </div>
      </div>

      {/* ?? Heatmap Grid ?? */}
      <div className="relative mt-6">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl bg-white/70 backdrop-blur-xs">
            <RefreshCw className="h-7 w-7 animate-spin text-sky-600" />
            <span className="mt-2 text-xs font-bold text-slate-600">
              Menghitung matriks spasial temporal...
            </span>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-xs">
          <table className="w-full min-w-[860px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-600">
                <th className="sticky left-0 z-10 w-56 bg-slate-50/95 px-4 py-3 shadow-xs">
                  Negara Anggota ASEAN
                </th>
                {monthNames.map((m) => (
                  <th
                    key={m}
                    className={`px-2.5 py-3 text-center transition-colors ${
                      m === metricStats.peakMonthName ? 'bg-amber-50/80 text-amber-900 font-black' : ''
                    }`}
                  >
                    {m}
                  </th>
                ))}
                <th className="w-28 px-4 py-3 text-right">
                  Total {selectedYear}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {data?.countries.map((c) => {
                const totalMetricVal =
                  activeMetric === 'cases'
                    ? c.total_cases
                    : activeMetric === 'deaths'
                    ? c.total_deaths
                    : activeMetric === 'cfr'
                    ? c.total_cases > 0
                      ? ((c.total_deaths / c.total_cases) * 100).toFixed(1) + '%'
                      : '0.0%'
                    : c.total_events;

                return (
                  <tr
                    key={c.country}
                    className="group transition-colors hover:bg-slate-50/70"
                  >
                    {/* Country Sticky Column */}
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5 shadow-xs group-hover:bg-slate-50/90">
                      <button
                        onClick={() => setSelectedCountry(c)}
                        className="flex w-full items-center justify-between text-left focus:outline-none"
                      >
                        <div className="flex items-center gap-2.5">
                          <CountryFlag
                            countryName={c.country}
                            shape="rounded"
                            size="sm"
                            className="shadow-xs ring-1 ring-slate-200/80"
                          />
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-blue-700">
                              {c.country}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-600">
                              ISO: {c.iso}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
                      </button>
                    </td>

                    {/* 12 Month Cells */}
                    {c.months.map((m) => {
                      const { displayVal } = getCellDetails(m);
                      const colorClass = getCellColorClass(m);

                      return (
                        <td
                          key={m.month_num}
                          onMouseEnter={() => setHoveredCell({ country: c, month: m })}
                          onMouseLeave={() => setHoveredCell(null)}
                          onClick={() => setSelectedCountry(c)}
                          className="cursor-pointer p-1.5 text-center"
                        >
                          <div
                            className={`flex h-10 w-full items-center justify-center rounded-lg border text-[11px] transition-all duration-150 group-hover:scale-[1.02] ${colorClass}`}
                          >
                            {displayVal}
                          </div>
                        </td>
                      );
                    })}

                    {/* Total Column */}
                    <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                      <div>
                        {typeof totalMetricVal === 'number'
                          ? formatCompact(totalMetricVal)
                          : totalMetricVal}
                      </div>
                      <div className="text-[10px] font-normal text-slate-600">
                        {activeMetric === 'cases'
                          ? `${formatCompact(c.total_deaths)} wafat`
                          : activeMetric === 'deaths'
                          ? `${formatCompact(c.total_cases)} kasus`
                          : activeMetric === 'cfr'
                          ? `${formatCompact(c.total_cases)} kasus`
                          : `${formatCompact(c.total_cases)} kasus`}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ?? Active Hover Popover / Tooltip ?? */}
      {hoveredCell && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200/90 bg-gradient-to-r from-sky-50/90 via-white to-blue-50/70 p-3 text-xs shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <CountryFlag
              countryName={hoveredCell.country.country}
              shape="rounded"
              size="md"
              className="shadow-xs"
            />
            <div>
              <span className="text-sm font-black text-slate-900">
                {hoveredCell.country.country}
              </span>
              <span className="ml-2 font-bold text-slate-500">
                ? {hoveredCell.month.month_name} {selectedYear}
              </span>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Berdasarkan artikel hasil crawling terbitan {hoveredCell.month.month_name} {selectedYear}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-sans">
            <div className="rounded-lg bg-white px-3 py-1.5 border border-slate-200/80 shadow-xs">
              <div className="text-[10px] font-bold text-slate-600 uppercase">Kasus Terdeteksi</div>
              <div className="text-sm font-black text-blue-700">
                {hoveredCell.month.cases.toLocaleString('id-ID')}
              </div>
            </div>
            <div className="rounded-lg bg-white px-3 py-1.5 border border-slate-200/80 shadow-xs">
              <div className="text-[10px] font-bold text-slate-600 uppercase">Kematian</div>
              <div className="text-sm font-black text-rose-700">
                {hoveredCell.month.deaths.toLocaleString('id-ID')}
              </div>
            </div>
            <div className="rounded-lg bg-white px-3 py-1.5 border border-slate-200/80 shadow-xs">
              <div className="text-[10px] font-bold text-slate-600 uppercase">Case Fatality Rate</div>
              <div className="text-sm font-black text-amber-700">
                {hoveredCell.month.cases > 0
                  ? ((hoveredCell.month.deaths / hoveredCell.month.cases) * 100).toFixed(2)
                  : '0.00'}
                %
              </div>
            </div>
            <div className="rounded-lg bg-white px-3 py-1.5 border border-slate-200/80 shadow-xs">
              <div className="text-[10px] font-bold text-slate-600 uppercase">Sinyal Surveilans</div>
              <div className="text-sm font-black text-purple-700">
                {hoveredCell.month.events} sinyal ({hoveredCell.month.alerts} prioritas)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ?? Bottom Legend & Info ?? */}
      <div className="mt-5 flex flex-col gap-3 border-t border-slate-200/80 pt-4 text-xs lg:flex-row lg:items-center lg:justify-between">
        {/* Scale Legend */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Intensitas Skala:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-7 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-400">
              0
            </span>
            <span className="text-[11px] text-slate-500">Nol / Belum ada data</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-7 items-center justify-center rounded border border-emerald-200 bg-emerald-100 text-[10px] font-bold text-emerald-800">
              Low
            </span>
            <span className="text-[11px] text-slate-500">Rendah</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-7 items-center justify-center rounded border border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-800">
              Med
            </span>
            <span className="text-[11px] text-slate-500">Sedang</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-7 items-center justify-center rounded border border-orange-400 bg-orange-200 text-[10px] font-bold text-orange-950">
              High
            </span>
            <span className="text-[11px] text-slate-500">Tinggi</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-7 items-center justify-center rounded border border-rose-600 bg-rose-500 text-[10px] font-bold text-white shadow-xs">
              Peak
            </span>
            <span className="text-[11px] text-slate-500">Kritis / Puncak</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-600">
          ?? Klik baris negara untuk melihat rincian grafik kurva bulanan secara terperinci.
        </div>
      </div>

      {/* ?? Modal Breakdown for Selected Country ?? */}
      {selectedCountry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <CountryFlag
                  countryName={selectedCountry.country}
                  shape="rounded"
                  size="lg"
                  className="shadow-sm"
                />
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    Epidemiological Profile: {selectedCountry.country}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Distribusi bulanan kasus, kematian, dan sinyal wabah tahun {selectedYear}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCountry(null)}
                aria-label="Tutup Detail Negara"
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal KPI Summary */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                  Total Kasus
                </div>
                <div className="mt-1 text-lg font-black text-blue-900">
                  {selectedCountry.total_cases.toLocaleString('id-ID')}
                </div>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-rose-700">
                  Total Kematian
                </div>
                <div className="mt-1 text-lg font-black text-rose-900">
                  {selectedCountry.total_deaths.toLocaleString('id-ID')}
                </div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                  Tingkat Fatalitas (CFR)
                </div>
                <div className="mt-1 text-lg font-black text-amber-900">
                  {selectedCountry.total_cases > 0
                    ? ((selectedCountry.total_deaths / selectedCountry.total_cases) * 100).toFixed(2)
                    : '0.00'}
                  %
                </div>
              </div>
            </div>

            {/* Modal Chart */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="mb-3 text-xs font-bold text-slate-700">
                Kurva Tren Kasus & Kematian Bulanan ({selectedCountry.country} - {selectedYear})
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={selectedCountry.months}
                    margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="month_name"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickFormatter={(v) => formatCompact(v)}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => [
                        Number(val).toLocaleString('id-ID'),
                        name === 'cases' ? 'Kasus Terdeteksi' : 'Kematian',
                      ]}
                      contentStyle={{
                        borderRadius: '0.75rem',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Bar
                      dataKey="cases"
                      fill="#0284c7"
                      radius={[4, 4, 0, 0]}
                      name="cases"
                    />
                    <Line
                      type="monotone"
                      dataKey="deaths"
                      stroke="#e11d48"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#e11d48' }}
                      name="deaths"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Modal Close Footer */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setSelectedCountry(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
