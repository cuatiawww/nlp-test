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

const densityColors: Record<DensityLevel, string> = {
  Rendah: '#d6ef72',
  Sedang: '#f6a43a',
  Tinggi: '#2a8f57',
  'Sangat Tinggi': '#234c9f',
}

const densityOrder: DensityLevel[] = ['Rendah', 'Sedang', 'Tinggi', 'Sangat Tinggi']

function normalizeProvinceName(value: string) {
  return value
    .toUpperCase()
    .replace(/\bD\.I\.\s*/g, 'D.I. ')
    .replace(/\bDI\.\s*/g, 'DI. ')
    .replace(/\s+/g, ' ')
    .trim()
}

function densityValueForProvinceName(name: string) {
  const normalized = normalizeProvinceName(name)
  let hash = 0
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0
  }
  return 18 + (hash % 67)
}

function levelFromDensity(value: number): DensityLevel {
  if (value < 35) return 'Rendah'
  if (value < 55) return 'Sedang'
  if (value < 75) return 'Tinggi'
  return 'Sangat Tinggi'
}

export default function IndonesiaStatusMapClient() {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<Map | null>(null)
  const provinceLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const provinceSourceRef = useRef<VectorSource | null>(null)
  const activeFilterRef = useRef<DensityLevel | null>(null)
  const selectedProvinceNameRef = useRef<string>('')
  const [activeFilter, setActiveFilter] = useState<DensityLevel | null>(null)
  const [selectedProvince, setSelectedProvince] = useState<{
    name: string
    densityLevel: DensityLevel
    densityValue: number
    kode: string | number
  } | null>(null)

  useEffect(() => {
    activeFilterRef.current = activeFilter
  }, [activeFilter])

  useEffect(() => {
    selectedProvinceNameRef.current = selectedProvince?.name || ''
  }, [selectedProvince])

  useEffect(() => {
    if (!mapRef.current) return

    const provinceSource = new VectorSource({
      url: '/indonesia-provinces.geojson',
      format: new GeoJSON(),
    })

    const provinceLayer = new VectorLayer({
      source: provinceSource,
      style: (feature: FeatureLike) => {
        const densityValue = densityValueForProvinceName(String(feature.get('Propinsi') || ''))
        const densityLevel = levelFromDensity(densityValue)
        const selectedName = selectedProvinceNameRef.current
        const isSelected = selectedName !== '' && selectedName === String(feature.get('Propinsi') || '')
        const disabled = activeFilterRef.current !== null && densityLevel !== activeFilterRef.current
        return new Style({
          fill: new Fill({
            color: disabled ? 'rgba(194, 219, 219, 0.45)' : densityColors[densityLevel],
          }),
          stroke: new Stroke({
            color: isSelected ? '#0a6e75' : '#ffffff',
            width: isSelected ? 2.2 : 1,
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

    provinceSource.once('change', () => {
      if (provinceSource.getState() !== 'ready') return
      const extent = provinceSource.getExtent()
      if (!extent) return
      map.getView().fit(extent, {
        padding: [20, 20, 20, 20],
        duration: 250,
        maxZoom: 5.8,
      })
    })

    map.on('singleclick', (evt) => {
      const clickedFeature = map.forEachFeatureAtPixel(evt.pixel, (featureAtPixel) => featureAtPixel as Feature) ?? null
      if (!clickedFeature) {
        setSelectedProvince(null)
        return
      }
      const propinsiName = String(clickedFeature.get('Propinsi') || '')
      const densityValue = densityValueForProvinceName(propinsiName)
      const densityLevel = levelFromDensity(densityValue)
      const kode = clickedFeature.get('kode') ?? '-'
      setSelectedProvince({ name: propinsiName, densityLevel, densityValue, kode })
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
      .find((f) => levelFromDensity(densityValueForProvinceName(String(f.get('Propinsi') || ''))) === activeFilter)
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

  const legendItems: DensityLevel[] = densityOrder

  return (
    <div className="relative h-full min-h-[510px] w-full overflow-hidden rounded-2xl border border-[#cde9e8] bg-transparent">
      <div ref={mapRef} className="h-full w-full" />

      <div className="absolute bottom-5 left-5 min-w-[200px] rounded-2xl border border-[#bfe3e2] bg-[#f3fffe]/95 p-4 shadow-[0_10px_30px_rgba(9,88,89,0.15)]">
        <p className="mb-1 text-[12px] font-bold uppercase tracking-wide text-[#2a4040]">Legenda Kepadatan Faskes</p>
        <p className="mb-2 text-[11px] leading-relaxed text-[#4c6363]">Skala rasio per 100.000 penduduk</p>
        <ul className="space-y-1.5">
          {legendItems.map((item) => {
            const isSelected = activeFilter === item
            const rangeLabel =
              item === 'Rendah'
                ? '< 35'
                : item === 'Sedang'
                  ? '35 - 54'
                  : item === 'Tinggi'
                    ? '55 - 74'
                    : '>= 75'
            return (
              <li
                key={item}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 transition-all hover:bg-[#e9f7f7]"
                style={{ opacity: activeFilter && !isSelected ? 0.45 : 1 }}
                onClick={() => setActiveFilter(isSelected ? null : item)}
              >
                <span
                  className="inline-block h-3.5 w-3.5 flex-shrink-0 rounded-[3px]"
                  style={{
                    backgroundColor: densityColors[item],
                    outline: isSelected ? `2px solid ${densityColors[item]}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
                <span className="text-[13px] font-medium" style={{ color: isSelected ? densityColors[item] : '#3a5050' }}>
                  {item} ({rangeLabel})
                </span>
              </li>
            )
          })}
        </ul>
        {activeFilter && (
          <button
            className="mt-3 w-full rounded-md border border-[#c8e6e5] bg-white py-1.5 text-[12px] font-semibold text-[#0f8f96] transition-colors hover:bg-[#eef9f9]"
            onClick={() => setActiveFilter(null)}
          >
            Reset gradasi
          </button>
        )}
      </div>

      {selectedProvince && (
        <div className="absolute right-5 top-5 min-w-[240px] max-w-[260px] rounded-2xl border border-[#bfe3e2] bg-[#f3fffe]/95 p-4 shadow-[0_10px_30px_rgba(9,88,89,0.15)]">
          <p className="text-[12px] font-bold uppercase tracking-wide text-[#2a4040]">Provinsi Dipilih</p>
          <p className="mt-1 text-[20px] font-bold leading-tight text-[#223333]">{selectedProvince.name}</p>
          <p className="mt-2 text-[13px] text-[#4a6060]">
            Kepadatan:{' '}
            <span className="font-semibold" style={{ color: densityColors[selectedProvince.densityLevel], fontSize: '14px' }}>
              {selectedProvince.densityLevel}
            </span>
          </p>
          <p className="mt-1 text-[13px] text-[#4a6060]">
            Rasio: <span className="font-semibold text-[#223333]">{selectedProvince.densityValue} faskes / 100.000 penduduk</span>
          </p>
        </div>
      )}
    </div>
  )
}
