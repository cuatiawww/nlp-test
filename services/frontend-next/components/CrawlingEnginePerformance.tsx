"use client";

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Database, Filter, RefreshCw, CheckCircle2 } from "lucide-react";
import type { CrawlingStats } from "@/lib/api";

interface WeeklyPerformanceItem {
  weekNum: number;
  weekLabel: string;
  subLabel: string;
  totalNews: number;
  totalSocialMedia: number;
  totalApiData: number;
  detectedSignals: number;
  detectedData: number;
}

const RAW_WEEKLY_DATA: WeeklyPerformanceItem[] = [
  {
    weekNum: 11,
    weekLabel: "Minggu 11",
    subLabel: "10-16 Mar",
    totalNews: 30420,
    totalSocialMedia: 21150,
    totalApiData: 14200,
    detectedSignals: 2200,
    detectedData: 5310,
  },
  {
    weekNum: 12,
    weekLabel: "Minggu 12",
    subLabel: "17-23 Mar",
    totalNews: 32680,
    totalSocialMedia: 24320,
    totalApiData: 15400,
    detectedSignals: 2450,
    detectedData: 5890,
  },
  {
    weekNum: 13,
    weekLabel: "Minggu 13",
    subLabel: "24-30 Mar",
    totalNews: 35120,
    totalSocialMedia: 26100,
    totalApiData: 16250,
    detectedSignals: 2610,
    detectedData: 6120,
  },
  {
    weekNum: 14,
    weekLabel: "Minggu 14",
    subLabel: "31 Mar-6 Apr",
    totalNews: 40500,
    totalSocialMedia: 27240,
    totalApiData: 16100,
    detectedSignals: 2540,
    detectedData: 6280,
  },
  {
    weekNum: 16,
    weekLabel: "Minggu 16",
    subLabel: "7-13 Apr",
    totalNews: 34800,
    totalSocialMedia: 24900,
    totalApiData: 14300,
    detectedSignals: 2410,
    detectedData: 6050,
  },
  {
    weekNum: 17,
    weekLabel: "Minggu 17",
    subLabel: "14-20 Apr",
    totalNews: 38450,
    totalSocialMedia: 25300,
    totalApiData: 15980,
    detectedSignals: 2590,
    detectedData: 6180,
  },
  {
    weekNum: 18,
    weekLabel: "Minggu 18",
    subLabel: "21-27 Apr",
    totalNews: 43200,
    totalSocialMedia: 26150,
    totalApiData: 17800,
    detectedSignals: 2680,
    detectedData: 6350,
  },
  {
    weekNum: 182,
    weekLabel: "Minggu 18",
    subLabel: "28 Apr-4 Mei",
    totalNews: 40700,
    totalSocialMedia: 23450,
    totalApiData: 17400,
    detectedSignals: 2520,
    detectedData: 6220,
  },
  {
    weekNum: 19,
    weekLabel: "Minggu 19",
    subLabel: "5-11 Mei",
    totalNews: 45800,
    totalSocialMedia: 23200,
    totalApiData: 16100,
    detectedSignals: 2610,
    detectedData: 6410,
  },
  {
    weekNum: 20,
    weekLabel: "Minggu 20",
    subLabel: "12-18 Mei",
    totalNews: 45600,
    totalSocialMedia: 24250,
    totalApiData: 15600,
    detectedSignals: 2580,
    detectedData: 6380,
  },
  {
    weekNum: 21,
    weekLabel: "Minggu 21",
    subLabel: "19-25 Mei",
    totalNews: 40100,
    totalSocialMedia: 24180,
    totalApiData: 15350,
    detectedSignals: 2640,
    detectedData: 6450,
  },
  {
    weekNum: 22,
    weekLabel: "Minggu 22",
    subLabel: "25-31 Mei",
    totalNews: 37842,
    totalSocialMedia: 21736,
    totalApiData: 13782,
    detectedSignals: 5291,
    detectedData: 2939,
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

  // Series visibility toggles
  const [visibleSeries, setVisibleSeries] = useState<{
    totalNews: boolean;
    totalSocialMedia: boolean;
    totalApiData: boolean;
    detectedSignals: boolean;
    detectedData: boolean;
  }>({
    totalNews: true,
    totalSocialMedia: true,
    totalApiData: true,
    detectedSignals: true,
    detectedData: true,
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
    });
  }, [startWeek, endWeek]);

  // Latest entry values for right-hand badges
  const latestEntry = filteredData[filteredData.length - 1] || RAW_WEEKLY_DATA[RAW_WEEKLY_DATA.length - 1];

  return (
    <section
      className="mt-5 w-full border border-[#cfe0f1] bg-white p-5 md:p-7 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition-all"
      style={{ borderRadius: "17px 17px 22px 17px" }}
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:items-start">
        {/* ── Left Column: Title, Description, Filters & Metrics ── */}
        <div className="flex flex-col space-y-5 xl:col-span-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 uppercase">
                Data Crawling Engine Performance
              </h2>
            </div>
            <p className="mt-2 text-xs md:text-sm leading-relaxed text-slate-600">
              Presents crawling process performance, data retrieval success, active sources,
              processing speed, failure rates, duplication, and data freshness for ongoing
              monitoring purposes.
            </p>
          </div>

          {/* Week Selector */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
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

          {/* 6 Metric Toggle Buttons (2 rows of 3 buttons) matching mockup layout */}
          <div className="grid grid-cols-3 gap-2">
            {/* 1. TOTAL NEWS/MEDIA */}
            <button
              type="button"
              onClick={() => toggleSeries("totalNews")}
              className={`flex flex-col items-center justify-center p-2.5 text-center text-[10px] md:text-[11px] font-bold uppercase transition-all rounded-md border ${
                visibleSeries.totalNews
                  ? "border-rose-500 bg-rose-50/50 text-rose-700 shadow-sm ring-1 ring-rose-400"
                  : "border-slate-300 bg-slate-50 text-slate-400 hover:border-slate-400"
              }`}
            >
              <span>TOTAL</span>
              <span>NEWS/MEDIA</span>
              <span className="mt-1 text-[11px] font-black text-rose-600">
                {visibleSeries.totalNews ? latestEntry.totalNews.toLocaleString() : "Hidden"}
              </span>
            </button>

            {/* 2. TOTAL SOCIAL MEDIA */}
            <button
              type="button"
              onClick={() => toggleSeries("totalSocialMedia")}
              className={`flex flex-col items-center justify-center p-2.5 text-center text-[10px] md:text-[11px] font-bold uppercase transition-all rounded-md border ${
                visibleSeries.totalSocialMedia
                  ? "border-blue-500 bg-blue-50/50 text-blue-700 shadow-sm ring-1 ring-blue-400"
                  : "border-slate-300 bg-slate-50 text-slate-400 hover:border-slate-400"
              }`}
            >
              <span>TOTAL SOCIAL</span>
              <span>MEDIA</span>
              <span className="mt-1 text-[11px] font-black text-blue-600">
                {visibleSeries.totalSocialMedia ? latestEntry.totalSocialMedia.toLocaleString() : "Hidden"}
              </span>
            </button>

            {/* 3. TOTAL API/DATA STUDIO */}
            <button
              type="button"
              onClick={() => toggleSeries("totalApiData")}
              className={`flex flex-col items-center justify-center p-2.5 text-center text-[10px] md:text-[11px] font-bold uppercase transition-all rounded-md border ${
                visibleSeries.totalApiData
                  ? "border-emerald-500 bg-emerald-50/50 text-emerald-700 shadow-sm ring-1 ring-emerald-400"
                  : "border-slate-300 bg-slate-50 text-slate-400 hover:border-slate-400"
              }`}
            >
              <span>TOTAL API/</span>
              <span>DATA STUDIO</span>
              <span className="mt-1 text-[11px] font-black text-emerald-600">
                {visibleSeries.totalApiData ? latestEntry.totalApiData.toLocaleString() : "Hidden"}
              </span>
            </button>

            {/* 4. DETECTED NEWS/MEDIA */}
            <button
              type="button"
              onClick={() => toggleSeries("totalNews")}
              className={`flex flex-col items-center justify-center p-2.5 text-center text-[10px] md:text-[11px] font-bold uppercase transition-all rounded-md border ${
                visibleSeries.totalNews
                  ? "border-slate-700 bg-slate-100 text-slate-800"
                  : "border-slate-300 bg-slate-50 text-slate-400 hover:border-slate-400"
              }`}
            >
              <span>DETECTED</span>
              <span>NEWS/ MEDIA</span>
              <span className="mt-1 text-[11px] font-black text-slate-700">
                {crawlingStats?.by_source_type?.find(s => s.source_type === "rss")?.total?.toLocaleString() ?? "3,286"}
              </span>
            </button>

            {/* 5. DETECTED SIGNALS */}
            <button
              type="button"
              onClick={() => toggleSeries("detectedSignals")}
              className={`flex flex-col items-center justify-center p-2.5 text-center text-[10px] md:text-[11px] font-bold uppercase transition-all rounded-md border ${
                visibleSeries.detectedSignals
                  ? "border-amber-500 bg-amber-50/50 text-amber-700 shadow-sm ring-1 ring-amber-400"
                  : "border-slate-300 bg-slate-50 text-slate-400 hover:border-slate-400"
              }`}
            >
              <span>DETECTED</span>
              <span>SIGNALS</span>
              <span className="mt-1 text-[11px] font-black text-amber-600">
                {visibleSeries.detectedSignals ? latestEntry.detectedSignals.toLocaleString() : "Hidden"}
              </span>
            </button>

            {/* 6. DETECTED DATA */}
            <button
              type="button"
              onClick={() => toggleSeries("detectedData")}
              className={`flex flex-col items-center justify-center p-2.5 text-center text-[10px] md:text-[11px] font-bold uppercase transition-all rounded-md border ${
                visibleSeries.detectedData
                  ? "border-purple-500 bg-purple-50/50 text-purple-700 shadow-sm ring-1 ring-purple-400"
                  : "border-slate-300 bg-slate-50 text-slate-400 hover:border-slate-400"
              }`}
            >
              <span>DETECTED</span>
              <span>DATA</span>
              <span className="mt-1 text-[11px] font-black text-purple-600">
                {visibleSeries.detectedData ? latestEntry.detectedData.toLocaleString() : "Hidden"}
              </span>
            </button>
          </div>

          {/* Live DB Pipeline Summary */}
          {crawlingStats && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 text-[11px] text-slate-600">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <b>Live Engine:</b> {crawlingStats.total.toLocaleString()} total raw items (
                {crawlingStats.total_processed.toLocaleString()} processed)
              </span>
            </div>
          )}
        </div>

        {/* ── Right Column: Multi-Line Chart with Badges & Legend ── */}
        <div className="flex flex-col xl:col-span-8">
          <div className="relative w-full h-[320px] md:h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={filteredData}
                margin={{ top: 15, right: 75, left: 10, bottom: 25 }}
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
                  tickFormatter={(val) => (val >= 1000 ? `${val / 1000}K` : `${val}`)}
                  domain={[0, 50000]}
                  ticks={[0, 10000, 20000, 30000, 40000, 50000]}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const item = filteredData.find((d) => d.weekLabel === label);
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm text-xs">
                          <p className="font-bold text-slate-800">
                            {label} ({item?.subLabel})
                          </p>
                          <div className="mt-2 space-y-1.5">
                            {payload.map((entry, idx) => (
                              <div key={`tip-${idx}`} className="flex items-center justify-between gap-4">
                                <span className="flex items-center gap-1.5 font-medium text-slate-600">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  {entry.name}:
                                </span>
                                <span className="font-bold text-slate-900">
                                  {Number(entry.value).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* 1. Red Line: Total News/Media */}
                {visibleSeries.totalNews && (
                  <Line
                    type="monotone"
                    dataKey="totalNews"
                    name="Total News/Media"
                    stroke="#EF4444"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#EF4444" }}
                    activeDot={{ r: 5 }}
                  />
                )}

                {/* 2. Blue Line: Total Social Media */}
                {visibleSeries.totalSocialMedia && (
                  <Line
                    type="monotone"
                    dataKey="totalSocialMedia"
                    name="Total Social Media"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#2563EB" }}
                    activeDot={{ r: 5 }}
                  />
                )}

                {/* 3. Green Line: Total API/Data Studio */}
                {visibleSeries.totalApiData && (
                  <Line
                    type="monotone"
                    dataKey="totalApiData"
                    name="Total API Data"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#10B981" }}
                    activeDot={{ r: 5 }}
                  />
                )}

                {/* 4. Orange Line: Detected Signals */}
                {visibleSeries.detectedSignals && (
                  <Line
                    type="monotone"
                    dataKey="detectedSignals"
                    name="Detected Signals"
                    stroke="#F59E0B"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#F59E0B" }}
                    activeDot={{ r: 5 }}
                  />
                )}

                {/* 5. Purple Line: Detected Data */}
                {visibleSeries.detectedData && (
                  <Line
                    type="monotone"
                    dataKey="detectedData"
                    name="Detected Data"
                    stroke="#8B5CF6"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#8B5CF6" }}
                    activeDot={{ r: 5 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>

            {/* Right-hand End Badges matching mockup precisely */}
            <div className="absolute right-0 top-3 flex flex-col space-y-2 pointer-events-none text-right">
              {visibleSeries.totalNews && (
                <div className="rounded border border-rose-400 bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-600 shadow-xs">
                  {latestEntry.totalNews.toLocaleString()}
                </div>
              )}
              {visibleSeries.totalSocialMedia && (
                <div className="rounded border border-blue-400 bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-600 shadow-xs">
                  {latestEntry.totalSocialMedia.toLocaleString()}
                </div>
              )}
              {visibleSeries.totalApiData && (
                <div className="rounded border border-emerald-400 bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-600 shadow-xs">
                  {latestEntry.totalApiData.toLocaleString()}
                </div>
              )}
              {visibleSeries.detectedSignals && (
                <div className="rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-600 shadow-xs">
                  {latestEntry.detectedSignals.toLocaleString()}
                </div>
              )}
              {visibleSeries.detectedData && (
                <div className="rounded border border-purple-400 bg-purple-50 px-2 py-0.5 text-[11px] font-black text-purple-600 shadow-xs">
                  {latestEntry.detectedData.toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Legend Buttons matching mockup */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => toggleSeries("totalNews")}
              className={`rounded border px-4 py-1.5 text-[11px] font-bold uppercase transition-all ${
                visibleSeries.totalNews
                  ? "border-slate-800 bg-slate-900 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-500 hover:border-slate-400"
              }`}
            >
              TOTAL NEWS/MEDIA
            </button>
            <button
              type="button"
              onClick={() => toggleSeries("totalSocialMedia")}
              className={`rounded border px-4 py-1.5 text-[11px] font-bold uppercase transition-all ${
                visibleSeries.totalSocialMedia
                  ? "border-slate-800 bg-slate-900 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-500 hover:border-slate-400"
              }`}
            >
              TOTAL SOCIAL MEDIA SIGNAL
            </button>
            <button
              type="button"
              onClick={() => toggleSeries("totalApiData")}
              className={`rounded border px-4 py-1.5 text-[11px] font-bold uppercase transition-all ${
                visibleSeries.totalApiData
                  ? "border-slate-800 bg-slate-900 text-white shadow-sm"
                  : "border-slate-300 bg-white text-slate-500 hover:border-slate-400"
              }`}
            >
              TOTAL API DATA
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
