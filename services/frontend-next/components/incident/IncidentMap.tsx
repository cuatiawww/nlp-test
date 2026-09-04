'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatDisasterName } from '@/lib/utils/disasterUtils'
import { Loader2, Settings, X, MapPin, Eye, EyeOff, Globe, Layers, Info, Clock, AlertTriangle, Compass, Activity, RotateCcw, Wind, Building2, Tent } from 'lucide-react'
import { useAuthStore } from '@/lib/authStore'




// OpenLayers core
import OlMap from 'ol/Map'
import View from 'ol/View'
import GeoJSON from 'ol/format/GeoJSON'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import TileArcGISRest from 'ol/source/TileArcGISRest'
import { Fill, Stroke, Style, Circle as CircleStyle, Icon, Text as OlText } from 'ol/style'
import { fromLonLat } from 'ol/proj'
import { defaults as defaultControls } from 'ol/control'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import Overlay from 'ol/Overlay'
import CircleGeom from 'ol/geom/Circle'
import 'ol/ol.css'
import { WindLayer } from 'ol-wind'

function maskPersonName(name: string): string {
  if (!name || name === '-') return '-'
  const parts = name.split(',')
  const mainName = parts[0].trim()
  const degrees = parts.slice(1).join(',').trim()

  const knownPrefixes = new Set(['dr.', 'dr', 'drg.', 'drg', 'ns.', 'ns', 'apt.', 'apt', 'bdn.', 'bdn', 'prof.', 'prof', 'ir.', 'ir', 'drs.', 'drs', 'dra.', 'dra'])

  const words = mainName.split(/\s+/)
  const maskedWords = words.map(w => {
    const cleanWord = w.replace(/[^a-zA-Z.]/g, '')
    if (knownPrefixes.has(cleanWord.toLowerCase())) {
      return w
    }
    if (w.length <= 2) return w[0] + '*'
    if (w.length === 3) return w[0] + '*' + w[2]
    return w.substring(0, 1) + '***' + w.substring(w.length - 1)
  })

  const maskedMain = maskedWords.join(' ')
  return degrees ? `${maskedMain}, ${degrees}` : maskedMain
}

function destroyWindLayerSafely(wl: any) {
  if (!wl) return
  try { wl.setVisible?.(false) } catch { }
  const obj = wl as unknown as Record<string, unknown>
  const tryCall = (k: string, arg?: unknown) => {
    const fn = obj[k]
    if (typeof fn === 'function') {
      try { (fn as (a?: unknown) => void)(arg) } catch { }
    }
  }
  tryCall('stop')
  tryCall('destroy')
  tryCall('dispose')
  tryCall('remove')
  tryCall('setMap', null)
  tryCall('setTarget', null)
}

function getLargestPolygonInteriorPoint(feature: any) {
  const geom = feature?.getGeometry?.()
  if (!geom) return null
  const type = geom.getType?.()
  if (type === 'MultiPolygon') {
    const polygons = geom.getPolygons()
    if (!polygons || polygons.length === 0) return null
    let maxArea = -1
    let largest = polygons[0]
    for (let i = 0; i < polygons.length; i++) {
      const a = polygons[i].getArea()
      if (a > maxArea) {
        maxArea = a
        largest = polygons[i]
      }
    }
    return largest.getInteriorPoint()
  } else if (type === 'Polygon') {
    return geom.getInteriorPoint()
  }
  return geom
}

function cleanFaskesLookupName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/^(rsud|rs\s*umum\s*daerah|rs\s*umum|rs|puskesmas|pkm|uptd|upt|klinik|pustu)\s+/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function getFaskesTriageData(rawItem?: any, name?: string, faskesList?: any[]) {
  let m = 0, k = 0, h = 0, ht = 0, total = 0, catatan = ''
  let found = false

  // 1. Direct fields if present on rawItem
  if (rawItem) {
    const rawM = rawItem.triase_merah ?? rawItem.merah ?? rawItem.korban_luka_berat ?? rawItem.luka_berat
    const rawK = rawItem.triase_kuning ?? rawItem.kuning
    const rawH = rawItem.triase_hijau ?? rawItem.hijau ?? rawItem.korban_luka_ringan ?? rawItem.luka_ringan
    const rawHt = rawItem.triase_hitam ?? rawItem.hitam ?? rawItem.korban_meninggal ?? rawItem.meninggal
    const rawTot = rawItem.total_pasien ?? rawItem.total ?? rawItem.korban_tertangani ?? rawItem.total_korban

    if (rawM !== undefined || rawK !== undefined || rawH !== undefined || rawHt !== undefined || rawTot !== undefined) {
      m = Math.max(0, Number(rawM || 0))
      k = Math.max(0, Number(rawK || 0))
      h = Math.max(0, Number(rawH || 0))
      ht = Math.max(0, Number(rawHt || 0))
      total = Number(rawTot ?? (m + k + h + ht))
      catatan = rawItem.catatan || rawItem.diagnosis || rawItem.catatan_triase || rawItem.catatan_pasien || ''
      if (m > 0 || k > 0 || h > 0 || ht > 0 || total > 0) {
        found = true
      }
    }
  }

  // 2. If triage breakdown is all 0 or not found, try cross-referencing with faskesList
  if ((!found || (m === 0 && k === 0 && h === 0 && ht === 0 && total > 0)) && Array.isArray(faskesList) && name) {
    const qName = cleanFaskesLookupName(name)
    const matched = faskesList.find((f: any) => {
      const fN = cleanFaskesLookupName(f.nama || f.nama_faskes || f.nama_master || '')
      return fN && (fN === qName || fN.includes(qName) || qName.includes(fN))
    })

    if (matched) {
      const fM = Number(matched.triase_merah || matched.merah || 0)
      const fK = Number(matched.triase_kuning || matched.kuning || 0)
      const fH = Number(matched.triase_hijau || matched.hijau || 0)
      const fHt = Number(matched.triase_hitam || matched.hitam || 0)
      const fTot = Number(matched.total_pasien || matched.total || (fM + fK + fH + fHt) || 0)

      if (fM > 0 || fK > 0 || fH > 0 || fHt > 0 || fTot > 0) {
        m = fM
        k = fK
        h = fH
        ht = fHt
        total = fTot || (m + k + h + ht)
        catatan = catatan || matched.catatan || matched.catatan_medis || matched.diagnosis || ''
        found = true
      }
    }
  }

  // If total > 0 but m, k, h, ht are all 0 (e.g. general casualty count only), assign to Hijau (Rawat Ringan/Jalan)
  if (total > 0 && m === 0 && k === 0 && h === 0 && ht === 0) {
    h = total
  }

  if (m === 0 && k === 0 && h === 0 && ht === 0 && total === 0 && !found) {
    return null
  }

  return { merah: m, kuning: k, hijau: h, hitam: ht, total: total || (m + k + h + ht), catatan }
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface MarkerData {
  kode_trans: string
  tgl_kejadian: string
  jenis_bencana: string
  kategori_bencana?: string
  lat: number
  lng: number
  provinsi?: string
  kabupaten?: string
  nama_kab?: string
  nama_desa?: string
  kecamatan?: string
  topografi?: string
  total_korban: number
  meninggal?: number
  luka_berat?: number
  luka_ringan?: number
  pengungsi?: number
  terdampak?: number
  icon_file?: string
  jml_titik_lokasi?: number
}

interface DisasterMapProps {
  markers: MarkerData[]
  selectedRegions?: any[]
  userScope?: any
  onSelectProvince?: (prov: string) => void
  isGuest?: boolean
  /** Jumlah bulan ke belakang untuk menampilkan pin (0 = semua periode) */
  markerMonths?: number
  setMarkerMonths?: (val: number) => void
  onSelectEvent?: (event: MarkerData) => void
  // Flood EOC Routing Props
  isFloodEocMode?: boolean
  selectedRouteTarget?: {
    id: string
    name: string
    latitude: number
    longitude: number
    type: 'hospital' | 'clinic' | 'shelter' | 'tck'
  } | null
  routeCoords?: number[][]
  routeInfo?: { distance: number; duration: number } | null
  faskesList?: any[]
  poskoList?: any[]
  tckList?: any[]
  /** Daftar faskes yang terdampak/rusak (dari laporan RHA). Ditampilkan dengan pin merah dan popup info kerusakan. */
  faskesRusakList?: any[]
  onSelectRouteTarget?: (target: any, type: 'hospital' | 'clinic' | 'shelter' | 'tck') => void
  disasterType?: string
  selectedRouteSource?: any
  onSelectRouteSource?: (source: any) => void
  lokasiList?: any[]
  /** Real earthquake epicenter points from USGS/BMKG API */
  earthquakePoints?: Array<{ lat: number; lng: number; magnitude: number; depth: number; place: string; time: string; dateStr: string; dateLabel: string; distKm: number; isMainshock: boolean; mmi?: number; tsunami?: number }>
}

interface MarkerPopupState {
  data: MarkerData
  x: number   // pixel x di dalam container peta
  y: number   // pixel y di dalam container peta
}

interface EocPopupState {
  rawItem: any
  type: 'hospital' | 'clinic' | 'pustu' | 'shelter' | 'disaster' | 'tck' | 'earthquake'
  name: string
  address?: string
  lat: number
  lng: number
  distance?: number
  /** Apakah faskes ini masuk daftar terdampak/rusak bencana */
  isTerdampak?: boolean
  /** Info kerusakan dari data inputan RHA */
  dampakInfo?: {
    rusak_berat?: number
    rusak_sedang?: number
    rusak_ringan?: number
    kondisi_faskes?: string
    fungsi_pelayanan?: string
    jenis_faskes?: string
    status?: string
  }
  details?: {
    jenis?: string
    operasional?: string
    dokter?: number | string
    perawat?: number | string
    kapasitas?: number | string
    ambulans?: number | string
    pengungsi_jiwa?: number | string
    kontak?: string
    golongan?: string
    spesifikasi?: string
    organisasi?: string
    nama_tim_emt?: string
    pekerjaan?: string
    nomor_telp?: string
  }
  earthquakeInfo?: {
    magnitude: number
    depth: number
    place: string
    time: string
    dateStr?: string
    dateLabel?: string
    isMainshock: boolean
    mmi?: number | string
    tsunami?: number
    distKm?: number
    source?: string
  }
  x: number
  y: number
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Normalisasi nama wilayah → key perbandingan (strip prefix, uppercase, tanpa spasi/simbol) */
const cleanKey = (name?: string | null) => {
  if (!name) return ''
  let cleaned = name
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/^(KABUPATEN|KAB|KOTA|PROVINSI|PROV|DAERAH ISTIMEWA|DI|DKI)\s+/gi, '')
    .trim()

  if (cleaned.includes('JAKARTA')) return 'JAKARTA'
  if (cleaned.includes('YOGYAKARTA')) return 'YOGYAKARTA'
  if (cleaned.includes('BANGKA')) return 'BANGKABELITUNG'
  if (cleaned.includes('KEPULAUAN RIAU') || cleaned === 'KEPRI') return 'KEPULAUANRIAU'
  if (cleaned === 'NTB' || cleaned.includes('NUSA TENGGARA BARAT')) return 'NUSATENGGARABARAT'
  if (cleaned === 'NTT' || cleaned.includes('NUSA TENGGARA TIMUR')) return 'NUSATENGGARATIMUR'

  return cleaned.replace(/[^A-Z0-9]/g, '')
}

/** Ambil nama provinsi dari properties feature OL (berbagai kemungkinan key) */
const getFeatureName = (feature: any, level: 'provinsi' | 'kabupaten') => {
  if (!feature) return ''
  const props = feature.getProperties() || {}
  const keys = level === 'provinsi'
    ? ['provinsi', 'PROVINSI', 'nama_prov', 'prov_single', 'prov_multi', 'WADMPR', 'NAME_1', 'NAMOBJ', 'Propinsi']
    : ['nama_kab', 'NAMA_KAB', 'kabupaten', 'KABUPATEN', 'kab_single', 'kab_multi', 'WADMMP', 'NAME_2', 'NAMOBJ', 'nama']
  for (const key of keys) {
    if (props[key] !== undefined && props[key] !== null && String(props[key]).trim() !== '') return String(props[key]).trim()
  }
  return ''
}

/** Warna choropleth berdasarkan jumlah kejadian sesuai legenda (Kemenkes / Inarisk Style seperti D:\project\puskes) */
const choroplethColor = (count: number, opacity: number = 0.92) => {
  if (count === 0) return `rgba(241, 245, 249, ${opacity * 0.6})`
  if (count <= 10) return `rgba(234, 179, 8, ${opacity})`        // Kuning (1 - 10)
  if (count <= 30) return `rgba(249, 115, 22, ${opacity})`       // Oranye (11 - 30)
  if (count <= 50) return `rgba(239, 68, 68, ${opacity})`        // Coral Red (31 - 50)
  return `rgba(185, 28, 28, ${opacity})`                         // Deep Crimson Red (> 50)
}

/** Style choropleth OL untuk tingkat kejadian dengan label angka per wilayah (seperti D:\project\puskes) */
const choroplethStyle = (count: number, hasWarning: boolean = false, labelText?: string) => {
  const baseColor = choroplethColor(count, 0.92)

  return new Style({
    fill: new Fill({ color: baseColor }),
    stroke: new Stroke({
      color: hasWarning ? '#dc2626' : count === 0 ? 'rgba(148, 163, 184, 0.5)' : '#ffffff',
      width: hasWarning ? 2.5 : count === 0 ? 0.8 : 1.5,
      lineDash: hasWarning ? [5, 5] : count > 50 ? [8, 4] : undefined,
    }),
    text: count > 0 ? new OlText({
      text: labelText || String(count),
      font: 'bold 11px Inter, sans-serif',
      fill: new Fill({ color: '#ffffff' }),
      stroke: new Stroke({ color: 'rgba(15, 23, 42, 0.8)', width: 2.5 }),
      textAlign: 'center',
      textBaseline: 'middle',
    }) : undefined,
  })
}

/** Warna pin marker berdasarkan total korban */
const pinColor = (totalKorban: number) => {
  if (totalKorban === 0) return '#94a3b8'
  if (totalKorban <= 5) return '#facc15'
  if (totalKorban <= 20) return '#f97316'
  return '#dc2626'
}

/** Style OL untuk marker pin */
const markerStyle = (iconFile: string | undefined, totalKorban: number) => {
  if (iconFile) {
    const backendUrl = process.env.NEXT_PUBLIC_SIPKK_BACKEND_BASE_URL || ''
    const src = iconFile.startsWith('http')
      ? iconFile
      : `${backendUrl}/app_asset/icon/data_bencana/${iconFile}`
    return new Style({
      image: new Icon({
        src: src,
        scale: 0.8,
      }),
    })
  }
  return new Style({
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: pinColor(totalKorban) }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
  })
}

const getDistanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Cache GeoJSON agar tidak fetch ulang setiap render
const geojsonCache: Record<string, any> = {}

// basePath untuk URL fetch API — NEXT_PUBLIC_BASE_PATH diinjeksi saat build time oleh Next.js
// Fallback ke string kosong jika tidak ada (development tanpa basePath)
const NEXT_BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

// ─────────────────────────────────────────────
// Helper: Categorize a faskes item into rs/puskesmas/klinik/pustu
// Pure function — defined at module level for stable reference in useMemo
// ─────────────────────────────────────────────
function categorizeFaskes(f: any): 'rs' | 'puskesmas' | 'klinik' | 'pustu' {
  const jStr = String(f.jenis || f.jenis_faskes || f.subjenis || '').toLowerCase()
  const nStr = String(f.nama || f.nama_faskes || '').toLowerCase()
  // Check RS first — use specific terms to avoid false positives from bare 'rs' substring
  if (
    jStr === 'rumah sakit' ||
    jStr.includes('rumah sakit') ||
    jStr.startsWith('rs') ||
    jStr === 'rsia' || jStr === 'rsud' || jStr === 'rsu' || jStr === 'rstp' || jStr === 'rsk' ||
    nStr.startsWith('rsud ') || nStr.startsWith('rs ') || nStr.includes(' rsud') ||
    nStr.includes('rumah sakit')
  ) return 'rs'
  // Pustu / Pembantu
  if (
    jStr.includes('pustu') || jStr.includes('pembantu') ||
    jStr.includes('poskesdes') || jStr.includes('polindes') || jStr.includes('posyandu') ||
    nStr.includes('pustu') || nStr.includes('pembantu')
  ) return 'pustu'
  // Klinik
  if (jStr.includes('klinik') || nStr.includes('klinik') || jStr.includes('balai pengobatan')) return 'klinik'
  // Default: Puskesmas
  return 'puskesmas'
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function DisasterMap({
  markers,
  selectedRegions = [],
  userScope,
  onSelectProvince,
  isGuest: propIsGuest,
  markerMonths,
  setMarkerMonths,
  onSelectEvent,
  isFloodEocMode = false,
  selectedRouteTarget = null,
  routeCoords = [],
  routeInfo = null,
  faskesList = [],
  poskoList = [],
  tckList = [],
  faskesRusakList = [],
  onSelectRouteTarget,
  disasterType,
  selectedRouteSource = null,
  onSelectRouteSource,
  lokasiList = [],
  earthquakePoints = []
}: DisasterMapProps) {
  const { token, user, isGuest: storeIsGuest } = useAuthStore()
  const isGuest = propIsGuest || storeIsGuest || !token || !user
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

  const [showTckLayer, setShowTckLayer] = useState(false) // Toggle layer TCK Kemkes (default: non-aktif)
  const [showPosko, setShowPosko] = useState(false) // Toggle layer Posko Pengungsian (default: non-aktif)
  const [showSeismicLayer, setShowSeismicLayer] = useState(true) // Toggle layer Titik Gempa USGS/BMKG

  // Infer normalized disaster category ONLY when disasterType is explicitly provided (Detail Page)
  const disasterCategory = useMemo(() => {
    if (!disasterType) return 'none' // Main dashboard page has no default auto-activated hazard layer
    const name = String(disasterType).toLowerCase()
    if (name.includes('kebakaran') || name.includes('karhutla') || name.includes('fire')) return 'kebakaran'
    if (name.includes('banjir') || name.includes('flood') || name.includes('genangan') || name.includes('rob')) return 'banjir'
    if (name.includes('gempa') || name.includes('earthquake')) return 'gempa'
    if (name.includes('longsor') || name.includes('landslide')) return 'longsor'
    if (name.includes('gunung') || name.includes('erupsi')) return 'gunung'
    return 'none'
  }, [disasterType])

  // ── Map refs ──
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<OlMap | null>(null)
  const baseMapLayerRef = useRef<any>(null)
  const provinceLayerRef = useRef<VectorLayer<VectorSource<any>> | null>(null)
  const kabupatenLayerRef = useRef<VectorLayer<VectorSource<any>> | null>(null)
  const markerLayerRef = useRef<VectorLayer<VectorSource<any>> | null>(null)
  const pulseOverlaysRef = useRef<Overlay[]>([])
  const lastFetchedProvinceRef = useRef<string | null>(null)
  const lastScopeKeyRef = useRef<string | null>(null)
  const prevTargetIdRef = useRef<string | null>(null)

  // BNPB layers refs
  const bnpbAdminLayerRef = useRef<any>(null)
  const bnpbHillshadeLayerRef = useRef<any>(null)
  const bnpbKepadatanLayerRef = useRef<any>(null)
  const bnpbBanjirLayerRef = useRef<any>(null)
  const bnpbGempaLayerRef = useRef<any>(null)
  const bnpbLongsorLayerRef = useRef<any>(null)
  const bnpbKarhutlaLayerRef = useRef<any>(null)
  const windLayerRef = useRef<any>(null)
  const showWindyRef = useRef(false)

  // EOC Routing Refs
  const eocLayerRef = useRef<VectorLayer<VectorSource<any>> | null>(null)

  // Stable callback refs (avoid stale closures inside OL event handlers)
  const onSelectProvinceRef = useRef(onSelectProvince)
  const userScopeRef = useRef(userScope)
  const markersRef = useRef(markers)
  const onSelectRouteTargetRef = useRef(onSelectRouteTarget)
  const faskesListRef = useRef(faskesList)
  const poskoListRef = useRef(poskoList)
  const faskesRusakListRef = useRef(faskesRusakList)
  const lokasiListRef = useRef(lokasiList)
  const nttSituasiRef = useRef<any[]>([])

  useEffect(() => {
    let active = true
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const normalizeNttRows = (rows: any[]): any[] => {
      if (!Array.isArray(rows)) return []
      return rows.map(r => {
        const out: any = {}
        Object.keys(r).forEach(k => {
          const key = k.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
          out[key] = r[k]
        })
        // Ensure numeric fields parsed correctly
        out.meninggal = Number(out.meninggal || 0)
        out.luka_berat = Number(out.luka_berat || 0)
        out.luka_ringan = Number(out.luka_ringan || 0)
        out.pengungsi = Number(out.pengungsi || 0)
        out.titik_pengungsian = Number(out.titik_pengungsian || 0)
        out.populasi_terdampak = Number(out.populasi_terdampak || out.penduduk_terdampak || 0)
        return out
      })
    }
    fetch(`${basePath}/api/ntt-data`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (!active) return
        if (json.success) {
          const list = json.tables?.situasi_kesehatan || json.data?.situasi_kesehatan || []
          nttSituasiRef.current = normalizeNttRows(Array.isArray(list) ? list : [])
        }
      })
      .catch((e) => console.warn('[DisasterMap] NTT Data fetch:', e))
    return () => {
      active = false
    }
  }, [])

  // ── UI state ──
  const [isLoading, setIsLoading] = useState(false)
  const [mapInstance, setMapInstance] = useState<OlMap | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showMarkers, setShowMarkers] = useState(true)  // toggle pin visibility
  const [showEocRoute, setShowEocRoute] = useState(true)
  const [pulseRadius, setPulseRadius] = useState<number>(1) // Default 1 km

  // ── Faskes Sub-Category Checkbox Filters ──
  const [faskesTypeFilters, setFaskesTypeFilters] = useState<{
    rs: boolean
    puskesmas: boolean
    klinik: boolean
    pustu: boolean
    siagaOnly: boolean
  }>({
    rs: true,
    puskesmas: true,
    klinik: true,
    pustu: true,
    siagaOnly: true,
  })

  const faskesCountsByType = useMemo(() => {
    const list = Array.isArray(faskesList) ? faskesList : []
    let rs = 0, puskesmas = 0, klinik = 0, pustu = 0, siaga = 0
    let rsSiaga = 0, pkmSiaga = 0, klinikSiaga = 0, pustuSiaga = 0

    list.forEach((f: any) => {
      const totPasien = Number(f.total_pasien || 0) || (Number(f.triase_merah || 0) + Number(f.triase_kuning || 0) + Number(f.triase_hijau || 0) + Number(f.triase_hitam || 0))
      const hasTriage = totPasien > 0

      if (hasTriage) siaga++

      const cat = categorizeFaskes(f)
      if (cat === 'rs') {
        rs++
        if (hasTriage) rsSiaga++
      } else if (cat === 'pustu') {
        pustu++
        if (hasTriage) pustuSiaga++
      } else if (cat === 'klinik') {
        klinik++
        if (hasTriage) klinikSiaga++
      } else {
        puskesmas++
        if (hasTriage) pkmSiaga++
      }
    })
    return {
      rs, puskesmas, klinik, pustu, siaga, total: list.length,
      rsSiaga, pkmSiaga, klinikSiaga, pustuSiaga
    }
  }, [faskesList])

  // Auto-enable EOC Routing layer when a route target is selected
  useEffect(() => {
    if (selectedRouteTarget) {
      setShowEocRoute(true)
    }
  }, [selectedRouteTarget])
  const [showBaseMap, setShowBaseMap] = useState(true)
  const [showGeoJson, setShowGeoJson] = useState(true)
  const [showWindy, setShowWindy] = useState(false)
  const [showWindLegend, setShowWindLegend] = useState(false)
  const [showRegionLegend, setShowRegionLegend] = useState(false)
  const [showCasualtyLegend, setShowCasualtyLegend] = useState(false)

  useEffect(() => {
    showWindyRef.current = showWindy
  }, [showWindy])

  // Fungsi untuk kembali ke titik pusat utama kejadian bencana (Reset View/Zoom)
  const handleResetCenter = useCallback(() => {
    if (!mapInstanceRef.current) return
    const firstM = markersRef.current && markersRef.current[0]
    const hasCoord = firstM && Number(firstM.lng) !== 0 && Number(firstM.lat) !== 0
    const centerCoord = hasCoord
      ? fromLonLat([Number(firstM.lng), Number(firstM.lat)])
      : isFloodEocMode
        ? fromLonLat([122.9814, -8.3421])
        : fromLonLat([118, -2.5])
    const targetZoom = isFloodEocMode ? 8.2 : 4.8

    mapInstanceRef.current.getView().animate({
      center: centerCoord,
      zoom: targetZoom,
      duration: 700
    })
  }, [isFloodEocMode])

  // BNPB layer visibilities - Bahaya Gempa Bumi aktif default
  const [showBnpbAdmin, setShowBnpbAdmin] = useState(false)
  const [showBnpbHillshade, setShowBnpbHillshade] = useState(false)
  const [showBnpbKepadatan, setShowBnpbKepadatan] = useState(false)
  const [showBnpbBanjir, setShowBnpbBanjir] = useState(false)
  const [showBnpbGempa, setShowBnpbGempa] = useState(true)
  const [showBnpbLongsor, setShowBnpbLongsor] = useState(false)
  const [showBnpbKarhutla, setShowBnpbKarhutla] = useState(false)

  // Auto activate matching spatial layer ONLY on Detail Page (when disasterType is provided)
  useEffect(() => {
    if (!disasterType || disasterCategory === 'none') {
      setShowBnpbBanjir(false)
      setShowBnpbGempa(true)
      setShowBnpbLongsor(false)
      setShowBnpbKarhutla(false)
      return
    }

    if (disasterCategory === 'kebakaran') {
      setShowBnpbKarhutla(true)
      setShowBnpbBanjir(false)
      setShowBnpbGempa(false)
      setShowBnpbLongsor(false)
      setShowWindy(false)
    } else if (disasterCategory === 'banjir') {
      setShowBnpbBanjir(true)
      setShowBnpbKarhutla(false)
      setShowBnpbGempa(false)
      setShowBnpbLongsor(false)
    } else if (disasterCategory === 'gempa') {
      setShowBnpbGempa(true)
      setShowBmkg(false)
      setShowBnpbBanjir(false)
      setShowBnpbKarhutla(false)
      setShowBnpbLongsor(false)
    } else if (disasterCategory === 'longsor') {
      setShowBnpbLongsor(true)
      setShowBnpbBanjir(false)
      setShowBnpbKarhutla(false)
      setShowBnpbGempa(false)
    }
  }, [disasterCategory, disasterType])

  const [markerPopup, setMarkerPopup] = useState<MarkerPopupState | null>(null)
  const [eocPopup, setEocPopup] = useState<EocPopupState | null>(null)

  // ── BMKG Layer states ──
  const [showBmkg, setShowBmkg] = useState(false)
  const [bmkgGempas, setBmkgGempas] = useState<any[]>([])
  const [activeBmkgAlert, setActiveBmkgAlert] = useState<any | null>(null)
  const [showEwsPulse, setShowEwsPulse] = useState(true)

  // Callback to create a pulsing overlay dynamically
  const createPulseOverlay = useCallback((lng: number, lat: number, type: 'danger' | 'warning' | 'gempa') => {
    const map = mapInstanceRef.current || mapInstance
    if (!map) return

    const pulseEl = document.createElement('div')
    pulseEl.className = 'ews-pulse-overlay pointer-events-none select-none'
    pulseEl.style.position = 'relative'
    pulseEl.style.width = '52px'
    pulseEl.style.height = '52px'
    pulseEl.style.display = 'flex'
    pulseEl.style.alignItems = 'center'
    pulseEl.style.justifyContent = 'center'

    let colorHex = '#ef4444' // red
    if (type === 'warning') colorHex = '#f97316' // orange
    else if (type === 'gempa') colorHex = '#ea580c' // amber

    pulseEl.innerHTML = `
      <style>
        @keyframes eocPulsePing {
          0% { transform: scale(0.4); opacity: 0.95; }
          60% { transform: scale(1.9); opacity: 0.15; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes eocPulseRadar {
          0% { transform: scale(0.2); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
          100% { transform: scale(2.1); opacity: 0; }
        }
      </style>
      <div style="position: absolute; width: 44px; height: 44px; border-radius: 9999px; background: ${colorHex}; opacity: 0.55; animation: eocPulsePing 1.8s cubic-bezier(0, 0.2, 0.8, 1) infinite;"></div>
      <div style="position: absolute; width: 44px; height: 44px; border-radius: 9999px; border: 2.2px solid ${colorHex}; animation: eocPulseRadar 1.8s ease-out infinite; animation-delay: 0.45s;"></div>
      <div style="position: relative; width: 10px; height: 10px; border-radius: 9999px; background: ${colorHex}; border: 2px solid #ffffff; box-shadow: 0 0 10px ${colorHex};"></div>
    `

    const overlay = new Overlay({
      element: pulseEl,
      positioning: 'center-center',
      stopEvent: false,
      position: fromLonLat([lng, lat])
    })

    map.addOverlay(overlay)
    pulseOverlaysRef.current.push(overlay)
  }, [mapInstance])

  // ── Filter states ──
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(new Set())
  const [excludedTypes, setExcludedTypes] = useState<Set<string>>(new Set())

  const toggleCategory = (catId: string) => {
    setExcludedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) {
        next.delete(catId)
      } else {
        next.add(catId)
      }
      return next
    })
  }

  const toggleType = (typeName: string) => {
    setExcludedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(typeName)) {
        next.delete(typeName)
      } else {
        next.add(typeName)
      }
      return next
    })
  }

  // Polygon popup state (province / kabupaten click popup)
  const [activePopup, setActivePopup] = useState<{
    type: 'provinsi' | 'kabupaten'
    name: string
    featureExtent?: any
    warnings?: any[]
    stats: {
      totalEvents: number
      totalKorban: number
      meninggal?: number
      lukaBerat?: number
      lukaRingan?: number
      totalLuka?: number
      pengungsi?: number
      titikPosko?: number
      populasiTerdampak?: number
      faskesCount?: number
      poskoCount?: number
      breakdown: { name: string; count: number; totalKorban?: number }[]
      eventsList?: MarkerData[]
      faskesList?: any[]
      poskoList?: any[]
      lokasiList?: any[]
    }
  } | null>(null)

  // ── API Indonesia early warnings state ──
  const [activeWarnings, setActiveWarnings] = useState<any[]>([])

  const warningsByProvince = useMemo(() => {
    const m = new Map<string, any[]>()
    if (!Array.isArray(activeWarnings)) return m
    activeWarnings.forEach((w) => {
      const provKey = cleanKey(w.province)
      if (provKey) {
        const list = m.get(provKey) || []
        list.push(w)
        m.set(provKey, list)
      }
    })
    return m
  }, [activeWarnings])

  // Fetch API Indonesia warnings on mount
  useEffect(() => {
    let active = true
    async function fetchWarnings() {
      try {
        const res = await fetch('/api/peringatan-dini')
        if (res.ok) {
          const json = await res.json()
          if (json.success && Array.isArray(json.data)) {
            if (active) {
              setActiveWarnings(json.data)
            }
          }
        }
      } catch (e) {
        console.error('[EWS Map] Failed to fetch Peringatan Dini:', e)
      }
    }
    void fetchWarnings()
    const interval = setInterval(fetchWarnings, 300000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  // ── Sync refs ──
  useEffect(() => {
    onSelectProvinceRef.current = onSelectProvince
    userScopeRef.current = userScope
    markersRef.current = markers
    onSelectRouteTargetRef.current = onSelectRouteTarget
    faskesListRef.current = faskesList
    poskoListRef.current = poskoList
    faskesRusakListRef.current = faskesRusakList
    lokasiListRef.current = lokasiList
  }, [onSelectProvince, userScope, markers, onSelectRouteTarget, faskesList, poskoList, faskesRusakList, lokasiList])

  // Dismiss popup on scope changes
  useEffect(() => {
    setActivePopup(null)
    setMarkerPopup(null)
    setEocPopup(null)
  }, [userScope])

  // ─────────────────────────────────────────────
  // Computed
  // ─────────────────────────────────────────────

  // 1. Get filtered markers first based on exclusions
  const filteredMarkers = useMemo(() => {
    return markers.filter((m) => {
      const cat = String(m.kategori_bencana || '1')
      if (excludedCategories.has(cat)) return false
      if (excludedTypes.has(m.jenis_bencana)) return false
      return true
    })
  }, [markers, excludedCategories, excludedTypes])



  // 2. Compute category totals from all markers
  const categoryCounts = useMemo(() => {
    let alam = 0
    let nonAlam = 0
    let sosial = 0
    markers.forEach((m) => {
      const cat = String(m.kategori_bencana || '1')
      if (cat === '1') alam++
      else if (cat === '2') nonAlam++
      else if (cat === '3') sosial++
    })
    return { alam, nonAlam, sosial }
  }, [markers])

  // 3. Compute disaster types breakdown from all markers
  const disasterTypesBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    const typeToCategory = new Map<string, string>()
    markers.forEach((m) => {
      counts.set(m.jenis_bencana, (counts.get(m.jenis_bencana) || 0) + 1)
      if (m.kategori_bencana !== undefined && m.kategori_bencana !== null) {
        typeToCategory.set(m.jenis_bencana, String(m.kategori_bencana))
      }
    })
    return Array.from(counts.entries()).map(([name, count]) => ({
      name,
      count,
      category: typeToCategory.get(name) || '1',
    })).sort((a, b) => b.count - a.count)
  }, [markers])

  // 4. Compute counts for choropleth based on filtered markers
  const { provinceCounts, kabupatenCounts } = useMemo(() => {
    const provinceCounts = new Map<string, number>()
    const kabupatenCounts = new Map<string, number>()
    filteredMarkers.forEach((m) => {
      const pStr = m.provinsi || (m as any).prov_single || (m as any).nama_prov || (m as any).prov || ''
      const kStr = m.kabupaten || (m as any).kab_single || (m as any).nama_kab || (m as any).kab || ''
      const pKey = cleanKey(pStr)
      const kKey = cleanKey(kStr)

      if (pKey) provinceCounts.set(pKey, (provinceCounts.get(pKey) || 0) + 1)
      if (kKey) kabupatenCounts.set(kKey, (kabupatenCounts.get(kKey) || 0) + 1)
    })
    return { provinceCounts, kabupatenCounts }
  }, [filteredMarkers])

  // Keys wilayah terpilih untuk polygon highlight / arsiran GeoJSON
  const selectedProvKeys = useMemo(() => {
    const keys: string[] = []
    if (Array.isArray(selectedRegions)) {
      selectedRegions.forEach((r: any) => {
        const pName = r.province_name || (r.type === 'provinsi' ? r.label : '')
        if (pName) keys.push(cleanKey(pName))
        if (r.label) {
          const matchProv = r.label.match(/,\s*([A-Za-z\s]+)\)/)
          if (matchProv && matchProv[1]) keys.push(cleanKey(matchProv[1]))
          keys.push(cleanKey(r.label))
        }
      })
    }
    return keys
  }, [selectedRegions])

  const selectedKabKeys = useMemo(() => {
    const keys: string[] = []
    if (Array.isArray(selectedRegions)) {
      selectedRegions.forEach((r: any) => {
        const kName = r.kabupaten_name || (r.type === 'kabupaten' ? r.label : '')
        if (kName) keys.push(cleanKey(kName))

        if (r.label) {
          const matchKab = r.label.match(/\((?:KAB\.|KOTA|KABUPATEN)\s*([^,)]+)/i)
          if (matchKab && matchKab[1]) keys.push(cleanKey(matchKab[1]))
          keys.push(cleanKey(r.label))
        }
      })
    }
    return keys
  }, [selectedRegions])

  // ─────────────────────────────────────────────
  // Initialize Map (once)
  // ─────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current) return

    // Base Map OSM layer
    const baseMapLayer = new TileLayer({
      source: new OSM(),
      visible: showBaseMap,
    })
    baseMapLayerRef.current = baseMapLayer

    // BNPB layers
    const bnpbAdminLayer = new TileLayer({
      source: new TileArcGISRest({
        url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/batas_administrasi/MapServer',
        params: {},
      }),
      visible: showBnpbAdmin,
    })
    bnpbAdminLayerRef.current = bnpbAdminLayer

    const bnpbHillshadeLayer = new TileLayer({
      source: new TileArcGISRest({
        url: 'https://gis.bnpb.go.id/server/rest/services/Basemap/Indo_Hillshade/MapServer',
        params: {},
      }),
      visible: showBnpbHillshade,
      opacity: 0.6,
    })
    bnpbHillshadeLayerRef.current = bnpbHillshadeLayer

    const bnpbKepadatanLayer = new TileLayer({
      source: new TileArcGISRest({
        url: 'https://gis.bnpb.go.id/server/rest/services/Basemap/Kepadatan_penduduk_2020/MapServer',
        params: {},
      }),
      visible: showBnpbKepadatan,
      opacity: 0.6,
    })
    bnpbKepadatanLayerRef.current = bnpbKepadatanLayer

    const bnpbBanjirLayer = new TileLayer({
      source: new TileArcGISRest({
        url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir/ImageServer',
        params: {},
      }),
      visible: showBnpbBanjir,
      opacity: 0.6,
    })
    bnpbBanjirLayerRef.current = bnpbBanjirLayer

    const bnpbGempaLayer = new TileLayer({
      source: new TileArcGISRest({
        url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_gempabumi/ImageServer',
        params: {},
      }),
      visible: showBnpbGempa,
      opacity: 0.6,
    })
    bnpbGempaLayerRef.current = bnpbGempaLayer

    const bnpbLongsorLayer = new TileLayer({
      source: new TileArcGISRest({
        url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_tanah_longsor/ImageServer',
        params: {},
      }),
      visible: showBnpbLongsor,
      opacity: 0.6,
    })
    bnpbLongsorLayerRef.current = bnpbLongsorLayer

    const bnpbKarhutlaLayer = new TileLayer({
      source: new TileArcGISRest({
        url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_kebakaran_hutan_dan_lahan/ImageServer',
        params: {},
      }),
      visible: showBnpbKarhutla,
      opacity: 0.6,
    })
    bnpbKarhutlaLayerRef.current = bnpbKarhutlaLayer

    // Province choropleth layer — zIndex 2 agar di atas basemap
    const provinceLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 2,
      style: new Style({
        fill: new Fill({ color: 'rgba(241, 245, 249, 0.6)' }),
        stroke: new Stroke({ color: 'rgba(100, 116, 139, 0.85)', width: 1.2 }),
      }),
    })
    provinceLayerRef.current = provinceLayer

    // Kabupaten choropleth layer — zIndex 3 agar di atas province
    const kabupatenLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 3,
      style: new Style({
        fill: new Fill({ color: 'rgba(241, 245, 249, 0.6)' }),
        stroke: new Stroke({ color: 'rgba(100, 116, 139, 0.85)', width: 1.2 }),
      }),
    })
    kabupatenLayerRef.current = kabupatenLayer  // ← FIX: assign ref yang terlupakan

    // Marker pin layer
    const markerLayer = new VectorLayer({ source: new VectorSource(), zIndex: 10 })
    markerLayerRef.current = markerLayer

    // EOC routing & faskes layer
    const eocLayer = new VectorLayer({ source: new VectorSource(), zIndex: 12 })
    eocLayerRef.current = eocLayer

    const firstM = markers && markers[0]
    const hasInitialCoord = firstM && Number(firstM.lng) !== 0 && Number(firstM.lat) !== 0
    const initialCenter = isFloodEocMode && hasInitialCoord
      ? fromLonLat([Number(firstM.lng), Number(firstM.lat)])
      : fromLonLat([118, -2.5])
    const initialZoom = isFloodEocMode ? 8.2 : 4.8

    const map = new OlMap({
      target: mapRef.current,
      layers: [
        baseMapLayer,
        bnpbAdminLayer,
        bnpbHillshadeLayer,
        bnpbKepadatanLayer,
        bnpbBanjirLayer,
        bnpbGempaLayer,
        bnpbLongsorLayer,
        bnpbKarhutlaLayer,
        provinceLayer,
        kabupatenLayer,
        markerLayer,
        eocLayer
      ],
      controls: defaultControls({ attribution: false }),
      view: new View({
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 4,
        maxZoom: 15,
      }),
    })

    // Overlay elements will be added dynamically on render hook

    // ── Click handler ──
    map.on('singleclick', (evt) => {
      // 1. Check EOC Layer feature first
      const eocFeature = map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => f,
        { layerFilter: (l) => l === eocLayerRef.current }
      )
      if (eocFeature) {
        const id = eocFeature.get('id')
        const rawItem = eocFeature.get('rawItem')
        const itemType = eocFeature.get('itemType')
        const name = eocFeature.get('name') || rawItem?.nama || rawItem?.nama_faskes || 'Lokasi Terkait'

        if (id && !String(id).startsWith('pulse-circle') && id !== 'route-line' && id !== 'flood' && rawItem) {
          const container = mapContainerRef.current
          if (container && mapRef.current) {
            const rect = container.getBoundingClientRect()
            const mapRect = mapRef.current.getBoundingClientRect()
            const x = evt.pixel[0] + (mapRect.left - rect.left)
            const y = evt.pixel[1] + (mapRect.top - rect.top)

            const lat = Number(rawItem.latitude || rawItem.lat || 0)
            const lng = Number(rawItem.longitude || rawItem.lng || 0)
            const firstMarker = markersRef.current && markersRef.current[0]
            const originLat = firstMarker ? Number(firstMarker.lat) : lat
            const originLng = firstMarker ? Number(firstMarker.lng) : lng
            const distKm = getDistanceInKm(originLat, originLng, lat, lng)

            const hasStructuralDamage = Number(rawItem.rusak_berat || 0) > 0 || 
                                       Number(rawItem.rusak_sedang || 0) > 0 || 
                                       Number(rawItem.rusak_ringan || 0) > 0 ||
                                       String(rawItem.kondisi_bangunan || '').toLowerCase().includes('rusak') ||
                                       String(rawItem.kondisi_faskes || '').toLowerCase().includes('rusak') ||
                                       String(rawItem.status || '').toLowerCase().includes('rusak') ||
                                       String(rawItem.status || '').toLowerCase().includes('tutup')

            const isTerdampak = (!!rawItem._isTerdampak && hasStructuralDamage) || hasStructuralDamage
            const isEarthquake = itemType === 'earthquake'

            setEocPopup({
              rawItem,
              type: (itemType as any) || 'clinic',
              name: isEarthquake ? (rawItem.name || name) : name,
              address: isEarthquake
                ? (rawItem.place || 'Wilayah Episentrum Gempa NTT')
                : (rawItem.alamat || rawItem.kecamatan || (rawItem.kab_kota ? `Kab. ${rawItem.kab_kota}` : '') || (rawItem.nama_desa ? `Desa ${rawItem.nama_desa}, Kec. ${rawItem.kecamatan || ''}` : '')),
              lat,
              lng,
              distance: isEarthquake ? (rawItem.distKm || (distKm > 0.05 ? Number(distKm.toFixed(1)) : 0)) : (distKm > 0.05 ? Number(distKm.toFixed(1)) : 0),
              isTerdampak,
              dampakInfo: isTerdampak ? {
                rusak_berat: Number(rawItem.rusak_berat || 0),
                rusak_sedang: Number(rawItem.rusak_sedang || 0),
                rusak_ringan: Number(rawItem.rusak_ringan || 0),
                kondisi_faskes: rawItem.kondisi_faskes || rawItem.kondisi || '',
                fungsi_pelayanan: rawItem.fungsi_pelayanan || rawItem.fungsi || '',
                jenis_faskes: rawItem.jenis_faskes || rawItem.jenis || '',
                status: rawItem.status || ''
              } : undefined,
              details: !isEarthquake ? {
                jenis: rawItem.jenis || rawItem.jenis_faskes || rawItem.jenis_pos || (itemType === 'tck' ? 'Relawan TCK Kemkes RI' : undefined),
                operasional: rawItem.operasional || rawItem.status_operasional || 'Operasional Normal',
                dokter: rawItem.dokter,
                perawat: rawItem.perawat,
                kapasitas: rawItem.kapasitas || rawItem.tt_tersedia,
                ambulans: rawItem.ambulans,
                pengungsi_jiwa: rawItem.jml_pengungsi || rawItem.jiwa,
                kontak: rawItem.telepon || rawItem.kontak || rawItem.pj_kontak || rawItem.nomor_telp,
                golongan: rawItem.golongan,
                spesifikasi: rawItem.spesifikasi,
                organisasi: rawItem.organisasi,
                nama_tim_emt: rawItem.nama_tim_emt,
                pekerjaan: rawItem.pekerjaan,
                nomor_telp: rawItem.nomor_telp
              } : undefined,
              earthquakeInfo: isEarthquake ? {
                magnitude: Number(rawItem.magnitude || 0),
                depth: Number(rawItem.depth || 10),
                place: rawItem.place || 'Wilayah Episentrum NTT',
                time: rawItem.time || '',
                dateStr: rawItem.dateStr || '',
                dateLabel: rawItem.dateLabel || '',
                isMainshock: !!rawItem.isMainshock,
                mmi: rawItem.mmi,
                tsunami: rawItem.tsunami,
                distKm: rawItem.distKm,
                source: 'Katalog Seismik Global USGS & BMKG TEWS'
              } : undefined,
              x,
              y
            })
            // NOTE: Routing is triggered only when user clicks "Rute Taktis" button in popup
          }

          setMarkerPopup(null)
          setActivePopup(null)
          return
        }
      }

      // 2. Check marker pin (highest priority on main dashboard)
      const markerFeature = map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => f,
        { layerFilter: (l) => l === markerLayerRef.current }
      )
      if (markerFeature) {
        const data = markerFeature.get('markerData') as MarkerData

        // Calculate pixel position relative to map container
        const container = mapContainerRef.current
        if (container && mapRef.current) {
          const rect = container.getBoundingClientRect()
          const mapRect = mapRef.current.getBoundingClientRect()
          const x = evt.pixel[0] + (mapRect.left - rect.left)
          const y = evt.pixel[1] + (mapRect.top - rect.top)
          setMarkerPopup({ data, x, y })
        }

        setEocPopup(null)
        setActivePopup(null)
        return
      }

      // 3. Check polygon features
      const polyFeature = map.forEachFeatureAtPixel(evt.pixel, (f) => f)

      if (!polyFeature) {
        setActivePopup(null)
        setMarkerPopup(null)
        setEocPopup(null)
        return
      }

      setMarkerPopup(null)
      setEocPopup(null)

      const currentScope = userScopeRef.current
      const isProvMode = currentScope?.mode === 'provinsi'
      const isKabMode = currentScope?.mode === 'kabupaten'

      if (!isProvMode && !isKabMode) {
        // National mode → clicked province
        const provName = getFeatureName(polyFeature, 'provinsi')
        if (!provName) return

        const provCleaned = cleanKey(provName)
        const provMarkers = markersRef.current.filter((m) => cleanKey(m.provinsi) === provCleaned)
        const extent = polyFeature.getGeometry()?.getExtent()

        // Smoothly zoom/fit to the clicked province
        if (extent) {
          map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 600 })
        }

        // Group by kabupaten
        const kabMap = new Map<string, { count: number; totalKorban: number }>()
        provMarkers.forEach((m) => {
          const kab = m.kabupaten || 'LAINNYA'
          const existing = kabMap.get(kab) || { count: 0, totalKorban: 0 }
          existing.count++
          existing.totalKorban += m.total_korban || 0
          kabMap.set(kab, existing)
        })

        const breakdown = Array.from(kabMap.entries())
          .map(([name, s]) => ({ name, count: s.count, totalKorban: s.totalKorban }))
          .sort((a, b) => b.count - a.count)

        setActivePopup({
          type: 'provinsi',
          name: provName,
          featureExtent: extent,
          warnings: warningsByProvince.get(provCleaned) || [],
          stats: {
            totalEvents: provMarkers.length,
            totalKorban: provMarkers.reduce((s, m) => s + (m.total_korban || 0), 0),
            breakdown,
          },
        })
      } else {
        // Province/kabupaten mode → clicked kabupaten
        const kabName = getFeatureName(polyFeature, 'kabupaten')
        if (!kabName) return

        const kabCleaned = cleanKey(kabName)
        const extent = polyFeature.getGeometry()?.getExtent()

        // Auto zoom/focus smoothly to clicked kabupaten
        if (extent) {
          map.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 600 })
        }

        const kabMarkers = markersRef.current.filter((m) => cleanKey(m.kabupaten) === kabCleaned || cleanKey(m.nama_kab) === kabCleaned)

        const allFaskes = [...(faskesListRef.current || []), ...(faskesRusakListRef.current || [])]
        const kabFaskes = allFaskes.filter((f: any) => {
          const k1 = cleanKey(f.kabupaten)
          const k2 = cleanKey(f.kab_kota)
          const k3 = cleanKey(f.alamat)
          const k4 = cleanKey(f.nama || f.nama_faskes)
          const k5 = cleanKey(f.desa)
          return k1 === kabCleaned || k2 === kabCleaned || k3.includes(kabCleaned) || k4.includes(kabCleaned) || k5.includes(kabCleaned)
        })

        const allPosko = poskoListRef.current || []
        const kabPosko = allPosko.filter((p: any) => {
          const k1 = cleanKey(p.kabupaten)
          const k2 = cleanKey(p.lokasi_spesifik)
          const k3 = cleanKey(p.nama || p.nama_pos)
          return k1 === kabCleaned || k2.includes(kabCleaned) || k3.includes(kabCleaned)
        })

        const allLokasi = lokasiListRef.current || []
        const kabLokasi = allLokasi.filter((l: any) => cleanKey(l.kabupaten) === kabCleaned)

        // NTT Collector Dataset lookup
        let nttData: any = null
        if (Array.isArray(nttSituasiRef.current) && nttSituasiRef.current.length > 0) {
          nttData = nttSituasiRef.current.find((item: any) => cleanKey(item.kabupaten) === kabCleaned)
        }

        const meninggal = nttData ? Number(nttData.meninggal || 0) : kabMarkers.reduce((s, m) => s + (m.meninggal || 0), 0)
        const lukaBerat = nttData ? Number(nttData.luka_berat || 0) : kabMarkers.reduce((s, m) => s + (m.luka_berat || 0), 0)
        const lukaRingan = nttData ? Number(nttData.luka_ringan || 0) : kabMarkers.reduce((s, m) => s + (m.luka_ringan || 0), 0)
        const totalLuka = nttData ? (lukaBerat + lukaRingan) : (kabMarkers.reduce((s, m) => s + (m.luka_berat || 0) + (m.luka_ringan || 0), 0) || kabMarkers.reduce((s, m) => s + (m.total_korban || 0), 0))
        const pengungsi = nttData ? Number(nttData.pengungsi || 0) : (kabPosko.reduce((s: number, p: any) => s + Number(p.jumlah_jiwa || p.jiwa || 0), 0) || kabMarkers.reduce((s, m) => s + (m.pengungsi || 0), 0))
        const titikPosko = nttData ? Number(nttData.titik_pengungsian || 0) : kabPosko.length
        const populasiTerdampak = nttData ? Number(nttData.populasi_terdampak || 0) : kabMarkers.reduce((s, m) => s + (m.terdampak || 0), 0)

        setActivePopup({
          type: 'kabupaten',
          name: kabName,
          featureExtent: extent,
          stats: {
            totalEvents: kabMarkers.length || (nttData ? 1 : 0),
            totalKorban: (meninggal + totalLuka) || kabMarkers.reduce((s, m) => s + (m.total_korban || 0), 0),
            meninggal,
            lukaBerat,
            lukaRingan,
            totalLuka,
            pengungsi,
            titikPosko,
            populasiTerdampak,
            faskesCount: kabFaskes.length,
            poskoCount: kabPosko.length || titikPosko,
            breakdown: [],
            eventsList: kabMarkers,
            faskesList: kabFaskes,
            poskoList: kabPosko,
            lokasiList: kabLokasi,
          },
        })
      }
    })

    mapInstanceRef.current = map
    setMapInstance(map)

    // Setup Windy Layer via npm ol-wind (async fetch GFS data)
    async function initWindy() {
      try {
        const res = await fetch('/api/gfs')
        if (!res.ok) return
        const windData = await res.json()
        const baseVelocity = 0.01
        const windLayer = new WindLayer(windData as any, {
          windOptions: {
            velocityScale: baseVelocity,
            paths: 1000,
            colorScale: [
              'rgb(15,60,140)',
              'rgb(30,100,155)',
              'rgb(70,150,145)',
              'rgb(85,160,115)',
              'rgb(130,180,110)',
              'rgb(175,200,140)',
              'rgb(215,195,60)',
              'rgb(205,160,45)',
              'rgb(210,125,35)',
              'rgb(200,95,20)',
              'rgb(195,70,15)',
              'rgb(185,35,10)',
              'rgb(170,18,8)',
              'rgb(155,8,12)',
              'rgb(115,0,18)',
            ],
            lineWidth: 2,
            generateParticleOption: true,
          },
          fieldOptions: { wrapX: true },
        } as any)
        // Default: sesuaikan dengan showWindyRef (false by default)
        const isWindActive = showWindyRef.current
        ; (windLayer as any).setVisible?.(isWindActive)
        try {
          if (isWindActive && typeof (windLayer as any).start === 'function') {
            ; (windLayer as any).start()
          }
        } catch { }
        map.addLayer(windLayer as any)
        windLayerRef.current = windLayer as any
      } catch (err) {
        console.warn('[DisasterMap] Windy Layer load error (optional):', err)
      }
    }
    void initWindy()

    return () => {
      map.setTarget(undefined)
      mapInstanceRef.current = null
      pulseOverlaysRef.current.forEach((ov) => map.removeOverlay(ov))
      pulseOverlaysRef.current = []
      setMapInstance(null)

      // Destroy Windy Layer safely
      if (windLayerRef.current) {
        destroyWindLayerSafely(windLayerRef.current)
        windLayerRef.current = null
      }

      bnpbAdminLayerRef.current = null
      bnpbHillshadeLayerRef.current = null
      bnpbKepadatanLayerRef.current = null
      bnpbBanjirLayerRef.current = null
      bnpbGempaLayerRef.current = null
      bnpbLongsorLayerRef.current = null
      bnpbKarhutlaLayerRef.current = null
      provinceLayerRef.current = null
      kabupatenLayerRef.current = null
      markerLayerRef.current = null
      eocLayerRef.current = null
    }
  }, [])

  // ── Sync Basemap and GeoJSON Layer states ──
  useEffect(() => {
    const baseMapLayer = baseMapLayerRef.current
    const provinceLayer = provinceLayerRef.current
    const kabupatenLayer = kabupatenLayerRef.current

    if (baseMapLayer) {
      baseMapLayer.setVisible(showBaseMap)
    }

    if (provinceLayer && kabupatenLayer) {
      provinceLayer.setVisible(showGeoJson)
      kabupatenLayer.setVisible(showGeoJson)

      if (showBaseMap && showGeoJson) {
        provinceLayer.setOpacity(0.85)
        kabupatenLayer.setOpacity(0.85)
      } else {
        provinceLayer.setOpacity(1.0)
        kabupatenLayer.setOpacity(1.0)
      }
    }
  }, [showBaseMap, showGeoJson])

  // ── Sync BNPB Layers state ──
  useEffect(() => {
    if (bnpbAdminLayerRef.current) bnpbAdminLayerRef.current.setVisible(showBnpbAdmin)
    if (bnpbHillshadeLayerRef.current) bnpbHillshadeLayerRef.current.setVisible(showBnpbHillshade)
    if (bnpbKepadatanLayerRef.current) bnpbKepadatanLayerRef.current.setVisible(showBnpbKepadatan)
    if (bnpbBanjirLayerRef.current) bnpbBanjirLayerRef.current.setVisible(showBnpbBanjir)
    if (bnpbGempaLayerRef.current) bnpbGempaLayerRef.current.setVisible(showBnpbGempa)
    if (bnpbLongsorLayerRef.current) bnpbLongsorLayerRef.current.setVisible(showBnpbLongsor)
    if (bnpbKarhutlaLayerRef.current) bnpbKarhutlaLayerRef.current.setVisible(showBnpbKarhutla)
  }, [showBnpbAdmin, showBnpbHillshade, showBnpbKepadatan, showBnpbBanjir, showBnpbGempa, showBnpbLongsor, showBnpbKarhutla])

  // ── Sync Windy Layer state ──
  useEffect(() => {
    const wl = windLayerRef.current
    if (wl) {
      wl.setVisible(showWindy)
      try {
        if (showWindy) {
          if (typeof wl.start === 'function') {
            wl.start()
          }
        } else {
          if (typeof wl.stop === 'function') {
            wl.stop()
          }
        }
      } catch (e) { }
      // Force refresh map
      try {
        mapInstance?.renderSync?.()
      } catch { }
    }
  }, [showWindy, mapInstance])


  // Helper untuk update style choropleth layer secara konsisten
  const updateChoroplethStyles = useCallback(() => {
    const provinceLayer = provinceLayerRef.current
    const kabupatenLayer = kabupatenLayerRef.current
    if (!provinceLayer || !kabupatenLayer) return

    const isProvMode = userScope?.mode === 'provinsi'
    const isKabMode = userScope?.mode === 'kabupaten'
    const targetProvKey = cleanKey(userScope?.provinsi?.label || '')
    const targetKabKey = cleanKey(userScope?.kabupaten?.label || '')

    provinceLayer.setStyle((feature: any) => {
      const provKey = cleanKey(getFeatureName(feature, 'provinsi'))
      const count = provinceCounts.get(provKey) || 0

      // Multi-wilayah terpilih via Smart Search Bar
      if (selectedRegions && selectedRegions.length > 0) {
        const isSelectedProv = selectedProvKeys.some(
          (k) => k && (provKey.includes(k) || k.includes(provKey) || (provKey.includes('jakarta') && k.includes('jakarta')) || (provKey.includes('yogyakarta') && k.includes('yogyakarta')))
        )
        if (isSelectedProv) {
          return new Style({
            fill: new Fill({ color: choroplethColor(count, 0.75) }),
            stroke: new Stroke({ color: '#0f766e', width: 2.8 }),
          })
        }
        // Wilayah non-terpilih: Choropleth berskala lebih redup agar persebaran tetap terlihat
        return new Style({
          fill: new Fill({ color: choroplethColor(count, 0.25) }),
          stroke: new Stroke({ color: 'rgba(100, 116, 139, 0.75)', width: 1.0 }),
        })
      }

      if ((isProvMode || isKabMode) && targetProvKey) {
        // Selected province → outline tegas transparan agar layer kabupaten di dalamnya terlihat
        if (provKey === targetProvKey) {
          return new Style({
            fill: new Fill({ color: 'rgba(0,0,0,0)' }),
            stroke: new Stroke({ color: '#9333ea', width: 3.0 })
          })
        }
        // Provinsi lain di-hide / diarsir disabled halus agar peta terfokus
        return new Style({
          fill: new Fill({ color: 'rgba(241, 245, 249, 0.4)' }),
          stroke: new Stroke({ color: 'rgba(148, 163, 184, 0.35)', width: 0.8 })
        })
      }

      // National choropleth style
      const provWarnings = warningsByProvince.get(provKey)
      const hasWarning = !!(provWarnings && provWarnings.length > 0)
      return choroplethStyle(count, hasWarning, count > 0 ? String(count) : undefined)
    })

    kabupatenLayer.setStyle((feature: any) => {
      const kabKey = cleanKey(getFeatureName(feature, 'kabupaten'))
      const rawName = getFeatureName(feature, 'kabupaten')
      const formattedName = rawName.replace(/^(KABUPATEN|KAB|KOTA)\s+/i, '').trim()

      if (selectedRegions && selectedRegions.length > 0 && selectedKabKeys.length > 0) {
        const isSelectedKab = selectedKabKeys.some(
          (k) => k && (kabKey.includes(k) || k.includes(kabKey))
        )
        if (isSelectedKab) {
          const polyStyle = new Style({
            fill: new Fill({ color: 'rgba(37, 99, 235, 0.45)' }),
            stroke: new Stroke({ color: '#1d4ed8', width: 2.8 }),
          })
          const textStyle = new Style({
            geometry: (f: any) => getLargestPolygonInteriorPoint(f),
            text: new OlText({
              text: formattedName,
              font: 'bold 11px Inter, sans-serif',
              fill: new Fill({ color: '#0f172a' }),
              stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
              overflow: false
            })
          })
          return [polyStyle, textStyle]
        }
      }

      // Mode Provinsi atau Kabupaten → Batas ungu tegas & Label nama tepat 1 kali per kabupaten pada daratan utama
      if ((isProvMode || isKabMode) && targetProvKey) {
        const isTargetKab = isKabMode && targetKabKey && kabKey === targetKabKey
        const polyStyle = new Style({
          fill: new Fill({ color: isTargetKab ? 'rgba(254, 240, 138, 0.35)' : 'rgba(254, 240, 138, 0.18)' }),
          stroke: new Stroke({ color: isTargetKab ? '#9333ea' : '#a855f7', width: isTargetKab ? 3.2 : 2.6 }),
        })
        const textStyle = new Style({
          geometry: (f: any) => getLargestPolygonInteriorPoint(f),
          text: new OlText({
            text: formattedName,
            font: 'bold 11px Inter, sans-serif',
            fill: new Fill({ color: '#1e293b' }),
            stroke: new Stroke({ color: '#ffffff', width: 3.5 }),
            overflow: false
          })
        })
        return [polyStyle, textStyle]
      }

      const count = kabupatenCounts.get(kabKey) || 0
      return choroplethStyle(count)
    })

    provinceLayer.changed()
    kabupatenLayer.changed()
  }, [userScope, provinceCounts, kabupatenCounts, warningsByProvince, selectedRegions, selectedProvKeys, selectedKabKeys])

  useEffect(() => {
    updateChoroplethStyles()
  }, [updateChoroplethStyles])

  // ─────────────────────────────────────────────
  // Load Province GeoJSON (once)
  // ─────────────────────────────────────────────

  useEffect(() => {
    const map = mapInstance
    const provinceLayer = provinceLayerRef.current
    if (!map || !provinceLayer) return

    const source = provinceLayer.getSource()!
    if (source.getFeatures().length > 0) {
      updateChoroplethStyles()
      return  // already loaded
    }

    const cacheKey = 'level_provinsi'
    const load = (geojson: any) => {
      const features = new GeoJSON().readFeatures(geojson, {
        dataProjection: 'EPSG:4326',
        featureProjection: map.getView().getProjection(),
      })
      source.addFeatures(features)
      updateChoroplethStyles()
    }

    if (geojsonCache[cacheKey]) {
      load(geojsonCache[cacheKey])
    } else {
      setIsLoading(true)
      fetch(`${NEXT_BASE_PATH}/api/wilayah-geojson?level=provinsi`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.success && data.geojson) {
            geojsonCache[cacheKey] = data.geojson
            load(data.geojson)
          } else {
            console.error('GeoJSON provinsi tidak tersedia dari API')
          }
        })
        .catch(() => {
          console.error('GeoJSON provinsi gagal dimuat dari API')
        })
        .finally(() => setIsLoading(false))
    }
  }, [mapInstance, updateChoroplethStyles])

  // ─────────────────────────────────────────────
  // Load/Clear Kabupaten GeoJSON based on scope
  // ─────────────────────────────────────────────

  useEffect(() => {
    const map = mapInstance
    const kabupatenLayer = kabupatenLayerRef.current
    if (!map || !kabupatenLayer) return

    const kabSource = kabupatenLayer.getSource()!
    const isProvMode = userScope?.mode === 'provinsi'
    const isKabMode = userScope?.mode === 'kabupaten'
    const provinceName = userScope?.provinsi?.label || ''
    const kabupatenName = userScope?.kabupaten?.label || ''
    const scopeKey = `${userScope?.mode}_${provinceName}_${kabupatenName}`

    if ((isProvMode || isKabMode) && provinceName) {
      const focusMap = (features: any[]) => {
        const extent = kabSource.getExtent()
        if (extent && features.length > 0) {
          map.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 500 })
        }
      }

      if (lastFetchedProvinceRef.current !== provinceName) {
        lastFetchedProvinceRef.current = provinceName
        const cacheKey = `level_kabupaten_${provinceName}`
        const load = (geojson: any) => {
          kabSource.clear()
          const features = new GeoJSON().readFeatures(geojson, {
            dataProjection: 'EPSG:4326',
            featureProjection: map.getView().getProjection(),
          })
          kabSource.addFeatures(features)
          updateChoroplethStyles()
          if (lastScopeKeyRef.current !== scopeKey) {
            lastScopeKeyRef.current = scopeKey
            focusMap(features)
          }
        }

        if (geojsonCache[cacheKey]) {
          load(geojsonCache[cacheKey])
        } else {
          setIsLoading(true)
          fetch(`/api/wilayah-geojson?level=kabupaten&province=${encodeURIComponent(provinceName)}`)
            .then((r) => r.json())
            .then((data) => {
              if (data?.success && data.geojson) {
                geojsonCache[cacheKey] = data.geojson
                load(data.geojson)
              }
            })
            .catch((e) => {
              console.error('GeoJSON kabupaten gagal:', e)
            })
            .finally(() => setIsLoading(false))
        }
      } else {
        updateChoroplethStyles()
        if (lastScopeKeyRef.current !== scopeKey) {
          lastScopeKeyRef.current = scopeKey
          focusMap(kabSource.getFeatures())
        }
      }
    } else {
      lastFetchedProvinceRef.current = null
      kabSource.clear()
      updateChoroplethStyles()
      if (lastScopeKeyRef.current !== scopeKey) {
        lastScopeKeyRef.current = scopeKey
        map.getView().animate({ center: fromLonLat([118, -2.5]), zoom: 4.8, duration: 500 })
      }
    }
  }, [mapInstance, userScope?.mode, userScope?.provinsi?.label, userScope?.kabupaten?.label, updateChoroplethStyles])

  // ─────────────────────────────────────────────
  // Re-style choropleth & multi-region layers when data/selectedRegions changes
  // ─────────────────────────────────────────────

  useEffect(() => {
    updateChoroplethStyles()
  }, [updateChoroplethStyles])

  // Auto-fit map extent saat wilayah terpilih berubah
  useEffect(() => {
    const map = mapInstance
    const provinceLayer = provinceLayerRef.current
    if (!map || !provinceLayer || !selectedRegions || selectedRegions.length === 0) return

    const source = provinceLayer.getSource()
    if (!source) return

    const features = source.getFeatures()
    if (!features || features.length === 0) return

    const matchedFeatures: any[] = []
    features.forEach((f: any) => {
      const provKey = cleanKey(getFeatureName(f, 'provinsi'))
      const isMatch = selectedProvKeys.some(
        (k) => k && (provKey.includes(k) || k.includes(provKey) || (provKey.includes('jakarta') && k.includes('jakarta')) || (provKey.includes('yogyakarta') && k.includes('yogyakarta')))
      )
      if (isMatch) matchedFeatures.push(f)
    })

    if (matchedFeatures.length > 0) {
      const extents = matchedFeatures.map((f: any) => f.getGeometry().getExtent())
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      extents.forEach((e: any) => {
        if (e[0] < minX) minX = e[0]
        if (e[1] < minY) minY = e[1]
        if (e[2] > maxX) maxX = e[2]
        if (e[3] > maxY) maxY = e[3]
      })

      if (minX !== Infinity && maxX !== -Infinity) {
        map.getView().fit([minX, minY, maxX, maxY], { padding: [60, 60, 60, 60], duration: 600 })
      }
    }
  }, [mapInstance, selectedRegions, selectedProvKeys])

  // ── BMKG Data Fetch & Proximity Alert EWS ──
  useEffect(() => {
    let active = true
    async function fetchBmkg() {
      try {
        const res = await fetch('/api/bmkg-gempa')
        if (res.ok) {
          const json = await res.json()
          if (json.success && json.data?.Infogempa?.gempa) {
            const rawList = json.data.Infogempa.gempa
            const list = Array.isArray(rawList) ? rawList : [rawList]

            if (active) {
              setBmkgGempas(list)

              const latest = list[0]
              if (latest && latest.Coordinates) {
                const [latStr, lngStr] = latest.Coordinates.split(',')
                const gempaLat = parseFloat(latStr)
                const gempaLng = parseFloat(lngStr)

                const savedCoords = localStorage.getItem('user_coords')
                if (savedCoords) {
                  try {
                    const userCoords = JSON.parse(savedCoords)
                    if (userCoords && typeof userCoords.lat === 'number' && typeof userCoords.lng === 'number') {
                      const dist = getDistanceInKm(userCoords.lat, userCoords.lng, gempaLat, gempaLng)

                      // EWS Trigger: within 150 km and magnitude >= 5.0
                      if (dist <= 150 && parseFloat(latest.Magnitude) >= 5.0) {
                        setActiveBmkgAlert({
                          gempa: latest,
                          distance: Math.round(dist)
                        })

                        if (typeof window !== 'undefined') {
                          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
                          if (AudioContextClass) {
                            const ctx = new AudioContextClass()
                            const osc = ctx.createOscillator()
                            const gain = ctx.createGain()
                            osc.connect(gain)
                            gain.connect(ctx.destination)
                            osc.type = 'sawtooth'
                            osc.frequency.setValueAtTime(500, ctx.currentTime)
                            osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.4)
                            osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.8)
                            gain.gain.setValueAtTime(0.3, ctx.currentTime)
                            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2)
                            osc.start()
                            osc.stop(ctx.currentTime + 1.2)
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.error('[BMKG EWS] Coordinates parse error:', e)
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('[BMKG EWS] Failed to fetch data:', e)
      }
    }

    void fetchBmkg()
    const interval = setInterval(fetchBmkg, 120000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  // ─────────────────────────────────────────────
  // Sync marker features when markers/visibility changes
  // ─────────────────────────────────────────────

  useEffect(() => {
    const markerLayer = markerLayerRef.current
    if (!markerLayer) return

    const source = markerLayer.getSource()!
    source.clear()

    if (!showMarkers || isFloodEocMode) {
      markerLayer.setVisible(false)
      const map = mapInstanceRef.current
      if (map) {
        pulseOverlaysRef.current.forEach((ov) => map.removeOverlay(ov))
        pulseOverlaysRef.current = []
      }
      return
    }

    markerLayer.setVisible(true)

    const validMarkers = filteredMarkers.filter((m) => m.lat && m.lng && m.lat !== 0 && m.lng !== 0)
    const features: Feature<any>[] = validMarkers.map((m) => {
      const feature = new Feature({
        geometry: new Point(fromLonLat([m.lng, m.lat])),
        markerData: m,
      })
      feature.setStyle(markerStyle(m.icon_file, m.total_korban))
      return feature
    })

    // Clear old pulse overlays
    const map = mapInstanceRef.current
    if (map) {
      pulseOverlaysRef.current.forEach((ov) => map.removeOverlay(ov))
      pulseOverlaysRef.current = []
    }

    // Draw proximity EWS warning circles if enabled
    if (showEwsPulse) {
      let userCoords: { lat: number; lng: number } | null = null
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('user_coords')
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
              userCoords = parsed
            }
          } catch (e) {
            console.error('[EWS Map Circle] Failed to parse coordinates:', e)
          }
        }
      }

      validMarkers.forEach((m) => {
        if (m.lat && m.lng && (m.total_korban > 0 || m.jenis_bencana)) {
          let drawRadius: number | null = null
          let fillColor = 'rgba(239, 68, 68, 0.04)'
          let strokeColor = 'rgba(239, 68, 68, 0.25)'
          let isNear = false
          let nearType: 'danger' | 'warning' = 'warning'

          if (userCoords) {
            const mLat = Number(m.lat)
            const mLng = Number(m.lng)
            const dist = getDistanceInKm(userCoords.lat, userCoords.lng, mLat, mLng)

            if (dist <= 25) {
              // Dalam 25km: peringatan bahaya dekat (lingkaran 25km radius merah)
              drawRadius = 25000
              fillColor = 'rgba(239, 68, 68, 0.08)'
              strokeColor = 'rgba(239, 68, 68, 0.45)'
              isNear = true
              nearType = 'danger'
            } else if (dist <= 50) {
              // Dalam 50km: peringatan waspada (lingkaran 50km radius oranye)
              drawRadius = 50000
              fillColor = 'rgba(245, 158, 11, 0.05)'
              strokeColor = 'rgba(245, 158, 11, 0.35)'
              isNear = true
              nearType = 'warning'
            }
          }

          if (drawRadius !== null) {
            const circleFeature = new Feature({
              geometry: new CircleGeom(fromLonLat([m.lng, m.lat]), drawRadius),
            })
            circleFeature.setStyle(new Style({
              fill: new Fill({ color: fillColor }),
              stroke: new Stroke({ color: strokeColor, width: 1.2, lineDash: [4, 4] })
            }))
            features.push(circleFeature)

            // Dynamic pulsing radar ring for dangerous proximity events!
            if (isNear) {
              createPulseOverlay(m.lng, m.lat, nearType)
            }
          }
        }
      })

      // Fallback pulse overlay for the latest disaster if user location is not set yet
      if (!userCoords && validMarkers.length > 0) {
        const sorted = [...validMarkers].sort((a, b) => {
          const dateA = a.tgl_kejadian ? new Date(a.tgl_kejadian.replace(/\s*WIB/gi, '').trim()).getTime() : 0
          const dateB = b.tgl_kejadian ? new Date(b.tgl_kejadian.replace(/\s*WIB/gi, '').trim()).getTime() : 0
          return dateB - dateA
        })
        const latest = sorted[0]
        if (latest && latest.lat && latest.lng) {
          createPulseOverlay(latest.lng, latest.lat, 'danger')
        }
      }
    }

    // Add User Current GPS Location blue pin
    if (typeof window !== 'undefined') {
      const savedCoords = localStorage.getItem('user_coords')
      if (savedCoords) {
        try {
          const userCoords = JSON.parse(savedCoords)
          if (userCoords && typeof userCoords.lat === 'number' && typeof userCoords.lng === 'number') {
            const userFeature = new Feature({
              geometry: new Point(fromLonLat([userCoords.lng, userCoords.lat])),
              markerData: {
                kode_trans: 'user-location',
                jenis_bencana: 'Lokasi Saya',
                provinsi: '',
                kabupaten: localStorage.getItem('user_coords_name') || 'Saya Berada di Sini',
                total_korban: 0,
                lat: userCoords.lat,
                lng: userCoords.lng
              }
            })
            userFeature.setStyle(new Style({
              image: new CircleStyle({
                radius: 8,
                fill: new Fill({ color: '#2563eb' }),
                stroke: new Stroke({ color: '#ffffff', width: 2 })
              })
            }))
            features.push(userFeature)
          }
        } catch (e) {
          console.error('[DisasterMap] Failed to parse user coords:', e)
        }
      }
    }

    // Add BMKG Gempa Terkini Layer
    if (showBmkg && bmkgGempas.length > 0) {
      bmkgGempas.forEach((g) => {
        if (g.Coordinates) {
          const [latStr, lngStr] = g.Coordinates.split(',')
          const glat = parseFloat(latStr)
          const glng = parseFloat(lngStr)
          if (!isNaN(glat) && !isNaN(glng)) {
            const gempaFeature = new Feature({
              geometry: new Point(fromLonLat([glng, glat])),
              markerData: {
                kode_trans: `bmkg-${g.DateTime}`,
                jenis_bencana: `Gempa M ${g.Magnitude}`,
                provinsi: g.Potensi,
                kabupaten: `${g.Wilayah} (Kedalaman ${g.Kedalaman})`,
                total_korban: 0,
                lat: glat,
                lng: glng
              }
            })
            gempaFeature.setStyle(new Style({
              image: new CircleStyle({
                radius: 8,
                fill: new Fill({ color: '#f97316' }),
                stroke: new Stroke({ color: '#ffffff', width: 2 })
              })
            }))
            features.push(gempaFeature)

            if (showEwsPulse) {
              const warningCircle = new Feature({
                geometry: new CircleGeom(fromLonLat([glng, glat]), 50000) // 50km radius
              })
              warningCircle.setStyle(new Style({
                fill: new Fill({ color: 'rgba(249, 115, 22, 0.04)' }),
                stroke: new Stroke({ color: 'rgba(249, 115, 22, 0.3)', width: 1.2, lineDash: [3, 3] })
              }))
              features.push(warningCircle)

              // Dynamic pulse overlay for BMKG earthquakes (M >= 5.0)
              const mag = parseFloat(g.Magnitude)
              if (mag >= 5.0) {
                createPulseOverlay(glng, glat, 'gempa')
              }
            }
          }
        }
      })
    }

    source.addFeatures(features)

  }, [filteredMarkers, showMarkers, showBmkg, bmkgGempas, showEwsPulse, createPulseOverlay])

  // ── Sync EOC Routing & Faskes Layer ──
  useEffect(() => {
    const eocLayer = eocLayerRef.current
    if (!eocLayer) return

    const map = mapInstanceRef.current || mapInstance
    if (!map) return

    const source = eocLayer.getSource()!
    source.clear()

    if (!isFloodEocMode || !showEocRoute) {
      eocLayer.setVisible(false)
      return
    }

    eocLayer.setVisible(true)

    // Start coordinates (center of disaster or kabupaten)
    const firstMarker = markers && markers[0]
    const startLat = firstMarker ? firstMarker.lat : 1.6833
    const startLng = firstMarker ? firstMarker.lng : 98.8472

    const getSvgPin = (color: string, iconType: 'flood' | 'gempa' | 'hospital' | 'clinic' | 'pustu' | 'shelter' | 'disaster' | 'tck' | 'earthquake') => {
      let inner = '<circle cx="12" cy="10" r="3" fill="' + color + '"/>'
      if (iconType === 'hospital') {
        inner = '<path d="M12 6v8M8 10h8" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/><path d="M9 18h6" stroke="#ffffff" stroke-width="1.8"/>'
      } else if (iconType === 'clinic') {
        inner = '<path d="M12 6.5v7M8.5 10h7" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>'
      } else if (iconType === 'pustu') {
        inner = '<path d="M12 7v6M9 10h6" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>'
      } else if (iconType === 'shelter') {
        inner = '<path d="M12 6l5 4.5v5.5H7v-5.5l5-4.5z" stroke="#ffffff" stroke-width="2" fill="rgba(255,255,255,0.2)"/>'
      } else if (iconType === 'tck') {
        // Tenaga Cadangan Kesehatan (TCK) - Dokter / Personil Medis Siaga
        inner = '<circle cx="12" cy="7.2" r="2.8" fill="#ffffff"/><path d="M6.5 16c0-2.8 2.5-4.8 5.5-4.8s5.5 2 5.5 4.8" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M12 12v3.2M10.4 13.6h3.2" stroke="' + color + '" stroke-width="1.3" stroke-linecap="round"/>'
      } else if (iconType === 'flood' || iconType === 'gempa' || iconType === 'disaster') {
        inner = '<circle cx="12" cy="10" r="3.5" fill="#ffffff"/><circle cx="12" cy="10" r="1.5" fill="' + color + '"/>'
      } else if (iconType === 'earthquake') {
        inner = '<circle cx="12" cy="10" r="4.5" fill="#ffffff"/><path d="M12 6.5l-2 3.5h2l-1.5 3.5 3.5-4h-2l1.5-3z" fill="' + color + '"/>'
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="34" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" fill="${color}" opacity="0.95"/>${inner}</svg>`
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
    }

    const getSvgMainshockPin = (mag: number) => {
      const magText = mag > 0 ? (mag >= 10 ? mag.toFixed(0) : mag.toFixed(1)) : '7.4'
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="54" viewBox="0 0 46 54" fill="none">
        <circle cx="23" cy="20" r="19" fill="rgba(220, 38, 38, 0.25)" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3 3"/>
        <path d="M23 4C14.16 4 7 11.16 7 20C7 31 23 50 23 50S39 31 39 20C39 11.16 31.84 4 23 4Z" fill="#dc2626" stroke="#ffffff" stroke-width="2.5"/>
        <circle cx="23" cy="20" r="11" fill="#ffffff"/>
        <text x="23" y="24" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="900" fill="#991b1b">M ${magText}</text>
      </svg>`
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
    }

    const getSvgAftershockNode = (mag: number) => {
      if (mag >= 6.0) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="#b91c1c" stroke="#ffffff" stroke-width="2.5"/>
          <text x="12" y="15.5" text-anchor="middle" font-family="system-ui, sans-serif" font-size="8.5" font-weight="900" fill="#ffffff">${mag.toFixed(1)}</text>
        </svg>`
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
      }
      if (mag >= 5.0) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="8" fill="#ea580c" stroke="#ffffff" stroke-width="2"/>
          <text x="10" y="13" text-anchor="middle" font-family="system-ui, sans-serif" font-size="7.5" font-weight="900" fill="#ffffff">${mag.toFixed(1)}</text>
        </svg>`
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
      }
      if (mag >= 4.0) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="5.5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.8"/>
        </svg>`
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" fill="#fbbf24" stroke="#ffffff" stroke-width="1.2"/>
      </svg>`
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
    }

    // 1. Add disaster location pins and pulsing radius circle ONLY on the main epicenter/target
    if (showMarkers) {
      const validDisasterMarkers = Array.isArray(markers) ? markers : []

      validDisasterMarkers.forEach((m: any, idx: number) => {
        if (m.lat && m.lng && Number(m.lat) !== 0 && Number(m.lng) !== 0) {
          const lat = Number(m.lat)
          const lng = Number(m.lng)
          const isEpicenter = !!m.isEpicenter || idx === 0

          // Draw pin marker
          const disasterFeat = new Feature({
            geometry: new Point(fromLonLat([lng, lat])),
            id: `disaster-${idx}`,
            name: m.nama || (m.nama_desa ? `Kec. ${m.kecamatan || ''}, Desa ${m.nama_desa}` : (isEpicenter ? 'Pusat Episentrum Gempa NTT' : `Titik Dampak - ${m.kabupaten || 'Kabupaten'}`)),
            rawItem: m,
            itemType: 'disaster'
          })
          disasterFeat.setStyle(new Style({
            image: new Icon({
              src: getSvgPin(isEpicenter ? '#dc2626' : '#ea580c', 'disaster'),
              scale: isEpicenter ? 1.05 : 0.78,
              anchor: [0.5, 1]
            }),
            zIndex: isEpicenter ? 100 : 50
          }))
          source.addFeature(disasterFeat)

          // Draw concentric impact radius rings on epicenter and radar pulse overlay on all disaster points
          if (isEpicenter) {
            const concentricRings = [
              { km: 5, stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.20)' },
              { km: 15, stroke: '#f97316', fill: 'rgba(249, 115, 22, 0.15)' },
              { km: 35, stroke: '#eab308', fill: 'rgba(234, 179, 8, 0.10)' },
              { km: 60, stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.08)' }
            ]

            concentricRings.forEach((r) => {
              const circleFeat = new Feature({
                geometry: new CircleGeom(fromLonLat([lng, lat]), r.km * 1000),
                id: `pulse-circle-${idx}-${r.km}`
              })
              circleFeat.setStyle(new Style({
                fill: new Fill({ color: r.fill }),
                stroke: new Stroke({
                  color: r.stroke,
                  width: 2.0,
                  lineDash: [6, 6]
                })
              }))
              source.addFeature(circleFeat)
            })

            // Inner core zone for epicenter
            const innerCircle = new Feature({
              geometry: new CircleGeom(fromLonLat([lng, lat]), 2500),
              id: `pulse-inner-${idx}`
            })
            innerCircle.setStyle(new Style({
              fill: new Fill({ color: 'rgba(220, 38, 38, 0.28)' }),
              stroke: new Stroke({ color: 'rgba(185, 28, 28, 0.95)', width: 1.8 })
            }))
            source.addFeature(innerCircle)
          }

          // Trigger radar overlay bip-bip denyut (always active like on TV display)
          createPulseOverlay(lng, lat, isEpicenter ? 'danger' : 'warning')
        }
      })
    }

    // 1.5. Add Real Earthquake Points & Epicenters (from USGS/BMKG API)
    if (showSeismicLayer && Array.isArray(earthquakePoints) && earthquakePoints.length > 0) {
      // Identify mainshock index (highest magnitude or marked isMainshock)
      let mainshockIdx = 0
      let maxMag = -1
      earthquakePoints.forEach((eq: any, i: number) => {
        const m = Number(eq.magnitude || 0)
        if (eq.isMainshock || m > maxMag) {
          maxMag = m
          mainshockIdx = i
        }
      })

      earthquakePoints.forEach((eq: any, idx: number) => {
        const eqLat = Number(eq.lat || 0)
        const eqLng = Number(eq.lng || 0)
        if (eqLat !== 0 && eqLng !== 0) {
          const mag = Number(eq.magnitude || 0)
          const isMain = idx === mainshockIdx

          // Only the Mainshock gets the Primary Isoseismal / Shake Impact Circles (zona guncangan utama)
          if (isMain) {
            const primaryRadiusKm = Math.min(80, Math.max(35, (mag - 3) * 12))
            const shockCircle = new Feature({
              geometry: new CircleGeom(fromLonLat([eqLng, eqLat]), primaryRadiusKm * 1000),
              id: `eq-circle-main`
            })
            shockCircle.setStyle(new Style({
              fill: new Fill({ color: 'rgba(220, 38, 38, 0.07)' }),
              stroke: new Stroke({
                color: 'rgba(220, 38, 38, 0.75)',
                width: 2.2,
                lineDash: [6, 6]
              })
            }))
            source.addFeature(shockCircle)

            // Inner Severe Shaking Zone (MMI VII-VIII)
            const innerRadiusKm = Math.max(15, primaryRadiusKm * 0.45)
            const innerShockCircle = new Feature({
              geometry: new CircleGeom(fromLonLat([eqLng, eqLat]), innerRadiusKm * 1000),
              id: `eq-circle-inner`
            })
            innerShockCircle.setStyle(new Style({
              fill: new Fill({ color: 'rgba(220, 38, 38, 0.12)' }),
              stroke: new Stroke({
                color: '#dc2626',
                width: 1.5
              })
            }))
            source.addFeature(innerShockCircle)

            // Pulse overlay on mainshock epicenter
            createPulseOverlay(eqLng, eqLat, 'danger')
          }

          // Epicenter / Aftershock marker feature
          const eqFeat = new Feature({
            geometry: new Point(fromLonLat([eqLng, eqLat])),
            id: `eq-point-${idx}`,
            name: `${isMain ? '★ Episentrum Gempa Utama' : '⚡ Titik Gempa Susulan'} M ${mag.toFixed(1)} - ${eq.place || 'NTT'}`,
            rawItem: {
              ...eq,
              latitude: eqLat,
              longitude: eqLng
            },
            itemType: 'earthquake'
          })

          if (isMain) {
            eqFeat.setStyle(new Style({
              image: new Icon({
                src: getSvgMainshockPin(mag),
                scale: 1.0,
                anchor: [0.5, 0.92]
              }),
              zIndex: 100
            }))
          } else {
            eqFeat.setStyle(new Style({
              image: new Icon({
                src: getSvgAftershockNode(mag),
                scale: 1.0,
                anchor: [0.5, 0.5]
              }),
              zIndex: Math.round(mag * 10)
            }))
          }

          source.addFeature(eqFeat)
        }
      })
    }

    // 2. Add Faskes List (Filtered by Checkboxes: RS, Puskesmas, Klinik, Pustu, Siaga Only)
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const rawFaskesList = Array.isArray(faskesList) ? faskesList : []
    const hasAnyCategoryChecked = faskesTypeFilters.rs || faskesTypeFilters.puskesmas || faskesTypeFilters.klinik || faskesTypeFilters.pustu

    if (hasAnyCategoryChecked || faskesTypeFilters.siagaOnly) {
      rawFaskesList.forEach((f: any, idx: number) => {
        const fLat = Number(f.latitude || f.lat || 0)
        const fLng = Number(f.longitude || f.lng || 0)
        if (fLat !== 0 && fLng !== 0) {
          // Strict NTT Bounding Box check when in NTT event / provincial mode:
          if (isFloodEocMode) {
            if (fLat < -11.6 || fLat > -7.5 || fLng < 118.5 || fLng > 125.5) {
              return // Skip faskes located outside NTT province
            }
          }

          // Categorize using shared helper for consistency with count display
          const category = categorizeFaskes(f)

          // Patient triage check (merawat pasien bencana)
          const totPasien = Number(f.total_pasien || 0) || (Number(f.triase_merah || 0) + Number(f.triase_kuning || 0) + Number(f.triase_hijau || 0) + Number(f.triase_hitam || 0))
          const hasTriage = totPasien > 0

          // If Siaga Only is active, must have triage patients
          if (faskesTypeFilters.siagaOnly && !hasTriage) return

          // Category filtering:
          if (hasAnyCategoryChecked) {
            if (category === 'rs' && !faskesTypeFilters.rs) return
            if (category === 'puskesmas' && !faskesTypeFilters.puskesmas) return
            if (category === 'klinik' && !faskesTypeFilters.klinik) return
            if (category === 'pustu' && !faskesTypeFilters.pustu) return
          }

          let itemCategory: 'hospital' | 'clinic' | 'pustu' = 'clinic'
          if (category === 'rs') {
            itemCategory = 'hospital'
          } else if (category === 'pustu') {
            itemCategory = 'pustu'
          } else if (category === 'klinik') {
            itemCategory = 'clinic'
          }

          const fFeat = new Feature({
            geometry: new Point(fromLonLat([fLng, fLat])),
            id: f.nama || `faskes-${idx}`,
            name: f.nama || f.nama_faskes,
            rawItem: f,
            itemType: itemCategory
          })

          let faskesIconSrc = `${basePath}/puskes.svg`
          if (category === 'rs') {
            faskesIconSrc = `${basePath}/rs.svg`
          } else if (category === 'puskesmas') {
            faskesIconSrc = `${basePath}/puskes.svg`
          } else if (category === 'klinik') {
            faskesIconSrc = `${basePath}/klinik.svg`
          } else if (category === 'pustu') {
            faskesIconSrc = `${basePath}/pustu.svg`
          }

          fFeat.setStyle(new Style({
            image: new Icon({
              src: faskesIconSrc,
              size: [102.46, 102.46],
              scale: 0.28,
              anchor: [0.5, 0.5]
            })
          }))
          source.addFeature(fFeat)
        }
      })
    }

      // 2b. Add Faskes Terdampak/Rusak (pin merah — dari data inputan RHA)
      const fRusakList = Array.isArray(faskesRusakList) ? faskesRusakList : []
      fRusakList.forEach((f: any, idx: number) => {
        const fLat = Number(f.latitude || f.lat || 0)
        const fLng = Number(f.longitude || f.lng || 0)
        // Only show on map if has coordinates within NTT bounds
        if (fLat !== 0 && fLng !== 0) {
          if (isFloodEocMode) {
            if (fLat < -11.6 || fLat > -7.5 || fLng < 118.5 || fLng > 125.5) {
              return
            }
          }

          // Categorize using shared helper for consistency
          const category = categorizeFaskes(f)

          // Patient triage check
          const totPasien = Number(f.total_pasien || 0) || (Number(f.triase_merah || 0) + Number(f.triase_kuning || 0) + Number(f.triase_hijau || 0) + Number(f.triase_hitam || 0))
          const hasTriage = totPasien > 0

          if (faskesTypeFilters.siagaOnly && !hasTriage) return

          if (hasAnyCategoryChecked) {
            if (category === 'rs' && !faskesTypeFilters.rs) return
            if (category === 'puskesmas' && !faskesTypeFilters.puskesmas) return
            if (category === 'klinik' && !faskesTypeFilters.klinik) return
            if (category === 'pustu' && !faskesTypeFilters.pustu) return
          }

          const hasDamage = Number(f.rusak_berat || 0) > 0 || 
                            Number(f.rusak_sedang || 0) > 0 || 
                            Number(f.rusak_ringan || 0) > 0 || 
                            String(f.kondisi_bangunan || '').toLowerCase().includes('rusak') || 
                            String(f.kondisi_faskes || '').toLowerCase().includes('rusak') ||
                            String(f.status || '').toLowerCase().includes('rusak') ||
                            String(f.status || '').toLowerCase().includes('tutup')
          const fFeat = new Feature({
            geometry: new Point(fromLonLat([fLng, fLat])),
            id: `rusak-${f.nama_faskes || f.nama || idx}`,
            name: f.nama_faskes || f.nama || (hasDamage ? 'Faskes Terdampak' : 'Faskes Siaga'),
            rawItem: { ...f, _isTerdampak: hasDamage },
            itemType: category === 'rs' ? 'hospital' : category === 'pustu' ? 'pustu' : 'clinic'
          })

          let rusakIconSrc = `${basePath}/puskes.svg`
          if (category === 'rs') {
            rusakIconSrc = `${basePath}/rs.svg`
          } else if (category === 'puskesmas') {
            rusakIconSrc = `${basePath}/puskes.svg`
          } else if (category === 'klinik') {
            rusakIconSrc = `${basePath}/klinik.svg`
          } else if (category === 'pustu') {
            rusakIconSrc = `${basePath}/pustu.svg`
          }

          fFeat.setStyle(new Style({
            image: new Icon({
              src: rusakIconSrc,
              size: [102.46, 102.46],
              scale: 0.28,
              anchor: [0.5, 0.5]
            })
          }))
          source.addFeature(fFeat)
        }
      })

    // 3. Add Posko List (if enabled)
    if (showPosko) {
      const pList = Array.isArray(poskoList) ? poskoList : []
      pList.forEach((pos: any, idx: number) => {
        const pLat = Number(pos.latitude || pos.lat || 0)
        const pLng = Number(pos.longitude || pos.lng || 0)
        if (pLat !== 0 && pLng !== 0) {
          if (isFloodEocMode) {
            if (pLat < -11.6 || pLat > -7.5 || pLng < 118.5 || pLng > 125.5) {
              return
            }
          }

          const pFeat = new Feature({
            geometry: new Point(fromLonLat([pLng, pLat])),
            id: pos.nama || `posko-${idx}`,
            name: pos.nama || `Posko ${pos.kecamatan || ''}`,
            rawItem: pos,
            itemType: 'shelter'
          })
          pFeat.setStyle(new Style({
            image: new Icon({
              src: `${basePath}/posyandu.svg`,
              scale: 0.08,
              anchor: [0.5, 0.5]
            })
          }))
          source.addFeature(pFeat)
        }
      })
    }

    // 4. Add TCK Relawan List (if enabled)
    if (showTckLayer) {
      const tList = Array.isArray(tckList) ? tckList : []
      const nttKabCoords: Record<string, [number, number]> = {
        'mangga': [-8.62, 120.46],
        'manggarai timur': [-8.65, 120.57],
        'manggarai barat': [-8.56, 119.98],
        'flores timur': [-8.33, 122.98],
        'lembata': [-8.37, 123.54],
        'sikka': [-8.62, 122.21],
        'ende': [-8.84, 121.65],
        'ngada': [-8.78, 120.97],
        'nagekeo': [-8.70, 121.28],
        'alor': [-8.29, 124.57],
        'timor tengah selatan': [-9.86, 124.28],
        'kupang': [-10.17, 123.60]
      }

      tList.forEach((tck: any, idx: number) => {
        let tLat = Number(tck.latitude || tck.lat || 0)
        let tLng = Number(tck.longitude || tck.lng || 0)

        // If no explicit coordinates, attempt matching with faskesList or NTB/NTT kabupaten center
        if (tLat === 0 || tLng === 0) {
          const occ = String(tck.pekerjaan || '').toLowerCase()
          const matchedF = rawFaskesList.find((f: any) => {
            const fName = String(f.nama || '').toLowerCase()
            return occ && (fName.includes(occ) || occ.includes(fName))
          })

          if (matchedF && (matchedF.latitude || matchedF.lat)) {
            const jitterLat = ((idx % 7) - 3) * 0.002
            const jitterLng = (((idx * 3) % 7) - 3) * 0.002
            tLat = Number(matchedF.latitude || matchedF.lat) + jitterLat
            tLng = Number(matchedF.longitude || matchedF.lng) + jitterLng
          } else {
            const kabStr = String(tck.kab_kota || '').toLowerCase()
            let matchedCoords: [number, number] | null = null
            for (const [kKey, coords] of Object.entries(nttKabCoords)) {
              if (kabStr.includes(kKey)) {
                matchedCoords = coords
                break
              }
            }
            if (!matchedCoords) {
              matchedCoords = [startLat || -8.62, startLng || 120.46]
            }
            const jitterLat = ((idx % 9) - 4) * 0.004
            const jitterLng = (((idx * 2) % 9) - 4) * 0.004
            tLat = matchedCoords[0] + jitterLat
            tLng = matchedCoords[1] + jitterLng
          }
        }

        if (tLat !== 0 && tLng !== 0) {
          if (isFloodEocMode) {
            if (tLat < -11.6 || tLat > -7.5 || tLng < 118.5 || tLng > 125.5) {
              return
            }
          }

          const tFeat = new Feature({
            geometry: new Point(fromLonLat([tLng, tLat])),
            id: tck.id_relawan || `tck-${idx}`,
            name: tck.nama || 'Relawan TCK Kemkes',
            rawItem: {
              ...tck,
              latitude: tLat,
              longitude: tLng
            },
            itemType: 'tck'
          })
          tFeat.setStyle(new Style({
            image: new Icon({
              src: `${basePath}/tck.svg`,
              size: [102.46, 102.46],
              scale: 0.28,
              anchor: [0.5, 0.5]
            })
          }))
          source.addFeature(tFeat)
        }
      })
    }

    // 4. Draw route if active
    if (routeCoords && routeCoords.length > 0) {
      const lineCoords = routeCoords.map((c) => fromLonLat(c))
      const routeFeat = new Feature({
        geometry: new LineString(lineCoords),
        id: 'route-line'
      })
      routeFeat.setStyle(new Style({
        stroke: new Stroke({
          color: '#0284c7',
          width: 4.5,
          lineDash: [4, 6]
        })
      }))
      source.addFeature(routeFeat)
    }

    // Zoom view to encompass route or center ONLY ONCE when target ID changes
    if (map && selectedRouteTarget && selectedRouteTarget.id !== prevTargetIdRef.current) {
      prevTargetIdRef.current = selectedRouteTarget.id
      map.getView().animate({
        center: fromLonLat([Number(selectedRouteTarget.longitude), Number(selectedRouteTarget.latitude)]),
        zoom: 13,
        duration: 700
      })
    } else if (!selectedRouteTarget) {
      prevTargetIdRef.current = null
      // Auto-fit directly to NTT / Flores disaster area extent when in EOC detail mode
      if (map && isFloodEocMode && source.getFeatures().length > 0) {
        const ext = source.getExtent()
        if (ext && ext.length === 4 && isFinite(ext[0]) && isFinite(ext[1]) && isFinite(ext[2]) && isFinite(ext[3])) {
          map.getView().fit(ext, { padding: [50, 50, 50, 50], maxZoom: 9.5, duration: 600 })
        } else {
          const firstM = markers && markers[0]
          const cLng = firstM?.lng ? Number(firstM.lng) : 121.5
          const cLat = firstM?.lat ? Number(firstM.lat) : -8.6
        }
      }
    }

    return () => {
      if (map) {
        pulseOverlaysRef.current.forEach(ov => map.removeOverlay(ov))
        pulseOverlaysRef.current = []
      }
    }
  }, [showEocRoute, isFloodEocMode, showMarkers, showPosko, showTckLayer, showSeismicLayer, earthquakePoints, tckList, faskesList, faskesRusakList, faskesTypeFilters, poskoList, selectedRouteTarget, routeCoords, markers, mapInstance, pulseRadius])

  // ─────────────────────────────────────────────
  // Legend / UI data
  // ─────────────────────────────────────────────

  const markerTitle = userScope?.mode === 'provinsi' || userScope?.mode === 'kabupaten'
    ? 'SEBARAN KEJADIAN PER KABUPATEN/KOTA'
    : 'SEBARAN KEJADIAN PER PROVINSI'

  const choroplethLegend = [
    { label: '0 kejadian', color: 'rgba(241, 245, 249, 0.8)' },
    { label: '1 – 10 kejadian', color: '#facc15' },
    { label: '11 – 30 kejadian', color: '#f97316' },
    { label: '31 – 50 kejadian', color: '#ef4444' },
    { label: '> 50 kejadian', color: '#991b1b' },
  ]


  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div
      ref={mapContainerRef}
      className="relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-[#f1fcfc]"
    >
      {/* Floating EOC Route details card on the left side of the map (Hanya tampil saat rute aktif/diklik) */}
      {isFloodEocMode && showEocRoute && selectedRouteTarget && (
        <div className="absolute top-4 left-4 z-20 w-80 max-h-[85%] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-left-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                <Compass className="h-3.5 w-3.5 text-teal-700" />
                Info Rujukan Faskes &amp; Evakuasi
              </span>
              <button
                onClick={() => onSelectRouteTarget && onSelectRouteTarget(null, 'clinic')}
                className="text-slate-400 hover:text-slate-650 p-0.5 rounded transition"
                title="Tutup / Bersihkan Rute"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-750">
              <div>
                <h5 className="font-extrabold text-slate-900 text-sm leading-tight">{selectedRouteTarget.name}</h5>
                <span className="text-[9px] uppercase font-bold text-teal-700">
                  {selectedRouteTarget.type === 'hospital' ? 'Rumah Sakit Rujukan' : selectedRouteTarget.type === 'shelter' ? 'Posko Pengungsian' : selectedRouteTarget.type === 'tck' ? 'Relawan TCK Kemkes RI' : 'Puskesmas / Klinik'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 py-2 border-y border-slate-200 bg-slate-50 px-2 rounded-lg">
                <div>
                  <span className="text-[9px] text-slate-400 block uppercase font-bold">Jarak Tempuh</span>
                  <span className="font-extrabold text-slate-800 text-sm">
                    {routeInfo ? `${routeInfo.distance.toFixed(1)} km` : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block uppercase font-bold">Durasi Respon</span>
                  <span className="font-extrabold text-slate-800 text-sm">
                    {routeInfo ? `${Math.round(routeInfo.duration)} mnt` : '-'}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-455 uppercase block">Rute Taktis Darurat</span>
                <p className="text-[11px] text-slate-650 leading-relaxed font-semibold">
                  {selectedRouteTarget.type === 'hospital'
                    ? 'Rute evakuasi gawat darurat ambulans menuju Rumah Sakit rujukan utama.'
                    : selectedRouteTarget.type === 'shelter'
                      ? 'Jalur penyelamatan dan mobilisasi warga terdampak menuju posko pengungsian terdekat.'
                      : selectedRouteTarget.type === 'tck'
                        ? 'Jalur koordinasi darurat & mobilisasi penugasan Tenaga Cadangan Kesehatan (TCK) / Tim EMT menuju lokasi bencana.'
                        : 'Akses pelayanan medis menuju Puskesmas / Klinik siaga setempat.'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* BMKG Proximity Warning Modal */}
      {activeBmkgAlert && (
        <div className="absolute inset-x-4 top-4 z-[30] animate-in slide-in-from-top-4 duration-500 max-w-md mx-auto">
          <div className="bg-gradient-to-r from-rose-600 to-amber-600 border border-red-700 rounded-3xl p-5 shadow-[0_15px_40px_rgba(239,68,68,0.25)] text-white relative">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white animate-pulse">
                <AlertTriangle className="h-6 w-6 animate-bounce" />
              </div>
              <div className="space-y-1 flex-1">
                <span className="text-[9px] font-black tracking-widest bg-white/20 px-2 py-0.5 rounded-full uppercase">BMKG EWS TERPADU</span>
                <h4 className="text-xs font-black uppercase tracking-wide">GEMPA BUMI BAHAYA DEKAT</h4>
                <p className="text-[11px] leading-relaxed opacity-95">
                  Gempa kekuatan <strong className="font-extrabold">M {activeBmkgAlert.gempa.Magnitude}</strong> terdeteksi di {activeBmkgAlert.gempa.Wilayah}.
                  Berjarak <strong className="font-extrabold">{activeBmkgAlert.distance} km</strong> dari posisi Anda! ({activeBmkgAlert.gempa.Potensi})
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveBmkgAlert(null)}
              className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── OL Map canvas ── */}
      <div ref={mapRef} className="h-full w-full min-h-[480px]" />

      {/* ── Loading overlay ── */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/30 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/95 px-6 py-4 shadow-[0_12px_40px_rgba(15,118,110,0.15)] border border-teal-100">
            <Loader2 className="h-7 w-7 animate-spin text-teal-700" />
            <span className="text-xs font-bold text-slate-700 tracking-wider uppercase">Memuat Peta Spasial...</span>
          </div>
        </div>
      )}

      {/* ── EOC Navigation / Directions Card Overlay ── */}
      {selectedRouteTarget && (
        <div className="absolute left-4 top-4 z-20 max-w-sm sm:max-w-md w-[90%] sm:w-auto rounded-2xl border border-teal-200/90 bg-white/95 backdrop-blur-md p-3.5 shadow-[0_12px_40px_rgba(15,118,110,0.18)] animate-in fade-in slide-in-from-left duration-200">
          <div className="flex items-start justify-between border-b border-slate-100 pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs shrink-0">
                <Compass className="h-4 w-4" />
              </span>
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-teal-700 block leading-none">
                  {selectedRouteTarget.type === 'tck' ? 'RUTE MOBILISASI TCK KEMKES' : 'RUTE NAVIGASI DARAT EOC'}
                </span>
                <h4 className="text-xs sm:text-sm font-black text-slate-900 leading-tight mt-0.5 truncate max-w-[230px]">
                  DARI BENCANA ➔ {selectedRouteTarget.name}
                </h4>
              </div>
            </div>
            <button
              onClick={() => onSelectRouteTarget?.(null, 'hospital')}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition shrink-0"
              title="Tutup Rute"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* From & To Detail Rows */}
          <div className="space-y-1.5 text-xs text-slate-700">
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-150">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-600 shrink-0 animate-ping" />
              <span className="text-[10px] font-black text-slate-500 uppercase shrink-0 w-10">DARI:</span>
              <span className="font-extrabold text-slate-900 truncate">
                📍 Titik Kejadian Bencana ({disasterType || 'Bencana'})
              </span>
            </div>

            <div className="flex items-center gap-2 bg-teal-50/70 p-2 rounded-xl border border-teal-150">
              <span className="h-2.5 w-2.5 rounded-full bg-teal-600 shrink-0" />
              <span className="text-[10px] font-black text-teal-800 uppercase shrink-0 w-10">KE:</span>
              <span className="font-extrabold text-slate-900 truncate">
                {selectedRouteTarget.type === 'tck' ? '🧑‍⚕️ ' : selectedRouteTarget.type === 'shelter' ? '⛺ ' : '🏥 '}
                {selectedRouteTarget.name}
              </span>
            </div>

            {routeInfo && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-slate-100/70 px-2.5 py-1.5 rounded-lg border border-slate-200/70 text-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase block">Jarak Tempuh</span>
                  <span className="text-xs sm:text-sm font-black text-teal-800 block mt-0.5">{routeInfo.distance.toFixed(1)} km</span>
                </div>
                <div className="bg-slate-100/70 px-2.5 py-1.5 rounded-lg border border-slate-200/70 text-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase block">Est. Waktu Tempuh</span>
                  <span className="text-xs sm:text-sm font-black text-teal-800 block mt-0.5">
                    {(() => {
                      const totalMnt = Math.round(routeInfo.duration)
                      if (totalMnt >= 60) {
                        const jam = Math.floor(totalMnt / 60)
                        const mnt = totalMnt % 60
                        return mnt > 0 ? `${jam} jam ${mnt} mnt` : `${jam} jam`
                      }
                      return `${totalMnt} mnt`
                    })()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Direct Google Maps Navigation Button (From ➔ To) */}
          {(() => {
            const origLat = markers && markers[0] ? markers[0].lat : selectedRouteTarget.latitude - 0.05
            const origLng = markers && markers[0] ? markers[0].lng : selectedRouteTarget.longitude - 0.05
            const gmapsDirUrl = `https://www.google.com/maps/dir/?api=1&origin=${origLat},${origLng}&destination=${selectedRouteTarget.latitude},${selectedRouteTarget.longitude}&travelmode=driving`

            return (
              <a
                href={gmapsDirUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-sm transition-all active:scale-[0.98]"
              >
                <Compass className="h-3.5 w-3.5" />
                Buka Maps
              </a>
            )
          })()}
        </div>
      )}

      {/* ── Top-Right Map Controls Toolbar ── */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        {/* Reset Zoom / Center to Disaster Button */}
        <button
          onClick={handleResetCenter}
          className="flex items-center gap-1.5 rounded-xl bg-white/95 border border-slate-300 px-3 py-2 shadow-md text-slate-750 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 transition-all active:scale-95 animate-in fade-in duration-200"
          title="Kembali ke Titik Pusat Kejadian Bencana (Reset Zoom)"
        >
          <RotateCcw className="h-3.5 w-3.5 text-teal-650" />
          <span className="text-xs font-black tracking-wide hidden sm:inline">Pusat Kejadian</span>
        </button>

        {/* Settings button */}
        <button
          onClick={() => { setShowSettings(true); setMarkerPopup(null) }}
          className="flex items-center gap-1.5 rounded-xl bg-white/95 border border-slate-300 px-3 py-2 shadow-md text-slate-750 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-300 transition-all active:scale-95 animate-in fade-in duration-200"
          title="Pengaturan Layer & Tampilan Peta"
        >
          <Settings className="h-3.5 w-3.5 text-teal-650" />
          <span className="text-xs font-black tracking-wide">Pengaturan Peta</span>
        </button>
      </div>

      {/* ── Settings panel (slide from right) ── */}
      {showSettings && (
        <>
          {/* Backdrop */}
          <div
            className="absolute inset-0 z-20 bg-black/10"
            onClick={() => setShowSettings(false)}
          />

          {/* Panel */}
          <div className="absolute right-0 top-0 z-30 h-full w-72 bg-white/98 backdrop-blur-md border-l border-slate-200 shadow-[−8px_0_40px_rgba(0,0,0,0.08)] flex flex-col animate-in slide-in-from-right duration-200">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-teal-700" />
                <span className="text-sm font-bold text-slate-800">Pengaturan Peta</span>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* ── Tampilan section ── */}
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                  Tampilan
                </p>

                {/* Toggle marker pins */}
                <div
                  onClick={() => setShowMarkers((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:bg-teal-50/50 hover:border-teal-100 transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 text-teal-600" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Tampilkan Pin Marker</p>
                      <p className="text-[10px] text-slate-400">Titik lokasi kejadian bencana</p>
                    </div>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showMarkers ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showMarkers ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                {/* Period range selector */}
                {setMarkerMonths !== undefined && (
                  <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <Clock className="h-4 w-4 text-teal-600 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Rentang Waktu Pin</p>
                        <p className="text-[10px] text-slate-400">Tampilkan kejadian N bulan terakhir</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[
                        { label: '1 Bln', value: 1 },
                        { label: '3 Bln', value: 3 },
                        { label: '6 Bln', value: 6 },
                        { label: '1 Thn', value: 12 },
                        { label: 'Semua', value: 0 },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setMarkerMonths(opt.value)}
                          className={`rounded-lg py-1.5 text-[10px] font-bold transition-all duration-150 ${markerMonths === opt.value
                              ? 'bg-teal-600 text-white shadow-sm'
                              : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700'
                            }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Toggle basemap */}
                <div
                  onClick={() => setShowBaseMap((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:bg-teal-50/50 hover:border-teal-100 transition-all mt-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Globe className="h-4 w-4 text-teal-600" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Peta Dasar (OSM)</p>
                      <p className="text-[10px] text-slate-400">Tampilkan peta jalan & geografis</p>
                    </div>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showBaseMap ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showBaseMap ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                {/* Toggle GeoJSON boundary */}
                <div
                  onClick={() => setShowGeoJson((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:bg-teal-50/50 hover:border-teal-100 transition-all mt-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className="h-4 w-4 text-teal-600" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Batas Administrasi</p>
                      <p className="text-[10px] text-slate-400">Layer GeoJSON kerawanan wilayah</p>
                    </div>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showGeoJson ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showGeoJson ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                {/* Toggle Windy */}
                <div
                  onClick={() => setShowWindy((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:bg-teal-50/50 hover:border-teal-100 transition-all mt-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Globe className="h-4 w-4 text-teal-600" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Aliran Angin (Windy)</p>
                      <p className="text-[10px] text-slate-400">Tampilkan pola pergerakan angin GFS</p>
                    </div>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showWindy ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showWindy ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                {/* Toggle EOC Route (only when isFloodEocMode is active) */}
                {isFloodEocMode && (
                  <div
                    onClick={() => setShowEocRoute((v) => !v)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:bg-teal-50/50 hover:border-teal-100 transition-all mt-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <Layers className="h-4 w-4 text-teal-600" />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Rute Evakuasi &amp; Faskes</p>
                        <p className="text-[10px] text-slate-400">Tampilkan jalur rute jalan raya dan pin faskes</p>
                      </div>
                    </div>
                    <div
                      className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showEocRoute ? 'bg-teal-600' : 'bg-slate-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showEocRoute ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                    </div>
                  </div>
                )}

                {/* Sub-Checkbox Filter Faskes (Simple List styled like Jenis Kejadian) */}
                {isFloodEocMode && showEocRoute && (
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                        Tipe Fasilitas Kesehatan
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFaskesTypeFilters({ rs: true, puskesmas: true, klinik: true, pustu: true, siagaOnly: false })}
                          className="text-[10px] font-bold text-teal-700 hover:text-teal-900 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 hover:bg-teal-100 transition-colors"
                        >
                          Semua
                        </button>
                        <button
                          type="button"
                          onClick={() => setFaskesTypeFilters({ rs: false, puskesmas: false, klinik: false, pustu: false, siagaOnly: false })}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-100 transition-colors"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 border border-slate-100 rounded-xl bg-[#fcfdfd] p-2 shadow-inner">
                      {/* Rumah Sakit */}
                      <label
                        className="flex cursor-pointer items-center justify-between py-1.5 px-2 hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-lg transition-all"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={faskesTypeFilters.rs}
                            onChange={(e) => setFaskesTypeFilters((prev) => ({ ...prev, rs: e.target.checked }))}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                          />
                          <img src={`${basePath}/rs.svg`} alt="RS" className="w-4 h-4 shrink-0" />
                          <span className="text-[11px] font-semibold text-slate-700 truncate">Rumah Sakit (RS)</span>
                        </div>
                        <span className={`text-[10px] font-extrabold ${faskesTypeFilters.siagaOnly ? 'text-rose-600' : 'text-slate-400'}`}>
                          {faskesTypeFilters.siagaOnly ? (
                            <span>{faskesCountsByType.rsSiaga} <span className="text-slate-300 font-normal">/ {faskesCountsByType.rs}</span></span>
                          ) : (
                            faskesCountsByType.rs
                          )}
                        </span>
                      </label>

                      {/* Puskesmas */}
                      <label
                        className="flex cursor-pointer items-center justify-between py-1.5 px-2 hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-lg transition-all"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={faskesTypeFilters.puskesmas}
                            onChange={(e) => setFaskesTypeFilters((prev) => ({ ...prev, puskesmas: e.target.checked }))}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                          />
                          <img src={`${basePath}/puskes.svg`} alt="Puskesmas" className="w-4 h-4 shrink-0" />
                          <span className="text-[11px] font-semibold text-slate-700 truncate">Puskesmas</span>
                        </div>
                        <span className={`text-[10px] font-extrabold ${faskesTypeFilters.siagaOnly ? 'text-rose-600' : 'text-slate-400'}`}>
                          {faskesTypeFilters.siagaOnly ? (
                            <span>{faskesCountsByType.pkmSiaga} <span className="text-slate-300 font-normal">/ {faskesCountsByType.puskesmas}</span></span>
                          ) : (
                            faskesCountsByType.puskesmas
                          )}
                        </span>
                      </label>

                      {/* Klinik */}
                      <label
                        className="flex cursor-pointer items-center justify-between py-1.5 px-2 hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-lg transition-all"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={faskesTypeFilters.klinik}
                            onChange={(e) => setFaskesTypeFilters((prev) => ({ ...prev, klinik: e.target.checked }))}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                          />
                          <img src={`${basePath}/klinik.svg`} alt="Klinik" className="w-4 h-4 shrink-0" />
                          <span className="text-[11px] font-semibold text-slate-700 truncate">Klinik</span>
                        </div>
                        <span className="text-[10px] font-extrabold text-slate-400">
                          {faskesTypeFilters.siagaOnly ? (
                            <span>{faskesCountsByType.klinikSiaga} <span className="text-slate-300 font-normal">/ {faskesCountsByType.klinik}</span></span>
                          ) : (
                            faskesCountsByType.klinik
                          )}
                        </span>
                      </label>

                      {/* Puskesmas Pembantu (Pustu) */}
                      <label
                        className="flex cursor-pointer items-center justify-between py-1.5 px-2 hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-lg transition-all"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={faskesTypeFilters.pustu}
                            onChange={(e) => setFaskesTypeFilters((prev) => ({ ...prev, pustu: e.target.checked }))}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                          />
                          <img src={`${basePath}/pustu.svg`} alt="Pustu" className="w-4 h-4 shrink-0" />
                          <span className="text-[11px] font-semibold text-slate-700 truncate">Puskesmas Pembantu (Pustu)</span>
                        </div>
                        <span className="text-[10px] font-extrabold text-slate-400">
                          {faskesTypeFilters.siagaOnly ? (
                            <span>{faskesCountsByType.pustuSiaga} <span className="text-slate-300 font-normal">/ {faskesCountsByType.pustu.toLocaleString('id-ID')}</span></span>
                          ) : (
                            faskesCountsByType.pustu.toLocaleString('id-ID')
                          )}
                        </span>
                      </label>

                      {/* Hanya Faskes Rawat Pasien */}
                      <label
                        className="flex cursor-pointer items-center justify-between py-1.5 px-2 hover:bg-slate-50 border-t border-slate-150 pt-2 transition-all"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={faskesTypeFilters.siagaOnly}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setFaskesTypeFilters((prev) => {
                                if (checked) {
                                  return {
                                    ...prev,
                                    siagaOnly: true,
                                    rs: true,
                                    puskesmas: true,
                                    klinik: true,
                                    pustu: true,
                                  }
                                }
                                return {
                                  ...prev,
                                  siagaOnly: false,
                                }
                              })
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                          />
                          <span className={`text-[11px] font-bold truncate ${faskesTypeFilters.siagaOnly ? 'text-rose-700 font-extrabold' : 'text-slate-700'}`}>
                            Hanya Faskes Rawat Pasien
                          </span>
                        </div>
                        <span className={`text-[10px] font-extrabold ${faskesTypeFilters.siagaOnly ? 'text-rose-600' : 'text-slate-400'}`}>
                          {faskesCountsByType.siaga}
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Radius Denyutan Bencana (only when isFloodEocMode is active) */}
                {isFloodEocMode && (
                  <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <Compass className="h-4 w-4 text-rose-500 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Radius Episentrum &amp; Dampak</p>
                        <p className="text-[10px] text-slate-400">Jangkauan area dampak (km)</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[
                        { label: '1 km', value: 1 },
                        { label: '5 km', value: 5 },
                        { label: '10 km', value: 10 },
                        { label: '25 km', value: 25 },
                        { label: '50 km', value: 50 },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPulseRadius(opt.value)}
                          className={`rounded-lg py-1 text-[10px] font-black transition-all ${pulseRadius === opt.value
                              ? 'bg-rose-500 text-white shadow-xs'
                              : 'bg-white text-slate-600 border border-slate-100 hover:bg-slate-100'
                            }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Seleksi Titik Asal Rute (only when isFloodEocMode is active) */}
                {isFloodEocMode && Array.isArray(markers) && markers.length > 0 && onSelectRouteSource && (
                  <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center gap-2.5 mb-2">
                      <MapPin className="h-4 w-4 text-sky-600 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">Titik Asal Rute (FROM)</p>
                        <p className="text-[10px] text-slate-400">Pilih titik bencana sebagai asal rute</p>
                      </div>
                    </div>
                    <select
                      value={selectedRouteSource?.id || ''}
                      onChange={(e) => {
                        const targetId = e.target.value;
                        const idx = markers.findIndex((m, i) => (m.kode_trans || `loc-${i}`) === targetId);
                        if (idx !== -1) {
                          const m = markers[idx];
                          onSelectRouteSource({
                            id: targetId,
                            name: m.nama_desa
                              ? `Titik ${idx + 1} - Desa ${m.nama_desa}${m.kecamatan ? `, Kec. ${m.kecamatan}` : ''}`
                              : m.kecamatan
                                ? `Titik ${idx + 1} - Kec. ${m.kecamatan}`
                                : `Titik Bencana ${idx + 1}`,
                            latitude: Number(m.lat),
                            longitude: Number(m.lng),
                            type: 'kejadian'
                          });
                        }
                      }}
                      className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-750 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-2xs"
                    >
                      {markers.map((m, idx) => {
                        const optId = m.kode_trans || `loc-${idx}`;
                        // Buat label per-titik yang unik tanpa inherit daftar semua kecamatan
                        const locLabel = m.nama_desa
                          ? `Titik ${idx + 1}: Desa ${m.nama_desa}${m.kecamatan ? ` (Kec. ${m.kecamatan})` : ''}`
                          : m.kecamatan
                            ? `Titik ${idx + 1}: Kec. ${m.kecamatan}`
                            : `Titik Bencana ${idx + 1} (${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)})`
                        return (
                          <option key={optId} value={optId}>
                            ⚠️ {locLabel}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Toggle Wind Legend */}
                <div
                  onClick={() => setShowWindLegend((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:bg-teal-50/50 hover:border-teal-100 transition-all mt-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Wind className="h-4 w-4 text-teal-600" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Legenda Aliran Angin</p>
                      <p className="text-[10px] text-slate-400">Keterangan gradasi warna &amp; kecepatan angin</p>
                    </div>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showWindLegend ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showWindLegend ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                {/* Toggle region legend visibility */}
                <div
                  onClick={() => setShowRegionLegend((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:bg-teal-50/50 hover:border-teal-100 transition-all mt-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Info className="h-4 w-4 text-teal-600" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Legenda Wilayah</p>
                      <p className="text-[10px] text-slate-400">Keterangan warna jumlah kejadian</p>
                    </div>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showRegionLegend ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showRegionLegend ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                {/* Toggle casualty legend visibility */}
                <div
                  onClick={() => setShowCasualtyLegend((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:bg-teal-50/50 hover:border-teal-100 transition-all mt-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Info className="h-4 w-4 text-red-500" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Legenda Korban</p>
                      <p className="text-[10px] text-slate-400">Keterangan warna dampak korban</p>
                    </div>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showCasualtyLegend ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showCasualtyLegend ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>



              </div>

              {/* ── BMKG & TCK Layers Section ── */}
              <div className="mb-6 border-b border-slate-100 pb-5 space-y-2.5">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                  SUMBER DAYA & EWS TERPADU
                </p>

                {/* Toggle Real USGS/BMKG Seismic Epicenters */}
                <div
                  onClick={() => setShowSeismicLayer((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-red-100 bg-red-50/50 px-3 py-2 hover:bg-red-100/50 transition-all"
                >
                  <div>
                    <p className="text-xs font-semibold text-red-900 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-600 animate-ping" />
                      Titik Episentrum Gempa (USGS/BMKG)
                      {earthquakePoints && earthquakePoints.length > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 bg-red-700 text-white rounded-full">
                          {earthquakePoints.length}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-red-700 font-medium">Plot koordinat riil episentrum & radius guncangan gempa</p>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showSeismicLayer ? 'bg-red-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showSeismicLayer ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                {/* Toggle TCK Kemkes Layer */}
                <div
                  onClick={() => setShowTckLayer((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-teal-100 bg-teal-50/50 px-3 py-2 hover:bg-teal-100/50 transition-all"
                >
                  <div>
                    <p className="text-xs font-semibold text-teal-900 flex items-center gap-1.5">
                      <img src={`${basePath}/tck.svg`} alt="TCK" className="w-4 h-4 shrink-0" />
                      TCK Terregistrasi Wilayah
                      {tckList && tckList.length > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 bg-teal-700 text-white rounded-full">
                          {tckList.length}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-teal-700 font-medium">Titik sebaran dokter, perawat & tim EMT siaga</p>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showTckLayer ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showTckLayer ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                {/* Toggle Posko Pengungsian Layer */}
                <div
                  onClick={() => setShowPosko((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-2 hover:bg-sky-100/50 transition-all"
                >
                  <div>
                    <p className="text-xs font-semibold text-sky-900 flex items-center gap-1.5">
                      <Tent className="w-4 h-4 shrink-0 text-sky-700" />
                      Posko Pengungsian Siaga
                      {poskoList && poskoList.length > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 bg-sky-700 text-white rounded-full">
                          {poskoList.length}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-sky-700 font-medium">Titik pos pengungsian & penyaluran logistik</p>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showPosko ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showPosko ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                {/* Toggle EWS Pulse Radius Circles */}
                <div
                  onClick={() => setShowEwsPulse((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-teal-50/50 hover:border-teal-100 transition-all"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Denyut Radius EWS</p>
                    <p className="text-[10px] text-slate-400 font-medium">Lingkaran radius EWS 25km & 50km dekat GPS</p>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showEwsPulse ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showEwsPulse ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                <div
                  onClick={() => setShowBmkg((v) => !v)}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-teal-50/50 hover:border-teal-100 transition-all"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Layer Gempa Terkini BMKG</p>
                    <p className="text-[10px] text-slate-400 font-medium">Plot seismik realtime & radius bahaya 50km</p>
                  </div>
                  <div
                    className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showBmkg ? 'bg-teal-600' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showBmkg ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </div>
                </div>
              </div>

              {/* ── BNPB Inarisk Layers Section ── */}
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                  Layer BNPB (Inarisk)
                </p>
                <div className="space-y-2.5">
                  {/* Toggle BNPB Batas Administrasi */}
                  <div
                    onClick={() => setShowBnpbAdmin((v) => !v)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-teal-50/50 hover:border-teal-100 transition-all"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Batas Administrasi BNPB</p>
                      <p className="text-[10px] text-slate-400 font-medium">Batas administrasi daerah Inarisk</p>
                    </div>
                    <div
                      className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showBnpbAdmin ? 'bg-teal-600' : 'bg-slate-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showBnpbAdmin ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                    </div>
                  </div>

                  {/* Toggle BNPB Hillshade */}
                  <div
                    onClick={() => setShowBnpbHillshade((v) => !v)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-teal-50/50 hover:border-teal-100 transition-all"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Indo Hillshade</p>
                      <p className="text-[10px] text-slate-400 font-medium">Peta bayangan bukit basemap</p>
                    </div>
                    <div
                      className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showBnpbHillshade ? 'bg-teal-600' : 'bg-slate-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showBnpbHillshade ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                    </div>
                  </div>

                  {/* Toggle BNPB Kepadatan Penduduk 2020 */}
                  <div
                    onClick={() => setShowBnpbKepadatan((v) => !v)}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-teal-50/50 hover:border-teal-100 transition-all"
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Kepadatan Penduduk 2020</p>
                      <p className="text-[10px] text-slate-400 font-medium">Kepadatan penduduk tahun 2020</p>
                    </div>
                    <div
                      className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showBnpbKepadatan ? 'bg-teal-600' : 'bg-slate-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showBnpbKepadatan ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                    </div>
                  </div>

                  {/* Complete InaRISK Hazard Layers (All 4 Hazards Always Available) */}
                  <div
                    onClick={() => setShowBnpbBanjir((v) => !v)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 transition-all ${disasterCategory === 'banjir'
                        ? 'border-blue-200 bg-blue-50/60 hover:bg-blue-100/60 shadow-xs'
                        : 'border-slate-100 bg-slate-50 hover:bg-teal-50/50 hover:border-teal-100'
                      }`}
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        {disasterCategory === 'banjir' && <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />}
                        Bahaya Banjir (InaRISK)
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">Peta zona rawan genangan & banjir</p>
                    </div>
                    <div
                      className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showBnpbBanjir ? 'bg-teal-600' : 'bg-slate-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showBnpbBanjir ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                    </div>
                  </div>

                  <div
                    onClick={() => setShowBnpbGempa((v) => !v)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 transition-all ${disasterCategory === 'gempa'
                        ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-100/60 shadow-xs'
                        : 'border-slate-100 bg-slate-50 hover:bg-teal-50/50 hover:border-teal-100'
                      }`}
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        {disasterCategory === 'gempa' && <span className="h-2 w-2 rounded-full bg-amber-600 animate-pulse" />}
                        Bahaya Gempa Bumi (InaRISK)
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">Peta kerawanan guncangan & sesar gempa</p>
                    </div>
                    <div
                      className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showBnpbGempa ? 'bg-teal-600' : 'bg-slate-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showBnpbGempa ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                    </div>
                  </div>

                  <div
                    onClick={() => setShowBnpbLongsor((v) => !v)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 transition-all ${disasterCategory === 'longsor'
                        ? 'border-stone-300 bg-amber-900/10 hover:bg-amber-900/20 shadow-xs'
                        : 'border-slate-100 bg-slate-50 hover:bg-teal-50/50 hover:border-teal-100'
                      }`}
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        {disasterCategory === 'longsor' && <span className="h-2 w-2 rounded-full bg-amber-800 animate-pulse" />}
                        Bahaya Tanah Longsor (InaRISK)
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">Peta kerentanan gerakan tanah lereng</p>
                    </div>
                    <div
                      className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showBnpbLongsor ? 'bg-teal-600' : 'bg-slate-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showBnpbLongsor ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                    </div>
                  </div>

                  <div
                    onClick={() => setShowBnpbKarhutla((v) => !v)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 transition-all ${disasterCategory === 'kebakaran'
                        ? 'border-red-200 bg-red-50/60 hover:bg-red-100/60 shadow-xs'
                        : 'border-slate-100 bg-slate-50 hover:bg-teal-50/50 hover:border-teal-100'
                      }`}
                  >
                    <div>
                      <p className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        {disasterCategory === 'kebakaran' && <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />}
                        Bahaya Karhutla (InaRISK)
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">Peta kerawanan kebakaran hutan & lahan</p>
                    </div>
                    <div
                      className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${showBnpbKarhutla ? 'bg-teal-600' : 'bg-slate-300'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${showBnpbKarhutla ? 'translate-x-4' : 'translate-x-0'}`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Filter & Kategori Section ── */}
              <div className={showMarkers ? "space-y-5 transition-opacity" : "space-y-5 opacity-40 pointer-events-none transition-opacity"}>
                {/* ── Kategori Bencana ── */}
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                    Kategori Bencana
                  </p>
                  <div className="space-y-2">
                    {/* Bencana Alam */}
                    <div
                      onClick={() => toggleCategory('1')}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 hover:bg-teal-50/40 hover:border-teal-100 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700">Bencana Alam</span>
                        <span className="rounded-md bg-white border border-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{categoryCounts.alam}</span>
                      </div>
                      <div
                        className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${!excludedCategories.has('1') ? 'bg-teal-600' : 'bg-slate-300'}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${!excludedCategories.has('1') ? 'translate-x-4' : 'translate-x-0'}`}
                        />
                      </div>
                    </div>

                    {/* Bencana Non-Alam */}
                    <div
                      onClick={() => toggleCategory('2')}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 hover:bg-teal-50/40 hover:border-teal-100 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700">Bencana Non-Alam</span>
                        <span className="rounded-md bg-white border border-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{categoryCounts.nonAlam}</span>
                      </div>
                      <div
                        className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${!excludedCategories.has('2') ? 'bg-teal-600' : 'bg-slate-300'}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${!excludedCategories.has('2') ? 'translate-x-4' : 'translate-x-0'}`}
                        />
                      </div>
                    </div>

                    {/* Bencana Sosial */}
                    <div
                      onClick={() => toggleCategory('3')}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 hover:bg-teal-50/40 hover:border-teal-100 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700">Bencana Sosial</span>
                        <span className="rounded-md bg-white border border-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{categoryCounts.sosial}</span>
                      </div>
                      <div
                        className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${!excludedCategories.has('3') ? 'bg-teal-600' : 'bg-slate-300'}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${!excludedCategories.has('3') ? 'translate-x-4' : 'translate-x-0'}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Detail Jenis Kejadian ── */}
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3">
                    Jenis Kejadian
                  </p>
                  {disasterTypesBreakdown.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-4 text-center">
                      <p className="text-[11px] text-slate-400 italic">Tidak ada jenis kejadian</p>
                    </div>
                  ) : (
                    <div className="max-h-[260px] overflow-y-auto pr-1 space-y-1.5 border border-slate-100 rounded-xl bg-[#fcfdfd] p-2 shadow-inner">
                      {disasterTypesBreakdown.map((item) => {
                        const isChecked = !excludedTypes.has(item.name);
                        const isCategoryDisabled = excludedCategories.has(item.category);
                        const getCategoryLabel = (cat: string) => {
                          if (cat === '1') return 'Alam'
                          if (cat === '2') return 'Non-Alam'
                          return 'Sosial'
                        }
                        const getCategoryBadgeClass = (cat: string) => {
                          if (cat === '1') return 'bg-teal-50 text-teal-700 border-teal-150'
                          if (cat === '2') return 'bg-blue-50 text-blue-700 border-blue-150'
                          return 'bg-purple-50 text-purple-700 border-purple-150'
                        }

                        return (
                          <div
                            key={item.name}
                            onClick={() => {
                              if (!isCategoryDisabled) toggleType(item.name);
                            }}
                            className={`flex cursor-pointer items-center justify-between py-1.5 px-2 hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-lg transition-all ${isCategoryDisabled ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''
                              }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked && !isCategoryDisabled}
                                disabled={isCategoryDisabled}
                                onChange={() => { }} // handled by parent onClick
                                className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                              />
                              <span className="text-[11px] font-semibold text-slate-700 truncate">{item.name}</span>
                              <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider shrink-0 ${getCategoryBadgeClass(item.category)}`}>
                                {getCategoryLabel(item.category)}
                              </span>
                            </div>
                            <span className="text-[10px] font-extrabold text-slate-400">
                              {item.count}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>


            {/* Panel footer */}
            <div className="border-t border-slate-100 px-4 py-3">
              <p className="text-[10px] text-slate-400 text-center">
                SIPKK · Sistem Informasi PKK
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── Marker Pin Popup ── */}
      {markerPopup && (
        <div
          className="absolute z-10 w-[280px] rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] transition-all duration-200"
          style={{
            left: Math.min(markerPopup.x + 10, (mapContainerRef.current?.offsetWidth || 800) - 295),
            top: Math.max(markerPopup.y - 10, 8),
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 p-3 pb-2.5">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-800">
                <MapPin className="h-2.5 w-2.5" />
                Lokasi Kejadian
              </span>
              <h4 className="mt-1 text-[13px] font-extrabold uppercase text-[#1a3535] leading-tight">
                {formatDisasterName(markerPopup.data.jenis_bencana)}
              </h4>
            </div>
            <button
              onClick={() => setMarkerPopup(null)}
              className="ml-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition flex-shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Info rows */}
          <div className="p-3 space-y-1.5 text-[11px] text-slate-600">
            <div className="flex items-start gap-2">
              <span className="w-16 flex-shrink-0 text-[10px] font-bold text-black uppercase">Tanggal</span>
              <span className="font-semibold text-slate-800">{markerPopup.data.tgl_kejadian || '—'}</span>
            </div>

            <div className="flex items-start gap-2">
              <span className="w-16 flex-shrink-0 text-[10px] font-bold text-black uppercase">Lokasi</span>
              <span className="font-semibold text-slate-800 leading-snug">
                {[markerPopup.data.kecamatan && `Kec. ${markerPopup.data.kecamatan}`, markerPopup.data.kabupaten].filter(Boolean).join(', ') || markerPopup.data.provinsi || '—'}
              </span>
            </div>

            {markerPopup.data.nama_desa && markerPopup.data.nama_desa !== 'Desa Lainnya' && (
              <div className="flex items-start gap-2">
                <span className="w-16 flex-shrink-0 text-[10px] font-bold text-black uppercase">Desa/Dusun</span>
                <span className="font-semibold text-slate-800">{markerPopup.data.nama_desa}</span>
              </div>
            )}

            {markerPopup.data.topografi && markerPopup.data.topografi !== '-' && (
              <div className="flex items-start gap-2">
                <span className="w-16 flex-shrink-0 text-[10px] font-bold text-black uppercase">Topografi</span>
                <span className="font-semibold text-slate-800">{markerPopup.data.topografi}</span>
              </div>
            )}

            <div className="flex items-start gap-2">
              <span className="w-16 flex-shrink-0 text-[10px] font-bold text-black uppercase">Korban</span>
              <span
                className="font-extrabold"
                style={{ color: pinColor(markerPopup.data.total_korban) }}
              >
                {markerPopup.data.total_korban > 0 ? `${markerPopup.data.total_korban.toLocaleString('id-ID')} orang` : 'Tidak ada korban'}
              </span>
            </div>

            {markerPopup.data.jml_titik_lokasi !== undefined && markerPopup.data.jml_titik_lokasi > 0 && !String(markerPopup.data.kode_trans || '').includes('-loc-') && (
              <div className="flex items-start gap-2">
                <span className="w-16 flex-shrink-0 text-[10px] font-bold text-black uppercase">Sebaran</span>
                <span className="font-extrabold text-teal-800">
                  {markerPopup.data.jml_titik_lokasi} titik lokasi kejadian
                </span>
              </div>
            )}
          </div>

          {/* Footer — Detail button */}
          {!String(markerPopup.data.kode_trans || '').includes('-loc-') && (
            <div className="border-t border-slate-100 p-2.5">
              <button
                onClick={() => {
                  if (onSelectEvent) {
                    onSelectEvent(markerPopup.data)
                  }
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-700 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-teal-800"
              >
                LIHAT DETAIL
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── EOC Faskes / Posko / Disaster Interactive Popup ── */}
      {eocPopup && (
        <div
          className="absolute z-20 w-[300px] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_16px_48px_rgba(0,0,0,0.18)] animate-in fade-in zoom-in-95 duration-200 text-xs overflow-hidden"
          style={{
            left: Math.min(Math.max(12, eocPopup.x - 150), (mapContainerRef.current?.offsetWidth || 800) - 315),
            top: Math.max(12, Math.min(eocPopup.y + 16, (mapContainerRef.current?.offsetHeight || 600) - 380)),
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 p-3.5 pb-3 bg-slate-50/70">
            <div className="min-w-0 flex-1">
              {/* Only show badge for Earthquake, TCK, or Shelter. Faskes/RS badges removed as requested */}
              {(eocPopup.type === 'earthquake' || eocPopup.type === 'tck' || eocPopup.type === 'shelter') && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                  eocPopup.type === 'earthquake'
                    ? 'bg-red-100 text-red-800 border border-red-300 font-black'
                    : eocPopup.type === 'tck'
                      ? 'bg-teal-50 text-teal-800 border border-teal-200'
                      : 'bg-purple-50 text-purple-700 border border-purple-200'
                }`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                  {eocPopup.type === 'earthquake'
                    ? (eocPopup.earthquakeInfo?.isMainshock ? '⚡ Episentrum Gempa Utama' : '⚡ Titik Gempa Susulan')
                    : eocPopup.type === 'tck'
                      ? 'Relawan TCK Kemkes RI'
                      : 'Posko Kesehatan & Darurat'}
                </span>
              )}
              <h4 className={`text-sm font-black text-slate-900 leading-snug ${(eocPopup.type === 'earthquake' || eocPopup.type === 'tck' || eocPopup.type === 'shelter') ? 'mt-1.5' : 'mt-0'}`}>
                {eocPopup.type === 'tck' ? maskPersonName(eocPopup.name) : eocPopup.name}
              </h4>
              {eocPopup.type === 'tck' && eocPopup.details?.golongan && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 bg-teal-100/80 text-teal-800 rounded">
                    {eocPopup.details.golongan}
                  </span>
                  {eocPopup.details.spesifikasi && (
                    <span className="text-[9.5px] font-semibold text-slate-600 truncate">
                      {eocPopup.details.spesifikasi}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setEocPopup(null)}
              className="ml-2 rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition shrink-0"
              title="Tutup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-3.5 space-y-2.5 text-slate-650 max-h-[360px] overflow-y-auto">
            {eocPopup.address && (
              <div className="flex items-start gap-2 text-[11px]">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span className="font-semibold text-slate-700 leading-snug">{eocPopup.address}</span>
              </div>
            )}

            {eocPopup.type === 'tck' && (
              <div className="space-y-1.5 bg-teal-50/50 p-2.5 rounded-xl border border-teal-100 text-[11px]">
                {eocPopup.details?.pekerjaan && (
                  <div className="flex items-start gap-1.5">
                    <span className="text-slate-500 font-medium shrink-0 text-[10px] uppercase w-16">Faskes/Unit:</span>
                    <strong className="text-slate-800">{eocPopup.details.pekerjaan}</strong>
                  </div>
                )}
                {eocPopup.details?.nama_tim_emt && (
                  <div className="flex items-start gap-1.5">
                    <span className="text-slate-500 font-medium shrink-0 text-[10px] uppercase w-16">Tim EMT:</span>
                    <strong className="text-teal-900">{eocPopup.details.nama_tim_emt}</strong>
                  </div>
                )}
                {eocPopup.details?.organisasi && eocPopup.details.organisasi !== eocPopup.details.nama_tim_emt && (
                  <div className="flex items-start gap-1.5">
                    <span className="text-slate-500 font-medium shrink-0 text-[10px] uppercase w-16">Klaster:</span>
                    <strong className="text-slate-700">{eocPopup.details.organisasi}</strong>
                  </div>
                )}
              </div>
            )}

            {eocPopup.distance !== undefined && eocPopup.distance > 0 && (
              <div className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-[10px] font-bold border ${eocPopup.isTerdampak
                  ? 'bg-rose-50/70 border-rose-100/80 text-rose-900'
                  : 'bg-teal-50/70 border-teal-100/80 text-teal-900'
                }`}>
                <span>Jarak dari Titik Bencana:</span>
                <span className={`font-black text-[11px] ${eocPopup.isTerdampak ? 'text-rose-800' : 'text-teal-800'}`}>± {eocPopup.distance} km</span>
              </div>
            )}

            {/* Informasi Kerusakan untuk Faskes Terdampak */}
            {eocPopup.isTerdampak && eocPopup.dampakInfo && (() => {
              const d = eocPopup.dampakInfo
              const hasBerat = (d.rusak_berat || 0) > 0
              const hasSedang = (d.rusak_sedang || 0) > 0
              const hasRingan = (d.rusak_ringan || 0) > 0
              const kondisiLabel = hasBerat ? 'Rusak Berat' : hasSedang ? 'Rusak Sedang' : hasRingan ? 'Rusak Ringan' : (d.kondisi_faskes || d.status || 'Terdampak')
              const kondisiColor = hasBerat ? 'text-rose-700 bg-rose-50 border-rose-200' : hasSedang ? 'text-orange-700 bg-orange-50 border-orange-200' : 'text-amber-700 bg-amber-50 border-amber-200'
              return (
                <div className="space-y-1.5 rounded-xl border border-rose-200 bg-rose-50/60 p-2.5 text-[11px]">
                  <div className="text-[10px] font-black uppercase tracking-wider text-rose-700 flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    Kondisi Kerusakan Dilaporkan
                  </div>
                  {/* Tingkat Kerusakan Struktural */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Tingkat Kerusakan:</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${kondisiColor}`}>
                      {kondisiLabel}
                    </span>
                  </div>
                  {/* Detail Unit Rusak */}
                  {(hasBerat || hasSedang || hasRingan) && (
                    <div className="grid grid-cols-3 gap-1 mt-1">
                      {hasBerat && (
                        <div className="rounded-lg bg-rose-100 border border-rose-200 p-1.5 text-center">
                          <span className="block text-[8.5px] font-bold text-rose-600 uppercase">Berat</span>
                          <span className="text-[12px] font-black text-rose-800">{d.rusak_berat}</span>
                        </div>
                      )}
                      {hasSedang && (
                        <div className="rounded-lg bg-orange-100 border border-orange-200 p-1.5 text-center">
                          <span className="block text-[8.5px] font-bold text-orange-600 uppercase">Sedang</span>
                          <span className="text-[12px] font-black text-orange-800">{d.rusak_sedang}</span>
                        </div>
                      )}
                      {hasRingan && (
                        <div className="rounded-lg bg-amber-100 border border-amber-200 p-1.5 text-center">
                          <span className="block text-[8.5px] font-bold text-amber-600 uppercase">Ringan</span>
                          <span className="text-[12px] font-black text-amber-800">{d.rusak_ringan}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Status Fungsi Pelayanan */}
                  {d.fungsi_pelayanan && (
                    <div className="flex items-start gap-1.5 pt-1 border-t border-rose-100">
                      <span className="text-slate-500 font-medium shrink-0">Fungsi Layanan:</span>
                      <span className="font-bold text-rose-800 leading-snug">{d.fungsi_pelayanan}</span>
                    </div>
                  )}
                  {d.kondisi_faskes && !d.fungsi_pelayanan && (
                    <div className="flex items-start gap-1.5 pt-1 border-t border-rose-100">
                      <span className="text-slate-500 font-medium shrink-0">Kondisi:</span>
                      <span className="font-bold text-rose-800 leading-snug">{d.kondisi_faskes}</span>
                    </div>
                  )}
                </div>
              )
            })()}

            {eocPopup.type === 'earthquake' && eocPopup.earthquakeInfo && (
              <div className="space-y-2.5">
                {/* Seismic Key Cards */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-red-50 border border-red-200 p-2.5 text-center">
                    <span className="text-[9px] font-black uppercase text-red-600 block">Magnitudo</span>
                    <span className="text-xl font-black text-red-700 block mt-0.5">
                      M {eocPopup.earthquakeInfo.magnitude.toFixed(1)}
                    </span>
                    <span className="text-[8.5px] font-bold text-red-500 block">Skala Richter</span>
                  </div>
                  <div className="rounded-xl bg-orange-50 border border-orange-200 p-2.5 text-center">
                    <span className="text-[9px] font-black uppercase text-orange-600 block">Kedalaman</span>
                    <span className="text-xl font-black text-orange-800 block mt-0.5">
                      {eocPopup.earthquakeInfo.depth} km
                    </span>
                    <span className="text-[8.5px] font-bold text-orange-500 block">
                      {eocPopup.earthquakeInfo.depth <= 70 ? 'Dangkal (< 70km)' : 'Menengah'}
                    </span>
                  </div>
                </div>

                {/* Details List */}
                <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 text-[11px]">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                    <span className="text-slate-500 font-medium">Waktu Kejadian:</span>
                    <span className="font-bold text-slate-800">
                      {eocPopup.earthquakeInfo.time} {eocPopup.earthquakeInfo.dateLabel && `(${eocPopup.earthquakeInfo.dateLabel})`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                    <span className="text-slate-500 font-medium">Tipe Guncangan:</span>
                    <span className={`px-2 py-0.2 rounded-full font-black text-[9px] border ${eocPopup.earthquakeInfo.isMainshock
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}>
                      {eocPopup.earthquakeInfo.isMainshock ? 'Gempa Utama (Mainshock)' : 'Gempa Susulan'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                    <span className="text-slate-500 font-medium">Koordinat:</span>
                    <span className="font-mono font-bold text-slate-700 text-[10px]">
                      {eocPopup.lat.toFixed(4)}°, {eocPopup.lng.toFixed(4)}°
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-slate-500 font-medium">Sumber Data:</span>
                    <span className="font-bold text-teal-800 text-[10px]">
                      {eocPopup.earthquakeInfo.source || 'USGS & BMKG'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Metrics Grid (for Faskes/Shelter) */}
            {eocPopup.type !== 'tck' && eocPopup.type !== 'earthquake' && (
              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px]">
                {eocPopup.details?.kapasitas ? (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <span className="text-slate-400 block uppercase font-bold text-[8.5px]">Kapasitas TT</span>
                    <span className="font-extrabold text-slate-800 text-[11px]">{eocPopup.details.kapasitas} Bed</span>
                  </div>
                ) : null}

                {eocPopup.details?.dokter || eocPopup.details?.perawat ? (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <span className="text-slate-400 block uppercase font-bold text-[8.5px]">Tenaga Medis</span>
                    <span className="font-extrabold text-slate-800 text-[11px]">
                      {[
                        eocPopup.details.dokter ? `${eocPopup.details.dokter} Dr` : null,
                        eocPopup.details.perawat ? `${eocPopup.details.perawat} Ns` : null
                      ].filter(Boolean).join(' · ') || 'Siaga'}
                    </span>
                  </div>
                ) : null}

                {eocPopup.details?.ambulans ? (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <span className="text-slate-400 block uppercase font-bold text-[8.5px]">Ambulans</span>
                    <span className="font-extrabold text-slate-800 text-[11px]">{eocPopup.details.ambulans} Unit</span>
                  </div>
                ) : null}

                {eocPopup.details?.pengungsi_jiwa ? (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                    <span className="text-slate-400 block uppercase font-bold text-[8.5px]">Warga Ditampung</span>
                    <span className="font-extrabold text-purple-800 text-[11px]">{eocPopup.details.pengungsi_jiwa} Jiwa</span>
                  </div>
                ) : null}

                {eocPopup.details?.operasional && !isFloodEocMode && (
                  <div className="col-span-2 rounded-lg bg-emerald-50/50 border border-emerald-100 p-1.5 flex items-center justify-between text-[10px]">
                    <span className="text-emerald-700 font-bold">Status Kesiapan:</span>
                    <span className="font-extrabold text-emerald-800">{eocPopup.details.operasional}</span>
                  </div>
                )}
              </div>
            )}

            {/* ─── Identifikasi Kondisi Pasien (Triase IGD & Rawat) ─── */}
            {(eocPopup.type === 'hospital' || eocPopup.type === 'clinic' || eocPopup.type === 'pustu' || eocPopup.isTerdampak) && (() => {
              const triage = getFaskesTriageData(eocPopup.rawItem, eocPopup.name, faskesList)
              if (!triage) return null

              const totalPatients = triage.total || (triage.merah + triage.kuning + triage.hijau + triage.hitam)
              const hasPatients = totalPatients > 0

              return (
                <div className="mt-2.5 pt-2.5 border-t border-slate-150 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-800 flex items-center gap-1">
                      <Activity className="h-3.5 w-3.5 text-rose-600" />
                      Kondisi Pasien (Triase)
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${triage.merah > 0
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : hasPatients
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}>
                      {hasPatients ? `Total: ${totalPatients} Pasien` : '0 Pasien'}
                    </span>
                  </div>

                  {/* 4 Kolom Triase Mini Badge Grid */}
                  <div className="grid grid-cols-4 gap-1 text-center">
                    <div className="rounded-lg bg-rose-50 border border-rose-200/90 p-1.5 flex flex-col items-center justify-center">
                      <span className="block text-[8px] font-black text-rose-600 uppercase leading-none">Merah</span>
                      <span className="text-[13px] font-black text-rose-700 mt-0.5 block leading-tight">{triage.merah}</span>
                      <span className="text-[7.5px] text-rose-500 font-bold block leading-none mt-0.5">Kritis</span>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-200/90 p-1.5 flex flex-col items-center justify-center">
                      <span className="block text-[8px] font-black text-amber-700 uppercase leading-none">Kuning</span>
                      <span className="text-[13px] font-black text-amber-800 mt-0.5 block leading-tight">{triage.kuning}</span>
                      <span className="text-[7.5px] text-amber-600 font-bold block leading-none mt-0.5">Mendesak</span>
                    </div>
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200/90 p-1.5 flex flex-col items-center justify-center">
                      <span className="block text-[8px] font-black text-emerald-700 uppercase leading-none">Hijau</span>
                      <span className="text-[13px] font-black text-emerald-800 mt-0.5 block leading-tight">{triage.hijau}</span>
                      <span className="text-[7.5px] text-emerald-600 font-bold block leading-none mt-0.5">Ringan</span>
                    </div>
                    <div className="rounded-lg bg-slate-100 border border-slate-300 p-1.5 flex flex-col items-center justify-center">
                      <span className="block text-[8px] font-black text-slate-700 uppercase leading-none">Hitam</span>
                      <span className="text-[13px] font-black text-slate-900 mt-0.5 block leading-tight">{triage.hitam}</span>
                      <span className="text-[7.5px] text-slate-500 font-bold block leading-none mt-0.5">Meninggal</span>
                    </div>
                  </div>

                  {triage.catatan ? (
                    <div className="mt-1 px-2.5 py-1.5 rounded-lg bg-amber-50/80 border border-amber-200 text-[10px] text-amber-900 leading-tight">
                      <strong className="font-bold text-amber-950">Catatan:</strong> {triage.catatan}
                    </div>
                  ) : null}
                </div>
              )
            })()}

            {/* List Relawan TCK yang siaga di Faskes Ini (Cross-Reference) */}
            {(eocPopup.type === 'hospital' || eocPopup.type === 'clinic' || eocPopup.type === 'pustu') && (() => {
              const matchedTck = (tckList || []).filter((r: any) => {
                const occ = String(r.pekerjaan || '').toLowerCase()
                const fName = String(eocPopup.name || '').toLowerCase()
                return (occ && (fName.includes(occ) || occ.includes(fName))) ||
                  (r.kab_kota && String(eocPopup.address || '').toLowerCase().includes(String(r.kab_kota).toLowerCase()))
              })

              if (matchedTck.length === 0) return null

              return (
                <div className="mt-2.5 pt-2.5 border-t border-slate-150">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-black uppercase text-teal-800 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                      Relawan TCK Siaga ({matchedTck.length})
                    </span>
                    <span className="text-[9px] text-slate-400 font-medium">TCK Kemkes RI</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-teal-50">
                    {matchedTck.map((tck: any, tIdx: number) => {
                      const cleanPhone = String(tck.nomor_telp || '081234567890').replace(/[^0-9]/g, '')
                      const displayName = tck.nama && String(tck.nama).trim() !== '' && tck.nama !== '-'
                        ? tck.nama
                        : (tck.nama_relawan || tck.nama_lengkap || (tck.spesifikasi && tck.spesifikasi !== '-' ? `Relawan (${tck.spesifikasi})` : `Relawan TCK #${tIdx + 1}`))
                      const displayRole = (tck.spesifikasi && tck.spesifikasi !== '-')
                        ? tck.spesifikasi
                        : (tck.golongan && tck.golongan !== '-'
                          ? tck.golongan
                          : (tck.pekerjaan && tck.pekerjaan !== '-' ? tck.pekerjaan : 'Tenaga Medis'))
                      const waUrl = `https://wa.me/${cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone}?text=Halo%20${encodeURIComponent(displayName)},%20kami%20menghubungi%20dari%20EOC%20SIPKK%20Kemenkes%20terkait%20penanganan%20kejadian%20bencana.`
                      return (
                        <div key={tIdx} className="flex items-center justify-between p-2 rounded-lg bg-teal-50/60 hover:bg-teal-50 border border-teal-100/80 text-[10px] transition">
                          <div className="min-w-0 pr-1.5 flex-1">
                            <strong className="text-slate-800 truncate block font-bold leading-tight">{displayName}</strong>
                            <span className="text-teal-700 text-[9px] block truncate font-medium mt-0.5">{displayRole}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => {
                                if (onSelectRouteTarget) {
                                  onSelectRouteTarget({
                                    ...tck,
                                    latitude: eocPopup.lat,
                                    longitude: eocPopup.lng
                                  }, 'tck')
                                }
                                setEocPopup(null)
                              }}
                              className="px-2 py-1 rounded-md bg-teal-600 hover:bg-teal-700 text-white font-bold text-[9.5px] transition shadow-xs"
                              title="Set Rute ke Dokter/Relawan Ini"
                            >
                              Rute
                            </button>
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9.5px] transition shadow-xs"
                              title="Chat WhatsApp"
                            >
                              WA
                            </a>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Footer Actions */}
          <div className="border-t border-slate-100 p-2.5 bg-slate-50/50 flex gap-2">
            {eocPopup.type === 'earthquake' ? (
              <div className="w-full flex gap-2">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${eocPopup.lat},${eocPopup.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white py-2 text-[11px] font-bold shadow-xs transition"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Buka Titik Koordinat di Google Maps
                </a>
              </div>
            ) : eocPopup.isTerdampak ? (
              /* Faskes Terdampak: tidak bisa dijadikan rute, tampilkan peringatan + link lokasi */
              <>
                <div className="flex-1 flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-2.5 py-2 text-[10px] font-bold text-rose-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Tidak dapat dijadikan tujuan rute — faskes ini sedang terdampak bencana</span>
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${eocPopup.lat},${eocPopup.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-700 px-3 py-2 text-[11px] font-bold transition shrink-0"
                  title="Lihat di Google Maps"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Lokasi
                </a>
              </>
            ) : eocPopup.type !== 'disaster' ? (
              <>
                <button
                  onClick={() => {
                    if (onSelectRouteTarget) {
                      onSelectRouteTarget(eocPopup.rawItem, eocPopup.type as any)
                    }
                    setEocPopup(null)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white py-2 text-[11px] font-bold shadow-xs transition"
                >
                  <Compass className="h-3.5 w-3.5" />
                  {eocPopup.type === 'tck' ? 'Rute ke TCK' : 'Rute Taktis'}
                </button>
                {eocPopup.type === 'tck' && eocPopup.details?.nomor_telp && (
                  <a
                    href={`https://wa.me/${String(eocPopup.details.nomor_telp).replace(/[^0-9]/g, '').startsWith('0') ? '62' + String(eocPopup.details.nomor_telp).replace(/[^0-9]/g, '').slice(1) : String(eocPopup.details.nomor_telp).replace(/[^0-9]/g, '')}?text=Halo%20${encodeURIComponent(eocPopup.name)},%20kami%20menghubungi%20dari%20EOC%20SIPKK%20Kemenkes.`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-[11px] font-bold transition shadow-xs"
                    title="Hubungi WhatsApp"
                  >
                    WA
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${eocPopup.lat},${eocPopup.lng}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 px-3 py-2 text-[11px] font-bold transition"
                  title="Buka di Google Maps"
                >
                  <Globe className="h-3.5 w-3.5 text-teal-700" />
                  G-Maps
                </a>
              </>
            ) : (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${eocPopup.lat},${eocPopup.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white py-2 text-[11px] font-bold shadow-xs transition"
              >
                <MapPin className="h-3.5 w-3.5" />
                Lihat di Google Maps
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Polygon Popup (Province / Kabupaten Click) ── */}
      {activePopup && (
        <div className="absolute right-4 top-14 z-20 w-[330px] sm:w-[380px] max-h-[540px] flex flex-col rounded-2xl border border-teal-300/80 bg-white/95 backdrop-blur-md p-4 shadow-[0_16px_50px_rgba(15,118,110,0.18)] transition-all duration-300 animate-in fade-in slide-in-from-top-2">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 pb-2.5 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="inline-block rounded-full bg-teal-100 text-teal-800 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
                  Detail {activePopup.type}
                </span>
                <span className="inline-block rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[9px] font-bold">
                  Data Terbuka
                </span>
              </div>
              <h4 className="text-base font-black uppercase tracking-wider text-slate-900 truncate">
                {activePopup.name}
              </h4>
            </div>
            <button
              onClick={() => setActivePopup(null)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              title="Tutup Detail"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Ringkasan Statistik 2x2 Grid ── */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {/* Meninggal */}
            <div className="rounded-xl bg-rose-50/90 p-2.5 border border-rose-200/70">
              <p className="text-[9.5px] font-extrabold text-rose-800 uppercase tracking-wide">Meninggal</p>
              <p className="text-lg font-black text-rose-950">
                {(activePopup.stats.meninggal ?? 0).toLocaleString('id-ID')} <span className="text-[10px] font-bold text-rose-700">Jiwa</span>
              </p>
            </div>

            {/* Luka-luka */}
            <div className="rounded-xl bg-amber-50/90 p-2.5 border border-amber-200/70">
              <p className="text-[9.5px] font-extrabold text-amber-800 uppercase tracking-wide">Luka-Luka</p>
              <p className="text-lg font-black text-amber-950">
                {(activePopup.stats.totalLuka ?? activePopup.stats.totalKorban ?? 0).toLocaleString('id-ID')} <span className="text-[10px] font-bold text-amber-700">Jiwa</span>
              </p>
            </div>

            {/* Pengungsi */}
            <div className="rounded-xl bg-sky-50/90 p-2.5 border border-sky-200/70">
              <p className="text-[9.5px] font-extrabold text-sky-800 uppercase tracking-wide">Pengungsi</p>
              <p className="text-lg font-black text-sky-950">
                {(activePopup.stats.pengungsi ?? 0).toLocaleString('id-ID')} <span className="text-[10px] font-bold text-sky-700">Jiwa</span>
              </p>
            </div>

            {/* Terdampak / Posko */}
            <div className="rounded-xl bg-teal-50/90 p-2.5 border border-teal-200/70">
              <p className="text-[9.5px] font-extrabold text-teal-800 uppercase tracking-wide">Populasi Terdampak</p>
              <p className="text-lg font-black text-teal-950">
                {(activePopup.stats.populasiTerdampak ?? 0) > 0
                  ? `${(activePopup.stats.populasiTerdampak ?? 0).toLocaleString('id-ID')} Jiwa`
                  : `${activePopup.stats.totalEvents} Kejadian`}
              </p>
            </div>
          </div>

          {/* ── Detail Content List (Scrollable) ── */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 max-h-[220px]">
            {activePopup.type === 'provinsi' ? (
              <>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                  Sebaran Kejadian per Kab/Kota:
                </p>
                {activePopup.stats.breakdown.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Tidak ada kejadian bencana tercatat.</p>
                ) : (
                  <div className="space-y-1.5">
                    {activePopup.stats.breakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center rounded-lg bg-slate-50 p-2 text-xs border border-slate-100">
                        <span className="font-semibold text-slate-700 truncate max-w-[180px]">{item.name}</span>
                        <div className="flex items-center gap-1.5">
                          {item.totalKorban ? (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                              {item.totalKorban} korban
                            </span>
                          ) : null}
                          <span className="font-extrabold text-slate-900 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md">
                            {item.count} kejadian
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Faskes List in this Kabupaten */}
                {activePopup.stats.faskesList && activePopup.stats.faskesList.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-teal-800 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-teal-600" />
                      Fasilitas Kesehatan Terkait ({activePopup.stats.faskesList.length} Unit):
                    </p>
                    <div className="space-y-1.5">
                      {activePopup.stats.faskesList.map((f: any, idx: number) => (
                        <div key={idx} className="rounded-xl border border-teal-100 bg-teal-50/40 p-2 text-xs">
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-bold text-slate-800 text-[11px] truncate">{f.nama || f.nama_faskes}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 font-medium">
                            {f.kecamatan && <span>Kec. {f.kecamatan}</span>}
                            {f.tt_tersedia && <span>• {f.tt_tersedia} TT Tersedia</span>}
                            {f.dokter && <span>• {f.dokter} Dokter</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Posko List in this Kabupaten */}
                {activePopup.stats.poskoList && activePopup.stats.poskoList.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-sky-800 flex items-center gap-1">
                      <Tent className="w-3.5 h-3.5 text-sky-600" />
                      Pos Pengungsian ({activePopup.stats.poskoList.length} Posko):
                    </p>
                    <div className="space-y-1.5">
                      {activePopup.stats.poskoList.map((pos: any, idx: number) => (
                        <div key={idx} className="rounded-xl border border-sky-100 bg-sky-50/40 p-2 text-xs">
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-bold text-slate-800 text-[11px] truncate">{pos.nama || pos.nama_pos}</span>
                            <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-white border border-sky-200 text-sky-800 shrink-0">
                              {(pos.jumlah_jiwa || pos.jiwa || 0).toLocaleString('id-ID')} Jiwa
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500 font-medium truncate">
                            {pos.lokasi_spesifik || pos.kecamatan || 'Posko Pengungsian'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Events list in this Kabupaten */}
                {activePopup.stats.eventsList && activePopup.stats.eventsList.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Titik Kejadian Bencana ({activePopup.stats.eventsList.length}):
                    </p>
                    <div className="space-y-1.5">
                      {activePopup.stats.eventsList.map((item, idx) => (
                        <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2 text-xs">
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-teal-800">{formatDisasterName(item.jenis_bencana)}</span>
                            <span className="text-[10px] text-slate-400">{item.tgl_kejadian}</span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {item.kecamatan && <span>Kec. {item.kecamatan}</span>}
                            {item.nama_desa && <span>, Desa {item.nama_desa}</span>}
                          </div>
                          <div className="mt-1 flex items-center justify-between border-t border-dashed border-slate-200 pt-1">
                            <span className="text-[10px] text-slate-400">Total Korban:</span>
                            <span className="font-bold text-red-600">{item.total_korban} orang</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Warnings from BMKG/API Indonesia */}
          {activePopup.warnings && activePopup.warnings.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-red-500 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                PERINGATAN DINI CUACA BMKG:
              </p>
              <div className="max-h-[70px] overflow-y-auto space-y-1 pr-1">
                {activePopup.warnings.map((w, idx) => (
                  <div key={idx} className="bg-red-50 border border-red-100 rounded-lg p-1.5 text-[10px] text-slate-700">
                    <strong className="text-red-700 block">{w.event}</strong>
                    <span className="block text-slate-600">{w.area}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2">
            {activePopup.featureExtent && (
              <button
                onClick={() => {
                  if (mapInstanceRef.current && activePopup.featureExtent) {
                    mapInstanceRef.current.getView().fit(activePopup.featureExtent, { padding: [70, 70, 70, 70], duration: 600 })
                  }
                }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 py-2 text-xs font-bold text-white shadow-xs transition active:scale-[0.98]"
              >
                <Compass className="w-3.5 h-3.5" />
                Fokus Wilayah
              </button>
            )}

            {activePopup.type === 'provinsi' && (
              <button
                onClick={() => {
                  onSelectProvinceRef.current?.(activePopup.name)
                  setActivePopup(null)
                }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 py-2 text-xs font-bold text-white shadow-xs transition"
              >
                Lihat Detail Provinsi &rarr;
              </button>
            )}

            <button
              onClick={() => setActivePopup(null)}
              className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-bold transition"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* ── Legend (bottom-left) ── */}
      {((showWindLegend && showWindy) || showRegionLegend || showCasualtyLegend) && (
        <div className="absolute bottom-4 left-4 max-w-[280px] sm:max-w-[320px] rounded-2xl border border-teal-200/90 bg-white/95 backdrop-blur-md p-3.5 shadow-[0_8px_30px_rgba(15,118,110,0.15)] space-y-3 z-10 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-teal-700" />
              <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">Legenda Peta Spasial</span>
            </div>
            <button
              onClick={() => {
                setShowWindLegend(false)
                setShowRegionLegend(false)
                setShowCasualtyLegend(false)
              }}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition"
              title="Tutup Legenda (Bisa diaktifkan lagi di Pengaturan Peta)"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Wind Speed & Direction Legend */}
          {showWindLegend && showWindy && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-800 flex items-center gap-1">
                  <Wind className="h-3 w-3 text-teal-650" />
                  Aliran &amp; Kecepatan Angin (GFS)
                </span>
              </div>

              {/* Gradient Bar */}
              <div className="h-2 w-full rounded-full bg-gradient-to-r from-[rgb(15,60,140)] via-[rgb(85,160,115)] via-[rgb(215,195,60)] via-[rgb(210,125,35)] to-[rgb(185,35,10)] shadow-inner" />
              <div className="flex justify-between text-[8.5px] font-bold text-slate-500 px-0.5">
                <span>0 km/j</span>
                <span>20 km/j</span>
                <span>40 km/j</span>
                <span>&gt;60 km/j</span>
              </div>

              {/* Color Categories */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 text-[9.5px]">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#55a073] shrink-0 border border-slate-200" />
                  <span className="text-slate-700 font-semibold">🟢 Hijau: Normal / Tenang</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#d7c33c] shrink-0 border border-slate-200" />
                  <span className="text-slate-700 font-semibold">🟡 Kuning: Sedang</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#b9230a] shrink-0 border border-slate-200" />
                  <span className="text-slate-700 font-semibold">🔴 Merah: Kencang / Bahaya</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#730012] shrink-0 border border-slate-200" />
                  <span className="text-slate-700 font-semibold">🟣 Ungu: Badai Ekstrem</span>
                </div>
              </div>

              <div className="bg-teal-50/60 rounded-lg p-1.5 border border-teal-100 text-[9px] text-teal-800 leading-tight">
                🧭 <strong>Mata Angin:</strong> Garis partikel bergerak mengikuti arah tiupan angin (dari hulu ke hilir tujuan).
              </div>
            </div>
          )}

          {/* Choropleth legend */}
          {showRegionLegend && (
            <div className="border-t border-slate-100 pt-2">
              <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#0f766e]">{markerTitle}</p>
              <div className="space-y-1">
                {choroplethLegend.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full border border-slate-200 shadow-xs" style={{ background: b.color }} />
                    <span className="text-[10px] font-medium text-slate-700">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pin Marker (Korban) legend */}
          {showCasualtyLegend && (
            <div className="border-t border-slate-100 pt-2">
              <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-red-600">Skala Dampak Korban Bencana</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9.5px]">
                {[
                  { label: '0 korban', color: '#94a3b8' },
                  { label: '1 – 5 korban', color: '#facc15' },
                  { label: '6 – 20 korban', color: '#f97316' },
                  { label: '> 20 korban', color: '#dc2626' },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-200 shadow-xs animate-pulse" style={{ background: b.color }} />
                    <span className="text-slate-700 font-semibold">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}


    </div>
  )
}
