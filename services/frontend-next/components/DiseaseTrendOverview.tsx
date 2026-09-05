'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  Flame,
  Globe,
  Info,
  Layers,
  RefreshCw,
  TrendingDown,
} from 'lucide-react';
import CountryFlag from './CountryFlag';
import {
  fetchDiseaseTrendOverview,
  DiseaseTrendOverviewData,
  PriorityDiseaseAlert,
} from '@/lib/api';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

export default function DiseaseTrendOverview() {
  const [data, setData] = useState<DiseaseTrendOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(7);
  const [showAllAlerts, setShowAllAlerts] = useState<boolean>(false);
  const [expandedDisease, setExpandedDisease] = useState<string | null>(null);
  const [visibleLines, setVisibleLines] = useState<Record<string, boolean>>({
    dbd: true,
    campak: true,
    covid: true,
    rabies: true,
    hfmd: true,
  });

  const loadData = async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchDiseaseTrendOverview(days);
      setData(res);
    } catch (err: any) {
      console.error('Failed to load disease trend overview:', err);
      setError(err?.message || 'Failed to load surveillance trend summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDays);
  }, [selectedDays]);

  const formatCompact = (num: number): string => {
    const value = Number(num);
    if (!Number.isFinite(value)) return '0';
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
    if (value >= 1_000) return (value / 1_000).toFixed(value >= 10_000 ? 0 : 1) + 'K';
    return value.toLocaleString('id-ID');
  };

  const toggleLine = (dataKey: string) => {
    setVisibleLines((prev) => ({
      ...prev,
      [dataKey]: !prev[dataKey],
    }));
  };

  const displayedAlerts = useMemo(() => {
    if (!data?.priority_alerts) return [];
    return showAllAlerts
      ? data.priority_alerts
      : data.priority_alerts.slice(0, 5);
  }, [data, showAllAlerts]);

  // Color mapping for diseases
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'TINGGI':
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black tracking-wider text-rose-600 uppercase shadow-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            TINGGI
          </span>
        );
      case 'SEDANG':
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black tracking-wider text-amber-700 uppercase">
            SEDANG
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black tracking-wider text-emerald-700 uppercase">
            RENDAH
          </span>
        );
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/50 p-5 lg:p-7 shadow-sm">
      {/* ?? Header Bar ?? */}
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-xl font-black tracking-tight text-slate-900 lg:text-2xl">
            Health Topic Signals & Trends by Country
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 lg:text-sm">
            Shows health topics with the highest case burden, countries with the greatest signal concentration based on NLP extraction, and the latest daily case trends across ASEAN.
          </p>
        </div>

        {/* ?? Controls: Day Filter & Refresh ?? */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs font-semibold">
            <button
              onClick={() => setSelectedDays(7)}
              className={`rounded-lg px-3 py-1.5 transition-all ${
                selectedDays === 7
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setSelectedDays(14)}
              className={`rounded-lg px-3 py-1.5 transition-all ${
                selectedDays === 14
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              14 Days
            </button>
            <button
              onClick={() => setSelectedDays(30)}
              className={`rounded-lg px-3 py-1.5 transition-all ${
                selectedDays === 30
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 Days
            </button>
          </div>

          <button
            onClick={() => loadData(selectedDays)}
            disabled={loading}
            title="Reload Trend Summary"
            aria-label="Reload Trend Summary"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ?? Quick KPI Stat Highlights ?? */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900">
              {data?.summary.total_diseases ?? 15} Health Topics
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              Total Monitored Classifications
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900">
              DBD ({data?.summary.top_burden_country ?? 'Philippines'})
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              Highest Case Burden
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900">
              HFMD (Malaysia)
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              1.33M Case Concentration
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-xs">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900">
              Campak & COVID-19
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              Indonesia Dominance
            </div>
          </div>
        </div>
      </div>

      {/* ?? Main 2-Column Section: Sinyal Prioritas (Left) & Tren Kasus Harian (Right) ?? */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: Sinyal Prioritas List & Country Breakdown */}
        <div className="lg:col-span-6 flex flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
                <h3 className="text-sm font-black text-slate-900">
                  Priority Signals
                </h3>
                <p className="text-[11px] text-slate-500">
                  Health topics with the highest country case counts (NLP Extraction)
                </p>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              {data?.priority_alerts.length ?? 0} Jenis
            </span>
          </div>

          {/* Alert List Rows */}
          <div className="mt-3 flex flex-col divide-y divide-slate-100">
            {loading && (
              <div className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-sky-600" />
                <span className="mt-2 text-xs font-semibold text-slate-500">
                  Memuat data surveilans...
                </span>
              </div>
            )}

            {error && (
              <div className="my-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}

            {!loading && displayedAlerts.map((item) => {
              const isExpanded = expandedDisease === item.disease;

              return (
                <div key={item.disease} className="py-2.5 transition-colors">
                  <div
                    onClick={() => setExpandedDisease(isExpanded ? null : item.disease)}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg p-1.5 hover:bg-slate-50/80"
                  >
                    {/* Disease Icon & Name */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-black text-xs">
                        {item.disease.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {item.disease}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span>Total ASEAN:</span>
                          <span className="font-bold text-slate-700">
                            {formatCompact(item.total_asean_cases)} cases
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Top Country with Flag */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 text-right">
                        <CountryFlag
                          countryName={item.top_country}
                          shape="rounded"
                          size="sm"
                          className="shadow-2xs"
                        />
                        <div className="text-left">
                          <div className="text-xs font-bold text-slate-800">
                            {item.top_country}
                          </div>
                          <div className="text-[10px] text-slate-600">
                            {formatCompact(item.top_country_cases)} cases
                          </div>
                        </div>
                      </div>

                      {/* Detection Date */}
                      <div className="hidden sm:block text-right">
                        <div className="text-[11px] font-semibold text-slate-600">
                          {item.latest_published_label || 'Latest'}
                        </div>
                      </div>

                      {/* Severity Badge */}
                      <div>{getSeverityBadge(item.severity)}</div>

                      {/* Chevron Toggle */}
                      <div className="text-slate-400">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Breakdown for this Disease */}
                  {isExpanded && (
                    <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs animate-in fade-in duration-150">
                      <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase">
                        <span>Cross-Country Case Distribution ({item.disease})</span>
                        <span>{item.country_breakdown.length} Affected Countries</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {item.country_breakdown.map((cb) => {
                          const pct =
                            item.total_asean_cases > 0
                              ? Math.round((cb.cases / item.total_asean_cases) * 100)
                              : 0;

                          return (
                            <div key={cb.country} className="flex flex-col gap-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <div className="flex items-center gap-2">
                                  <CountryFlag
                                    countryName={cb.country}
                                    shape="rounded"
                                    size="xs"
                                  />
                                  <span className="font-semibold text-slate-800">
                                    {cb.country}
                                  </span>
                                  {cb.country === item.top_country && (
                                    <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-700">
                                      Highest
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 font-mono">
                                  <span className="font-bold text-slate-900">
                                    {formatCompact(cb.cases)} cases
                                  </span>
                                  <span className="text-slate-600">({pct}%)</span>
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    cb.country === item.top_country
                                      ? 'bg-rose-500'
                                      : 'bg-sky-500'
                                  }`}
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Toggle All Alerts Button */}
          {data && data.priority_alerts.length > 5 && (
            <button
              onClick={() => setShowAllAlerts(!showAllAlerts)}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-bold text-blue-700 hover:bg-slate-50 transition-colors"
            >
              {showAllAlerts ? 'Show Less' : 'View All Signals (' + data.priority_alerts.length + ' Topics)'}
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showAllAlerts ? '-rotate-90' : 'rotate-90'}`} />
            </button>
          )}
        </div>

        {/* RIGHT COLUMN: Multi-Day Trend Chart */}
        <div className="lg:col-span-6 flex flex-col rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
                <h3 className="text-sm font-black text-slate-900">
                  Detected Case Trend ({selectedDays} Days)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Daily detected-case fluctuation for priority health topics
                </p>
            </div>
          </div>

          {/* Interactive Legend Pills */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <button
              onClick={() => toggleLine('dbd')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-all ${
                visibleLines.dbd
                  ? 'bg-sky-100 text-sky-800 border border-sky-300 font-bold'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 line-through'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[#0284c7]" />
              DBD
            </button>
            <button
              onClick={() => toggleLine('campak')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-all ${
                visibleLines.campak
                  ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 line-through'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
              Campak
            </button>
            <button
              onClick={() => toggleLine('covid')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-all ${
                visibleLines.covid
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 line-through'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[#10b981]" />
              COVID-19
            </button>
            <button
              onClick={() => toggleLine('rabies')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-all ${
                visibleLines.rabies
                  ? 'bg-rose-100 text-rose-800 border border-rose-300 font-bold'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 line-through'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[#f43f5e]" />
              Rabies
            </button>
            <button
              onClick={() => toggleLine('hfmd')}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-all ${
                visibleLines.hfmd
                  ? 'bg-purple-100 text-purple-800 border border-purple-300 font-bold'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 line-through'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[#a855f7]" />
              HFMD
            </button>
          </div>

          {/* Multi-Line Chart Container */}
          <div className="mt-4 h-72 w-full">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-sky-600" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data?.daily_trends || []}
                  margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="date_label"
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
                      Number(val).toLocaleString('en-US') + ' cases',
                      name.toUpperCase(),
                    ]}
                    contentStyle={{
                      borderRadius: '0.75rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  {visibleLines.dbd && (
                    <Line
                      type="monotone"
                      dataKey="dbd"
                      name="DBD"
                      stroke="#0284c7"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#0284c7' }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {visibleLines.campak && (
                    <Line
                      type="monotone"
                      dataKey="campak"
                      name="Campak"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#f59e0b' }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {visibleLines.covid && (
                    <Line
                      type="monotone"
                      dataKey="covid"
                      name="COVID-19"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#10b981' }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {visibleLines.rabies && (
                    <Line
                      type="monotone"
                      dataKey="rabies"
                      name="Rabies"
                      stroke="#f43f5e"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#f43f5e' }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {visibleLines.hfmd && (
                    <Line
                      type="monotone"
                      dataKey="hfmd"
                      name="HFMD"
                      stroke="#a855f7"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#a855f7' }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart Context Footer */}
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500">
            <Info className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
            <div>
              The chart shows daily cases for the most active topics. Click a legend pill above to isolate a trend.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
