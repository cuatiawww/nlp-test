/**
 * ISO 8601 Epidemiological Week Utilities (WHO / Kemenkes SKDR standard)
 * Week starts on Monday and ends on Sunday.
 * Week 1 is the week that contains the first Thursday of the year (or Jan 4th).
 */

export interface EpiWeekRange {
  startDate: Date;
  endDate: Date;
  startIso: string; // YYYY-MM-DD
  endIso: string;   // YYYY-MM-DD
  startFormatted: string; // e.g. "29 Des 2025"
  endFormatted: string;   // e.g. "04 Jan 2026"
  label: string;          // e.g. "29 Des 2025 - 04 Jan 2026"
}

const MONTHS_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

export function getEpiWeekDateRange(year: number, week: number, locale: "id" | "en" = "id"): EpiWeekRange {
  // Find Monday of Week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // Sunday is 7, Monday is 1
  const mondayWeek1 = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);

  // Target week Monday & Sunday
  const monday = new Date(mondayWeek1.getTime() + (week - 1) * 7 * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);

  const months = locale === "en" ? MONTHS_EN : MONTHS_ID;

  const formatDate = (d: Date) => {
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = months[d.getUTCMonth()];
    const yr = d.getUTCFullYear();
    return `${day} ${month} ${yr}`;
  };

  const toIso = (d: Date) => d.toISOString().split("T")[0];

  const startFormatted = formatDate(monday);
  const endFormatted = formatDate(sunday);

  return {
    startDate: monday,
    endDate: sunday,
    startIso: toIso(monday),
    endIso: toIso(sunday),
    startFormatted,
    endFormatted,
    label: `${startFormatted} — ${endFormatted}`,
  };
}

/**
 * Returns the current ISO 8601 Epi Week and Year
 */
export function getCurrentEpiWeek(): { year: number; week: number } {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}

/**
 * Returns human-readable summary of an Epi week range
 * e.g. "Minggu 1 s/d Minggu 36, 2026 (29 Des 2025 - 06 Sep 2026)"
 */
export function formatEpiRangeDescription(
  startYear: number,
  startWeek: number,
  endYear: number,
  endWeek: number,
  locale: "id" | "en" = "id"
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
