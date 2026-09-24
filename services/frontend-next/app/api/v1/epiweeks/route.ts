import { NextRequest, NextResponse } from 'next/server';
import { getAllEpiWeeksForYear, getCurrentEpiWeek, getWeeksInYear } from '@/lib/epi-week';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cur = getCurrentEpiWeek();
  const yearParam = searchParams.get('year');
  const year = yearParam ? parseInt(yearParam, 10) : cur.year;

  // Attempt to proxy to backend-rust if available
  const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://disease-backend-rust:8081';
  try {
    const res = await fetch(`${backendUrl}/api/v1/epiweeks?year=${year}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {}

  // Fallback to local exact MMWR calculation
  const totalWeeks = getWeeksInYear(year);
  const weeks = getAllEpiWeeksForYear(year);

  return NextResponse.json({
    success: true,
    year,
    total_weeks: totalWeeks,
    current_week: cur.week,
    current_year: cur.year,
    weeks,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://disease-backend-rust:8081';
    const res = await fetch(`${backendUrl}/api/v1/epiweeks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
    const err = await res.json().catch(() => ({ error: 'Gagal menyimpan ke backend' }));
    return NextResponse.json({ success: false, error: err.error || 'Backend error' }, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
