"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Database, Filter, RefreshCw, CheckCircle2, BarChart2, Layers } from "lucide-react";
import type { CrawlingStats } from "@/lib/api";

interface WeeklyPerformanceItem {
  weekNum: number;
  weekLabel: string;
  subLabel: string;
  totalNews: number;
  totalSocialMedia: number;
  totalApiData: number;
}

const RAW_WEEKLY_DATA: WeeklyPerformanceItem[] = [
  {
    weekNum: 11,
    weekLabel: "Minggu 11",
    subLabel: "10-16 Mar",
    totalNews: 30420,
    totalSocialMedia: 21150,
    totalApiData: 14200,
  },
  {
    weekNum: 12,
    weekLabel: "Minggu 12",
    subLabel: "17-23 Mar",
    totalNews: 32680,
    totalSocialMedia: 24320,
    totalApiData: 15400,
  },
  {
    weekNum: 13,
    weekLabel: "Minggu 13",
    subLabel: "24-30 Mar",
    totalNews: 35120,
    totalSocialMedia: 26100,
    totalApiData: 16250,
  },
  {
    weekNum: 14,
    weekLabel: "Minggu 14",
    subLabel: "31 Mar-6 Apr",
    totalNews: 40500,
    totalSocialMedia: 27240,
    totalApiData: 16100,
  },
  {
    weekNum: 16,
    weekLabel: "Minggu 16",
    subLabel: "7-13 Apr",
    totalNews: 34800,
    totalSocialMedia: 24900,
    totalApiData: 14300,
  },
  {
    weekNum: 17,
    weekLabel: "Minggu 17",
    subLabel: "14-20 Apr",
    totalNews: 38450,
    totalSocialMedia: 25300,
    totalApiData: 15980,
  },
  {
    weekNum: 18,
    weekLabel: "Minggu 18",
    subLabel: "21-27 Apr",
    totalNews: 43200,
    totalSocialMedia: 26150,
    totalApiData: 17800,
  },
  {
    weekNum: 182,
    weekLabel: "Minggu 18",
    subLabel: "28 Apr-4 Mei",
    totalNews: 40700,
    totalSocialMedia: 23450,
    totalApiData: 17400,
  },
  {
    weekNum: 19,
    weekLabel: "Minggu 19",
    subLabel: "5-11 Mei",
    totalNews: 45800,
    totalSocialMedia: 23200,
    totalApiData: 16100,
  },
  {
    weekNum: 20,
    weekLabel: "Minggu 20",
    subLabel: "12-18 Mei",
    totalNews: 45600,
    totalSocialMedia: 24250,
    totalApiData: 15600,
  },
  {
    weekNum: 21,
    weekLabel: "Minggu 21",
    subLabel: "19-25 Mei",
    totalNews: 40100,
    totalSocialMedia: 24180,
    totalApiData: 15350,
  },
  {
    weekNum: 22,
    weekLabel: "Minggu 22",
    subLabel: "25-31 Mei",
    totalNews: 37842,
    totalSocialMedia: 21736,
    totalApiData: 13782,
  },
];

interface CrawlingEnginePerformanceProps {
  crawlingStats?: CrawlingStats | null;
}

export default function CrawlingEnginePerformance({
  crawlingStats,
}: CrawlingEnginePerformanceProps) {
  const [startWeek, setStartWeek] = useState<number>(11);
  const [endWeek, setEndWeek] = useState<number>(22);
  const [chartMode, setChartMode] = useState<"stacked" | "grouped">("stacked");

  // Series visibility toggles
  const [visibleSeries, setVisibleSeries] = useState<{
    totalNews: boolean;
    totalSocialMedia: boolean;
    totalApiData: boolean;
  }>({
    totalNews: true,
    totalSocialMedia: true,
    totalApiData: true,
  });

  const toggleSeries = (key: keyof typeof visibleSeries) => {
    setVisibleSeries((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Filter weekly data based on startWeek and endWeek
  const filteredData = useMemo(() => {
    return RAW_WEEKLY_DATA.filter((item) => {
      const num = item.weekNum === 182 ? 18.5 : item.weekNum;
      return num >= startWeek && num <= endWeek;
    }).map((item) => {
      const news = visibleSeries.totalNews ? item.totalNews : 0;
      const social = visibleSeries.totalSocialMedia ? item.totalSocialMedia : 0;
      const api = visibleSeries.totalApiData ? item.totalApiData : 0;
      return {
        ...item,
        totalNewsVal: news,
        totalSocialMediaVal: social,
        totalApiDataVal: api,
        totalCombined: news + social + api,
      };
    });
  }, [startWeek, endWeek, visibleSeries]);

  // Latest entry values for cards
  const latestRaw = RAW_WEEKLY_DATA[RAW_WEEKLY_DATA.length - 1];

  return (
    <section
      className="mt-5 w-full border border-[#cfe0f1] bg-white p-5 md:p-7 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition-all"
      style={{ borderRadius: "17px 17px 22px 17px" }}
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:items-start">
        {/* ── Left Column: Title, Description, Filters & 3 Metric Cards ── */}
        <div className="flex flex-col space-y-5 xl:col-span-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 uppercase">
              Data Crawling Engine Performance
            </h2>
            <p className="mt-2 text-xs md:text-sm leading-relaxed text-slate-600">
              Presents crawling process performance, data retrieval success, active sources,
              processing speed, failure rates, duplication, and data freshness for ongoing
              monitoring purposes.
            </p>
          </div>

          {/* Week Selector & Chart Mode Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">Select Week</span>
              <select
                value={startWeek}
                onChange={(e) => setStartWeek(Number(e.target.value))}
                className="h-8 rounded-md border border-slate-300 bg-white px-2.5 font-bold text-slate-800 shadow-sm focus:border-[#0060A9] focus:outline-none"
              >
                {[11, 12, 13, 14, 16, 17, 18, 19, 20, 21].map((w) => (
                  <option key={`start-${w}`} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              <span className="font-semibold text-slate-600">To</span>
              <select
                value={endWeek}
                onChange={(e) => setEndWeek(Number(e.target.value))}
                className="h-8 rounded-md border border-slate-300 bg-white px-2.5 font-bold text-slate-800 shadow-sm focus:border-[#0060A9] focus:outline-none"
              >
                {[12, 13, 14, 16, 17, 18, 19, 20, 21, 22].map((w) => (
                  <option key={`end-${w}`} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              {(startWeek !== 11 || endWeek !== 22) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartWeek(11);
                    setEndWeek(22);
                  }}
                  className="text-[11px] font-bold text-[#0060A9] hover:underline ml-1"
                >
                  Reset
                </button>
              )}
            </div>

            {/* Mode Switch: Stacked vs Grouped */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setChartMode("stacked")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 transition-all ${
                  chartMode === "stacked"
                    ? "bg-white text-[#0060A9] shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Layers className="h-3 w-3" />
                Stacked
              </button>
              <button
                type="button"
                onClick={() => setChartMode("grouped")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 transition-all ${
                  chartMode === "grouped"
                    ? "bg-white text-[#0060A9] shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <BarChart2 className="h-3 w-3" />
                Grouped
              </button>
            </div>
          </div>

          {/* 3 Metric Toggle Cards */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* 1. TOTAL NEWS/MEDIA */}
            <button
              type="button"
              onClick={() => toggleSeries("totalNews")}
              className={`flex flex-col items-center justify-center p-3 text-center text-[10px] md:text-[11px] font-bold uppercase transition-all rounded-xl border ${
                visibleSeries.totalNews
                  ? "border-rose-500 bg-rose-50/60 text-rose-700 shadow-sm ring-1 ring-rose-400"
                  : "border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <span>TOTAL NEWS</span>
              </div>
              <span className="text-[9px] text-slate-500">MEDIA</span>
              <span className="mt-1.5 text-xs md:text-sm font-black text-rose-600">
                {visibleSeries.totalNews ? latestRaw.totalNews.toLocaleString() : "Hidden"}
              </span>
            </button>

            {/* 2. TOTAL SOCIAL MEDIA */}
            <button
              type="button"
              onClick={() => toggleSeries("totalSocialMedia")}
              className={`flex flex-col items-center justify-center p-3 text-center text-[10px] md:text-[11px] font-bold uppercase transition-all rounded-xl border ${
                visibleSeries.totalSocialMedia
                  ? "border-blue-500 bg-blue-50/60 text-blue-700 shadow-sm ring-1 ring-blue-400"
                  : "border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span>SOCIAL MEDIA</span>
              </div>
              <span className="text-[9px] text-slate-500">SIGNALS</span>
              <span className="mt-1.5 text-xs md:text-sm font-black text-blue-600">
                {visibleSeries.totalSocialMedia ? latestRaw.totalSocialMedia.toLocaleString() : "Hidden"}
              </span>
            </button>

            {/* 3. TOTAL API/DATA STUDIO */}
            <button
              type="button"
              onClick={() => toggleSeries("totalApiData")}
              className={`flex flex-col items-center justify-center p-3 text-center text-[10px] md:text-[11px] font-bold uppercase transition-all rounded-xl border ${
                visibleSeries.totalApiData
                  ? "border-emerald-500 bg-emerald-50/60 text-emerald-700 shadow-sm ring-1 ring-emerald-400"
                  : "border-slate-200 bg-slate-50 text-slate-400 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>API DATA</span>
              </div>
              <span className="text-[9px] text-slate-500">STUDIO</span>
              <span className="mt-1.5 text-xs md:text-sm font-black text-emerald-600">
                {visibleSeries.totalApiData ? latestRaw.totalApiData.toLocaleString() : "Hidden"}
              </span>
            </button>
          </div>

          {/* Live DB Pipeline Summary */}
          {crawlingStats && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-[11px] text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <b>Live Engine:</b> {crawlingStats.total.toLocaleString()} total raw items (
                {crawlingStats.total_processed.toLocaleString()} processed)
              </span>
            </div>
          )}
        </div>

        {/* ── Right Column: Stacked Bar Chart with Categories ── */}
        <div className="flex flex-col xl:col-span-8">
          <div className="relative w-full h-[320px] md:h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredData}
                margin={{ top: 15, right: 25, left: 10, bottom: 25 }}
                barCategoryGap="20%"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="weekLabel"
                  tick={({ x, y, payload }) => {
                    const item = filteredData.find((d) => d.weekLabel === payload.value);
                    const isLatest = payload.value === "Minggu 22";
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text
                          x={0}
                          y={0}
                          dy={12}
                          textAnchor="middle"
                          fill={isLatest ? "#0060A9" : "#64748b"}
                          fontSize={10}
                          fontWeight={isLatest ? 700 : 500}
                        >
                          {payload.value}
                        </text>
                        {item?.subLabel && (
                          <text
                            x={0}
                            y={0}
                            dy={24}
                            textAnchor="middle"
                            fill={isLatest ? "#0060A9" : "#94a3b8"}
                            fontSize={9}
                            fontWeight={isLatest ? 700 : 400}
                          >
                            {item.subLabel}
                          </text>
                        )}
                      </g>
                    );
                  }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickFormatter={(val) => (val >= 1000 ? `${Math.round(val / 1000)}K` : `${val}`)}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const item = filteredData.find((d) => d.weekLabel === label);
                      const totalSum = payload.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white/95 p-3.5 shadow-xl backdrop-blur-sm text-xs space-y-2 min-w-[200px]">
                          <div className="border-b border-slate-100 pb-1.5 flex items-center justify-between">
                            <span className="font-bold text-slate-800">
                              {label}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {item?.subLabel}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {payload.map((entry, idx) => {
                              const val = Number(entry.value) || 0;
                              const pct = totalSum > 0 ? ((val / totalSum) * 100).toFixed(1) : "0";
                              return (
                                <div key={`tip-${idx}`} className="flex items-center justify-between gap-3">
                                  <span className="flex items-center gap-1.5 font-medium text-slate-600">
                                    <span
                                      className="h-2.5 w-2.5 rounded-sm"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    {entry.name}:
                                  </span>
                                  <div className="text-right">
                                    <span className="font-bold text-slate-900">
                                      {val.toLocaleString()}
                                    </span>
                                    <span className="ml-1 text-[10px] text-slate-400">
                                      ({pct}%)
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="border-t border-slate-100 pt-1.5 flex items-center justify-between font-black text-slate-900">
                            <span>Total Minggu:</span>
                            <span className="text-[#0060A9]">
                              {totalSum.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* 1. Red Bar: Total News/Media */}
                {visibleSeries.totalNews && (
                  <Bar
                    dataKey="totalNewsVal"
                    name="Total News/Media"
                    stackId={chartMode === "stacked" ? "crawling" : undefined}
                    fill="#EF4444"
                    radius={chartMode === "grouped" ? [4, 4, 0, 0] : (!visibleSeries.totalSocialMedia && !visibleSeries.totalApiData ? [6, 6, 0, 0] : [0, 0, 0, 0])}
                  />
                )}

                {/* 2. Blue Bar: Total Social Media */}
                {visibleSeries.totalSocialMedia && (
                  <Bar
                    dataKey="totalSocialMediaVal"
                    name="Total Social Media"
                    stackId={chartMode === "stacked" ? "crawling" : undefined}
                    fill="#2563EB"
                    radius={chartMode === "grouped" ? [4, 4, 0, 0] : (!visibleSeries.totalApiData ? [6, 6, 0, 0] : [0, 0, 0, 0])}
                  />
                )}

                {/* 3. Green Bar: Total API/Data Studio */}
                {visibleSeries.totalApiData && (
                  <Bar
                    dataKey="totalApiDataVal"
                    name="Total API Data"
                    stackId={chartMode === "stacked" ? "crawling" : undefined}
                    fill="#10B981"
                    radius={chartMode === "grouped" ? [4, 4, 0, 0] : [6, 6, 0, 0]}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Bottom Legend / Filter Buttons */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => toggleSeries("totalNews")}
              className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[11px] font-bold uppercase transition-all ${
                visibleSeries.totalNews
                  ? "border-rose-500 bg-rose-50 text-rose-700 shadow-xs"
                  : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
              TOTAL NEWS/MEDIA
            </button>
            <button
              type="button"
              onClick={() => toggleSeries("totalSocialMedia")}
              className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[11px] font-bold uppercase transition-all ${
                visibleSeries.totalSocialMedia
                  ? "border-blue-500 bg-blue-50 text-blue-700 shadow-xs"
                  : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
              TOTAL SOCIAL MEDIA SIGNAL
            </button>
            <button
              type="button"
              onClick={() => toggleSeries("totalApiData")}
              className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[11px] font-bold uppercase transition-all ${
                visibleSeries.totalApiData
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-xs"
                  : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              TOTAL API DATA
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
