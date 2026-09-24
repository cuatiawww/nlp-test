'use client'

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  CalendarDays,
  Clock3,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Database,
  Filter,
  ExternalLink,
  FileText,
  Globe2,
  Info,
  MapPin,
  RefreshCw,
  Radio,
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
import { fetchPublicDashboard, fetchKpiSnapshot, fetchCrawlingStats } from "@/lib/api";
import { scopeDashboardLocations } from "@/lib/asean-scope";
import AseanScopeBanner from "@/components/AseanScopeBanner";
import CrawlingEnginePerformance from "@/components/CrawlingEnginePerformance";
import CaseLocationHeatmap from "@/components/CaseLocationHeatmap";
import DiseaseTrendOverview from "@/components/DiseaseTrendOverview";
import MorbidityMortalitySection from "@/components/MorbidityMortalitySection";
import EpiFilterBar, { EpiFilterState } from "@/components/EpiFilterBar";
import { getCurrentEpiWeek } from "@/lib/epi-week";

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

function getAlertPublishTimestamp(alert: OutbreakLocation): number {
  const dateStr = alert.latest_date || alert.detail?.published_at;
  if (!dateStr) return 0;
  try {
    const d = new Date(dateStr);
    const t = d.getTime();
    if (!isNaN(t)) return t;
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, dNum] = match;
      return new Date(Number(y), Number(m) - 1, Number(dNum)).getTime();
    }
    return 0;
  } catch {
    return 0;
  }
}

// ── Normalization Helper for 100% Consistent KPI Breakdown ─────────────────────
function formatNumber(
  value: unknown,
  numLocale = "id-ID",
  options?: Intl.NumberFormatOptions,
) {
  const numeric = Number(value);
  return (Number.isFinite(numeric) ? numeric : 0).toLocaleString(numLocale, options);
}

function normalizeMatrixToTarget(
  matrix: { label: string; value: number; sub?: string }[],
  targetTotal: number,
): { label: string; value: number; sub?: string; sharePct: string }[] {
  if (!matrix || matrix.length === 0) {
    if (targetTotal > 0) {
      return [{ label: "Total Monitored", value: targetTotal, sharePct: "100.0" }];
    }
    return [];
  }

  const rawSum = matrix.reduce((s, m) => s + (typeof m.value === "number" ? m.value : 0), 0);
  if (rawSum === 0 || targetTotal === 0) {
    return matrix.map((m) => ({
      ...m,
      value: 0,
      sharePct: "0.0",
    }));
  }

  if (rawSum === targetTotal) {
    return matrix.map((m) => ({
      ...m,
      sharePct: ((m.value / targetTotal) * 100).toFixed(1),
    }));
  }

  let allocatedSum = 0;
  const scaled = matrix.map((m) => {
    const rawVal = typeof m.value === "number" ? m.value : 0;
    const propVal = Math.round((rawVal / rawSum) * targetTotal);
    allocatedSum += propVal;
    return {
      ...m,
      value: propVal,
      sharePct: ((rawVal / rawSum) * 100).toFixed(1),
    };
  });

  const diff = targetTotal - allocatedSum;
  if (diff !== 0 && scaled.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < scaled.length; i++) {
      if (scaled[i].value > scaled[maxIdx].value) maxIdx = i;
    }
    scaled[maxIdx].value += diff;
  }

  return scaled;
}

// ── Crawling Info Modal (100% Synchronized & User-Friendly) ───────────────────
function CrawlingInfoModal({
  crawlingStats,
}: {
  crawlingStats: {
    total: number;
    this_month: number;
    last_month: number;
    total_processed: number;
    stored_in_db?: number;
    nlp_processing?: number;
    current_live_crawl?: number;
    total_crawled_all_time?: number;
    current_month: string;
    previous_month: string;
    by_source_type: { source_type: string; total: number; processed: number; this_month: number }[];
  } | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const sY = sp.get("startYear");
      const sW = sp.get("startWeek");
      const eY = sp.get("endYear");
      const eW = sp.get("endWeek");
      const dis = sp.get("disease");
      const ctry = sp.get("country");
      if (sY || sW || eY || eW || dis || ctry) {
        setFilters((prev) => ({
          ...prev,
          startYear: sY ? Number(sY) : prev.startYear,
          startWeek: sW ? Number(sW) : prev.startWeek,
          endYear: eY ? Number(eY) : prev.endYear,
          endWeek: eW ? Number(eW) : prev.endWeek,
          disease: dis || prev.disease,
          country: ctry || prev.country,
        }));
      }
    }
  }, []);
  const { t } = useTranslation();
  if (!crawlingStats) return null;

  const sourceLabel: Record<string, string> = {
    rss: t("crawling.sourceLabels.rss"),
    twitter: t("crawling.sourceLabels.twitter"),
    social_media: t("crawling.sourceLabels.social_media"),
    skdr: t("crawling.sourceLabels.skdr"),
    skdr_api: t("crawling.sourceLabels.skdr_api"),
    web: t("crawling.sourceLabels.web"),
    unknown: t("crawling.sourceLabels.unknown"),
  };

  // Older backend deployments may return a partial crawling-stats payload.
  // Normalize numeric fields here so the dashboard never crashes while the
  // API is being upgraded or a source row is incomplete.
  const totalCrawled = Number(crawlingStats.total_crawled_all_time ?? crawlingStats.total ?? 0) || 0;
  const thisMonth = Number(crawlingStats.this_month ?? 0) || 0;
  const totalProcessed = Number(crawlingStats.total_processed ?? 0) || 0;

  const processedPct =
    totalCrawled > 0
      ? ((totalProcessed / totalCrawled) * 100).toFixed(1)
      : "0";

  // Build normalized matrix for sources that sums exactly to crawlingStats.total
  const rawSources = (crawlingStats.by_source_type || [])
    .filter((s) => (s.source_type || "").toLowerCase() !== "test")
    .map((s) => {
    const sourceType = s.source_type || "unknown";
    const sourceTotal = Number(s.total ?? 0) || 0;
    const sourceProcessed = Number(s.processed ?? 0) || 0;
    return {
      label: sourceLabel[sourceType] || sourceType.toUpperCase(),
      value: sourceTotal,
      sub: `${formatNumber(sourceProcessed)} ${t("crawling.processedByModel")}`,
    };
  });
  const normalizedSources = normalizeMatrixToTarget(rawSources, totalCrawled);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 transition shadow-xs"
        aria-label={t("crawling.infoTitle")}
        title={t("crawling.infoTitle")}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {mounted && open && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 transition-all duration-300 animate-in fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex max-h-[90vh] w-full max-w-3xl sm:max-w-4xl flex-col overflow-hidden rounded-3xl border border-emerald-200/90 bg-white shadow-2xl transition-all duration-300 animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header - Clean Title without Icon */}
            <div className="flex shrink-0 items-center justify-between border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50/50 to-white px-6 py-4 sm:px-7">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight leading-tight">
                  {t("crawling.infoTitle")}
                </h3>
                <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                  {t("crawling.infoSubtitle")}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6">
              {/* Hero Stat Box - 100% Synchronized */}
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white p-4 text-center shadow-xs">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 uppercase tracking-wider mb-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>{t("crawling.syncedBadge")}</span>
                </div>
                <p className="text-3xl sm:text-4xl font-black text-emerald-600 tracking-tight">
                  {formatNumber(totalCrawled)}
                </p>
                <p className="text-xs font-bold text-slate-600 mt-1">
                  {t("crawling.totalSourceRecords")}
                </p>
              </div>

              {/* User-friendly explanations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
                  <div className="text-slate-800 font-extrabold text-[11px] uppercase tracking-wider">
                    <span>{t("crawling.whatItMeans")}</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11.5px]">
                    {t("crawling.whatItMeansBody")}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
                  <div className="text-slate-800 font-extrabold text-[11px] uppercase tracking-wider">
                    <span>{t("crawling.processingFlow")}</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed text-[11.5px]">
                    {t("crawling.processingFlowBody")}
                  </p>
                </div>
              </div>

              {/* 3 Secondary KPI Boxes */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                  <p className="text-sm sm:text-base font-black text-emerald-700">
                    {formatNumber(totalCrawled)}
                  </p>
                  <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    {t("crawling.allTime")}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-2.5">
                  <p className="text-sm sm:text-base font-black text-[#0060A9]">
                    {formatNumber(thisMonth)}
                  </p>
                  <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    {t("crawling.thisMonth")}
                  </p>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-2.5">
                  <p className="text-sm sm:text-base font-black text-violet-700">
                    {processedPct}%
                  </p>
                  <p className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    {t("crawling.validatedRecords")}
                  </p>
                </div>
              </div>

              {/* Breakdown Table with Mini Progress Bars */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-700">
                    {t("crawling.sourceBreakdown")}
                  </p>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Total: {formatNumber(totalCrawled)}
                  </span>
                </div>
                <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/90 text-left border-b border-slate-200/80">
                        <th className="px-3.5 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                          {t("crawling.sourceType")}
                        </th>
                        <th className="px-2 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-center">
                          {t("crawling.share")}
                        </th>
                        <th className="px-3.5 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-right">
                          {t("crawling.recordCount")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {normalizedSources.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/60 transition">
                          <td className="px-3.5 py-2.5">
                            <p className="font-bold text-slate-800">{row.label}</p>
                            {row.sub && (
                              <p className="text-[9.5px] text-slate-400 mt-0.5">{row.sub}</p>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500"
                                  style={{ width: `${Math.min(100, Math.max(2, parseFloat(row.sharePct)))}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-emerald-700">
                                {row.sharePct}%
                              </span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-black text-slate-900">
                            {formatNumber(row.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-50/60 font-black text-emerald-950 border-t border-emerald-200">
                        <td className="px-3.5 py-2.5 text-[11px] uppercase tracking-wider">
                          {t("crawling.totalRecords")}
                        </td>
                        <td className="px-2 py-2.5 text-center text-[10px]">100.0%</td>
                        <td className="px-3.5 py-2.5 text-right text-sm text-emerald-700 font-black">
                          {formatNumber(totalCrawled)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Generic KPI Info Modal (100% Synchronized with KPI Value & Beautiful UI) ──
function KpiInfoModal({
  open,
  onClose,
  title,
  kpiValue,
  label,
  tone = "blue",
  icon,
  explanation,
  matrixTitle,
  matrix,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  kpiValue: number;
  label: string;
  tone?: string;
  icon?: React.ReactNode;
  explanation: {
    meaning: string;
    calculation: string;
  };
  matrixTitle: string;
  matrix: { label: string; value: number; sub?: string }[];
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  // Normalization guarantees that row values sum up exactly to kpiValue
  const normalizedRows = normalizeMatrixToTarget(matrix, kpiValue);

  const isRed = tone === "red";
  const isGold = tone === "gold" || tone === "orange";
  const isEmerald = tone === "emerald";

  const theme = {
    headerGradient: isRed
      ? "from-rose-50 via-red-50/40 to-white"
      : isGold
      ? "from-amber-50 via-yellow-50/40 to-white"
      : isEmerald
      ? "from-emerald-50 via-teal-50/40 to-white"
      : "from-blue-50 via-sky-50/40 to-white",
    headerBorder: isRed
      ? "border-rose-100"
      : isGold
      ? "border-amber-100"
      : isEmerald
      ? "border-emerald-100"
      : "border-blue-100",
    iconBg: isRed
      ? "bg-rose-600 text-white shadow-rose-600/20"
      : isGold
      ? "bg-amber-600 text-white shadow-amber-600/20"
      : isEmerald
      ? "bg-emerald-600 text-white shadow-emerald-600/20"
      : "bg-[#0060A9] text-white shadow-[#0060A9]/20",
    heroText: isRed
      ? "text-rose-600"
      : isGold
      ? "text-[#B49B58]"
      : isEmerald
      ? "text-emerald-600"
      : "text-[#0060A9]",
    heroBorder: isRed
      ? "border-rose-200 bg-rose-50/60"
      : isGold
      ? "border-amber-200 bg-amber-50/60"
      : isEmerald
      ? "border-emerald-200 bg-emerald-50/60"
      : "border-blue-200 bg-blue-50/60",
    badge: isRed
      ? "bg-rose-100/90 text-rose-800"
      : isGold
      ? "bg-amber-100/90 text-amber-900"
      : isEmerald
      ? "bg-emerald-100/90 text-emerald-800"
      : "bg-blue-100/90 text-[#0060A9]",
    barBg: isRed ? "bg-rose-500" : isGold ? "bg-amber-500" : isEmerald ? "bg-emerald-500" : "bg-[#0060A9]",
    footBg: isRed
      ? "bg-rose-50/80 text-rose-950 border-rose-200"
      : isGold
      ? "bg-amber-50/80 text-amber-950 border-amber-200"
      : isEmerald
      ? "bg-emerald-50/80 text-emerald-950 border-emerald-200"
      : "bg-blue-50/80 text-blue-950 border-blue-200",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 sm:p-6 transition-all duration-300 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl sm:max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Clean Title without Icon */}
        <div
          className={`flex shrink-0 items-center justify-between border-b ${theme.headerBorder} bg-gradient-to-r ${theme.headerGradient} px-6 py-4 sm:px-7`}
        >
          <div>
            <h3 className="text-lg font-black text-slate-900 leading-tight tracking-tight">{title}</h3>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-7 space-y-6">
          {/* Hero Value - 100% Matched with Card */}
          <div className={`rounded-2xl border ${theme.heroBorder} p-4 text-center shadow-xs`}>
            <div className={`inline-flex items-center gap-1.5 rounded-full ${theme.badge} px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider mb-1.5`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Official value synchronized with KPI card</span>
            </div>
            <p className={`text-3xl sm:text-4xl font-black ${theme.heroText} tracking-tight`}>
              {formatNumber(kpiValue)}
            </p>
            <p className="text-xs font-bold text-slate-600 mt-1">
              Total {label} in the current monitoring period
            </p>
          </div>

          {/* User-friendly explanations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
              <div className="text-slate-800 font-extrabold text-[11px] uppercase tracking-wider">
                <span>What does it mean?</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {explanation.meaning}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1">
              <div className="text-slate-800 font-extrabold text-[11px] uppercase tracking-wider">
                <span>How is it calculated?</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-[11.5px]">
                {explanation.calculation}
              </p>
            </div>
          </div>

          {/* Matrix Breakdown with Mini Bars */}
          {normalizedRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-700">
                  {matrixTitle}
                </p>
                <span className="text-[10px] font-bold text-slate-500">
                  Total: {formatNumber(kpiValue)}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50/90 text-left border-b border-slate-200/80">
                      <th className="px-3.5 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider">
                        Category / Region
                      </th>
                      <th className="px-2 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-center">
                        Share
                      </th>
                      <th className="px-3.5 py-2.5 font-bold text-slate-600 text-[10px] uppercase tracking-wider text-right">
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {normalizedRows.slice(0, 10).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/60 transition">
                        <td className="px-3.5 py-2.5">
                          <p className="font-bold text-slate-800">{row.label}</p>
                          {row.sub && (
                            <p className="text-[9.5px] text-slate-400 mt-0.5">{row.sub}</p>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${theme.barBg}`}
                                style={{ width: `${Math.min(100, Math.max(2, parseFloat(row.sharePct)))}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-bold text-slate-600">
                              {row.sharePct}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-black text-slate-900">
                          {formatNumber(row.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={`font-black border-t ${theme.footBg}`}>
                      <td className="px-3.5 py-2.5 text-[11px] uppercase tracking-wider">
                        Total Monitored
                      </td>
                      <td className="px-2 py-2.5 text-center text-[10px]">100.0%</td>
                      <td className={`px-3.5 py-2.5 text-right text-sm font-black ${theme.heroText}`}>
                        {formatNumber(kpiValue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {normalizedRows.length > 10 && (
                <p className="mt-1.5 text-[9.5px] text-slate-400 text-right">
                  Showing the top 10 of {normalizedRows.length} entities
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function Kpi({
  label,
  value,
  icon,
  tone = "blue",
  trend,
  currentMonth,
  previousMonth,
  infoModal,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: string;
  trend?: { current: number; previous: number };
  currentMonth?: string;
  previousMonth?: string;
  infoModal?: {
    title: string;
    explanation: {
      meaning: string;
      calculation: string;
    };
    matrixTitle: string;
    matrix: { label: string; value: number; sub?: string }[];
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
  const currentMonthLabel = currentMonth
    ? new Intl.DateTimeFormat(numLocale, { month: "long" }).format(
        new Date(`${currentMonth}-01T00:00:00Z`),
      )
    : t("dashboard.thisMonth");
  const previousMonthLabel = previousMonth
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
          kpiValue={value}
          label={label}
          tone={tone}
          icon={icon}
          explanation={infoModal.explanation}
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
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-blue-100 hover:text-[#0060A9] transition shadow-xs"
            aria-label={`Info about ${label}`}
            title={`View Details & Explanation for ${label}`}
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
            {formatNumber(value, numLocale)}
          </p>
          <div className="mt-2 text-[9px] font-bold leading-tight text-slate-500">
            <p className="uppercase text-slate-700">
              Current month: {currentMonthLabel} ({formatNumber(trend?.current ?? 0, numLocale)})
            </p>
            <p className="mt-0.5 uppercase">
              Previous month: {previousMonthLabel} ({formatNumber(trend?.previous ?? 0, numLocale)})
            </p>
            <p
              className={`mt-1 flex items-center gap-0.5 ${isUp ? "text-emerald-600" : "text-red-600"}`}
            >
              {isUp ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {formatNumber(percentage, numLocale, { maximumFractionDigits: 1 })}%{" "}
              {t("dashboard.fromPreviousMonth")}
            </p>
          </div>
        </div>
      </article>
    </>
  );
}

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const { t, locale, translateDisease, translateSeverity } = useTranslation();
  const numLocale = locale === "en" ? "en-US" : "id-ID";
  const currentYear = new Date().getFullYear();
  const currentEpi = getCurrentEpiWeek();
  const [filters, setFilters] = useState<EpiFilterState>({
    disease: "all",
    country: "ASEAN",
    startYear: currentEpi.year || currentYear,
    startWeek: 1,
    endYear: currentEpi.year || currentYear,
    endWeek: currentEpi.week || 1,
  });
  const [data, setData] = useState<PublicDashboard | null>(null);
  const [selected, setSelected] = useState<OutbreakLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [crawlingStats, setCrawlingStats] = useState<{
    total: number;
    this_month: number;
    last_month: number;
    total_processed: number;
    stored_in_db?: number;
    nlp_processing?: number;
    current_month: string;
    previous_month: string;
    live_crawled: number;
    current_live_crawl?: number;
    total_crawled_all_time?: number;
    active_run_count: number;
    active_since: string | null;
    collector_status: "RUNNING" | "IDLE" | string;
    last_report_at: string | null;
    by_source_type: { source_type: string; total: number; processed: number; this_month: number }[];
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const refreshCrawlingStats = useCallback(async () => {
    const crawlData = await fetchCrawlingStats().catch(() => null);
    if (crawlData) setCrawlingStats(crawlData);
  }, []);

  const dashboardApiFilters = useCallback((active: EpiFilterState) => ({
    country: active.country,
    disease: active.disease,
    start_year: active.startYear,
    start_week: active.startWeek,
    end_year: active.endYear,
    end_week: active.endWeek,
    year: active.endYear,
  }), []);

  const refreshKpis = useCallback(async () => {
    const kpiData = await fetchKpiSnapshot(dashboardApiFilters(filters)).catch(() => null);
    if (!kpiData?.kpis) return;
    setData((prev) => (prev ? { ...prev, kpis: { ...prev.kpis, ...kpiData.kpis } } : prev));
  }, [dashboardApiFilters, filters]);

  const load = useCallback(async (customFilters?: EpiFilterState) => {
    const active = customFilters || filters;
    try {
      setError("");
      const dashboardFilters = dashboardApiFilters(active);
      const [dashData, kpiData, crawlData] = await Promise.all([
        fetchPublicDashboard(dashboardFilters),
        fetchKpiSnapshot(dashboardFilters).catch(() => null),
        fetchCrawlingStats().catch(() => null),
      ]);
      if (kpiData?.kpis) {
        dashData.kpis = { ...dashData.kpis, ...kpiData.kpis }
      }
      setData(dashData);
      if (crawlData) setCrawlingStats(crawlData);
    } catch {
      setError(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [dashboardApiFilters, filters, t]);

  useEffect(() => {
    load();
    const id = window.setInterval(() => void refreshKpis(), 120_000);
    return () => window.clearInterval(id);
  }, [load, refreshKpis]);

  // Keep the collector KPI live without reloading the heavier dashboard payload.
  useEffect(() => {
    void refreshCrawlingStats();
    const id = window.setInterval(() => void refreshCrawlingStats(), 15_000);
    return () => window.clearInterval(id);
  }, [refreshCrawlingStats]);

  useEffect(() => {
    const available = data?.available_years;
    if (available?.length && !available.includes(filters.endYear)) {
      setFilters(prev => ({ ...prev, endYear: available[0], startYear: available[0] }));
    }
  }, [data?.available_years, filters.endYear]);

  const mapLocations = useMemo(
    () => scopeDashboardLocations(data?.locations, filters.country),
    [data?.locations, filters.country],
  );

  const countryData = data?.by_country ?? [];

  const sortedAlerts = useMemo(() => {
    if (!data?.alerts?.length) return [];
    return [...data.alerts]
      .sort((a, b) => {
        const timeA = getAlertPublishTimestamp(a);
        const timeB = getAlertPublishTimestamp(b);
        if (timeB !== timeA) {
          return timeB - timeA;
        }
        return (b.cases ?? 0) - (a.cases ?? 0);
      })
      .slice(0, 20);
  }, [data?.alerts]);

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
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100"
          >
            <RefreshCw className="h-4 w-4" />
            {t("dashboard.refresh")}
          </button>
        </div>
      </section>

      <EpiFilterBar
        availableDiseases={data?.available_diseases}
        availableYears={data?.available_years}
        currentEpiWeek={data?.current_epi_week}
        currentEpiYear={data?.current_epi_year}
        value={filters}
        onChange={(newFilters) => setFilters(newFilters)}
        onApply={(newFilters) => {
          setFilters(newFilters);
          load(newFilters);
        }}
        isLoading={loading}
      />

      <AseanScopeBanner country={filters.country} />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Live crawling pipeline KPI. */}
        <article
          className="relative min-h-[158px] border border-emerald-200 bg-white px-4 py-3 shadow-[0_6px_18px_rgba(5,150,105,.08)] transition hover:-translate-y-0.5 hover:border-emerald-400"
          style={{ borderRadius: "17px 17px 22px 17px" }}
        >
          <CrawlingInfoModal crawlingStats={crawlingStats} />
          <div className="flex items-start gap-3">
            <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Radio className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 pr-7">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#4f4f4f]">
                  Total Crawled (All-Time)
                </p>
                <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide ${Number(crawlingStats?.active_run_count || 0) > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${Number(crawlingStats?.active_run_count || 0) > 0 ? "animate-pulse bg-emerald-500" : "bg-slate-300"}`} />
                  {Number(crawlingStats?.active_run_count || 0) > 0 ? "Running" : "Idle"}
                </span>
              </div>
              <p className="mt-1 truncate text-[30px] font-bold leading-none text-emerald-600">
                {formatNumber(crawlingStats?.total_crawled_all_time ?? crawlingStats?.total ?? 0)}
              </p>
              <p className="mt-1 text-[9px] font-semibold text-slate-400">
                Cumulative collector total, updated while crawling is live
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                  <p className="text-[8px] font-black uppercase tracking-wide text-slate-400">Current Live Crawl</p>
                  <p className="mt-0.5 text-sm font-black text-slate-700">{formatNumber(crawlingStats?.current_live_crawl ?? crawlingStats?.live_crawled ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-2 py-1.5">
                  <p className="text-[8px] font-black uppercase tracking-wide text-blue-500">NLP Processing</p>
                  <p className="mt-0.5 text-sm font-black text-[#0060A9]">{formatNumber(crawlingStats?.nlp_processing ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-2 py-1.5">
                  <p className="text-[8px] font-black uppercase tracking-wide text-violet-500">Stored in DB</p>
                  <p className="mt-0.5 text-sm font-black text-violet-700">{formatNumber(crawlingStats?.stored_in_db ?? crawlingStats?.total_processed ?? 0)}</p>
                </div>
              </div>
            </div>
          </div>
        </article>
        <Kpi
          label={t("dashboard.kpiDetectedCases")}
          value={data?.kpis.cases ?? 0}
          icon={<Bug className="h-5 w-5" />}
          tone="blue"
          trend={data?.trends?.cases}
          currentMonth={data?.trends?.current_month}
          previousMonth={data?.trends?.previous_month}
          infoModal={{
            title: t("dashboard.kpiInfo.casesTitle"),
            explanation: {
              meaning: t("dashboard.kpiInfo.casesMeaning"),
              calculation: t("dashboard.kpiInfo.casesCalculation")
            },
            matrixTitle: t("dashboard.kpiInfo.casesMatrix"),
            matrix: (data?.by_country ?? []).map((c) => ({
              label: c.name,
              value: c.cases,
            })),
          }}
        />
        <Kpi
          label={t("dashboard.kpiDeaths")}
          value={data?.kpis.deaths ?? 0}
          icon={<Skull className="h-5 w-5" />}
          tone="red"
          trend={data?.trends?.deaths}
          currentMonth={data?.trends?.current_month}
          previousMonth={data?.trends?.previous_month}
          infoModal={{
            title: t("dashboard.kpiInfo.deathsTitle"),
            explanation: {
              meaning: t("dashboard.kpiInfo.deathsMeaning"),
              calculation: t("dashboard.kpiInfo.deathsCalculation")
            },
            matrixTitle: t("dashboard.kpiInfo.deathsMatrix"),
            matrix: mapLocations
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
          label={t("dashboard.kpiLocations")}
          value={data?.kpis.locations ?? 0}
          icon={<MapPin className="h-5 w-5" />}
          tone="blue"
          trend={data?.trends?.locations}
          currentMonth={data?.trends?.current_month}
          previousMonth={data?.trends?.previous_month}
          infoModal={{
            title: t("dashboard.kpiInfo.locationsTitle"),
            explanation: {
              meaning: t("dashboard.kpiInfo.locationsMeaning"),
              calculation: t("dashboard.kpiInfo.locationsCalculation")
            },
            matrixTitle: t("dashboard.kpiInfo.locationsMatrix"),
            matrix: mapLocations
              .reduce<{ label: string; value: number }[]>((acc, loc) => {
                const existing = acc.find((x) => x.label === loc.country);
                if (existing) { existing.value += 1; } else { acc.push({ label: loc.country, value: 1 }); }
                return acc;
              }, [])
              .filter((x) => x.value > 0)
              .sort((a, b) => b.value - a.value),
          }}
        />
        {/* ── Total Crawling Card ── */}
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
                {sortedAlerts.length ? (
                  sortedAlerts.map((a, i) => (
                    <button
                      key={`${a.detail?.event_id || a.detail?.url || a.location_name}-${a.disease}-${i}`}
                      type="button"
                      onClick={() => setSelected(a)}
                      className="group w-full rounded-xl border border-slate-100 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 truncate">
                            {translateDisease(a.disease)}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {a.location_name}, {a.country}
                            {a.detail?.source_name ? ` • ${a.detail.source_name}` : ""}
                          </p>
                        </div>
                        <span
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-[#0060A9] border border-blue-200/80 transition group-hover:bg-[#0060A9] group-hover:text-white shrink-0"
                        >
                          <span>View Details</span>
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        <b>{formatNumber(a.cases ?? 0, numLocale)}</b> {t("dashboard.casesUnit")} •{" "}
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
                locations={mapLocations}
              />
            </div>
          </article>
        </div>
      </section>

      {/* ── Data Crawling Engine Performance Section (below map) ── */}
      <CrawlingEnginePerformance crawlingStats={crawlingStats} />

      {/* ?? Case Location Summary Heatmap Section (Spatial-Temporal Matrix) ?? */}
      <CaseLocationHeatmap filters={filters} />

      {/* ?? Disease Trend Overview (Peringatan Prioritas & Multi-Day Trend) ?? */}
      <DiseaseTrendOverview filters={filters} />

      {/* ?? Morbidity & Mortality Section (Weekly Trend & Cases vs Deaths) ?? */}
      <MorbidityMortalitySection filters={filters} />

      {/* Temporarily hidden: Case Distribution by Health Topic and Country Distribution. */}
      {false && (
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
      )}

      {/* Temporarily hidden: Surveillance Summary by Location. */}
      {false && (
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
              {mapLocations.slice(0, 20).map((r, i) => (
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
                    {formatNumber(r.cases ?? 0, numLocale)}
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
      )}

      {mounted && selected && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 sm:p-6 backdrop-blur-xs transition-all duration-300 animate-in fade-in"
          onClick={() => setSelected(null)}
        >
          <section
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-[#f8fbff] shadow-2xl transition-all duration-300 animate-in zoom-in-95"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur-md">
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
                  [t("dashboard.labelLocation"), `${selected.location_name}${selected.province || selected.city ? ` · ${[selected.province, selected.city].filter(Boolean).join(" / ")}` : ""}, ${selected.country}`],
                  [t("dashboard.labelTotalCases"), formatNumber(selected.cases ?? 0, numLocale)],
                  [t("dashboard.labelDeaths"), formatNumber(selected.deaths ?? 0, numLocale)],
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
        </div>,
        document.body
      )}
    </div>
  );
}
