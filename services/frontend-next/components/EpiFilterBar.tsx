'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  Filter,
  Globe2,
  CalendarDays,
  Bug,
  Calendar,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  ChevronDown,
  AlertCircle
} from 'lucide-react';
import { getEpiWeekDateRange, getCurrentEpiWeek, formatEpiRangeDescription } from '@/lib/epi-week';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import {
  ASEAN11_DISPLAY,
  ASEAN_SCOPE_FILTER_LABEL,
  ASEAN_SCOPE_HINT,
} from '@/lib/asean-scope';

export interface EpiFilterState {
  disease: string;
  country: string;
  startYear: number;
  startWeek: number;
  endYear: number;
  endWeek: number;
}

interface EpiFilterBarProps {
  availableDiseases?: string[];
  availableYears?: number[];
  currentEpiWeek?: number;
  currentEpiYear?: number;
  value: EpiFilterState;
  onChange: (filters: EpiFilterState) => void;
  onApply: (filters: EpiFilterState) => void;
  isLoading?: boolean;
}

const WEEKS_LIST = Array.from({ length: 52 }, (_, i) => i + 1);

export default function EpiFilterBar({
  availableDiseases = [],
  availableYears = [2026, 2025, 2024],
  currentEpiWeek: serverEpiWeek,
  currentEpiYear: serverEpiYear,
  value,
  onChange,
  onApply,
  isLoading = false,
}: EpiFilterBarProps) {
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'en' ? 'en' : 'id';

  // Local draft state for smooth user selection before clicking 'Terapkan'
  const [draft, setDraft] = useState<EpiFilterState>(value);

  // Synchronize draft if parent value changes externally
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const currentEpi = useMemo(() => {
    if (serverEpiWeek && serverEpiYear) {
      return { year: serverEpiYear, week: serverEpiWeek };
    }
    return getCurrentEpiWeek();
  }, [serverEpiWeek, serverEpiYear]);

  // Compute calendar dates for Start and End weeks
  const startRange = useMemo(
    () => getEpiWeekDateRange(draft.startYear, draft.startWeek, dateLocale),
    [draft.startYear, draft.startWeek, dateLocale]
  );

  const endRange = useMemo(
    () => getEpiWeekDateRange(draft.endYear, draft.endWeek, dateLocale),
    [draft.endYear, draft.endWeek, dateLocale]
  );

  // Calculate total number of weeks spanned
  const totalWeeksSpanned = useMemo(() => {
    if (draft.startYear === draft.endYear) {
      return Math.max(1, draft.endWeek - draft.startWeek + 1);
    }
    const yearsDiff = draft.endYear - draft.startYear;
    return Math.max(1, yearsDiff * 52 + (draft.endWeek - draft.startWeek + 1));
  }, [draft.startYear, draft.startWeek, draft.endYear, draft.endWeek]);

  const hasInvalidRange = useMemo(() => {
    if (draft.startYear > draft.endYear) return true;
    if (draft.startYear === draft.endYear && draft.startWeek > draft.endWeek) return true;
    return false;
  }, [draft.startYear, draft.startWeek, draft.endYear, draft.endWeek]);

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (hasInvalidRange) return;
    onChange(draft);
    onApply(draft);
  };

  const handleReset = () => {
    const curW = currentEpi.week || 1;
    const curY = currentEpi.year || 2026;
    const defaultState: EpiFilterState = {
      disease: 'all',
      country: 'ASEAN',
      startYear: curY,
      startWeek: 1,
      endYear: curY,
      endWeek: curW,
    };
    setDraft(defaultState);
    onChange(defaultState);
    onApply(defaultState);
  };

  // Combine built-in standard diseases with dynamic DB ones
  const diseaseOptions = useMemo(() => {
    const standardPriority = [
      'COVID-19',
      'dengue fever DBD',
      'Campak',
      'RABIES',
      'hand foot mouth disease',
      'Kolera',
      'Malaria',
      'Flu Burung',
    ];

    const uniqueSet = new Set<string>();
    standardPriority.forEach((d) => uniqueSet.add(d));
    availableDiseases.forEach((d) => {
      if (d && d.trim() && !d.toUpperCase().startsWith('UNKNOWN') && !d.toUpperCase().startsWith('NEGATIVE')) {
        uniqueSet.add(d.trim());
      }
    });

    return Array.from(uniqueSet);
  }, [availableDiseases]);

  return (
    <section className="w-full rounded-2xl border border-[#cfe0f1] bg-white p-4 shadow-[0_8px_24px_rgba(0,96,169,0.06)] transition-all">
      {/* Top Header & Context Description */}
      <div className="flex flex-col gap-2 pb-3 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 text-[#0060A9]">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0060A9] shadow-xs">
            <Filter className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Integrated Epidemiological Surveillance Filter
              </h2>
            </div>
            <p className="text-[11px] text-slate-500">
              Select a disease, ASEAN country or region, and an Epidemiological Week range (ISO 8601)
            </p>
          </div>
        </div>

        {/* Current Active Range Human-Readable Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1.5 rounded-xl border border-blue-200/80 bg-gradient-to-r from-blue-50/80 to-sky-50/60 px-3 py-1.5 text-xs text-blue-900 shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-[#0060A9]" />
            <span className="font-extrabold text-[11px] text-[#0060A9]">
              {formatEpiRangeDescription(
                draft.startYear,
                draft.startWeek,
                draft.endYear,
                draft.endWeek,
                dateLocale
              )}
            </span>
            <span className="ml-1 rounded-md bg-blue-600 px-1.5 py-0.5 text-[9.5px] font-bold text-white">
              {totalWeeksSpanned} Wk
            </span>
          </div>
        </div>
      </div>

      {/* Main Filter Form Inputs */}
      <form onSubmit={handleApply} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* 1. Diseases Filter (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-1">
            <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
              <Bug className="h-3 w-3 text-red-500" />
              Disease
            </label>
            <div className="relative rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-50 focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
              <select
                id="select-disease"
                value={draft.disease}
                onChange={(e) => setDraft({ ...draft, disease: e.target.value })}
                className="w-full bg-transparent px-3 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer pr-8"
              >
                <option value="all">All Diseases</option>
                {diseaseOptions.map((dis) => (
                  <option key={dis} value={dis}>
                    {dis}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="text-[10px] text-slate-400 px-1 truncate">
              {draft.disease === 'all'
                ? 'All validated classifications'
                : `Selected disease: ${draft.disease}`}
            </p>
          </div>

          {/* 2. Region / Country (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-1">
            <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
              <Globe2 className="h-3 w-3 text-[#0060A9]" />
              Country / Region
            </label>
            <div className="relative rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-50 focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
              <select
                id="select-country"
                value={draft.country}
                onChange={(e) => setDraft({ ...draft, country: e.target.value })}
                className="w-full bg-transparent px-3 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer pr-8"
              >
                <option value="ASEAN">{ASEAN_SCOPE_FILTER_LABEL}</option>
                <option value="global">Global (include outside ASEAN)</option>
                {ASEAN11_DISPLAY.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="text-[10px] text-slate-400 px-1 truncate">
              {draft.country === 'global'
                ? 'Worldwide including outside ASEAN'
                : draft.country === 'all' || draft.country === 'ASEAN' || draft.country === 'asean11'
                ? ASEAN_SCOPE_HINT
                : `Selected country: ${draft.country}`}
            </p>
          </div>

          {/* 3. Start EPI Week & Year (2 cols) */}
          <div className="lg:col-span-2 flex flex-col gap-1">
            <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
              <CalendarDays className="h-3 w-3 text-emerald-600" />
              Start: Week & Year
            </label>
            <div className="flex gap-1.5">
              {/* Start Week */}
              <div className="relative flex-1 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-50 focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
                <select
                  id="select-start-week"
                  value={draft.startWeek}
                  onChange={(e) => setDraft({ ...draft, startWeek: Number(e.target.value) })}
                  className="w-full bg-transparent px-2 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                >
                  {WEEKS_LIST.map((w) => (
                    <option key={w} value={w}>
                      W{w}
                    </option>
                  ))}
                </select>
              </div>
              {/* Start Year */}
              <div className="relative w-20 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-50 focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
                <select
                  id="select-start-year"
                  value={draft.startYear}
                  onChange={(e) => setDraft({ ...draft, startYear: Number(e.target.value) })}
                  className="w-full bg-transparent px-2 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {/* Start Date Helper Text */}
            <p className="text-[9.5px] font-medium text-emerald-700 bg-emerald-50/70 border border-emerald-100 rounded-md px-1.5 py-0.5 mt-0.5 truncate">
              📅 {startRange.startFormatted}
            </p>
          </div>

          {/* 4. End EPI Week & Year (2 cols) */}
          <div className="lg:col-span-2 flex flex-col gap-1">
            <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
              <CalendarDays className="h-3 w-3 text-blue-600" />
              End: Week & Year
            </label>
            <div className="flex gap-1.5">
              {/* End Week */}
              <div className="relative flex-1 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-50 focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
                <select
                  id="select-end-week"
                  value={draft.endWeek}
                  onChange={(e) => setDraft({ ...draft, endWeek: Number(e.target.value) })}
                  className="w-full bg-transparent px-2 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                >
                  {WEEKS_LIST.map((w) => (
                    <option key={w} value={w}>
                      W{w}
                    </option>
                  ))}
                </select>
              </div>
              {/* End Year */}
              <div className="relative w-20 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-50 focus-within:border-[#0060A9] focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition shadow-2xs">
                <select
                  id="select-end-year"
                  value={draft.endYear}
                  onChange={(e) => setDraft({ ...draft, endYear: Number(e.target.value) })}
                  className="w-full bg-transparent px-2 py-2 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {/* End Date Helper Text */}
            <p className="text-[9.5px] font-medium text-blue-700 bg-blue-50/70 border border-blue-100 rounded-md px-1.5 py-0.5 mt-0.5 truncate">
              📅 {endRange.endFormatted}
            </p>
          </div>

          {/* 5. Buttons: Terapkan & Reset (2 cols) */}
          <div className="lg:col-span-2 flex items-end gap-1.5 pb-0.5">
            <button
              type="submit"
              id="btn-apply-filter"
              disabled={isLoading || hasInvalidRange}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#0060A9] to-blue-700 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-blue-500/20 transition hover:from-blue-700 hover:to-blue-800 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Apply</span>
                </>
              )}
            </button>
            <button
              type="button"
              id="btn-reset-filter"
              onClick={handleReset}
              title="Reset to default"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition active:scale-95 shadow-2xs cursor-pointer shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Error alert if start is after end */}
        {hasInvalidRange && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-2 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Invalid week range: the start week must be earlier than or equal to the end week.
            </span>
          </div>
        )}
      </form>
    </section>
  );
}
