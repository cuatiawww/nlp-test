"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bug,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Layers,
  MapPin,
  Radio,
  Search,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CountryFlag from "@/components/CountryFlag";
import type { OutbreakLocation } from "@/types";

export type AnalyticsViewMode = "all" | "diseases" | "regions" | "signals";

type DiseaseData = {
  name: string;
  cases: number;
};

type CountryData = {
  name: string;
  cases: number;
};

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  byDisease?: DiseaseData[];
  byCountry?: CountryData[];
  alerts?: OutbreakLocation[];
  translateDisease: (name?: string | null) => string;
  numLocale?: string;
  onSelectAlert?: (alert: OutbreakLocation) => void;
};

export default function AnalyticsSituationPanel({
  collapsed,
  onToggle,
  byDisease = [],
  byCountry = [],
  alerts = [],
  translateDisease,
  numLocale = "en-US",
  onSelectAlert,
}: Props) {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const formattedDiseases = useMemo(() => {
    return byDisease.map((d) => ({
      ...d,
      displayName: translateDisease(d.name),
    }));
  }, [byDisease, translateDisease]);

  const handleOpenChannel = (mode: AnalyticsViewMode) => {
    setViewMode(mode);
    if (collapsed) {
      onToggle();
    }
  };

  const formatCompact = (num: number): string => {
    const value = Number(num);
    if (!Number.isFinite(value)) return "0";
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
    if (value >= 1_000) return (value / 1_000).toFixed(value >= 10_000 ? 0 : 1) + "K";
    return value.toLocaleString(numLocale);
  };

  const formatPublishDate = (dateStr?: string | null) => {
    if (!dateStr) return "-";
    try {
      const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const [, y, m, d] = match;
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        return dateObj.toLocaleDateString(numLocale, {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(numLocale, {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
      return dateStr.slice(0, 10);
    } catch {
      return dateStr.slice(0, 10);
    }
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const diseaseMatch =
          (a.disease || "").toLowerCase().includes(q) ||
          translateDisease(a.disease).toLowerCase().includes(q);
        const locMatch =
          (a.location_name || "").toLowerCase().includes(q) ||
          (a.country || "").toLowerCase().includes(q);
        return diseaseMatch || locMatch;
      }
      return true;
    });
  }, [alerts, searchQuery, translateDisease]);

  // Collapsed Sidebar Mode
  if (collapsed) {
    return (
      <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl border border-[#cfe0f1] bg-white/95 p-1.5 shadow-[0_8px_24px_rgba(0,96,169,.12)] backdrop-blur-xl transition-all duration-300">
        <button
          onClick={onToggle}
          title="Expand Analytics & Situation"
          aria-label="Expand Analytics & Situation"
          className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-[#0060A9] transition hover:border-blue-300 hover:bg-blue-50 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="my-0.5 h-px w-6 bg-slate-200" />

        {/* Quick Diseases button */}
        <button
          onClick={() => handleOpenChannel("diseases")}
          title={`Cases Per Disease (${byDisease.length})`}
          className={`group relative grid h-8 w-8 place-items-center rounded-xl border transition cursor-pointer ${
            viewMode === "diseases"
              ? "border-[#0060A9] bg-[#0060A9] text-white shadow-sm"
              : "border-blue-200 bg-blue-50/80 text-[#0060A9] hover:bg-blue-100"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          {byDisease.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[8px] font-black text-white ring-1 ring-white">
              {byDisease.length}
            </span>
          )}
        </button>

        {/* Quick Regional Distribution button */}
        <button
          onClick={() => handleOpenChannel("regions")}
          title={`Regional Distribution (${byCountry.length})`}
          className={`group relative grid h-8 w-8 place-items-center rounded-xl border transition cursor-pointer ${
            viewMode === "regions"
              ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
              : "border-emerald-200 bg-emerald-50/80 text-emerald-600 hover:bg-emerald-100"
          }`}
        >
          <Globe2 className="h-4 w-4" />
          {byCountry.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[8px] font-black text-white ring-1 ring-white">
              {byCountry.length}
            </span>
          )}
        </button>

        {/* Quick Location-based Surveillance Signals button */}
        <button
          onClick={() => handleOpenChannel("signals")}
          title={`Location-based Surveillance Signals (${alerts.length})`}
          className={`group relative grid h-8 w-8 place-items-center rounded-xl border transition cursor-pointer ${
            viewMode === "signals"
              ? "border-amber-600 bg-amber-600 text-white shadow-sm"
              : "border-amber-200 bg-amber-50/80 text-amber-700 hover:bg-amber-100"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          {alerts.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-600 px-1 text-[8px] font-black text-white ring-1 ring-white animate-pulse">
              {alerts.length}
            </span>
          )}
        </button>

        {/* Quick Dual/Multi Sections (All) button */}
        <button
          onClick={() => handleOpenChannel("all")}
          title="All Surveillance Overview"
          className={`group relative grid h-8 w-8 place-items-center rounded-xl border transition cursor-pointer ${
            viewMode === "all"
              ? "border-slate-800 bg-slate-800 text-white shadow-sm"
              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Layers className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-2xl border border-[#cfe0f1] bg-white/95 shadow-[0_8px_24px_rgba(0,96,169,.1)] backdrop-blur-xl transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-2.5">
        <button
          onClick={onToggle}
          aria-label="Collapse Analytics"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white transition hover:bg-slate-100 cursor-pointer"
        >
          <ChevronRight className="h-3.5 w-3.5 text-[#0060A9]" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 text-right">
            <h3 className="truncate text-xs font-black uppercase tracking-wider text-[#0060A9]">
              ANALYTICS & SITUATION
            </h3>
            <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-bold text-slate-500">
              <span className="live-dot" />
              <span>Real-time Outbreak Intelligence</span>
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-1">
            <Sparkles className="h-3.5 w-3.5 text-[#0060A9]" />
          </div>
        </div>
      </div>

      {/* 4-Item Segmented View Switcher */}
      <div className="grid grid-cols-4 gap-1 border-b border-slate-200 bg-slate-100/80 p-1 text-[9px] sm:text-[9.5px] font-extrabold">
        <button
          onClick={() => setViewMode("all")}
          title="Show Overview Sections"
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition cursor-pointer ${
            viewMode === "all"
              ? "bg-white text-[#0060A9] shadow-sm ring-1 ring-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Layers className="h-3 w-3 shrink-0" />
          <span>All</span>
        </button>

        <button
          onClick={() => setViewMode("diseases")}
          title="Show Cases Per Disease"
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition cursor-pointer ${
            viewMode === "diseases"
              ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-200"
              : "text-slate-600 hover:text-blue-700"
          }`}
        >
          <BarChart3 className="h-3 w-3 text-blue-600 shrink-0" />
          <span className="truncate">Diseases</span>
          <span className="rounded-md bg-blue-50 px-1 text-[8px] font-black text-blue-600">
            {byDisease.length}
          </span>
        </button>

        <button
          onClick={() => setViewMode("regions")}
          title="Show Regional Distribution"
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition cursor-pointer ${
            viewMode === "regions"
              ? "bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200"
              : "text-slate-600 hover:text-emerald-700"
          }`}
        >
          <Globe2 className="h-3 w-3 text-emerald-600 shrink-0" />
          <span className="truncate">Regions</span>
          <span className="rounded-md bg-emerald-50 px-1 text-[8px] font-black text-emerald-600">
            {byCountry.length}
          </span>
        </button>

        <button
          onClick={() => setViewMode("signals")}
          title="Location-based Surveillance Signals"
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition cursor-pointer ${
            viewMode === "signals"
              ? "bg-white text-amber-700 shadow-sm ring-1 ring-amber-200"
              : "text-slate-600 hover:text-amber-700"
          }`}
        >
          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
          <span className="truncate">Signals</span>
          <span className="rounded-md bg-amber-50 px-1 text-[8px] font-black text-amber-600">
            {alerts.length}
          </span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-100/50 p-2">
        {viewMode === "all" ? (
          /* ALL MODE: DUAL BLOCKS + MINI SIGNALS TICKER */
          <div className="flex h-full flex-col gap-2 overflow-hidden">
            {/* Block Card 1: Cases Per Disease */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-blue-200/80 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-[10.5px] font-black tracking-wide text-blue-900">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                  CASES PER DISEASE
                </span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black text-blue-700">
                  {byDisease.length} Diseases
                </span>
              </div>
              <div className="flex-1 overflow-hidden p-2">
                <div className="h-full w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={formattedDiseases.slice(0, 5)}
                      layout="vertical"
                      margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis
                        type="category"
                        dataKey="displayName"
                        width={75}
                        tick={{ fontSize: 8.5, fontWeight: 700 }}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: "11px",
                          fontWeight: 700,
                          borderRadius: "8px",
                          border: "1px solid #bfdbfe",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                        }}
                      />
                      <Bar dataKey="cases" fill="#0060A9" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Block Card 2: Regional Distribution */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-emerald-200/80 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/70 px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-[10.5px] font-black tracking-wide text-emerald-900">
                  <Globe2 className="h-3.5 w-3.5 text-emerald-600" />
                  REGIONAL DISTRIBUTION
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">
                  {byCountry.length} Countries
                </span>
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
                {byCountry.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 text-xs transition hover:bg-emerald-50/50 hover:border-emerald-200"
                  >
                    <span className="flex items-center gap-2 font-bold text-slate-800">
                      <CountryFlag countryName={c.name} shape="circle" size="sm" />
                      <span className="truncate text-[11px]">{c.name}</span>
                    </span>
                    <b className="font-mono text-xs font-black text-[#0060A9]">
                      {c.cases.toLocaleString(numLocale)}
                    </b>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini Signals Quick Launch Bar */}
            {alerts.length > 0 && (
              <button
                onClick={() => setViewMode("signals")}
                className="flex items-center justify-between rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50/40 p-2 text-left transition hover:border-amber-300 hover:shadow-xs cursor-pointer shrink-0"
              >
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-950">
                      Location-based Surveillance Signals
                    </p>
                    <p className="text-[9px] font-semibold text-slate-500">
                      {alerts.length} active spatial risk alerts detected
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-amber-700">
                  <span>View All</span>
                  <ChevronRight className="h-3 w-3" />
                </div>
              </button>
            )}
          </div>
        ) : viewMode === "diseases" ? (
          /* Full Height Diseases View */
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-blue-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-black text-blue-900">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                CASES PER DISEASE
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9.5px] font-black text-blue-700">
                {byDisease.length} Diseases
              </span>
            </div>
            <div className="flex-1 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={formattedDiseases.slice(0, 12)}
                  layout="vertical"
                  margin={{ top: 10, right: 15, left: 10, bottom: 10 }}
                >
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis
                    type="category"
                    dataKey="displayName"
                    width={95}
                    tick={{ fontSize: 9.5, fontWeight: 700 }}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: "11px",
                      fontWeight: 700,
                      borderRadius: "8px",
                      border: "1px solid #bfdbfe",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    }}
                  />
                  <Bar dataKey="cases" fill="#0060A9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : viewMode === "regions" ? (
          /* Full Height Regions View */
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-emerald-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/70 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-black text-emerald-900">
                <Globe2 className="h-4 w-4 text-emerald-600" />
                REGIONAL DISTRIBUTION
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-black text-emerald-700">
                {byCountry.length} Countries
              </span>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
              {byCountry.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs transition hover:bg-emerald-50/50 hover:border-emerald-200"
                >
                  <span className="flex items-center gap-2.5 font-bold text-slate-800">
                    <CountryFlag countryName={c.name} shape="circle" size="md" />
                    <span className="text-xs font-bold">{c.name}</span>
                  </span>
                  <b className="font-mono text-sm font-black text-[#0060A9]">
                    {c.cases.toLocaleString(numLocale)}
                  </b>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* =========================================================================
             VIEW MODE: SIGNALS (Location-based Surveillance Signals)
             ========================================================================= */
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-amber-200/90 bg-white shadow-sm">
            {/* Header */}
            <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-orange-50/30 to-white px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-900">
                    <span className="truncate">Location-based Surveillance Signals</span>
                  </h4>
                  <p className="text-[9.5px] font-semibold text-slate-500 mt-0.5">
                    Real-time epidemic alerts & spatial surveillance signals
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-800">
                  {filteredAlerts.length} Signals
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter disease or location..."
                  className="w-full rounded-lg border border-slate-200 bg-white/90 py-1 pl-7 pr-7 text-[10px] text-slate-800 placeholder-slate-400 focus:border-[#0060A9] focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Signals List Body */}
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {filteredAlerts.length > 0 ? (
                filteredAlerts.map((a, i) => {
                  const key = `${a.location_name}-${a.disease}-${i}`;
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-slate-200/90 border-l-4 border-l-blue-400 bg-white shadow-2xs transition-all duration-200 hover:border-blue-200 hover:bg-blue-50/30"
                    >
                      {/* Card Header clickable */}
                      <button
                        type="button"
                        onClick={() => onSelectAlert?.(a)}
                        className="w-full p-2.5 text-left cursor-pointer focus:outline-none"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold text-slate-900 text-xs">
                              {translateDisease(a.disease)}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                              <CountryFlag countryName={a.country} shape="circle" size="xs" />
                              <span className="truncate text-[10.5px] font-semibold text-slate-600">
                                {a.location_name}, {a.country}
                              </span>
                            </div>
                          </div>
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[9.5px] font-bold text-[#0060A9] border border-blue-200/80 shrink-0 transition group-hover:bg-[#0060A9] group-hover:text-white"
                          >
                            <span>View Details</span>
                            <ChevronRight className="h-3 w-3" />
                          </span>
                        </div>

                        {/* Metrics summary row */}
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 font-bold text-blue-700">
                              {formatCompact(a.cases ?? 0)} Cases
                            </span>
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700">
                              {formatCompact(a.deaths ?? 0)} Deaths
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[9.5px] text-slate-400">
                            <Calendar className="h-3 w-3" />
                            <span>{formatPublishDate(a.latest_date || a.detail?.published_at)}</span>
                            <ChevronRight className="h-3 w-3 ml-1 text-slate-500" />
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-2">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  <p className="text-xs font-bold text-slate-600">
                    No active surveillance signals found
                  </p>
                  <p className="text-[10px] text-slate-400">
                    All monitored locations within normal baseline levels
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 p-2 text-[9px] font-bold text-slate-500">
        <span className="flex items-center gap-1.5 text-[#0060A9]">
          <TrendingUp className="h-3 w-3" />
          <span>Spatial Surveillance Intelligence</span>
        </span>
        <span>ASEAN Epi-Center</span>
      </div>
    </div>
  );
}
