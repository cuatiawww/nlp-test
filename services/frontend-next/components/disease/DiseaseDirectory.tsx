"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bug,
  CheckCircle2,
  Database,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";

import { fetchPaginated, fetchPublicDashboard, type DiseaseConcept } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/LanguageContext";

type DiseaseStatus = "all" | "active" | "inactive";
type DiseaseCategory = "Viral" | "Bacterial" | "Parasitic" | "Fungal" | "Prion" | "Other";

type DiseaseCard = DiseaseConcept & {
  category: DiseaseCategory;
  cases: number;
  deaths: number;
  events: number;
};

const CATEGORY_RULES: Array<{ category: DiseaseCategory; terms: string[] }> = [
  { category: "Viral", terms: ["virus", "viral", "influenza", "measles", "rubella", "dengue", "covid", "hepatitis", "rabies", "mpox", "zika", "chikungunya", "polio", "hiv", "aids", "nipah", "ebola", "marburg", "yellow fever", "hand foot"] },
  { category: "Bacterial", terms: ["bacteria", "bacterial", "tuberculosis", "pertussis", "cholera", "diphtheria", "tetanus", "plague", "leprosy", "typhoid", "meningitis", "leptospirosis"] },
  { category: "Parasitic", terms: ["parasite", "parasitic", "malaria", "filariasis", "schistosomiasis", "helminth"] },
  { category: "Fungal", terms: ["fungal", "candidiasis", "histoplasmosis", "aspergillosis", "cryptococcosis"] },
  { category: "Prion", terms: ["prion", "creutzfeldt", "cjd"] },
];

const CATEGORY_COLORS: Record<DiseaseCategory, string> = {
  Viral: "border-blue-200 bg-blue-50 text-blue-700",
  Bacterial: "border-amber-200 bg-amber-50 text-amber-700",
  Parasitic: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Fungal: "border-purple-200 bg-purple-50 text-purple-700",
  Prion: "border-rose-200 bg-rose-50 text-rose-700",
  Other: "border-slate-200 bg-slate-50 text-slate-600",
};

function classifyDisease(name: string): DiseaseCategory {
  const normalized = name.toLowerCase();
  return CATEGORY_RULES.find(({ terms }) => terms.some((term) => normalized.includes(term)))?.category || "Other";
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function DiseaseMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-base font-black leading-none text-slate-800">{value}</p>
    </div>
  );
}

export default function DiseaseDirectory() {
  const { t } = useTranslation();
  const [concepts, setConcepts] = useState<DiseaseConcept[]>([]);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof fetchPublicDashboard>> | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DiseaseStatus>("all");
  const [category, setCategory] = useState<DiseaseCategory | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDiseases() {
      setLoading(true);
      setError("");
      try {
        const firstPagePromise = fetchPaginated<DiseaseConcept>("/api/v1/disease-concepts?is_active=true&page=1&per_page=100");
        const dashboardPromise = fetchPublicDashboard().catch(() => null);
        const [firstPage, currentDashboard] = await Promise.all([firstPagePromise, dashboardPromise]);
        let allConcepts = firstPage.data;

        if (firstPage.totalPages > 1) {
          const remainingPages = await Promise.all(
            Array.from({ length: firstPage.totalPages - 1 }, (_, index) =>
              fetchPaginated<DiseaseConcept>(`/api/v1/disease-concepts?is_active=true&page=${index + 2}&per_page=100`),
            ),
          );
          allConcepts = allConcepts.concat(...remainingPages.map((page) => page.data));
        }

        if (!cancelled) {
          setConcepts(allConcepts);
          setDashboard(currentDashboard);
        }
      } catch {
        if (!cancelled) setError(t("diseaseDirectory.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDiseases();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const diseaseCards = useMemo<DiseaseCard[]>(() => {
    const dashboardDiseases = dashboard?.by_disease || [];
    return concepts.map((concept) => {
      const name = normalizeName(concept.canonical_name);
      const signal = dashboardDiseases.find((item) => {
        const itemName = normalizeName(item.name);
        return itemName === name || itemName.includes(name) || name.includes(itemName);
      });
      return {
        ...concept,
        category: classifyDisease(concept.canonical_name),
        cases: signal?.cases || 0,
        deaths: signal?.deaths || 0,
        events: signal?.events || 0,
      };
    });
  }, [concepts, dashboard]);

  const visibleDiseases = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return diseaseCards.filter((disease) => {
      const matchesQuery = !normalizedQuery || `${disease.disease_id || ""} ${disease.canonical_name} ${disease.description || ""}`.toLowerCase().includes(normalizedQuery);
      const matchesCategory = category === "all" || disease.category === category;
      const matchesStatus =
        status === "all" ||
        (status === "active" && disease.is_active) ||
        (status === "inactive" && !disease.is_active);
      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [category, diseaseCards, query, status]);

  const categories = useMemo(() => {
    const values = new Set(diseaseCards.map((disease) => disease.category));
    return (["Viral", "Bacterial", "Parasitic", "Fungal", "Prion", "Other"] as DiseaseCategory[]).filter((item) => values.has(item));
  }, [diseaseCards]);

  const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);
  const statusOptions: DiseaseStatus[] = ["all", "active", "inactive"];

  return (
    <main className="min-h-screen bg-[#f8fafc] px-4 py-3 md:px-6 md:py-5">
      <div className="w-full space-y-6">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end">
          <div>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900">{t("diseaseDirectory.title")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("diseaseDirectory.subtitle")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-28 rounded-2xl border border-blue-100 bg-white px-5 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("diseaseDirectory.diseases")}</p>
              <p className="mt-1 text-2xl font-black text-[#0060A9]">{diseaseCards.length}</p>
            </div>
            <div className="min-w-28 rounded-2xl border border-blue-100 bg-white px-5 py-3 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t("diseaseDirectory.categories")}</p>
              <p className="mt-1 text-2xl font-black text-[#0060A9]">{categories.length}</p>
            </div>
          </div>
        </header>

        <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800 shadow-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Disease names come from the local database master. Legacy spellings remain available as aliases for matching and audit, while dashboard output uses the active canonical name.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("diseaseDirectory.searchPlaceholder")}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm font-medium text-slate-700 outline-none transition focus:border-[#0060A9] focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0060A9]" aria-label={t("diseaseDirectory.clear")}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${status === option ? "border-[#0060A9] bg-[#0060A9] text-white" : "border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-[#0060A9]"}`}
                >
                  {t(`diseaseDirectory.${option}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setCategory("all")} className={`rounded-lg border px-3 py-2 text-xs font-bold ${category === "all" ? "border-[#0060A9] bg-[#0060A9] text-white" : "border-slate-200 text-slate-500"}`}>
              {t("diseaseDirectory.all")} ({diseaseCards.length})
            </button>
            {categories.map((item) => {
              const count = diseaseCards.filter((disease) => disease.category === item).length;
              return (
                <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${category === item ? "border-[#0060A9] bg-[#0060A9] text-white" : "border-slate-200 text-slate-500 hover:border-blue-200 hover:text-[#0060A9]"}`}>
                  {item} ({count})
                </button>
              );
            })}
          </div>
        </section>

        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("diseaseDirectory.showing", { shown: visibleDiseases.length, total: diseaseCards.length })}</p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">{error}</div>
        ) : loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => <div key={index} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm" />)}
          </div>
        ) : visibleDiseases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm font-semibold text-slate-500">{t("diseaseDirectory.noResults")}</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {visibleDiseases.map((disease) => {
              const active = disease.is_active;
              return (
                <article key={disease.id} className="group flex min-h-52 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-900/5">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${CATEGORY_COLORS[disease.category]}`}>{disease.category}</span>
                    <span className="font-mono text-[10px] font-bold text-slate-500">{disease.disease_id || "—"}</span>
                  </div>
                  <h2 className="mt-4 min-h-10 text-base font-black leading-5 text-slate-900">{disease.canonical_name}</h2>
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {active ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Database className="h-3.5 w-3.5" />}
                    <span>{active ? t("diseaseDirectory.active") : t("diseaseDirectory.inactive")}</span>
                  </div>
                  <div className="mt-auto grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 pt-4">
                    <DiseaseMetric label={t("diseaseDirectory.cases")} value={formatNumber(disease.cases)} />
                    <div className="pl-3"><DiseaseMetric label={t("diseaseDirectory.deaths")} value={formatNumber(disease.deaths)} /></div>
                    <div className="pl-3"><DiseaseMetric label={t("diseaseDirectory.events")} value={formatNumber(disease.events)} /></div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                    <Bug className="h-3.5 w-3.5" />
                    {disease.cases || disease.events ? t("diseaseDirectory.surveillance") : t("diseaseDirectory.noSignal")}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
