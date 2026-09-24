import { NextRequest, NextResponse } from 'next/server';
import { getEpiWeekDateRange, getMmwrEpiWeek, getWeeksInYear } from '@/lib/epi-week';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];

  // Attempt backend proxy first
  const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://disease-backend-rust:8081';
  try {
    const res = await fetch(`${backendUrl}/api/v1/epiweeks/calculate?date=${encodeURIComponent(dateStr)}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      return NextResponse.json(await res.json());
    }
  } catch {}

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return NextResponse.json({ success: false, error: 'Invalid date format' }, { status: 400 });
  }

  const res = getMmwrEpiWeek(d);
  const range = getEpiWeekDateRange(res.year, res.week);
  const total = getWeeksInYear(res.year);
  const days = [
    'Minggu / Sunday',
    'Senin / Monday',
    'Selasa / Tuesday',
    'Rabu / Wednesday',
    'Kamis / Thursday',
    'Jumat / Friday',
    'Sabtu / Saturday',
  ];

  return NextResponse.json({
    success: true,
    input_date: dateStr,
    day_of_week: days[d.getDay()],
    epi_year: res.year,
    epi_week: res.week,
    week_start: range.startIso,
    week_end: range.endIso,
    total_weeks_in_year: total,
    label: `EW ${String(res.week).padStart(2, '0')} / ${res.year}`,
  });
}
