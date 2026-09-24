/**
 * MMWR epidemiological week utilities & API integration.
 *
 * Follows the MMWR calendar used by CDC and epiweek.com:
 * - Weeks start on Sunday and end on Saturday.
 * - Week 1 is the first week containing at least 4 days of the year (contains January 4).
 * - A year has 52 or 53 epidemiological weeks.
 */

export interface EpiWeekRange {
  startDate: Date;
  endDate: Date;
  startIso: string;
  endIso: string;
  startFormatted: string;
  endFormatted: string;
  label: string;
}

export interface EpiWeekConfig {
  id?: number;
  epi_year: number;
  epi_week: number;
  title?: string;
  alert_level?: 'normal' | 'watch' | 'alert' | 'epidemic';
  primary_disease?: string;
  notes?: string;
  surveillance_status?: 'active' | 'planned' | 'archived';
  updated_at?: string;
}

export interface EpiWeekDetail {
  week: number;
  year: number;
  start_date: string;
  end_date: string;
  formatted_range: string;
  month: number;
  month_name: string;
  is_current: boolean;
  is_past: boolean;
  is_future: boolean;
  report_count?: number;
  config?: EpiWeekConfig | null;
}

export interface EpiWeeksApiResponse {
  success: boolean;
  year: number;
  total_weeks: number;
  current_week: number;
  current_year: number;
  weeks: EpiWeekDetail[];
}

const MS_PER_DAY = 86400000;

export const MONTHS_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const FULL_MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

export const FULL_MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/** Return the Sunday that starts MMWR week 1 for a year. */
export function getMmwrWeekOneStart(year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  return new Date(jan4.getTime() - jan4.getUTCDay() * MS_PER_DAY);
}

/** Total number of MMWR weeks in a given year (52 or 53 weeks). */
export function getWeeksInYear(year: number): number {
  const w1_this = getMmwrWeekOneStart(year);
  const w1_next = getMmwrWeekOneStart(year + 1);
  return Math.round((w1_next.getTime() - w1_this.getTime()) / (7 * MS_PER_DAY));
}

/** Convert a UTC date to the MMWR epidemiological year and week. */
export function getMmwrEpiWeek(date: Date): { year: number; week: number } {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  let year = utcDate.getUTCFullYear();
  let weekOneStart = getMmwrWeekOneStart(year);

  if (utcDate < weekOneStart) {
    year -= 1;
    weekOneStart = getMmwrWeekOneStart(year);
  } else {
    const nextWeekOneStart = getMmwrWeekOneStart(year + 1);
    if (utcDate >= nextWeekOneStart) {
      year += 1;
      weekOneStart = nextWeekOneStart;
    }
  }

  const sunday = new Date(utcDate.getTime() - utcDate.getUTCDay() * MS_PER_DAY);
  const week = Math.floor((sunday.getTime() - weekOneStart.getTime()) / (7 * MS_PER_DAY)) + 1;
  return { year, week };
}

export function getEpiWeekDateRange(year: number, week: number, locale: "id" | "en" = "id"): EpiWeekRange {
  const start = new Date(getMmwrWeekOneStart(year).getTime() + (week - 1) * 7 * MS_PER_DAY);
  const end = new Date(start.getTime() + 6 * MS_PER_DAY);
  const months = locale === "en" ? MONTHS_EN : MONTHS_ID;

  const formatDate = (date: Date) => {
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${day} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  };
  const toIso = (date: Date) => date.toISOString().split("T")[0];
  const startFormatted = formatDate(start);
  const endFormatted = formatDate(end);

  return {
    startDate: start,
    endDate: end,
    startIso: toIso(start),
    endIso: toIso(end),
    startFormatted,
    endFormatted,
    label: `${startFormatted} — ${endFormatted}`,
  };
}

/** Returns the current MMWR epidemiological week and year. */
export function getCurrentEpiWeek(): { year: number; week: number } {
  const now = new Date();
  return getMmwrEpiWeek(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

/** Generate local MMWR calendar for a year without needing network. */
export function getAllEpiWeeksForYear(year: number, locale: "id" | "en" = "id"): EpiWeekDetail[] {
  const totalWeeks = getWeeksInYear(year);
  const current = getCurrentEpiWeek();
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).getTime();
  const fullMonths = locale === "en" ? FULL_MONTHS_EN : FULL_MONTHS_ID;
  const list: EpiWeekDetail[] = [];

  for (let w = 1; w <= totalWeeks; w++) {
    const range = getEpiWeekDateRange(year, w, locale);
    const startMs = range.startDate.getTime();
    const endMs = range.endDate.getTime();
    const isCurrent = year === current.year && w === current.week;
    const isPast = endMs < todayUtc;
    const isFuture = startMs > todayUtc;
    const monthIdx = range.startDate.getUTCMonth();

    list.push({
      week: w,
      year,
      start_date: range.startIso,
      end_date: range.endIso,
      formatted_range: range.label,
      month: monthIdx + 1,
      month_name: fullMonths[monthIdx],
      is_current: isCurrent,
      is_past: isPast,
      is_future: isFuture,
      report_count: 0,
      config: null,
    });
  }

  return list;
}

export function formatEpiRangeDescription(
  startYear: number,
  startWeek: number,
  endYear: number,
  endWeek: number,
  locale: "id" | "en" = "id",
): string {
  const startRange = getEpiWeekDateRange(startYear, startWeek, locale);
  const endRange = getEpiWeekDateRange(endYear, endWeek, locale);

  if (startYear === endYear) {
    if (startWeek === endWeek) {
      return `Epi Week ${startWeek}, ${startYear} (${startRange.label})`;
    }
    return `Epi Week ${startWeek} – Week ${endWeek}, ${startYear} (${startRange.startFormatted} — ${endRange.endFormatted})`;
  }

  return `Epi Week ${startWeek}, ${startYear} – Week ${endWeek}, ${endYear} (${startRange.startFormatted} — ${endRange.endFormatted})`;
}

// -------------------------------------------------------------
// API CLIENT CALLS (Backend Rust & Public API Integration)
// -------------------------------------------------------------

import { API_BASE_URL } from "./api";

export async function fetchEpiWeeks(year?: number): Promise<EpiWeeksApiResponse> {
  const targetYear = year || getCurrentEpiWeek().year;
  const url = `${API_BASE_URL}/api/v1/epiweeks?year=${targetYear}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch epiweeks: ${res.statusText}`);
    }
    const json = await res.json();
    return json;
  } catch (err) {
    // Fallback to local computation if backend is compiling or offline
    const localWeeks = getAllEpiWeeksForYear(targetYear);
    const cur = getCurrentEpiWeek();
    return {
      success: true,
      year: targetYear,
      total_weeks: getWeeksInYear(targetYear),
      current_week: cur.week,
      current_year: cur.year,
      weeks: localWeeks,
    };
  }
}

export async function fetchCurrentEpiWeekApi(): Promise<{
  success: boolean;
  date: string;
  year: number;
  week: number;
  start_date: string;
  end_date: string;
  total_weeks: number;
  days_remaining_in_week: number;
  label: string;
  range_label: string;
}> {
  const url = `${API_BASE_URL}/api/v1/epiweeks/current`;
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch {}
  
  const cur = getCurrentEpiWeek();
  const range = getEpiWeekDateRange(cur.year, cur.week);
  const total = getWeeksInYear(cur.year);
  return {
    success: true,
    date: new Date().toISOString().split("T")[0],
    year: cur.year,
    week: cur.week,
    start_date: range.startIso,
    end_date: range.endIso,
    total_weeks: total,
    days_remaining_in_week: 6 - new Date().getUTCDay(),
    label: `EW ${String(cur.week).padStart(2, "0")} / ${cur.year}`,
    range_label: range.label,
  };
}

export async function calculateEpiWeekApi(dateStr: string): Promise<{
  success: boolean;
  input_date: string;
  day_of_week: string;
  epi_year: number;
  epi_week: number;
  week_start: string;
  week_end: string;
  total_weeks_in_year: number;
  label: string;
}> {
  const url = `${API_BASE_URL}/api/v1/epiweeks/calculate?date=${encodeURIComponent(dateStr)}`;
  try {
    const res = await fetch(url);
    if (res.ok) return await res.json();
  } catch {}

  const d = new Date(dateStr);
  const res = getMmwrEpiWeek(d);
  const range = getEpiWeekDateRange(res.year, res.week);
  const total = getWeeksInYear(res.year);
  const days = ["Minggu / Sunday", "Senin / Monday", "Selasa / Tuesday", "Rabu / Wednesday", "Kamis / Thursday", "Jumat / Friday", "Sabtu / Saturday"];
  return {
    success: true,
    input_date: dateStr,
    day_of_week: days[d.getDay()],
    epi_year: res.year,
    epi_week: res.week,
    week_start: range.startIso,
    week_end: range.endIso,
    total_weeks_in_year: total,
    label: `EW ${String(res.week).padStart(2, "0")} / ${res.year}`,
  };
}

export async function saveEpiWeekConfig(data: EpiWeekConfig): Promise<{ success: boolean; data: EpiWeekConfig }> {
  const url = `${API_BASE_URL}/api/v1/epiweeks`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menyimpan konfigurasi epi week' }));
    throw new Error(err.error || 'Gagal menyimpan konfigurasi');
  }
  return await res.json();
}

export async function deleteEpiWeekConfig(id: number): Promise<{ success: boolean; message: string }> {
  const url = `${API_BASE_URL}/api/v1/epiweeks/config/${id}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus konfigurasi' }));
    throw new Error(err.error || 'Gagal menghapus konfigurasi');
  }
  return await res.json();
}
