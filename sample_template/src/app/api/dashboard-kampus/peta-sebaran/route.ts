import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      kode_provinsi?: string
      kode_kabupaten?: string
    }

    const baseUrl = process.env.PSC119_DASHBOARD_BASE_URL?.trim()
    const token = process.env.PSC119_DASHBOARD_TTOKEN?.trim()

    if (!baseUrl || !token) {
      return NextResponse.json(
        { error: 'Missing PSC119_DASHBOARD_BASE_URL or PSC119_DASHBOARD_TTOKEN in environment.' },
        { status: 500 }
      )
    }

    const upstreamUrl = `${baseUrl.replace(/\/$/, '')}/dashboard-faskes/peta-sebaran`
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        TTOKEN: token,
      },
      body: JSON.stringify({
        kode_provinsi: body.kode_provinsi ?? '',
        kode_kabupaten: body.kode_kabupaten ?? '',
      }),
      cache: 'no-store',
    })

    const contentType = upstreamResponse.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await upstreamResponse.json()
      : await upstreamResponse.text()

    return NextResponse.json(payload, { status: upstreamResponse.status })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to proxy peta-sebaran endpoint.',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
