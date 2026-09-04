'use client'

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertTriangle,
  Bug,
  CalendarDays,
  Clock3,
  ChevronDown,
  ChevronUp,
  Filter,
  ExternalLink,
  FileText,
  Globe2,
  MapPin,
  RefreshCw,
  Shield,
  Skull,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchPublicDashboard } from "@/lib/api";
import type { OutbreakLocation, PublicDashboard } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const SpatialOutbreakMap = dynamic(
  () => import("@/components/SpatialOutbreakMap"),
  { ssr: false },
);

const colors = [
  "#0060A9",
  "#ED2939",
  "#B49B58",
  "#0284c7",
  "#6366f1",
  "#8b5cf6",
];

const severityClass = {
  AWAS: "bg-[#ED2939] text-white",
  SIAGA: "bg-[#B49B58] text-white",
  WASPADA: "bg-amber-400 text-slate-900",
  NORMAL: "bg-blue-100 text-[#0060A9]",
};

function cleanArticleContent(value?: string | null, fallback = "Source content is not available."): string {
  if (!value) return fallback;
  return value
    .replace(
      /<(script|style|noscript|svg|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function Kpi({
  label,
  value,
  icon,
  tone = "blue",
  trend,
  previousMonth,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: string;
  trend?: { current: number; previous: number };
  previousMonth?: string;
}) {
  const { t, locale } = useTranslation();
  const numLocale = locale === "en" ? "en-US" : "id-ID";
  const difference = (trend?.current ?? 0) - (trend?.previous ?? 0);
  const percentage = trend
    ? trend.previous > 0
      ? Math.abs((difference / trend.previous) * 100)
      : trend.current > 0
        ? 100
        : 0
    : 0;
  const isUp = difference >= 0;
  const monthLabel = previousMonth
    ? new Intl.DateTimeFormat(numLocale, { month: "long" }).format(
        new Date(`${previousMonth}-01T00:00:00Z`),
      )
    : t("dashboard.lastMonth");
  const color =
    tone === "red"
      ? "text-[#ED2939] bg-red-50/80"
      : tone === "gold" || tone === "orange"
        ? "text-[#B49B58] bg-[#fbf8ee]"
        : "text-[#0060A9] bg-blue-50/80";

  return (
    <article
      className="flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-[#0060A9]/40"
      style={{ borderRadius: "17px 17px 22px 17px" }}
    >
      <div
        className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full ${color}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
          {label}
        </p>
        <p
          className={`mt-2 truncate text-[30px] font-bold leading-none ${tone === "red" ? "text-[#ED2939]" : tone === "gold" || tone === "orange" ? "text-[#B49B58]" : "text-[#0060A9]"}`}
        >
          {value.toLocaleString(numLocale)}
        </p>
        <div className="mt-2 text-[9px] font-bold leading-tight text-slate-500">
          <p className="uppercase">
            {monthLabel} ({(trend?.previous ?? 0).toLocaleString(numLocale)})
          </p>
          <p
            className={`mt-1 flex items-center gap-0.5 ${isUp ? "text-emerald-600" : "text-red-600"}`}
          >
            {isUp ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {percentage.toLocaleString(numLocale, { maximumFractionDigits: 1 })}%{" "}
            {t("dashboard.fromPreviousMonth")}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function DashboardPage() {
  const { t, locale, translateDisease, translateSeverity } = useTranslation();
  const numLocale = locale === "en" ? "en-US" : "id-ID";
  const currentYear = new Date().getFullYear();
  const [country, setCountry] = useState("all");
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<PublicDashboard | null>(null);
  const [selected, setSelected] = useState<OutbreakLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setData(await fetchPublicDashboard({ country, year }));
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [country, year, t]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const available = data?.available_years;
    if (available?.length && !available.includes(year)) setYear(available[0]);
  }, [data?.available_years, year]);

  const countryData = data?.by_country ?? [];

  if (loading)
    return (
      <div className="grid min-h-[60vh] place-items-center text-sm font-semibold text-[#0060A9]">
        {t("common.loading")}
      </div>
    );

  return (
    <div className="w-full space-y-6 bg-[#f8fafc] px-4 py-6 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">
            {t("dashboard.pageTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t("dashboard.pageSubtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100"
          >
            <RefreshCw className="h-4 w-4" />
            {t("dashboard.refresh")}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#cfe0f1] bg-white p-3 shadow-[0_6px_18px_rgba(0,96,169,.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2 px-1 text-[#0060A9]">
            <Filter className="h-4 w-4" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider">
                {t("dashboard.filterTitle")}
              </p>
              <p className="text-[10px] text-slate-500">
                {t("dashboard.filterSub")}
              </p>
            </div>
          </div>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Globe2 className="h-4 w-4 shrink-0 text-[#0060A9]" />
            <span className="text-[10px] font-bold uppercase text-slate-500">
              {t("dashboard.country")}
            </span>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs font-bold text-slate-800 outline-none"
            >
              <option value="all">{t("dashboard.allAsean")}</option>
              {[
                "Brunei",
                "Cambodia",
                "Indonesia",
                "Laos",
                "Malaysia",
                "Myanmar",
                "Philippines",
                "Singapore",
                "Thailand",
                "Timor-Leste",
                "Vietnam",
              ].map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 lg:w-56">
            <CalendarDays className="h-4 w-4 shrink-0 text-[#0060A9]" />
            <span className="text-[10px] font-bold uppercase text-slate-500">
              {t("dashboard.year")}
            </span>
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="flex-1 bg-transparent text-xs font-bold text-slate-800 outline-none"
            >
              {(data?.available_years?.length
                ? data.available_years
                : [currentYear]
              ).map((availableYear) => (
                <option key={availableYear} value={availableYear}>
                  {availableYear}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={load}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100"
          >
            {t("dashboard.filterApply")}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          label={t("dashboard.kpiDetectedCases")}
          value={data?.trends?.cases.current ?? data?.kpis.cases ?? 0}
          icon={<Bug className="h-5 w-5" />}
          tone="blue"
          trend={data?.trends?.cases}
          previousMonth={data?.trends?.previous_month}
        />
        <Kpi
          label={t("dashboard.kpiDeaths")}
          value={data?.trends?.deaths.current ?? data?.kpis.deaths ?? 0}
          icon={<Skull className="h-5 w-5" />}
          tone="red"
          trend={data?.trends?.deaths}
          previousMonth={data?.trends?.previous_month}
        />
        <Kpi
          label={t("dashboard.kpiValidatedEvents")}
          value={data?.trends?.events.current ?? data?.kpis.events ?? 0}
          icon={<Activity className="h-5 w-5" />}
          tone="blue"
          trend={data?.trends?.events}
          previousMonth={data?.trends?.previous_month}
        />
        <Kpi
          label={t("dashboard.kpiLocations")}
          value={data?.trends?.locations.current ?? data?.kpis.locations ?? 0}
          icon={<MapPin className="h-5 w-5" />}
          tone="blue"
          trend={data?.trends?.locations}
          previousMonth={data?.trends?.previous_month}
        />
        <Kpi
          label={t("dashboard.kpiActiveAlerts")}
          value={data?.trends?.alerts.current ?? data?.kpis.active_alerts ?? 0}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="gold"
          trend={data?.trends?.alerts}
          previousMonth={data?.trends?.previous_month}
        />
      </div>

      <section className="w-full bg-[#f8fafc] pb-5">
        <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[381px_minmax(0,1fr)] xl:items-stretch">
          <section
            className="flex overflow-hidden border border-[#cfe0f1] bg-gradient-to-b from-[#f0f6fc] to-[#e8f1fa] xl:h-[550px] xl:w-[381px]"
            style={{ borderRadius: "17px 17px 22px 17px" }}
          >
            <div className="flex w-full flex-col">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                <AlertTriangle className="h-5 w-5 text-[#B49B58]" />
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">
                    {t("dashboard.ewsTitle")}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {t("dashboard.ewsSubtitle")}
                  </p>
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {data?.alerts.length ? (
                  data.alerts.slice(0, 12).map((a, i) => (
                    <button
                      key={`${a.location_name}-${a.disease}-${i}`}
                      type="button"
                      onClick={() => setSelected(a)}
                      className="w-full rounded-xl border border-slate-100 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">
                            {translateDisease(a.disease)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {a.location_name}, {a.country}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-black ${severityClass[a.severity]}`}
                        >
                          {translateSeverity(a.severity)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        <b>{a.cases.toLocaleString(numLocale)}</b> {t("dashboard.casesUnit")} •{" "}
                        <b>{a.deaths}</b> {t("dashboard.deathsUnit")} • {t("dashboard.thresholdUnit")} {a.threshold}
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="p-8 text-center text-sm text-slate-400">
                    {t("dashboard.noAlerts")}
                  </p>
                )}
              </div>
              <div className="border-t border-blue-200/70 bg-white/70 px-4 py-3 text-[10px] font-bold text-slate-500">
                {t("dashboard.ewsFootnote")}
              </div>
            </div>
          </section>

          <article
            className="flex flex-col border border-[#cfe0f1] bg-white p-4 xl:h-[550px]"
            style={{ borderRadius: "17px 17px 22px 17px" }}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-black uppercase leading-tight text-slate-900 sm:text-2xl">
                  {t("dashboard.spatialTitle")}
                </h3>
                <p className="mt-1.5 text-sm font-normal leading-relaxed text-slate-600 sm:text-base">
                  {t("dashboard.spatialDesc")}
                </p>
                <div className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-blue-200/80 bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#0060A9]">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0060A9]" />
                  <span className="truncate">
                    {t("dashboard.regionAseanLocations", { count: data?.kpis.locations ?? 0 })}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 min-h-[300px] w-full flex-1 overflow-hidden rounded-xl">
              <SpatialOutbreakMap
                countries={countryData}
                locations={data?.locations ?? []}
              />
            </div>
          </article>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-[#0060A9]/20 bg-gradient-to-r from-blue-50 via-sky-50 to-[#fdfbf5] p-5 shadow-sm">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#0060A9]" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-[#0060A9]">
              {t("dashboard.aiSummaryTitle")}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {data?.ai_summary.text}
            </p>
            <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
              {t("dashboard.aiSummarySub")}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-600">
            {t("dashboard.casesByDisease")}
          </h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <BarChart
                data={(data?.by_disease ?? []).slice(0, 8).map(d => ({
                  ...d,
                  name: translateDisease(d.name)
                }))}
                layout="vertical"
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <Bar dataKey="cases" fill="#0060A9" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-600">
            {t("dashboard.countryDistribution")}
          </h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={countryData}
                  dataKey="cases"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={95}
                  label={({ name }) => name}
                >
                  {countryData.map((_, i) => (
                    <Cell key={i} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

            {/* ===== ANALYTICS INSIGHT CHARTS (No Duplicate Summary Cards) ===== */}
      <section className="mt-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">

          {/* Panel B — Disease Risk Profile (Stacked Bar: Cases + Deaths with Smart Normalization) */}
          <div
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)]"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0060A9]">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">Disease Risk Profile</h2>
                <p className="text-[10px] text-slate-400">Cases vs Deaths — Top diseases by clinical burden</p>
              </div>
            </div>
            {(() => {
              // Smart disease normalizer to unify NLP variants (e.g., 'dengue fever DBD' + 'DBD', 'Campak' + 'Measles')
              const normalizeName = (raw: string): string => {
                const lower = (raw || '').toLowerCase().trim();
                if (lower.includes('dengue') || lower.includes('dbd')) return 'Dengue Fever';
                if (lower.includes('hand foot') || lower.includes('hfmd')) return 'Hand, Foot & Mouth';
                if (lower.includes('campak') || lower.includes('measles')) return 'Measles';
                if (lower.includes('flu') || lower.includes('influenza')) return 'Influenza';
                if (lower.includes('rabies')) return 'Rabies';
                if (lower.includes('covid')) return 'COVID-19';
                if (lower.includes('chikungunya')) return 'Chikungunya';
                if (lower.includes('meningitis')) return 'Meningitis';
                if (lower.includes('hanta')) return 'Hantavirus';
                if (lower.includes('ebola')) return 'Ebola';
                if (lower.includes('mers')) return 'MERS-CoV';
                if (lower.includes('avian') || lower.includes('h5n1')) return 'Avian Flu';
                if (lower.includes('malaria')) return 'Malaria';
                if (lower.includes('zika')) return 'Zika';
                return raw.charAt(0).toUpperCase() + raw.slice(1);
              };

              // Merge duplicated diseases together
              const mergedMap = new Map<string, { name: string; cases: number; deaths: number; events: number }>();
              (data?.by_disease ?? []).forEach((d) => {
                const unified = normalizeName(d.name);
                const existing = mergedMap.get(unified);
                if (existing) {
                  existing.cases += d.cases;
                  existing.deaths += d.deaths;
                  existing.events += d.events;
                } else {
                  mergedMap.set(unified, {
                    name: unified,
                    cases: d.cases,
                    deaths: d.deaths,
                    events: d.events,
                  });
                }
              });

              const diseaseRisk = Array.from(mergedMap.values())
                .filter((d) => d.cases > 0)
                .sort((a, b) => b.cases - a.cases)
                .slice(0, 6)
                .map((d) => ({
                  ...d,
                  cfr: d.cases > 0 ? ((d.deaths / d.cases) * 100).toFixed(1) : '0.0',
                }));

              if (diseaseRisk.length === 0) {
                return (
                  <p className="py-12 text-center text-sm text-slate-400">No disease data available</p>
                );
              }

              return (
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart
                      data={diseaseRisk}
                      layout="vertical"
                      margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={125}
                        tick={{ fontSize: 10, fill: "#475569", fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: 11 }}
                        formatter={(value: number, name: string) => [
                          value.toLocaleString(numLocale),
                          name === "cases" ? "Cases" : "Deaths",
                        ]}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => (
                          <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>
                            {value === "cases" ? "Cases" : "Deaths"}
                          </span>
                        )}
                      />
                      <Bar dataKey="cases" fill="#0060A9" radius={[0, 4, 4, 0]} maxBarSize={14} name="cases" />
                      <Bar dataKey="deaths" fill="#ED2939" radius={[0, 4, 4, 0]} maxBarSize={14} name="deaths" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}

            {/* CFR mini badges with deduplicated diseases */}
            {(() => {
              const normalizeName = (raw: string): string => {
                const lower = (raw || '').toLowerCase().trim();
                if (lower.includes('dengue') || lower.includes('dbd')) return 'Dengue Fever';
                if (lower.includes('hand foot') || lower.includes('hfmd')) return 'Hand, Foot & Mouth';
                if (lower.includes('campak') || lower.includes('measles')) return 'Measles';
                if (lower.includes('flu') || lower.includes('influenza')) return 'Influenza';
                if (lower.includes('rabies')) return 'Rabies';
                if (lower.includes('covid')) return 'COVID-19';
                if (lower.includes('meningitis')) return 'Meningitis';
                return raw.charAt(0).toUpperCase() + raw.slice(1);
              };

              const mergedMap = new Map<string, { name: string; cases: number; deaths: number }>();
              (data?.by_disease ?? []).forEach((d) => {
                const unified = normalizeName(d.name);
                const existing = mergedMap.get(unified);
                if (existing) {
                  existing.cases += d.cases;
                  existing.deaths += d.deaths;
                } else {
                  mergedMap.set(unified, { name: unified, cases: d.cases, deaths: d.deaths });
                }
              });

              const list = Array.from(mergedMap.values())
                .filter((d) => d.cases > 0)
                .map((d) => ({
                  ...d,
                  cfrNum: (d.deaths / d.cases) * 100,
                  cfrStr: ((d.deaths / d.cases) * 100).toFixed(1),
                }))
                .sort((a, b) => b.cfrNum - a.cfrNum)
                .slice(0, 6);

              if (list.length === 0) return null;

              return (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Case Fatality Rate (CFR)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((d) => {
                      const highRisk = d.cfrNum >= 2;
                      return (
                        <span
                          key={d.name}
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ${
                            highRisk
                              ? "bg-red-50 text-[#ED2939] ring-red-200"
                              : "bg-blue-50 text-[#0060A9] ring-blue-200"
                          }`}
                        >
                          {d.name}: {d.cfrStr}%
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Panel C — Alert Severity Breakdown (RadialBarChart Donut) */}
          <div
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_6px_18px_rgba(0,96,169,.06)]"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-[#ED2939]">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-700">ASEAN Alert Status</h2>
                <p className="text-[10px] text-slate-400">Location severity distribution across the region</p>
              </div>
            </div>
            {(() => {
              const allLocs = data?.locations ?? [];
              const counts = allLocs.reduce(
                (acc, loc) => {
                  acc[loc.severity] = (acc[loc.severity] || 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              );
              const total = allLocs.length;

              const severityData = [
                { name: "Normal", value: counts["NORMAL"] || 0, fill: "#22c55e" },
                { name: "Warning", value: counts["WASPADA"] || 0, fill: "#f59e0b" },
                { name: "High", value: counts["SIAGA"] || 0, fill: "#B49B58" },
                { name: "Critical", value: counts["AWAS"] || 0, fill: "#ED2939" },
              ].filter((d) => d.value > 0);

              if (total === 0) {
                return (
                  <p className="py-12 text-center text-sm text-slate-400">No location data available</p>
                );
              }

              return (
                <>
                  <div className="relative h-48">
                    <ResponsiveContainer>
                      <RadialBarChart
                        innerRadius="35%"
                        outerRadius="95%"
                        data={severityData}
                        startAngle={180}
                        endAngle={-180}
                      >
                        <RadialBar
                          dataKey="value"
                          cornerRadius={6}
                          background={{ fill: "#f8fafc" }}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: 11 }}
                          formatter={(value: number, name: string) => [
                            `${value} locations (${total > 0 ? ((value / total) * 100).toFixed(0) : 0}%)`,
                            name,
                          ]}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    {/* Center total label */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-2xl font-black text-slate-800">{total}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Locations</p>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {[
                      { key: "AWAS", label: "Critical", fill: "#ED2939" },
                      { key: "SIAGA", label: "High", fill: "#B49B58" },
                      { key: "WASPADA", label: "Warning", fill: "#f59e0b" },
                      { key: "NORMAL", label: "Normal", fill: "#22c55e" },
                    ].map(({ key, label, fill }) => {
                      const val = counts[key] || 0;
                      const pct = total > 0 ? ((val / total) * 100).toFixed(0) : "0";
                      return (
                        <div key={key} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: fill }}
                            />
                            <span className="text-[10px] font-semibold text-slate-600">{label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, backgroundColor: fill }}
                              />
                            </div>
                            <span className="w-6 text-right text-[10px] font-black text-slate-700">{val}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </section>
      {/* ===== END ANALYTICS INSIGHT CHARTS ===== */}

      <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-600">
            {t("dashboard.summaryByLocation")}
          </h2>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock3 className="h-3.5 w-3.5" />
            {data ? new Date(data.updated_at).toLocaleString(numLocale) : "-"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("dashboard.colLocation")}</th>
                <th className="px-4 py-3">{t("dashboard.colDisease")}</th>
                <th className="px-4 py-3 text-right">{t("dashboard.colCases")}</th>
                <th className="px-4 py-3 text-right">{t("dashboard.colDeaths")}</th>
                <th className="px-4 py-3 text-right">{t("dashboard.colConfidence")}</th>
                <th className="px-4 py-3 text-center">{t("dashboard.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {data?.locations.slice(0, 20).map((r, i) => (
                <tr
                  key={i}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/50"
                  title={t("dashboard.rowTooltip")}
                >
                  <td className="px-4 py-3 font-semibold">
                    {r.location_name}
                    <span className="block text-xs font-normal text-slate-400">
                      {r.country}
                    </span>
                  </td>
                  <td className="px-4 py-3">{translateDisease(r.disease)}</td>
                  <td className="px-4 py-3 text-right">
                    {r.cases.toLocaleString(numLocale)}
                  </td>
                  <td className="px-4 py-3 text-right">{r.deaths}</td>
                  <td className="px-4 py-3 text-right">
                    {r.confidence == null
                      ? "-"
                      : `${Math.round(r.confidence * 100)}%`}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                        r.severity ? severityClass[r.severity] : "bg-blue-100 text-[#0060A9]"
                      }`}
                    >
                      {translateSeverity(r.severity)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
          onClick={() => setSelected(null)}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-[#f8fbff] shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <FileText className="mt-1 h-5 w-5 shrink-0 text-[#0060A9]" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#0060A9]">
                    {t("dashboard.eventModal.badgeDetails")}
                  </p>
                  <h2 className="text-lg font-black uppercase text-slate-900">
                    {translateDisease(selected.disease)} - {selected.location_name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selected.detail?.source_name ||
                      selected.detail?.source_type ||
                      t("dashboard.modalCollectedSource")}{" "}
                    • {selected.latest_date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
                aria-label={t("dashboard.modalClose")}
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [t("dashboard.labelDisease"), translateDisease(selected.disease)],
                  [t("dashboard.labelLocation"), `${selected.location_name}, ${selected.country}`],
                  [t("dashboard.labelTotalCases"), selected.cases.toLocaleString(numLocale)],
                  [t("dashboard.labelDeaths"), selected.deaths.toLocaleString(numLocale)],
                  [
                    t("dashboard.labelConfidence"),
                    selected.confidence == null
                      ? "-"
                      : `${Math.round(selected.confidence * 100)}%`,
                  ],
                  [t("dashboard.labelEwsStatus"), translateSeverity(selected.severity)],
                  [
                    t("dashboard.labelEventType"),
                    selected.detail?.event_type?.replace(/_/g, " ") || "-",
                  ],
                  [t("dashboard.labelRelevance"), selected.detail?.relevance_score || "-"],
                  [t("dashboard.labelSentiment"), selected.detail?.sentiment || "-"],
                  [
                    t("dashboard.labelHealthRelated"),
                    selected.detail?.is_health_related ? t("common.yes") : t("common.no"),
                  ],
                  [
                    t("dashboard.labelNeedsReview"),
                    selected.detail?.needs_review ? t("common.yes") : t("common.no"),
                  ],
                  [
                    t("dashboard.labelCredibility"),
                    selected.detail?.source_credibility == null
                      ? "-"
                      : `${Math.round(Number(selected.detail.source_credibility) * 100)}%`,
                  ],
                ].map(([label, value]) => (
                  <article
                    key={label}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {label}
                    </p>
                    <p className="mt-2 break-words text-sm font-bold capitalize text-slate-800">
                      {value}
                    </p>
                  </article>
                ))}
              </div>
              {selected.detail?.symptoms?.length ||
              selected.detail?.disease_extracted?.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <article className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-black uppercase text-slate-500">
                      {t("dashboard.eventModal.detectedSymptoms")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selected.detail?.symptoms?.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </article>
                  <article className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-black uppercase text-slate-500">
                      {t("dashboard.eventModal.extractedDisease")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selected.detail?.disease_extracted?.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200"
                        >
                          {translateDisease(item)}
                        </span>
                      ))}
                    </div>
                  </article>
                </div>
              ) : null}
              <article className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
                <p className="text-xs font-black uppercase tracking-wider text-blue-900">
                  {t("dashboard.eventModal.dataSource")}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      {t("dashboard.eventModal.sourceName")}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {selected.detail?.source_name || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      {t("dashboard.eventModal.sourceType")}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {selected.detail?.source_type || "-"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 border-t border-blue-100 pt-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400">
                    {t("dashboard.eventModal.fullUrl")}
                  </p>
                  {selected.detail?.url ? (
                    <a
                      href={selected.detail.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-start gap-2 break-all text-xs font-semibold leading-5 text-[#0060A9] hover:text-[#004b85] hover:underline"
                    >
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {selected.detail.url}
                    </a>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      {t("dashboard.eventModal.urlUnavailable")}
                    </p>
                  )}
                </div>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                    {t("dashboard.eventModal.originalContent")}
                  </p>
                  {selected.detail?.url && (
                    <a
                      href={selected.detail.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#0060A9] hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> {t("dashboard.eventModal.openSource")}
                    </a>
                  )}
                </div>
                <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
                  {cleanArticleContent(selected.detail?.content, t("dashboard.noSourceContent"))}
                </p>
              </article>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
