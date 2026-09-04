import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

// In-memory cache for fast response
let cachedProvinces: any = null
let cachedKabupaten: any = null

export async function GET(request: NextRequest) {
  const level = request.nextUrl.searchParams.get('level') || 'provinsi'
  const provinceParam = request.nextUrl.searchParams.get('province') || request.nextUrl.searchParams.get('provinsi') || ''

  try {
    const dataDir = path.join(process.cwd(), 'public', 'data')

    if (level === 'kabupaten') {
      if (!cachedKabupaten) {
        const kabPath = path.join(dataDir, 'indonesia-kabupaten.geojson')
        if (fs.existsSync(kabPath)) {
          cachedKabupaten = JSON.parse(fs.readFileSync(kabPath, 'utf8'))
        }
      }

      if (!cachedKabupaten) {
        return NextResponse.json({ success: false, message: 'Data kabupaten tidak ditemukan' }, { status: 404 })
      }

      // If province filter is requested, filter features for super-fast payload (< 200KB)
      if (provinceParam && provinceParam.trim() && !provinceParam.toLowerCase().includes('semua')) {
        const target = provinceParam.toLowerCase().replace(/^(provinsi|prov|daerah\s+istimewa|di)\s+/i, '').trim()
        const filteredFeatures = (cachedKabupaten.features || []).filter((f: any) => {
          const p = String(f.properties?.provinsi || '').toLowerCase()
          return p.includes(target) || target.includes(p)
        })

        return NextResponse.json({
          success: true,
          level: 'kabupaten',
          province: provinceParam,
          geojson: {
            type: 'FeatureCollection',
            features: filteredFeatures
          }
        }, {
          headers: {
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          }
        })
      }

      return NextResponse.json({
        success: true,
        level: 'kabupaten',
        geojson: cachedKabupaten
      }, {
        headers: {
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        }
      })
    }

    // Default: level === 'provinsi'
    if (!cachedProvinces) {
      const provPath = path.join(dataDir, 'indonesia-38-provinces.geojson')
      const fallbackPath = path.join(process.cwd(), 'public', 'indonesia-provinces.geojson')

      if (fs.existsSync(provPath)) {
        cachedProvinces = JSON.parse(fs.readFileSync(provPath, 'utf8'))
      } else if (fs.existsSync(fallbackPath)) {
        cachedProvinces = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'))
      }
    }

    if (!cachedProvinces) {
      return NextResponse.json({ success: false, message: 'Data provinsi tidak ditemukan' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      level: 'provinsi',
      geojson: cachedProvinces
    }, {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      }
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error?.message || 'Gagal memuat GeoJSON wilayah'
    }, { status: 500 })
  }
}
