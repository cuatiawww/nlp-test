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
  Database,
  Filter,
  ExternalLink,
  FileText,
  Globe2,
  Info,
  MapPin,
  RefreshCw,
Skull,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
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
ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchPublicDashboard, fetchCrawlingStats } from "@/lib/api";
import CrawlingEnginePerformance from "@/components/CrawlingEnginePerformance";
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

function formatPublishDate(dateStr?: string | null, numLocale = "id-ID") {
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
}

// ── Crawling Info Modal ───────────────────────────────────────────────────────
function CrawlingInfoModal({ crawlingStats }: {
  crawlingStats: {
    total: number; this_month: number; last_month: number;
    total_processed: number; current_month: string; previous_month: string;
    by_source_type: { source_type: string; total: number; processed: number; this_month: number }[];
  } | null;
}) {
  const [open, setOpen] = useState(false);
  if (!crawlingStats) return null;
  const sourceLabel: Record<string, string> = {
    rss: "RSS / News Feed",
    twitter: "Twitter / X",
    skdr: "SKDR Surveillance",
    skdr_api: "SKDR API",
    social: "Social Media",
    unknown: "Unknown Source",
  };
  const processedPct = crawlingStats.total > 0
    ? ((crawlingStats.total_processed / crawlingStats.total) * 100).toFixed(1)
    : "0";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition"
        aria-label="Info about Total Crawling"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-emerald-100 bg-white shadow-[0_20px_60px_rgba(5,150,105,.15)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-gradient-to-r from-emerald-50 to-transparent px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100">
                  <Database className="h-4 w-4 text-emerald-600" />
                </div>
                <h3 className="text-sm font-black text-slate-800">Total Crawled Reports</h3>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="rounded-xl bg-emerald-50/60 border border-emerald-100 p-3.5">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-700 mb-1.5">What is this?</p>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Total number of raw reports (news articles, social media posts, and surveillance data)
                  collected by the crawling system since the beginning. This is an all-time total, not
                  filtered by year. The system continuously crawls registered sources and queues each
                  item for NLP processing.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl p-3 text-center bg-emerald-50 border border-emerald-100">
                  <p className="text-lg font-black text-emerald-600">{crawlingStats.total.toLocaleString()}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mt-0.5">All-Time Total</p>
                </div>
                <div className="rounded-xl p-3 text-center bg-blue-50 border border-blue-100">
                  <p className="text-lg font-black text-blue-600">{crawlingStats.this_month.toLocaleString()}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mt-0.5">This Month</p>
                </div>
                <div className="rounded-xl p-3 text-center bg-violet-50 border border-violet-100">
                  <p className="text-lg font-black text-violet-600">{processedPct}%</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mt-0.5">NLP Processed</p>
                </div>
              </div>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Breakdown by Source</p>
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-3 py-2 font-bold text-slate-600 text-[10px] uppercase tracking-wider">Source Type</th>
                        <th className="px-3 py-2 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-right">Total</th>
                        <th className="px-3 py-2 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-right">Processed</th>
                        <th className="px-3 py-2 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-right">This Month</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {crawlingStats.by_source_type.map((src, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                          <td className="px-3 py-2 font-semibold text-slate-700">
                            {sourceLabel[src.source_type] ?? src.source_type}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-800">{src.total.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-emerald-600 font-bold">{src.processed.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-blue-600 font-bold">{src.this_month.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── KPI Info Modal ────────────────────────────────────────────────────────────
function KpiInfoModal({
  open,
  onClose,
  title,
  description,
  matrixTitle,
  matrix,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  matrixTitle: string;
  matrix: { label: string; value: number | string; sub?: string }[];
}) {
  if (!open) return null;
  const total = matrix.reduce((s, r) => s + (typeof r.value === "number" ? r.value : 0), 0);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-blue-100 bg-white shadow-[0_20px_60px_rgba(0,96,169,.18)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-[#0060A9]/8 to-transparent px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0060A9]/10">
              <Info className="h-4 w-4 text-[#0060A9]" />
            </div>
            <h3 className="text-sm font-black text-slate-800">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Description */}
          <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-3.5">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-[#0060A9] mb-1.5">What is this?</p>
            <p className="text-xs text-slate-700 leading-relaxed">{description}</p>
          </div>
          {/* Matrix */}
          {matrix.length > 0 && (
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">{matrixTitle}</p>
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-3 py-2 font-bold text-slate-600 text-[10px] uppercase tracking-wider">Country / Source</th>
                      <th className="px-3 py-2 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-right">Count</th>
                      <th className="px-3 py-2 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {matrix.slice(0, 12).map((row, i) => {
                      const pct = total > 0 && typeof row.value === "number"
                        ? ((row.value / total) * 100).toFixed(1)
                        : "–";
                      return (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                          <td className="px-3 py-2 font-semibold text-slate-700">
                            {row.label}
                            {row.sub && <span className="ml-1 text-[9px] text-slate-400">({row.sub})</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-800">
                            {typeof row.value === "number" ? row.value.toLocaleString() : row.value}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="inline-block rounded-full bg-[#0060A9]/10 px-2 py-0.5 text-[10px] font-bold text-[#0060A9]">
                              {pct}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {matrix.length > 12 && (
                <p className="mt-1 text-[10px] text-slate-400 text-right">Showing top 12 of {matrix.length}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function Kpi({
  label,
  value,
  icon,
  tone = "blue",
  trend,
  previousMonth,
  infoModal,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: string;
  trend?: { current: number; previous: number };
  previousMonth?: string;
  infoModal?: {
    title: string;
    description: string;
    matrixTitle: string;
    matrix: { label: string; value: number | string; sub?: string }[];
  };
}) {
  const { t, locale } = useTranslation();
  const numLocale = locale === "en" ? "en-US" : "id-ID";
  const [modalOpen, setModalOpen] = useState(false);
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
    <>
      {infoModal && (
        <KpiInfoModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={infoModal.title}
          description={infoModal.description}
          matrixTitle={infoModal.matrixTitle}
          matrix={infoModal.matrix}
        />
      )}
      <article
        className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-[#0060A9]/40"
        style={{ borderRadius: "17px 17px 22px 17px" }}
      >
        {infoModal && (
          <button
            onClick={() => setModalOpen(true)}
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-blue-100 hover:text-[#0060A9] transition"
            aria-label={`Info about ${label}`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
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
    </>
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
  const [crawlingStats, setCrawlingStats] = useState<{
    total: number;
    this_month: number;
    last_month: number;
    total_processed: number;
    current_month: string;
    previous_month: string;
    by_source_type: { source_type: string; total: number; processed: number; this_month: number }[];
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const [dashData, crawlData] = await Promise.all([
        fetchPublicDashboard({ country, year }),
        fetchCrawlingStats().catch(() => null),
      ]);
      setData(dashData);
      if (crawlData) setCrawlingStats(crawlData);
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label={t("dashboard.kpiDetectedCases")}
          value={data?.trends?.cases.current ?? data?.kpis.cases ?? 0}
          icon={<Bug className="h-5 w-5" />}
          tone="blue"
          trend={data?.trends?.cases}
          previousMonth={data?.trends?.previous_month}
          infoModal={{
            title: "Detected Cases",
            description:
              "Total number of disease cases detected this month from all crawled sources (news, social media, and surveillance reports). This reflects the current month only — not the full year. The number is the sum of reported case counts extracted by the NLP system from validated health-related articles.",
            matrixTitle: "Breakdown by Country",
            matrix: (data?.by_country ?? []).map((c) => ({
              label: c.name,
              value: c.cases,
            })),
          }}
        />
        <Kpi
          label={t("dashboard.kpiDeaths")}
          value={data?.trends?.deaths.current ?? data?.kpis.deaths ?? 0}
          icon={<Skull className="h-5 w-5" />}
          tone="red"
          trend={data?.trends?.deaths}
          previousMonth={data?.trends?.previous_month}
          infoModal={{
            title: "Deaths Reported",
            description:
              "Total number of disease-related deaths reported this month from validated health sources. Extracted by the NLP pipeline from news and official surveillance reports. A death count is only recorded when the source article explicitly mentions fatality figures linked to a disease outbreak.",
            matrixTitle: "Breakdown by Country",
            matrix: (data?.locations ?? [])
              .reduce<{ label: string; value: number }[]>((acc, loc) => {
                const existing = acc.find((x) => x.label === loc.country);
                if (existing) { existing.value += loc.deaths; } else { acc.push({ label: loc.country, value: loc.deaths }); }
                return acc;
              }, [])
              .filter((x) => x.value > 0)
              .sort((a, b) => b.value - a.value),
          }}
        />
        <Kpi
          label={t("dashboard.kpiValidatedEvents")}
          value={data?.trends?.events.current ?? data?.kpis.events ?? 0}
          icon={<Activity className="h-5 w-5" />}
          tone="blue"
          trend={data?.trends?.events}
          previousMonth={data?.trends?.previous_month}
          infoModal={{
            title: "Validated Events",
            description:
              "Number of unique news articles or reports that have been validated as health-related by the NLP system this month. Each 'event' is a single source document (e.g., one news article) that passed the disease detection and relevance filters. Duplicates (same URL) are automatically deduplicated.",
            matrixTitle: "Breakdown by Country",
            matrix: (data?.locations ?? [])
              .reduce<{ label: string; value: number }[]>((acc, loc) => {
                const existing = acc.find((x) => x.label === loc.country);
                if (existing) { existing.value += loc.event_count; } else { acc.push({ label: loc.country, value: loc.event_count }); }
                return acc;
              }, [])
              .filter((x) => x.value > 0)
              .sort((a, b) => b.value - a.value),
          }}
        />
        <Kpi
          label={t("dashboard.kpiLocations")}
          value={data?.trends?.locations.current ?? data?.kpis.locations ?? 0}
          icon={<MapPin className="h-5 w-5" />}
          tone="blue"
          trend={data?.trends?.locations}
          previousMonth={data?.trends?.previous_month}
          infoModal={{
            title: "Detected Locations",
            description:
              "Number of unique geographic locations where disease events were detected this month. A location is counted when the NLP system successfully extracts a place name from a health article AND that location exists in the master location database with known coordinates. Locations without matching coordinates are excluded.",
            matrixTitle: "Breakdown by Country",
            matrix: (data?.by_country ?? []).map((c) => ({
              label: c.name,
              value: c.cases,
            })),
          }}
        />
        <Kpi
          label={t("dashboard.kpiActiveAlerts")}
          value={data?.trends?.alerts.current ?? data?.kpis.active_alerts ?? 0}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="gold"
          trend={data?.trends?.alerts}
          previousMonth={data?.trends?.previous_month}
          infoModal={{
            title: "Active EWS Alerts",
            description:
              "Number of locations currently under an Early Warning System (EWS) alert. An alert is triggered when: (1) the NLP model flags an article as an outbreak event, (2) the reported case count meets or exceeds the disease-specific threshold, and (3) the system confidence is ≥ 35% with a valid mapped location. Alert levels: WASPADA (watch), SIAGA (alert), AWAS (danger).",
            matrixTitle: "Breakdown by Severity Level",
            matrix: (["AWAS", "SIAGA", "WASPADA"] as const).map((sev) => ({
              label: sev,
              value: (data?.alerts ?? []).filter((a) => a.severity === sev).length,
              sub: sev === "AWAS" ? "Danger" : sev === "SIAGA" ? "Alert" : "Watch",
            })),
          }}
        />
        {/* ── Total Crawling Card ── */}
        <article
          className="relative flex min-h-[128px] items-center gap-3 border border-[#cfe0f1] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(0,96,169,.06)] transition hover:-translate-y-0.5 hover:border-[#0060A9]/40"
          style={{ borderRadius: "17px 17px 22px 17px" }}
        >
          <CrawlingInfoModal crawlingStats={crawlingStats} />
          <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full text-emerald-600 bg-emerald-50/80">
            <Database className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
              Total Crawled
            </p>
            <p className="mt-2 truncate text-[30px] font-bold leading-none text-emerald-600">
              {(crawlingStats?.total ?? 0).toLocaleString()}
            </p>
            <div className="mt-2 text-[9px] font-bold leading-tight text-slate-500">
              <p className="uppercase">
                {crawlingStats?.previous_month
                  ? new Intl.DateTimeFormat("en-US", { month: "long" }).format(
                      new Date(`${crawlingStats.previous_month}-01T00:00:00Z`),
                    )
                  : "Last month"}{" "}
                ({(crawlingStats?.last_month ?? 0).toLocaleString()})
              </p>
              <p className="mt-1 flex items-center gap-0.5 text-slate-400">
                <Info className="h-3 w-3" />
                {(crawlingStats?.this_month ?? 0).toLocaleString()} this month
              </p>
            </div>
          </div>
        </article>
      </div>

      {/* ── AI Summary Section (moved above map section) ── */}
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

      <section className="w-full bg-[#f8fafc] pb-5">
        <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[381px_minmax(0,1fr)] xl:items-stretch">
          <section
            className="flex overflow-hidden border border-[#cfe0f1] bg-gradient-to-b from-[#f0f6fc] to-[#e8f1fa] xl:h-[700px] 2xl:h-[760px] xl:w-[381px]"
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
                        <b>{a.deaths}</b> {t("dashboard.deathsUnit")} • {t("dashboard.publishDateUnit")}: {formatPublishDate(a.latest_date || a.detail?.published_at, numLocale)}
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
            className="flex flex-col border border-[#cfe0f1] bg-white p-4 xl:h-[700px] 2xl:h-[760px]"
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
            <div className="mt-4 min-h-[460px] w-full flex-1 overflow-hidden rounded-xl">
              <SpatialOutbreakMap
                countries={countryData}
                locations={data?.locations ?? []}
              />
            </div>
          </article>
        </div>
      </section>

      {/* ── Data Crawling Engine Performance Section (below map) ── */}
      <CrawlingEnginePerformance crawlingStats={crawlingStats} />

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
                    • {formatPublishDate(selected.latest_date || selected.detail?.published_at, numLocale)}
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
