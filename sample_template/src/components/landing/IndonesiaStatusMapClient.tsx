'use client'

import { useEffect, useRef, useState } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import GeoJSON from 'ol/format/GeoJSON'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Fill, Stroke, Style } from 'ol/style'
import { fromLonLat } from 'ol/proj'
import { defaults as defaultControls } from 'ol/control'
import type { FeatureLike } from 'ol/Feature'
import type Feature from 'ol/Feature'
import 'ol/ol.css'

type DensityLevel = 'Rendah' | 'Sedang' | 'Tinggi' | 'Sangat Tinggi'
type DensityBreaks = {
  q1: number
  q2: number
  q3: number
}

// Fixed thresholds: <50 (rendah), 50-99 (sedang), 100-149 (tinggi), >=150 (sangat tinggi)
const MIN_DENSITY_BREAKS: DensityBreaks = {
  q1: 50,
  q2: 100,
  q3: 150,
}

// Sequential: red (rendah/sedikit) → green (sangat tinggi/banyak faskes)
const densityColors: Record<DensityLevel, string> = {
  Rendah: '#d73027',
  Sedang: '#fee08b',
  Tinggi: '#91cf60',
  'Sangat Tinggi': '#1a9850',
}

const densityOrder: DensityLevel[] = ['Rendah', 'Sedang', 'Tinggi', 'Sangat Tinggi']

function normalizeProvinceName(value: string) {
  return value
    .toUpperCase()
    .replace(/\bD\.I\.\s*/g, 'D.I. ')
    .replace(/\bDI\.\s*/g, 'DI. ')
    .replace(/\bNUSA\s+TENGGARA\b/g, 'NUSATENGGARA')
    .replace(/\bDAERAH ISTIMEWA YOGYAKARTA\b/g, 'DI YOGYAKARTA')
    .replace(/\bBANTEN\b/g, 'PROBANTEN')
    .replace(/\s+/g, ' ')
    .trim()
}

function toGeoProvinceName(value: string) {
  const normalized = normalizeProvinceName(value)
  const papuaAliasToGeo: Record<string, string> = {
    PAPUA: 'IRIAN JAYA TIMUR',
    'PAPUA SELATAN': 'IRIAN JAYA TIMUR',
    'PAPUA PEGUNUNGAN': 'IRIAN JAYA TENGAH',
    'PAPUA TENGAH': 'IRIAN JAYA TENGAH',
    'PAPUA BARAT': 'IRIAN JAYA BARAT',
    'PAPUA BARAT DAYA': 'IRIAN JAYA BARAT',
  }
  return papuaAliasToGeo[normalized] ?? normalized
}

type PetaSebaranItem = {
  kode?: string
  nama?: string
  kode_provinsi?: string
  nama_provinsi?: string
  total_rs?: string | number
  total_puskesmas?: string | number
  total_posyandu?: string | number
  total_klinik?: string | number
  total_pustu?: string | number
  total_bkk?: string | number
  total_faskes?: string | number
  jumlah_penduduk?: string | number
  jml_penduduk?: string | number
  penduduk?: string | number
  populasi?: string | number
  rasio?: string | number
  rasio_kepadatan?: string | number
  rasio_faskes_per_100k?: string | number
  properties?: PetaSebaranItem
  features?: PetaSebaranItem[]
}
type PetaMetrics = {
  densityValue: number
  totalFaskes: number
  population: number
}

function toNumber(value: string | number | undefined) {
  if (typeof value === 'number') return value
  const parsed = Number.parseFloat((value ?? '0').toString().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function calculateTotalFaskes(item: PetaSebaranItem) {
  return (
    toNumber(item.total_rs) +
    toNumber(item.total_puskesmas) +
    toNumber(item.total_posyandu) +
    toNumber(item.total_klinik) +
    toNumber(item.total_pustu) +
    toNumber(item.total_bkk)
  )
}

function extractPetaRows(payloadData: unknown): PetaSebaranItem[] {
  const visited = new Set<unknown>()

  const walk = (node: unknown): PetaSebaranItem[] => {
    if (!node || visited.has(node)) return []
    visited.add(node)

    if (Array.isArray(node)) {
      return node as PetaSebaranItem[]
    }

    if (typeof node !== 'object') return []
    const obj = node as Record<string, unknown>

    if (Array.isArray(obj.features)) {
      return obj.features as PetaSebaranItem[]
    }

    // Common wrappers from gateways/backend
    const candidateKeys = ['data', 'result', 'payload', 'response']
    for (const key of candidateKeys) {
      if (key in obj) {
        const rows = walk(obj[key])
        if (rows.length > 0) return rows
      }
    }

    return []
  }

  return walk(payloadData)
}

function extractGeoJsonFeatureCollection(payloadData: unknown): Record<string, unknown> | null {
  const visited = new Set<unknown>()

  const walk = (node: unknown): Record<string, unknown> | null => {
    if (!node || visited.has(node)) return null
    visited.add(node)

    if (typeof node !== 'object') return null
    const obj = node as Record<string, unknown>
    const typeValue = String(obj.type ?? '')
    if (typeValue === 'FeatureCollection' && Array.isArray(obj.features)) {
      return obj
    }

    for (const value of Object.values(obj)) {
      if (!value) continue
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = walk(item)
          if (found) return found
        }
        continue
      }
      const found = walk(value)
      if (found) return found
    }

    return null
  }

  return walk(payloadData)
}

function getFeatureProvinceName(feature: FeatureLike) {
  return String(
    feature.get('nama_provinsi') ??
      feature.get('nama') ??
      feature.get('Propinsi') ??
      '',
  )
}

function getFeatureProvinceCode(feature: FeatureLike) {
  return String(
    feature.get('kode_provinsi') ??
      feature.get('kode') ??
      feature.get('Kode') ??
      '',
  ).trim()
}

function percentile(sortedValues: number[], p: number) {
  if (sortedValues.length === 0) return 0
  const idx = (sortedValues.length - 1) * p
  const low = Math.floor(idx)
  const high = Math.ceil(idx)
  if (low === high) return sortedValues[low]
  const weight = idx - low
  return sortedValues[low] * (1 - weight) + sortedValues[high] * weight
}

function createDensityBreaks(values: number[]): DensityBreaks {
  const valid = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b)
  if (valid.length === 0) return MIN_DENSITY_BREAKS

  const min = valid[0]
  const max = valid[valid.length - 1]
  if (min === max) {
    return {
      q1: Math.max(min, MIN_DENSITY_BREAKS.q1),
      q2: Math.max(min, MIN_DENSITY_BREAKS.q2),
      q3: Math.max(min, MIN_DENSITY_BREAKS.q3),
    }
  }

  const q1 = percentile(valid, 0.25)
  const q2 = percentile(valid, 0.5)
  const q3 = percentile(valid, 0.75)
  return {
    q1: Math.max(q1, MIN_DENSITY_BREAKS.q1),
    q2: Math.max(q2, MIN_DENSITY_BREAKS.q2),
    q3: Math.max(q3, MIN_DENSITY_BREAKS.q3),
  }
}

function levelFromDensity(value: number, breaks: DensityBreaks): DensityLevel {
  if (value < breaks.q1) return 'Rendah'
  if (value < breaks.q2) return 'Sedang'
  if (value < breaks.q3) return 'Tinggi'
  return 'Sangat Tinggi'
}

function formatRange(min: number, max: number) {
  return `${min.toFixed(2)} - ${max.toFixed(2)}`
}

export default function IndonesiaStatusMapClient({
  selectedProvinsi = '',
  selectedKabupaten = '',
}: {
  selectedProvinsi?: string
  selectedKabupaten?: string
}) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<Map | null>(null)
  const provinceLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const provinceSourceRef = useRef<VectorSource | null>(null)
  const activeFilterRef = useRef<DensityLevel | null>(null)
  const selectedProvinceGeoKeyRef = useRef<string>('')
  const densityByProvinceNameRef = useRef<Record<string, number>>({})
  const densityByProvinceCodeRef = useRef<Record<string, number>>({})
  const densityBreaksRef = useRef<DensityBreaks>(MIN_DENSITY_BREAKS)
  const metricsByProvinceNameRef = useRef<Record<string, PetaMetrics>>({})
  const metricsByProvinceCodeRef = useRef<Record<string, PetaMetrics>>({})
  const displayNameByGeoNameRef = useRef<Record<string, string>>({})
  const displayCodeByGeoNameRef = useRef<Record<string, string>>({})
  const [showFormulaModal, setShowFormulaModal] = useState(false)
  const [legendRanges, setLegendRanges] = useState<Record<DensityLevel, string>>({
    Rendah: '< 35',
    Sedang: '35 - 55',
    Tinggi: '55 - 75',
    'Sangat Tinggi': '> 75',
  })
  const [activeFilter, setActiveFilter] = useState<DensityLevel | null>(null)
  const [selectedProvince, setSelectedProvince] = useState<{
    name: string
    geoKey: string
    densityLevel: DensityLevel
    densityValue: number
    kode: string | number
    totalFaskes: number
    population: number
  } | null>(null)

  useEffect(() => {
    activeFilterRef.current = activeFilter
  }, [activeFilter])

  useEffect(() => {
    selectedProvinceGeoKeyRef.current = selectedProvince?.geoKey || ''
  }, [selectedProvince])

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/dashboard-faskes/peta-sebaran', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kode_provinsi: selectedProvinsi,
          kode_kabupaten: selectedKabupaten,
        }),
      })
      if (!response.ok) return
      const payload = (await response.json()) as { data?: unknown }
      const rows = extractPetaRows(payload.data)
      const byName: Record<string, number> = {}
      const byCode: Record<string, number> = {}
      const metricsByName: Record<string, PetaMetrics> = {}
      const metricsByCode: Record<string, PetaMetrics> = {}
      const displayNameByGeoName: Record<string, string> = {}
      const displayCodeByGeoName: Record<string, string> = {}
      const displayScoreByGeoName: Record<string, number> = {}
      const densityValues: number[] = []

      const mergeMetrics = (
        container: Record<string, PetaMetrics>,
        key: string,
        next: { totalFaskes: number; population: number },
      ) => {
        if (!key) return
        const prev = container[key]
        const mergedTotal = (prev?.totalFaskes ?? 0) + next.totalFaskes
        const mergedPopulation = (prev?.population ?? 0) + next.population
        container[key] = {
          totalFaskes: mergedTotal,
          population: mergedPopulation,
          densityValue:
            mergedPopulation > 0 ? (mergedTotal / mergedPopulation) * 100000 : 0,
        }
      }

      for (const item of rows) {
        const source = item.properties ?? item
        const totalFaskes = toNumber(source.total_faskes) || calculateTotalFaskes(source)
        const population = toNumber(
          source.jumlah_penduduk ?? source.jml_penduduk ?? source.penduduk ?? source.populasi,
        )
        const apiNameRaw = String(source.nama ?? source.nama_provinsi ?? '').trim()
        const name = toGeoProvinceName(apiNameRaw)
        const code = String(source.kode ?? source.kode_provinsi ?? '').trim()
        if (name) {
          mergeMetrics(metricsByName, name, { totalFaskes, population })
          if (apiNameRaw) {
            const score = totalFaskes
            const isPreferredBySelectedCode =
              Boolean(selectedProvinsi) && code === String(selectedProvinsi).trim()
            const hasNoChoiceYet = !(name in displayNameByGeoName)
            const shouldReplace =
              hasNoChoiceYet ||
              isPreferredBySelectedCode ||
              score > (displayScoreByGeoName[name] ?? -1)

            if (shouldReplace) {
              displayNameByGeoName[name] = apiNameRaw
              displayCodeByGeoName[name] = code
              displayScoreByGeoName[name] = score
            }
          }
        }
        if (code) {
          mergeMetrics(metricsByCode, code, { totalFaskes, population })
        }
      }
      for (const metric of Object.values(metricsByName)) densityValues.push(metric.densityValue)
      for (const metric of Object.values(metricsByCode)) densityValues.push(metric.densityValue)
      Object.entries(metricsByName).forEach(([name, metric]) => {
        byName[name] = metric.densityValue
      })
      Object.entries(metricsByCode).forEach(([code, metric]) => {
        byCode[code] = metric.densityValue
      })
      const nextBreaks = createDensityBreaks(densityValues)
      densityBreaksRef.current = nextBreaks
      setLegendRanges({
        Rendah: `<= ${nextBreaks.q1.toFixed(2)}`,
        Sedang: formatRange(nextBreaks.q1, nextBreaks.q2),
        Tinggi: formatRange(nextBreaks.q2, nextBreaks.q3),
        'Sangat Tinggi': `> ${nextBreaks.q3.toFixed(2)}`,
      })
      densityByProvinceNameRef.current = byName
      densityByProvinceCodeRef.current = byCode
      metricsByProvinceNameRef.current = metricsByName
      metricsByProvinceCodeRef.current = metricsByCode
      displayNameByGeoNameRef.current = displayNameByGeoName
      displayCodeByGeoNameRef.current = displayCodeByGeoName

      const featureCollection =
        extractGeoJsonFeatureCollection(payload.data) ??
        extractGeoJsonFeatureCollection(payload)
      const source = provinceSourceRef.current
      if (source && featureCollection) {
        const format = new GeoJSON()
        const nextFeatures = format.readFeatures(featureCollection, {
          dataProjection: 'EPSG:4326',
          featureProjection: 'EPSG:3857',
        })
        source.clear(true)
        source.addFeatures(nextFeatures)
        const extent = source.getExtent()
        if (extent && mapInstanceRef.current) {
          mapInstanceRef.current.getView().fit(extent, {
            padding: [20, 20, 20, 20],
            duration: 250,
            maxZoom: 5.8,
          })
        }
      }
      provinceLayerRef.current?.changed()
    })()
  }, [selectedProvinsi, selectedKabupaten])

  useEffect(() => {
    if (!mapRef.current) return

    const provinceSource = new VectorSource()

    const provinceLayer = new VectorLayer({
      source: provinceSource,
      style: (feature: FeatureLike) => {
        const name = getFeatureProvinceName(feature)
        const code = getFeatureProvinceCode(feature)
        const densityFromName =
          densityByProvinceNameRef.current[normalizeProvinceName(name)]
        const densityFromCode = densityByProvinceCodeRef.current[code]
        const densityValue = densityFromCode ?? densityFromName ?? 0
        const densityLevel = levelFromDensity(densityValue, densityBreaksRef.current)
        const featureGeoKey = normalizeProvinceName(name)
        const selectedGeoKey = selectedProvinceGeoKeyRef.current
        const hasSelectedProvince = selectedGeoKey !== ''
        const isSelected = hasSelectedProvince && selectedGeoKey === featureGeoKey
        const disabled = hasSelectedProvince
          ? !isSelected
          : activeFilterRef.current !== null && densityLevel !== activeFilterRef.current
        return new Style({
          fill: new Fill({
            color: disabled ? 'rgba(210, 210, 210, 0.4)' : densityColors[densityLevel],
          }),
          stroke: new Stroke({
            color: isSelected ? '#111' : '#ffffff',
            width: isSelected ? 2.5 : 0.8,
          }),
        })
      },
    })

    const map = new Map({
      target: mapRef.current,
      layers: [provinceLayer],
      controls: defaultControls({ attribution: false }),
      view: new View({
        center: fromLonLat([118, -2.5]),
        zoom: 4.6,
        minZoom: 4,
        maxZoom: 8.5,
      }),
    })

    map.on('singleclick', (evt) => {
      const clickedFeature =
        map.forEachFeatureAtPixel(evt.pixel, (f) => f as Feature) ?? null
      if (!clickedFeature) {
        setSelectedProvince(null)
        setActiveFilter(null)
        return
      }
      const propinsiName = getFeatureProvinceName(clickedFeature)
      const geoKey = normalizeProvinceName(propinsiName)
      const code = getFeatureProvinceCode(clickedFeature)
      const densityValue =
        densityByProvinceCodeRef.current[code] ??
        densityByProvinceNameRef.current[geoKey] ??
        0
      const metrics =
        metricsByProvinceCodeRef.current[code] ??
        metricsByProvinceNameRef.current[geoKey] ?? {
          densityValue,
          totalFaskes: 0,
          population: 0,
        }
      const displayName = displayNameByGeoNameRef.current[geoKey] ?? propinsiName
      const displayCode = displayCodeByGeoNameRef.current[geoKey] || code || '-'
      const densityLevel = levelFromDensity(densityValue, densityBreaksRef.current)
      setSelectedProvince({
        name: displayName,
        geoKey,
        densityLevel,
        densityValue: metrics.densityValue,
        kode: displayCode,
        totalFaskes: metrics.totalFaskes,
        population: metrics.population,
      })
      const geometry = clickedFeature.getGeometry()
      if (!geometry) return
      map.getView().fit(geometry.getExtent(), {
        duration: 350,
        padding: [40, 40, 40, 40],
        maxZoom: 7.5,
      })
    })

    mapInstanceRef.current = map
    provinceLayerRef.current = provinceLayer
    provinceSourceRef.current = provinceSource

    return () => {
      map.setTarget(undefined)
      mapInstanceRef.current = null
      provinceLayerRef.current = null
      provinceSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!provinceLayerRef.current || !provinceSourceRef.current) return
    provinceLayerRef.current.changed()
    const source = provinceSourceRef.current
    if (activeFilter === null) return
    const firstMatch = source
      .getFeatures()
      .find(
        (f) => {
          const name = getFeatureProvinceName(f)
          const code = getFeatureProvinceCode(f)
          const densityValue =
            densityByProvinceCodeRef.current[code] ??
            densityByProvinceNameRef.current[normalizeProvinceName(name)] ??
            0
          return levelFromDensity(densityValue, densityBreaksRef.current) === activeFilter
        },
      )
    if (!firstMatch || !mapInstanceRef.current) return
    const geometry = firstMatch.getGeometry()
    if (!geometry) return
    mapInstanceRef.current.getView().fit(geometry.getExtent(), {
      duration: 300,
      padding: [60, 60, 60, 60],
      maxZoom: 6.6,
    })
  }, [activeFilter])

  useEffect(() => {
    provinceLayerRef.current?.changed()
  }, [selectedProvince])

  // Gradient bar hanya untuk card klik provinsi
  const gradientBar = `linear-gradient(to right, ${densityColors['Rendah']}, ${densityColors['Sedang']}, ${densityColors['Tinggi']}, ${densityColors['Sangat Tinggi']})`

  const markerPercent =
    selectedProvince
      ? selectedProvince.densityLevel === 'Rendah'
        ? 8
        : selectedProvince.densityLevel === 'Sedang'
        ? 35
        : selectedProvince.densityLevel === 'Tinggi'
        ? 65
        : 92
      : 0

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-2xl border border-[#cde9e8] bg-transparent sm:min-h-[510px]">
      <div ref={mapRef} className="h-full w-full" />

      {/* Legend choropleth */}
      <div className="absolute bottom-1.5 left-1.5 max-w-[68%] rounded-lg border border-[#bfe3e2] bg-[#f3fffe]/95 p-2 shadow-[0_8px_18px_rgba(9,88,89,0.1)] sm:bottom-5 sm:left-5 sm:min-w-[200px] sm:max-w-none sm:rounded-2xl sm:p-4 sm:shadow-[0_10px_30px_rgba(9,88,89,0.15)]">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#2a4040] sm:text-[12px]">
          Legenda
        </p>
        <p className="mb-1.5 hidden text-[10px] leading-relaxed text-[#4c6363] sm:mb-2 sm:block sm:text-[11px]">
          Gradasi kepadatan/jumlah total faskes per wilayah
        </p>
        <ul className="space-y-1 sm:space-y-1.5">
          {densityOrder.map((item) => {
            const isSelected = activeFilter === item
            const rangeLabel =
              legendRanges[item]
            const hintLabel =
              item === 'Rendah'
                ? 'Jumlah faskes sedikit'
                : item === 'Sedang'
                ? 'Jumlah faskes menengah'
                : item === 'Tinggi'
                ? 'Jumlah faskes tinggi'
                : 'Jumlah faskes sangat padat'
            return (
              <li
                key={item}
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition-all hover:bg-[#e9f7f7] sm:gap-2"
                style={{ opacity: activeFilter && !isSelected ? 0.45 : 1 }}
                onClick={() => setActiveFilter(isSelected ? null : item)}
              >
                <span
                  className="inline-block h-3 w-3 flex-shrink-0 rounded-[3px] sm:h-3.5 sm:w-3.5"
                  style={{
                    backgroundColor: densityColors[item],
                    outline: isSelected ? `2px solid ${densityColors[item]}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
                <span className="text-[11px] font-medium leading-tight sm:text-[13px]" style={{ color: isSelected ? densityColors[item] : '#3a5050' }}>
                  {item} ({rangeLabel})
                </span>
                <span className="hidden text-[10px] font-normal text-[#6c8585] sm:block">
                  {hintLabel}
                </span>
              </li>
            )
          })}
        </ul>
        {activeFilter && (
          <button
            className="mt-2 w-full rounded-md border border-[#c8e6e5] bg-white py-1 text-[11px] font-semibold text-[#0f8f96] transition-colors hover:bg-[#eef9f9] sm:mt-3 sm:py-1.5 sm:text-[12px]"
            onClick={() => setActiveFilter(null)}
          >
            RESET
          </button>
        )}
      </div>

      {/* Card provinsi — gradient bar muncul HANYA di sini saat diklik */}
      {selectedProvince && (
        <div className="absolute right-5 top-5 min-w-[250px] max-w-[270px] overflow-hidden rounded-2xl border border-[#bfe3e2] bg-[#f3fffe]/95 shadow-[0_10px_30px_rgba(9,88,89,0.15)]">
          {/* Strip warna level di atas card */}
          <div
            className="h-2 w-full"
            style={{ backgroundColor: densityColors[selectedProvince.densityLevel] }}
          />
          <div className="p-4">
            <p className="text-[12px] font-bold uppercase tracking-wide text-[#2a4040]">
              Provinsi Dipilih
            </p>
            <button
              type="button"
              onClick={() => setShowFormulaModal(true)}
              className="mt-2 rounded-md border border-[#b8dcdb] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#0f8f96] transition-colors hover:bg-[#eaf8f8]"
            >
              Lihat Rumus
            </button>
            <p className="mt-1 text-[20px] font-bold leading-tight text-[#223333]">
              {selectedProvince.name}
            </p>

            <p className="mt-2 text-[13px] text-[#4a6060]">
              Kategori:{' '}
              <span
                className="font-semibold"
                style={{ color: densityColors[selectedProvince.densityLevel], fontSize: '14px' }}
              >
                {selectedProvince.densityLevel}
              </span>
            </p>
            <p className="mt-1 text-[13px] text-[#4a6060]">
              Rasio faskes:{' '}
              <span className="font-semibold text-[#223333]">
                {selectedProvince.densityValue > 0
                  ? `${selectedProvince.totalFaskes.toLocaleString('id-ID')} / ${selectedProvince.population.toLocaleString('id-ID')} × 100.000 = ${selectedProvince.densityValue.toFixed(2)}`
                  : 'Data rasio tidak tersedia'}    
              </span>
            </p>
            <p className="mt-1 text-[13px] text-[#4a6060]">
              Total faskes:{' '}
              <span className="font-semibold text-[#223333]">
                {selectedProvince.totalFaskes.toLocaleString('id-ID')}
              </span>
            </p>
            <p className="mt-1 text-[13px] text-[#4a6060]">
              Jumlah penduduk:{' '}
              <span className="font-semibold text-[#223333]">
                {selectedProvince.population > 0
                  ? selectedProvince.population.toLocaleString('id-ID')
                  : 'Data tidak tersedia'}
              </span>
            </p>

            {/* Gradient bar posisi kepadatan — hanya di card ini */}
            <div className="mt-3">
              <p className="mb-1 text-[10px] text-[#7a9f9f]">Posisi kepadatan nasional</p>
              <div
                className="relative h-2.5 w-full rounded-full"
                style={{ background: gradientBar }}
              >
                <div
                  className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
                  style={{
                    left: `${markerPercent}%`,
                    backgroundColor: densityColors[selectedProvince.densityLevel],
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[#7a9f9f]">
                <span>Rendah</span>
                <span>Sangat Tinggi</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFormulaModal && selectedProvince && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/25 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#bfe3e2] bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-wide text-[#2a4040]">Keterangan Rumus</p>
                <p className="mt-1 text-[18px] font-bold text-[#223333]">{selectedProvince.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="rounded-md border border-[#cfe8e7] px-2 py-1 text-[12px] text-[#4a6060] hover:bg-[#f2f9f9]"
              >
                Tutup
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[13px] text-[#3f5454]">
              <p>
                Rasio dihitung dengan rumus: <strong>(Total Faskes / Jumlah Penduduk) × 100.000</strong>
              </p>
              <p>
                Substitusi data: <strong>({selectedProvince.totalFaskes.toLocaleString('id-ID')} / {selectedProvince.population.toLocaleString('id-ID')}) × 100.000</strong>
              </p>
              <p>
                Hasil: <strong>{selectedProvince.densityValue.toFixed(2)}</strong>
              </p>
              <ul className="list-disc pl-5 text-[12px] text-[#5a7070]">
                <li>Rendah: {legendRanges.Rendah}</li>
                <li>Sedang: {legendRanges.Sedang}</li>
                <li>Tinggi: {legendRanges.Tinggi}</li>
                <li>Sangat Tinggi: {legendRanges['Sangat Tinggi']}</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

