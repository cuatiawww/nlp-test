"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bug,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Layers,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CountryFlag from "@/components/CountryFlag";

export type AnalyticsViewMode = "all" | "diseases" | "regions";

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
  translateDisease: (name?: string | null) => string;
  numLocale?: string;
};

export default function AnalyticsSituationPanel({
  collapsed,
  onToggle,
  byDisease = [],
  byCountry = [],
  translateDisease,
  numLocale = "en-US",
}: Props) {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("all");

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

  if (collapsed) {
    return (
      <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl border border-[#cfe0f1] bg-white/95 p-1.5 shadow-[0_8px_24px_rgba(0,96,169,.12)] backdrop-blur-xl">
        <button
          onClick={onToggle}
          title="Expand Analytics & Situation"
          aria-label="Expand Analytics & Situation"
          className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-[#0060A9] transition hover:border-blue-300 hover:bg-blue-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="my-0.5 h-px w-6 bg-slate-200" />

        {/* Quick Diseases button */}
        <button
          onClick={() => handleOpenChannel("diseases")}
          title={`Cases Per Disease (${byDisease.length})`}
          className={`group relative grid h-8 w-8 place-items-center rounded-xl border transition ${
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
          className={`group relative grid h-8 w-8 place-items-center rounded-xl border transition ${
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

        {/* Quick Dual Sections (All) button */}
        <button
          onClick={() => handleOpenChannel("all")}
          title="Dual Sections: Diseases + Regional Distribution"
          className={`group relative grid h-8 w-8 place-items-center rounded-xl border transition ${
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
    <div className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-2xl border border-[#cfe0f1] bg-white/95 shadow-[0_8px_24px_rgba(0,96,169,.1)] backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-2.5">
        <button
          onClick={onToggle}
          aria-label="Collapse Analytics"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white transition hover:bg-slate-100"
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

      {/* Segmented View Switcher */}
      <div className="grid grid-cols-3 gap-1 border-b border-slate-200 bg-slate-100/80 p-1 text-[10px] font-extrabold">
        <button
          onClick={() => setViewMode("all")}
          title="Show Dual Sections (Top: Diseases, Bottom: Regional)"
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition ${
            viewMode === "all"
              ? "bg-white text-[#0060A9] shadow-sm ring-1 ring-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>All (2 Sections)</span>
        </button>

        <button
          onClick={() => setViewMode("diseases")}
          title="Show Cases Per Disease Only"
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition ${
            viewMode === "diseases"
              ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-200"
              : "text-slate-600 hover:text-blue-700"
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
          <span>Diseases</span>
          <span className="rounded-md bg-blue-50 px-1 text-[8.5px] font-black text-blue-600">
            {byDisease.length}
          </span>
        </button>

        <button
          onClick={() => setViewMode("regions")}
          title="Show Regional Distribution Only"
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition ${
            viewMode === "regions"
              ? "bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200"
              : "text-slate-600 hover:text-emerald-700"
          }`}
        >
          <Globe2 className="h-3.5 w-3.5 text-emerald-600" />
          <span>Regions</span>
          <span className="rounded-md bg-emerald-50 px-1 text-[8.5px] font-black text-emerald-600">
            {byCountry.length}
          </span>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-100/50 p-2">
        {viewMode === "all" ? (
          /* 2-SECTION DUAL BLOCK CARD (TOP: DISEASES, BOTTOM: REGIONAL DISTRIBUTION) */
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
                  data={formattedDiseases.slice(0, 10)}
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
        ) : (
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
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 p-2 text-[9px] font-bold text-slate-500">
        <span className="flex items-center gap-1.5 text-[#0060A9]">
          <TrendingUp className="h-3 w-3" />
          <span>Spatial Surveillance Data</span>
        </span>
        <span>ASEAN Epi-Center</span>
      </div>
    </div>
  );
}
