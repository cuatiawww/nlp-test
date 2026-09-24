import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://disease-backend-rust:8081';
  try {
    const auth = req.headers.get('authorization');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) headers['Authorization'] = auth;

    const res = await fetch(`${backendUrl}/api/v1/epiweeks/config/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus konfigurasi' }));
    return NextResponse.json({ success: false, error: err.error || 'Backend error' }, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
