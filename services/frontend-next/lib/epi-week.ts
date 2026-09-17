/**
 * MMWR epidemiological week utilities.
 *
 * The application follows the MMWR calendar used by epiweek.com: weeks start
 * on Sunday and end on Saturday. Week 1 is the week containing January 4.
 * The calculation is local so dashboards do not depend on an external API at
 * runtime.
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

const MS_PER_DAY = 86400000;

const MONTHS_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Return the Sunday that starts MMWR week 1 for a year. */
function getMmwrWeekOneStart(year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  return new Date(jan4.getTime() - jan4.getUTCDay() * MS_PER_DAY);
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
