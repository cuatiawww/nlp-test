"use client";

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
  Skull,
  Sparkles,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchPublicDashboard } from "@/lib/api";
import type { OutbreakLocation, PublicDashboard } from "@/types";

const SpatialOutbreakMap = dynamic(
  () => import("@/components/SpatialOutbreakMap"),
  { ssr: false },
);
const colors = [
  "#0f8f96",
  "#06b6d4",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#f97316",
];
const severityClass = {
  AWAS: "bg-red-600 text-white",
  SIAGA: "bg-orange-500 text-white",
  WASPADA: "bg-yellow-400 text-slate-900",
  NORMAL: "bg-emerald-100 text-emerald-800",
};

function cleanArticleContent(value?: string | null): string {
  if (!value) return "Konten sumber tidak tersedia.";
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
  tone = "teal",
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
    ? new Intl.DateTimeFormat("id-ID", { month: "long" }).format(
        new Date(`${previousMonth}-01T00:00:00Z`),
      )
    : "Bulan lalu";
  const color =
    tone === "red"
      ? "text-red-600 bg-red-50/80"
      : tone === "orange"
        ? "text-amber-600 bg-amber-50/80"
        : "text-teal-700 bg-teal-50/80";
  return (
    <article
      className="flex min-h-[128px] items-center gap-3 border border-[#bedbda] bg-white px-4 py-3 shadow-[0_6px_18px_rgba(20,120,116,.06)] transition hover:-translate-y-0.5 hover:border-teal-400"
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
          className={`mt-2 truncate text-[30px] font-bold leading-none ${tone === "red" ? "text-red-600" : tone === "orange" ? "text-amber-600" : "text-teal-700"}`}
        >
          {value.toLocaleString("id-ID")}
        </p>
        <div className="mt-2 text-[9px] font-bold leading-tight text-slate-500">
          <p className="uppercase">
            {monthLabel} ({(trend?.previous ?? 0).toLocaleString("id-ID")})
          </p>
          <p
            className={`mt-1 flex items-center gap-0.5 ${isUp ? "text-emerald-600" : "text-red-600"}`}
          >
            {isUp ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {percentage.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
            dari bulan sebelumnya
          </p>
        </div>
      </div>
    </article>
  );
}

export default function DashboardPage() {
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
      setError("Data dashboard belum dapat dijangkau.");
    } finally {
      setLoading(false);
    }
  }, [country, year]);
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
      <div className="grid min-h-[60vh] place-items-center text-sm font-semibold text-teal-700">
        Memuat pemantauan outbreak ASEAN...
      </div>
    );

  return (
    <div className="w-full space-y-6 bg-[#fbffff] px-4 py-6 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">
            Dashboard Outbreak Penyakit ASEAN
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Pemantauan multilingual berbasis berita dan sumber kesehatan kawasan
            Asia Tenggara.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#047D78]"
          >
            <RefreshCw className="h-4 w-4" />
            Perbarui
          </button>
        </div>
      </section>
      <section className="rounded-2xl border border-[#bedbda] bg-white p-3 shadow-[0_6px_18px_rgba(20,120,116,.06)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2 px-1 text-[#047D78]">
            <Filter className="h-4 w-4" />
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider">
                Filter Pemantauan
              </p>
              <p className="text-[10px] text-slate-500">
                Seluruh komponen mengikuti filter aktif
              </p>
            </div>
          </div>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Globe2 className="h-4 w-4 shrink-0 text-teal-600" />
            <span className="text-[10px] font-bold uppercase text-slate-500">
              Negara
            </span>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs font-bold text-slate-800 outline-none"
            >
              <option value="all">Semua Negara ASEAN</option>
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
            <CalendarDays className="h-4 w-4 shrink-0 text-teal-600" />
            <span className="text-[10px] font-bold uppercase text-slate-500">
              Tahun
            </span>
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              className="flex-1 bg-transparent text-xs font-bold text-slate-800 outline-none"
            >
              {(data?.available_years?.length
                ? data.available_years
                : [currentYear]
              ).map((value) => (
                <option key={value} value={value}>
                  {value}
                  {value === currentYear ? " (Tahun Ini)" : ""}
                </option>
              ))}
            </select>
          </label>
          {(country !== "all" || year !== currentYear) && (
            <button
              onClick={() => {
                setCountry("all");
                setYear(currentYear);
              }}
              className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#047D78]"
            >
              Reset Filter
            </button>
          )}
        </div>
      </section>
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi
          label="Kasus Terdeteksi"
          value={data?.trends?.cases.current ?? data?.kpis.cases ?? 0}
          icon={<Bug className="h-5 w-5" />}
          trend={data?.trends?.cases}
          previousMonth={data?.trends?.previous_month}
        />
        <Kpi
          label="Kematian"
          value={data?.trends?.deaths.current ?? data?.kpis.deaths ?? 0}
          icon={<Skull className="h-5 w-5" />}
          tone="red"
          trend={data?.trends?.deaths}
          previousMonth={data?.trends?.previous_month}
        />
        <Kpi
          label="Event Tervalidasi"
          value={data?.trends?.events.current ?? data?.kpis.events ?? 0}
          icon={<Activity className="h-5 w-5" />}
          trend={data?.trends?.events}
          previousMonth={data?.trends?.previous_month}
        />
        <Kpi
          label="Lokasi"
          value={data?.trends?.locations.current ?? data?.kpis.locations ?? 0}
          icon={<MapPin className="h-5 w-5" />}
          trend={data?.trends?.locations}
          previousMonth={data?.trends?.previous_month}
        />
        <Kpi
          label="Peringatan Aktif"
          value={data?.trends?.alerts.current ?? data?.kpis.active_alerts ?? 0}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="orange"
          trend={data?.trends?.alerts}
          previousMonth={data?.trends?.previous_month}
        />
      </div>
      <section className="w-full bg-[#fbffff] pb-5">
        <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[381px_minmax(0,1fr)] xl:items-stretch">
          <section
            className="flex overflow-hidden border border-[#b7d9d8] bg-gradient-to-b from-[#edfbfa] to-[#e7f7f6] xl:h-[550px] xl:w-[381px]"
            style={{ borderRadius: "17px 17px 22px 17px" }}
          >
            <div className="flex w-full flex-col">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide">
                    Early Warning System
                  </h2>
                  <p className="text-xs text-slate-500">
                    Berbasis penyakit dan lokasi
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
                      className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-teal-300 hover:bg-teal-50/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">
                            {a.disease}
                          </p>
                          <p className="text-xs text-slate-500">
                            {a.location_name}, {a.country}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-black ${severityClass[a.severity]}`}
                        >
                          {a.severity}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        <b>{a.cases.toLocaleString("id-ID")}</b> kasus ·{" "}
                        <b>{a.deaths}</b> kematian · ambang {a.threshold}
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="p-8 text-center text-sm text-slate-400">
                    Tidak ada peringatan aktif.
                  </p>
                )}
              </div>
              <div className="border-t border-teal-200/70 bg-white/55 px-4 py-3 text-[10px] font-bold text-slate-500">
                EWS menggunakan ambang penyakit, lokasi, confidence, dan radius
                pengguna aktif.
              </div>
            </div>
          </section>
          <article
            className="flex flex-col border border-[#cdcdcd] bg-white p-4 xl:h-[550px]"
            style={{ borderRadius: "17px 17px 22px 17px" }}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-black uppercase leading-tight text-slate-900 sm:text-2xl">
                  Sebaran Spasial Outbreak Penyakit
                </h3>
                <p className="mt-1.5 text-sm font-normal leading-relaxed text-slate-600 sm:text-base">
                  Pemetaan ini menyajikan distribusi geografis kasus, kematian,
                  dan status peringatan penyakit di kawasan Asia Tenggara.
                </p>
                <div className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-teal-200/80 bg-teal-50 px-2.5 py-1 text-xs font-bold text-[#047D78]">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                  <span className="truncate">
                    Wilayah: ASEAN · {data?.kpis.locations ?? 0} lokasi
                    terdeteksi
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
      <section className="mt-4 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 p-5 shadow-sm">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-teal-800">
              Ringkasan AI Lokal
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {data?.ai_summary.text}
            </p>
            <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">
              Tanpa pemanggilan API berbayar · diperbarui bersama snapshot
            </p>
          </div>
        </div>
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-600">
            Kasus per Penyakit
          </h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <BarChart
                data={(data?.by_disease ?? []).slice(0, 8)}
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
                <Bar dataKey="cases" fill="#0f8f96" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-600">
            Distribusi Negara
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
            Ringkasan Outbreak per Lokasi
          </h2>
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Clock3 className="h-3.5 w-3.5" />
            {data ? new Date(data.updated_at).toLocaleString("id-ID") : "-"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Lokasi</th>
                <th className="px-4 py-3">Penyakit</th>
                <th className="px-4 py-3 text-right">Kasus</th>
                <th className="px-4 py-3 text-right">Kematian</th>
                <th className="px-4 py-3 text-right">Confidence</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.locations.slice(0, 20).map((r, i) => (
                <tr
                  key={i}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-teal-50/60"
                  title="Klik untuk melihat detail analisis"
                >
                  <td className="px-4 py-3 font-semibold">
                    {r.location_name}
                    <span className="block text-xs font-normal text-slate-400">
                      {r.country}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.disease}</td>
                  <td className="px-4 py-3 text-right">
                    {r.cases.toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-right">{r.deaths}</td>
                  <td className="px-4 py-3 text-right">
                    {r.confidence == null
                      ? "-"
                      : `${Math.round(r.confidence * 100)}%`}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black ${severityClass[r.severity]}`}
                    >
                      {r.severity}
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
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onMouseDown={() => setSelected(null)}
        >
          <section
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-[#fbffff] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex min-w-0 gap-3">
                <FileText className="mt-1 h-5 w-5 shrink-0 text-teal-600" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-teal-700">
                    Detail Hasil Analisis
                  </p>
                  <h2 className="mt-1 text-lg font-black text-slate-900">
                    {selected.disease} — {selected.location_name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selected.detail?.source_name ||
                      selected.detail?.source_type ||
                      "Sumber terkoleksi"}{" "}
                    · {selected.latest_date}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Tutup detail"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Penyakit", selected.disease],
                  ["Lokasi", `${selected.location_name}, ${selected.country}`],
                  ["Jumlah Kasus", selected.cases.toLocaleString("id-ID")],
                  ["Kematian", selected.deaths.toLocaleString("id-ID")],
                  [
                    "Confidence",
                    selected.confidence == null
                      ? "-"
                      : `${Math.round(selected.confidence * 100)}%`,
                  ],
                  ["Status EWS", selected.severity],
                  [
                    "Tipe Kejadian",
                    selected.detail?.event_type?.replace(/_/g, " ") || "-",
                  ],
                  ["Relevansi", selected.detail?.relevance_score || "-"],
                  ["Sentimen", selected.detail?.sentiment || "-"],
                  [
                    "Health Related",
                    selected.detail?.is_health_related ? "Ya" : "Tidak",
                  ],
                  [
                    "Perlu Review",
                    selected.detail?.needs_review ? "Ya" : "Tidak",
                  ],
                  [
                    "Kredibilitas",
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
                      Gejala Terdeteksi
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
                      Penyakit dari Konten
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selected.detail?.disease_extracted?.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </article>
                </div>
              ) : null}
              <article className="rounded-xl border border-teal-200 bg-teal-50/50 p-5">
                <p className="text-xs font-black uppercase tracking-wider text-teal-800">
                  Sumber Data
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      Nama Sumber
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {selected.detail?.source_name || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      Tipe Sumber
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {selected.detail?.source_type || "-"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 border-t border-teal-100 pt-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400">
                    URL Lengkap
                  </p>
                  {selected.detail?.url ? (
                    <a
                      href={selected.detail.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex items-start gap-2 break-all text-xs font-semibold leading-5 text-teal-700 hover:text-teal-900 hover:underline"
                    >
                      <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {selected.detail.url}
                    </a>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      URL sumber tidak tersedia.
                    </p>
                  )}
                </div>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Main Content Asli
                  </p>
                  {selected.detail?.url && (
                    <a
                      href={selected.detail.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Buka sumber
                    </a>
                  )}
                </div>
                <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-6 text-slate-600">
                  {cleanArticleContent(selected.detail?.content)}
                </p>
              </article>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
