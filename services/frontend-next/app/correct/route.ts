import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const candidateUrls = [
      process.env.NLP_SERVICE_URL,
      'http://disease-nlp-python:8000',
      'http://127.0.0.1:8000',
      'http://localhost:8000',
    ].filter(Boolean) as string[];

    let lastError: any = null;
    for (const baseUrl of candidateUrls) {
      const url = `${baseUrl.replace(/\/$/, '')}/correct`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({ status: 'ok' }));
          return NextResponse.json(data);
        } else if (res.status !== 404 && res.status !== 502 && res.status !== 503) {
          const errData = await res.json().catch(() => ({}));
          return NextResponse.json(
            { error: errData?.detail || errData?.error || 'Gagal menyimpan koreksi NLP' },
            { status: res.status }
          );
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    return NextResponse.json(
      { error: lastError?.message || 'NLP service tidak dapat dijangkau' },
      { status: 503 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
