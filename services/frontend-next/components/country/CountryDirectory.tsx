"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Bug,
  Database,
  Globe2,
  Search,
  Skull,
  SlidersHorizontal,
} from "lucide-react";

import { fetchPublicDashboard } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { PublicDashboard } from "@/types";

type DirectoryStatus = "all" | "with_data" | "no_data";

type CountryItem = {
  name: string;
  iso: string;
  flagCode?: string;
  cases: number;
  deaths: number;
  events: number;
  diseases: number;
  updatedAt?: string;
  hasData: boolean;
};

const ASEAN_COUNTRIES = [
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
];

const COUNTRY_FLAG_CODES: Record<string, string> = {
  brunei: "bn",
  "brunei darussalam": "bn",
  cambodia: "kh",
  indonesia: "id",
  laos: "la",
  "lao pdr": "la",
  malaysia: "my",
  myanmar: "mm",
  philippines: "ph",
  singapore: "sg",
  thailand: "th",
  "timor-leste": "tl",
  "timor leste": "tl",
  vietnam: "vn",
  "viet nam": "vn",
};

const COUNTRY_ISO: Record<string, string> = {
  brunei: "BRN",
  "brunei darussalam": "BRN",
  cambodia: "KHM",
  indonesia: "IDN",
  laos: "LAO",
  "lao pdr": "LAO",
  malaysia: "MYS",
  myanmar: "MMR",
  philippines: "PHL",
  singapore: "SGP",
  thailand: "THA",
  "timor-leste": "TLS",
  "timor leste": "TLS",
  vietnam: "VNM",
  "viet nam": "VNM",
};

function countryKey(name: string) {
  return name.trim().toLowerCase();
}

function countryFlagCode(name: string) {
  return COUNTRY_FLAG_CODES[countryKey(name)];
}

function countryIso(name: string) {
  return COUNTRY_ISO[countryKey(name)] || name.slice(0, 3).toUpperCase();
}

function formatDate(value: string | undefined, locale: "id" | "en") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 text-lg font-black leading-none text-slate-800">{value}</p>
    </div>
  );
}

export default function CountryDirectory() {
  const { t, locale } = useTranslation();
  const [overview, setOverview] = useState<PublicDashboard | null>(null);
  const [countryDashboards, setCountryDashboards] = useState<Record<string, PublicDashboard>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DirectoryStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDirectory() {
      setLoading(true);
      setError("");
      try {
        const dashboard = await fetchPublicDashboard();
        if (cancelled) return;
        setOverview(dashboard);

        const apiCountries = (dashboard.by_country || []).map((entry) => entry.name).filter(Boolean);
        const countryNames = Array.from(
          new Map([...ASEAN_COUNTRIES, ...apiCountries].map((name) => [countryKey(name), name])).values(),
        ).slice(0, 25);

        const results = await Promise.all(
          countryNames.map(async (name) => {
            try {
              return [countryKey(name), await fetchPublicDashboard({ country: name })] as const;
            } catch {
              return null;
            }
          }),
        );

        if (!cancelled) {
          setCountryDashboards(
            Object.fromEntries(results.filter((result): result is readonly [string, PublicDashboard] => result !== null)),
          );
        }
      } catch {
        if (!cancelled) setError(t("countries.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDirectory();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const countries = useMemo<CountryItem[]>(() => {
    const apiCountries = (overview?.by_country || []).map((entry) => entry.name).filter(Boolean);
    const countryNames = Array.from(
      new Map([...ASEAN_COUNTRIES, ...apiCountries].map((name) => [countryKey(name), name])).values(),
    );
    const overviewByCountry = new Map(
      (overview?.by_country || []).map((entry) => [countryKey(entry.name), entry]),
    );

    return countryNames.map((name) => {
      const countryData = overviewByCountry.get(countryKey(name));
      const detail = countryDashboards[countryKey(name)];
      const cases = countryData?.cases ?? detail?.kpis.cases ?? 0;
      const deaths = countryData?.deaths ?? detail?.kpis.deaths ?? 0;
      const events = detail?.kpis.events ?? 0;
      const diseases = detail?.by_disease?.length ?? 0;
      return {
        name,
        iso: countryIso(name),
        flagCode: countryFlagCode(name),
        cases,
        deaths,
        events,
        diseases,
        updatedAt: detail?.updated_at || overview?.updated_at,
        hasData: cases > 0 || deaths > 0 || events > 0 || diseases > 0,
      };
    });
  }, [countryDashboards, overview]);

  const visibleCountries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return countries.filter((country) => {
      const matchesQuery = !normalizedQuery || `${country.name} ${country.iso}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus = status === "all" || (status === "with_data" ? country.hasData : !country.hasData);
      return matchesQuery && matchesStatus;
    });
  }, [countries, query, status]);

  const numberFormat = new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US");
  const withDataCount = countries.filter((country) => country.hasData).length;

  return (
    <main className="min-h-screen bg-[#f8fafc] px-4 py-3 md:px-6 md:py-5">
      <div className="w-full space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-12 w-1 rounded-full bg-[#0060A9]" />
            <div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">{t("countries.title")}</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">{t("countries.subtitle")}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-white px-5 py-3 text-right shadow-sm">
            <p className="text-2xl font-black text-[#0060A9]">{countries.length}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("countries.registered")}</p>
          </div>
        </header>

        <section className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-sky-50 to-white p-5 shadow-sm md:flex-row md:items-start">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0060A9] text-white shadow-lg shadow-blue-900/10">
            <Globe2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-[#0060A9]">{t("countries.directoryTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t("countries.directoryDescription")}</p>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1 lg:max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("countries.searchPlaceholder")}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-[#0060A9] focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="mr-1 h-4 w-4 text-slate-400" />
            {(["all", "with_data", "no_data"] as DirectoryStatus[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setStatus(option)}
                className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                  status === option ? "bg-[#0060A9] text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-[#0060A9]"
                }`}
              >
                {t(`countries.${option === "all" ? "all" : option === "with_data" ? "withData" : "noData"}`)}
              </button>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {t("countries.showing", { shown: visibleCountries.length, total: countries.length })}
          </p>
          <p className="text-xs font-bold text-emerald-600">{t("countries.withDataCount", { count: withDataCount })}</p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">{error}</div>
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-52 animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="h-10 w-2/3 rounded bg-slate-100" />
                <div className="mt-7 h-16 rounded bg-slate-100" />
                <div className="mt-5 h-3 w-1/2 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : visibleCountries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-semibold text-slate-500">
            {t("countries.noResults")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleCountries.map((country) => (
              <Link
                key={country.name}
                href={`/detail-region?country=${encodeURIComponent(country.name)}`}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-900/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {country.flagCode ? (
                      <img
                        src={`https://flagcdn.com/w80/${country.flagCode}.png`}
                        alt={`${country.name} flag`}
                        className="h-9 w-14 rounded-md object-cover shadow-sm ring-1 ring-slate-200"
                      />
                    ) : (
                      <span className="flex h-9 w-14 items-center justify-center rounded-md bg-slate-100 text-slate-400" aria-hidden="true">
                        <Globe2 className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-slate-900">{country.name}</h3>
                      <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{country.iso}</p>
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-[#0060A9]" />
                </div>

                <div className="mt-5 grid grid-cols-3 divide-x divide-slate-100 border-y border-slate-100 py-4">
                  <Metric icon={Activity} label={t("countries.cases")} value={numberFormat.format(country.cases)} />
                  <div className="pl-3"><Metric icon={Skull} label={t("countries.deaths")} value={numberFormat.format(country.deaths)} /></div>
                  <div className="pl-3"><Metric icon={Bug} label={t("countries.diseases")} value={numberFormat.format(country.diseases)} /></div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-1.5 truncate"><Database className="h-3.5 w-3.5" />{t("countries.updated")} {formatDate(country.updatedAt, locale)}</span>
                  <span className={country.hasData ? "text-emerald-600" : "text-slate-400"}>{country.hasData ? t("countries.available") : t("countries.noData")}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
