'use client'

import { useEffect, useRef, useState } from 'react'
import GeoJSON from 'ol/format/GeoJSON'
import type { FeatureLike } from 'ol/Feature'
import OlMap from 'ol/Map'
import { unByKey } from 'ol/Observable'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import { Fill, Stroke, Style, Text } from 'ol/style'
import { defaults as defaultControls } from 'ol/control'
import { X, MapPin, RotateCcw } from 'lucide-react'
import 'ol/ol.css'

type ProvinceMapOlProps = { selectedProvince: string }

type ProvinceDetail = {
  province: string
  totalCampus: number
  averageScore: number
  category: string
  verified: number
  reportCompletion: number
  priorityCampus: number
  recommendation: string
}

type PetaSebaranItem = {
  kode?: string
  nama?: string
  kode_provinsi?: string
  nama_provinsi?: string
  total_faskes?: string | number
  total_rs?: string | number
  total_puskesmas?: string | number
  total_posyandu?: string | number
  total_klinik?: string | number
  total_pustu?: string | number
  total_bkk?: string | number
  properties?: PetaSebaranItem
}

// ── Papua / Irian Jaya name override map ─────────────────────────────────────
// GeoJSON lama masih memakai nama "Irian Jaya …". Mapping ini memaksa tampil
// nama Papua yang berlaku sesuai pemekaran 2022.

const PROVINCE_NAME_OVERRIDE: Record<string, string> = {
  // Nama-nama lama → nama resmi sekarang
  'IRIAN JAYA TIMUR':          'PAPUA',
  'IRIAN JAYA':                'PAPUA',
  'IRIAN JAYA BARAT':          'PAPUA BARAT',
  'IRIAN JAYA TENGAH':         'PAPUA TENGAH',
  'IRIAN JAYA PEGUNUNGAN':     'PAPUA PEGUNUNGAN',
  'PAPUA SELATAN BARAT':       'PAPUA BARAT DAYA',
  // Variasi penulisan lain yang mungkin ada di GeoJSON
  'IRJABAR':                   'PAPUA BARAT',
  'IRJATIM':                   'PAPUA',
}

// ── Choropleth ──────────────────────────────────────────────────────────────

function scoreFill(s: number) {
  if (s >= 800) return '#059669'
  if (s >= 600) return '#16a34a'
  if (s >= 500) return '#65a30d'
  if (s >= 400) return '#ca8a04'
  if (s >= 300) return '#ea580c'
  if (s >= 200) return '#dc2626'
  return '#b91c1c'
}
function scoreFillLight(s: number) {
  if (s >= 800) return '#a7f3d0'
  if (s >= 600) return '#bbf7d0'
  if (s >= 500) return '#d9f99d'
  if (s >= 400) return '#fef08a'
  if (s >= 300) return '#fed7aa'
  if (s >= 200) return '#fecaca'
  return '#fca5a5'
}
function scoreCategory(s: number) {
  if (s >= 800) return 'MINIMAL'
  if (s >= 600) return 'RENDAH'
  if (s >= 400) return 'WASPADA'
  if (s >= 200) return 'TINGGI'
  return 'KRITIS'
}

// ── Province name ────────────────────────────────────────────────────────────

function extractName(props: Record<string, unknown>): string {
  for (const key of ['name', 'NAME_1', 'Propinsi', 'propinsi', 'PROPINSI', 'PROVINSI', 'province', 'WADMPR']) {
    const v = props[key]
    if (typeof v === 'string' && v.trim()) {
      const raw = v.trim().toUpperCase()
      // Gunakan nama override jika ada, jika tidak kembalikan nama asli
      return PROVINCE_NAME_OVERRIDE[raw] ?? v.trim()
    }
  }
  const code = props.kode
  if (typeof code === 'string' && code.trim()) return `Wilayah ${code.trim()}`
  if (typeof code === 'number') return `Wilayah ${code}`
  return ''
}

function normalizeProvinceName(value: string) {
  return value.toUpperCase().replace(/\s+/g, ' ').trim()
}

function toNumber(value: string | number | undefined) {
  if (typeof value === 'number') return value
  const parsed = Number.parseFloat((value ?? '0').toString().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function totalFaskes(item: PetaSebaranItem) {
  const direct = toNumber(item.total_faskes)
  if (direct > 0) return direct
  return (
    toNumber(item.total_rs) +
    toNumber(item.total_puskesmas) +
    toNumber(item.total_posyandu) +
    toNumber(item.total_klinik) +
    toNumber(item.total_pustu) +
    toNumber(item.total_bkk)
  )
}

function extractRows(payloadData: unknown): PetaSebaranItem[] {
  if (Array.isArray(payloadData)) return payloadData as PetaSebaranItem[]
  if (!payloadData || typeof payloadData !== 'object') return []
  const obj = payloadData as Record<string, unknown>
  if (Array.isArray(obj.data)) return obj.data as PetaSebaranItem[]
  if (Array.isArray(obj.result)) return obj.result as PetaSebaranItem[]
  if (Array.isArray(obj.features)) return obj.features as PetaSebaranItem[]
  return []
}

// ── Known provinces with data from laporan ──────────────────────────────────

const KNOWN_PROVINCES = new Set([
  'jawa timur', 'kalimantan selatan', 'dki jakarta', 'jakarta',
  'jawa barat', 'banten', 'sumatera selatan', 'di yogyakarta',
  'yogyakarta', 'jawa tengah', 'kepulauan riau', 'bali',
])

const KNOWN_PROVINCE_DATA: Record<string, { h3n2?: string; covid?: string; mers?: string }> = {
  'jawa timur':          { h3n2: 'H3N2 24%', covid: 'COVID kumulatif' },
  'kalimantan selatan':  { h3n2: 'H3N2 24%' },
  'dki jakarta':         { h3n2: 'H3N2 14.8%', covid: 'COVID kumulatif' },
  'jakarta':             { h3n2: 'H3N2 14.8%', covid: 'COVID kumulatif' },
  'jawa barat':          { covid: 'COVID kumulatif' },
  'banten':              { covid: 'COVID kumulatif' },
  'sumatera selatan':    { covid: 'COVID kumulatif' },
  'di yogyakarta':       { covid: 'COVID kumulatif' },
  'yogyakarta':          { covid: 'COVID kumulatif' },
  'jawa tengah':         { h3n2: 'H3N2 (deteksi awal)' },
  'kepulauan riau':      { mers: 'MERS' },
  'bali':                { mers: 'MERS' },
}

const NO_DATA_PROVINCE: ProvinceDetail = {
  province: '',
  totalCampus: 0,
  averageScore: 0,
  category: 'TIDAK ADA DATA',
  verified: 0,
  reportCompletion: 0,
  priorityCampus: 0,
  recommendation: '',
}

const REAL_PROVINCE_DATA: ProvinceDetail = {
  province: '',
  totalCampus: 0,
  averageScore: 400,
  category: 'TERDETEKSI',
  verified: 0,
  reportCompletion: 0,
  priorityCampus: 0,
  recommendation: '',
}

const detailCache = new Map<string, ProvinceDetail>()

function getDetail(province: string, _idx: number): ProvinceDetail {
  const key = province.toLowerCase().trim()
  if (!KNOWN_PROVINCES.has(key)) {
    return { ...NO_DATA_PROVINCE, province }
  }
  if (detailCache.has(province)) return detailCache.get(province)!
  const d: ProvinceDetail = {
    province,
    totalCampus: 0,
    averageScore: 400,
    category: 'TERDETEKSI',
    verified: 0,
    reportCompletion: 0,
    priorityCampus: 0,
    recommendation: `Data: ${Object.values(KNOWN_PROVINCE_DATA[key] ?? {}).join(', ')}`,
  }
  detailCache.set(province, d)
  return d
}

// ── OL style ─────────────────────────────────────────────────────────────────

function mkStyle(fill: string, stroke: string, sw: number, label?: string): Style {
  return new Style({
    fill: new Fill({ color: fill }),
    stroke: new Stroke({ color: stroke, width: sw }),
    ...(label ? {
      text: new Text({
        text: label,
        fill: new Fill({ color: '#0f172a' }),
        stroke: new Stroke({ color: '#ffffff', width: 3 }),
        font: 'bold 14px sans-serif',
        overflow: true,
      }),
    } : {}),
    zIndex: label ? 10 : 1,
  })
}

function mkFeatureStyle(known: boolean, _label?: string): Style {
  return mkStyle(known ? '#14b8a6' : '#e2e8f0', known ? '#0f766e' : '#cbd5e1', known ? 3 : 1.8)
}

const LEGEND = [
  { color: '#b91c1c', label: 'Kritis  (< 200)' },
  { color: '#dc2626', label: 'Tinggi  (200-399)' },
  { color: '#ca8a04', label: 'Waspada  (400-599)' },
  { color: '#16a34a', label: 'Rendah  (600-799)' },
  { color: '#059669', label: 'Minimal  (>= 800)' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProvinceMapOl({ selectedProvince }: ProvinceMapOlProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<OlMap | null>(null)
  const layerRef     = useRef<VectorLayer<VectorSource> | null>(null)
  const loadedRef    = useRef(false)
  const activeRef    = useRef('')
  const selRef       = useRef(selectedProvince.toLowerCase())
  const campusByProvinceRef = useRef<Record<string, number>>({})
  const [detail, setDetail] = useState<ProvinceDetail | null>(null)

  function restyle(clicked: string, dropdown: string) {
    const layer = layerRef.current
    if (!layer) return
    const isAll = dropdown.includes('semua')
    layer.setStyle((f: FeatureLike) => {
      const props  = f.getProperties() as Record<string, unknown>
      const pname  = extractName(props)
      const lo     = pname.toLowerCase()
      const known  = KNOWN_PROVINCES.has(lo)
      const active = (!isAll && lo.includes(dropdown)) || (!!clicked && lo === clicked)
      if (active) {
        return mkFeatureStyle(known, known ? pname : undefined)
      }
      return mkFeatureStyle(known, known ? pname : undefined)
    })
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const source = new VectorSource()
    const layer  = new VectorLayer({
      source,
      style: (f: FeatureLike) => {
        const props = f.getProperties() as Record<string, unknown>
        const pname = extractName(props)
        const lo    = pname.toLowerCase()
        const known = KNOWN_PROVINCES.has(lo)
        return mkFeatureStyle(known, known ? pname : undefined)
      },
    })
    layerRef.current = layer

    const tileLayer = new TileLayer({ source: new OSM({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' }), opacity: 0.35 })

    const map = new OlMap({
      target: containerRef.current,
      layers: [tileLayer, layer],
      view: new View({ center: [12200000, -400000], zoom: 5.8 }),
      controls: defaultControls({ attribution: false }),
    })
    mapRef.current = map

    // CLICK — collect features array, take first, then zoom
    const clickKey = map.on('singleclick', (evt) => {
      if (!loadedRef.current) return

      const hits: FeatureLike[] = []
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          hits.push(f)
          return true
        },
        { hitTolerance: 8 }
      )

      if (hits.length === 0) {
        activeRef.current = ''
        setDetail(null)
        restyle('', selRef.current)
        return
      }

      const f     = hits[0]
      const props = f.getProperties() as Record<string, unknown>
      const pname = extractName(props)
      if (!pname) return

      const idx = Number(f.get('colorIdx') ?? 0)
      const d   = getDetail(pname, idx)
      const apiCampus = campusByProvinceRef.current[normalizeProvinceName(pname)] ?? 0
      const mergedDetail: ProvinceDetail =
        apiCampus > 0
          ? {
              ...d,
              totalCampus: apiCampus,
              averageScore: Math.min(950, 120 + apiCampus),
              category: scoreCategory(Math.min(950, 120 + apiCampus)),
            }
          : d
      activeRef.current = pname.toLowerCase()
      setDetail(mergedDetail)
      restyle(pname.toLowerCase(), selRef.current)

      // Zoom to province
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geom = (f as any).getGeometry?.()
      if (geom) {
        map.getView().fit(geom.getExtent(), {
          duration: 450,
          padding: [40, 320, 40, 40],
          maxZoom: 7.5,
        })
      }
    })

    const hoverKey = map.on('pointermove', (evt) => {
      if (evt.dragging) return
      const hit = map.hasFeatureAtPixel(evt.pixel, { hitTolerance: 8 })
      ;(map.getTargetElement() as HTMLElement).style.cursor = hit ? 'pointer' : ''
    })

    const loadApiMetrics = async () => {
      try {
        const resp = await fetch('/api/dashboard-kie/peta-sebaran', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kode_provinsi: '' }),
        })
        if (!resp.ok) return
        const payload = (await resp.json()) as { data?: unknown }
        const rows = extractRows(payload.data ?? payload)
        const nextMap: Record<string, number> = {}
        for (const row of rows) {
          const source = row.properties ?? row
          const rawName = String(source.nama ?? source.nama_provinsi ?? '').trim()
          if (!rawName) continue
          // Terapkan override nama Papua juga untuk data dari API
          const overridden = PROVINCE_NAME_OVERRIDE[rawName.toUpperCase()] ?? rawName
          const key = normalizeProvinceName(overridden)
          nextMap[key] = (nextMap[key] ?? 0) + totalFaskes(source)
        }
        if (Object.keys(nextMap).length > 0) {
          campusByProvinceRef.current = nextMap
          restyle(activeRef.current, selRef.current)
        }
      } catch {
        // Keep deterministic local fallback when API is not reachable.
      }
    }

    void loadApiMetrics()

    fetch('/indonesia-provinces.geojson')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((geojson) => {
        const features = new GeoJSON().readFeatures(geojson, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        })
        features.forEach((f, i) => {
          f.set('colorIdx', i)
        })
        source.addFeatures(features)
        loadedRef.current = true
        restyle(activeRef.current, selRef.current)
      })
      .catch((e) => console.error('[ProvinceMap] GeoJSON load error:', e))

    return () => {
      unByKey([clickKey, hoverKey])
      map.setTarget(undefined)
      mapRef.current = null
      loadedRef.current = false
    }
  }, [])

  useEffect(() => {
    selRef.current = selectedProvince.toLowerCase()
    restyle(activeRef.current, selRef.current)
  }, [selectedProvince])

  const zoom = (d: number) => {
    const v = mapRef.current?.getView()
    if (v) v.animate({ zoom: (v.getZoom() ?? 5) + d, duration: 250 })
  }

  const resetView = () => {
    activeRef.current = ''
    setDetail(null)
    restyle('', selRef.current)
    mapRef.current?.getView().animate({ center: [13100000, -250000], zoom: 4.8, duration: 450 })
  }

  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-xl">
      <div ref={containerRef} className="h-full w-full" />

      {/* Detail panel */}
      {detail ? (
        <div
          key={detail.province}
          className="absolute right-3 top-3 w-[min(296px,calc(100%-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.18)]"
          style={{ animation: 'fadeSlideIn 180ms ease' }}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3"
            style={{ backgroundColor: KNOWN_PROVINCES.has(detail.province.toLowerCase()) ? '#0d9488' : '#94a3b8' }}>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-white/80" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Provinsi Dipilih</p>
                <h4 className="text-sm font-extrabold leading-tight text-white">{detail.province}</h4>
              </div>
            </div>
            <button type="button" onClick={resetView}
              className="rounded-lg p-1 text-white/70 transition hover:bg-white/20 hover:text-white"
              aria-label="Tutup">
              <X className="h-4 w-4" />
            </button>
          </div>

          {KNOWN_PROVINCES.has(detail.province.toLowerCase()) ? (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Status Data</p>
                  <p className="text-lg font-extrabold leading-none text-emerald-700">TERSEDIA</p>
                </div>
                <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
                  TERDETEKSI
                </span>
              </div>
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Data yang tersedia</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{detail.recommendation}</p>
              </div>
            </>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tidak Tersedia</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Data surveilans Influenza dan COVID-19 untuk provinsi ini belum tersedia dalam laporan pengawasan nasional.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="pointer-events-none absolute right-3 top-3 rounded-xl border border-teal-100 bg-white/90 px-3 py-2 text-[11px] font-semibold text-slate-500 shadow-sm">
          Klik provinsi untuk melihat detail
        </div>
      )}

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-2xl border border-slate-200 bg-white/97 p-3 shadow-lg">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Legenda Data</p>
        <p className="mt-0.5 text-[9px] text-slate-400">Ketersediaan data per provinsi</p>
        <ul className="mt-2 space-y-1.5">
          <li className="flex items-center gap-2 text-[10px] text-slate-600">
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: '#14b8a6' }} />
            Terdeteksi (10 provinsi)
          </li>
          <li className="flex items-center gap-2 text-[10px] text-slate-600">
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: '#e2e8f0' }} />
            Belum ada data
          </li>
        </ul>
      </div>

      {/* Zoom + Reset */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button type="button" onClick={() => zoom(0.8)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoom(-0.8)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          aria-label="Zoom out">-</button>
        <button type="button" onClick={resetView}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50"
          aria-label="Reset tampilan" title="Reset tampilan">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity:0; transform:translateY(-6px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  )
}