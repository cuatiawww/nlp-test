import { NextResponse } from 'next/server';
import { getCurrentEpiWeek, getEpiWeekDateRange, getWeeksInYear } from '@/lib/epi-week';

export async function GET() {
  const cur = getCurrentEpiWeek();
  const range = getEpiWeekDateRange(cur.year, cur.week);
  const total = getWeeksInYear(cur.year);

  // Attempt backend proxy first
  const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://disease-backend-rust:8081';
  try {
    const res = await fetch(`${backendUrl}/api/v1/epiweeks/current`, { cache: 'no-store' });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}

  const now = new Date();
  return NextResponse.json({
    success: true,
    date: now.toISOString().split('T')[0],
    year: cur.year,
    week: cur.week,
    start_date: range.startIso,
    end_date: range.endIso,
    total_weeks: total,
    days_remaining_in_week: Math.max(0, 6 - now.getUTCDay()),
    label: `EW ${String(cur.week).padStart(2, '0')} / ${cur.year}`,
    range_label: range.label,
  });
}
