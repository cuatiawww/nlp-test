import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ASEAN_ISO3 = new Set([
  'BRN',
  'KHM',
  'IDN',
  'LAO',
  'MYS',
  'MMR',
  'PHL',
  'SGP',
  'THA',
  'TLS',
  'VNM',
])

export async function GET(request: NextRequest) {
  const country = (request.nextUrl.searchParams.get('country') || '').trim().toUpperCase()
  const level = (request.nextUrl.searchParams.get('level') || 'ADM1').trim().toUpperCase()

  if (!ASEAN_ISO3.has(country)) {
    return NextResponse.json(
      { success: false, message: 'Unsupported ASEAN country code.' },
      { status: 400 },
    )
  }

  if (!/^ADM[0-2]$/.test(level)) {
    return NextResponse.json(
      { success: false, message: 'Only ADM0, ADM1, and ADM2 boundaries are supported.' },
      { status: 400 },
    )
  }

  try {
    const metadataResponse = await fetch(
      `https://www.geoboundaries.org/api/current/gbOpen/${country}/${level}/`,
      { next: { revalidate: 86400 } },
    )
    if (!metadataResponse.ok) {
      return NextResponse.json(
        { success: false, message: `Boundary metadata request failed (${metadataResponse.status}).` },
        { status: 502 },
      )
    }

    const metadata = await metadataResponse.json()
    const geometryUrl = metadata.simplifiedGeometryGeoJSON || metadata.gjDownloadURL
    if (!geometryUrl) {
      return NextResponse.json(
        { success: false, message: 'Boundary GeoJSON URL is missing.' },
        { status: 502 },
      )
    }

    const geometryResponse = await fetch(geometryUrl, { next: { revalidate: 86400 } })
    if (!geometryResponse.ok) {
      return NextResponse.json(
        { success: false, message: `Boundary GeoJSON request failed (${geometryResponse.status}).` },
        { status: 502 },
      )
    }

    const geojson = await geometryResponse.json()
    return NextResponse.json(
      {
        success: true,
        country,
        level,
        source: 'geoBoundaries gbOpen',
        geojson,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      },
    )
  } catch {
    return NextResponse.json(
      { success: false, message: 'Unable to load regional boundary data.' },
      { status: 502 },
    )
  }
}
