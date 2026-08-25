'use client'

import { useEffect, useRef, useState } from 'react'
import 'ol/ol.css'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import GeoJSON from 'ol/format/GeoJSON'
import { Style, Fill, Stroke, Circle as CircleStyle } from 'ol/style'
import type Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import type { FeatureLike } from 'ol/Feature'
import { fromLonLat } from 'ol/proj'
import { unByKey } from 'ol/Observable'
import { defaults as defaultControls } from 'ol/control'
import { X, MapPin, RotateCcw } from 'lucide-react'
import type { AnalyzeResponse } from '@/types'
import { ASEAN_GEOJSON } from '@/data/asean-countries'

type Props = {
  result?: AnalyzeResponse | null
  countryData?: { name: string; cases: number }[]
  locationsData?: { name: string; cases: number; country?: string }[]
  hideLegend?: boolean
}

const HIGHLIGHT = '#0d9488'
const MARKER = '#2563eb'

function countryFill(cases: number | undefined): string {
  if (cases == null) return '#94a3b8'
  if (cases > 30) return '#dc2626'
  if (cases > 0) return '#eab308'
  return '#94a3b8'
}

export default function AseanMap({ result, countryData, locationsData, hideLegend }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map | null>(null)
  const vectorRef = useRef<VectorLayer<VectorSource> | null>(null)
  const markerRef = useRef<VectorLayer<VectorSource> | null>(null)

  const [selected, setSelected] = useState<{
    name: string
    totalCases: number
    locations: { name: string; cases: number }[]
  } | null>(null)

  useEffect(() => {
    if (!el.current || mapRef.current) return

    const vectorSrc = new VectorSource({
      features: new GeoJSON().readFeatures(ASEAN_GEOJSON, {
        featureProjection: 'EPSG:3857',
      }),
    })

    const vectorLayer = new VectorLayer({
      source: vectorSrc,
      style: (f: FeatureLike) => {
        const name = (f.get('name') as string).toLowerCase()
        const item = countryData?.find((d) => d.name.toLowerCase() === name)
        const fill = countryFill(item?.cases)
        return new Style({
          fill: new Fill({ color: fill }),
          stroke: new Stroke({ color: '#475569', width: 1 }),
        })
      },
    })
    vectorRef.current = vectorLayer

    const markerSrc = new VectorSource()
    const markerLayer = new VectorLayer({
      source: markerSrc,
      style: (f) => {
        const exact = f.get('type') === 'exact'
        return new Style({
          image: new CircleStyle({
            radius: exact ? 8 : 6,
            fill: new Fill({ color: exact ? MARKER : HIGHLIGHT }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
        })
      },
    })
    markerRef.current = markerLayer

    const tileLayer = new TileLayer({
      source: new OSM(),
      opacity: 0.35,
    })

    const map = new Map({
      target: el.current,
      layers: [tileLayer, vectorLayer, markerLayer],
      view: new View({
        center: fromLonLat([110, 2]),
        zoom: 4,
        minZoom: 3,
        maxZoom: 10,
      }),
      controls: defaultControls({ attribution: false }),
    })

    const clickKey = map.on('singleclick', (evt) => {
      const hits: FeatureLike[] = []
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          hits.push(f)
          return true
        },
        { hitTolerance: 8, layerFilter: (l) => l === vectorLayer },
      )

      if (hits.length === 0) {
        setSelected(null)
        return
      }

      const name = hits[0].get('name') as string
      const item = countryData?.find((d) => d.name === name)
      const locs = locationsData?.filter((l) => l.country === name) ?? []

      setSelected({
        name,
        totalCases: item?.cases ?? 0,
        locations: locs.sort((a, b) => b.cases - a.cases),
      })

      const geom = (hits[0] as Feature<Geometry>).getGeometry()
      if (geom) {
        map.getView().fit(geom.getExtent(), {
          duration: 450,
          padding: [50, 200, 50, 50],
          maxZoom: 6,
        })
      }
    })

    const hoverKey = map.on('pointermove', (evt) => {
      if (evt.dragging) return
      const hit = map.hasFeatureAtPixel(evt.pixel, {
        hitTolerance: 8,
        layerFilter: (l) => l === vectorLayer,
      })
      ;(map.getTargetElement() as HTMLElement).style.cursor = hit ? 'pointer' : ''
    })

    mapRef.current = map

    return () => {
      unByKey([clickKey, hoverKey])
      map.setTarget(undefined)
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const vectorLayer = vectorRef.current
    const markerLayer = markerRef.current
    if (!vectorLayer || !markerLayer) return

    const vectorSource = vectorLayer.getSource()!
    const markerSource = markerLayer.getSource()!

    markerSource.clear()

    const hasLocation = result?.latitude != null && result?.longitude != null
    const hasCountry = !!result?.country && result?.language !== 'en'

    const targetCountry = result?.country?.toLowerCase()

    vectorLayer.setStyle((f: FeatureLike) => {
      const name = (f.get('name') as string).toLowerCase()
      const item = countryData?.find((d) => d.name.toLowerCase() === name)
      const isHighlighted =
        hasCountry && !!targetCountry && name === targetCountry
      const fill = isHighlighted
        ? '#dc2626'
        : countryFill(item?.cases)
      const stroke = isHighlighted ? '#dc2626' : '#475569'
      const sw = isHighlighted ? 2 : 1
      return new Style({
        fill: new Fill({ color: fill }),
        stroke: new Stroke({ color: stroke, width: sw }),
      })
    })
    vectorLayer.changed()

    if (hasLocation) {
      const f = new GeoJSON().readFeature(
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [result.longitude!, result.latitude!] },
        },
        { featureProjection: 'EPSG:3857' },
      ) as Feature
      f.set('type', 'exact')
      markerSource.addFeature(f)
    } else if (hasCountry && targetCountry) {
      const feature = vectorSource
        .getFeatures()
        .find((f) => (f.get('name') as string).toLowerCase() === targetCountry)
      if (feature) {
        const extent = feature.getGeometry()!.getExtent()
        mapRef.current?.getView().fit(extent, {
          padding: [50, 50, 50, 50],
          duration: 500,
          maxZoom: 6,
        })
      }
    } else if (!selected) {
      mapRef.current
        ?.getView()
        .animate({ center: fromLonLat([110, 2]), zoom: 4, duration: 500 })
    }
  }, [countryData, result])

  const resetView = () => {
    setSelected(null)
    mapRef.current
      ?.getView()
      .animate({ center: fromLonLat([110, 2]), zoom: 4, duration: 450 })
  }

  const zoom = (d: number) => {
    const v = mapRef.current?.getView()
    if (v) v.animate({ zoom: (v.getZoom() ?? 4) + d, duration: 250 })
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
             Pemetaan Media Monitoring Kawasan Asia Tenggara
          </span>
          {result && (
            <span className="ml-2 text-xs text-slate-400">
              {result.latitude != null
                ? `📍 ${result.location_name || 'Lokasi'}`
                : result.country
                  ? `🌏 ${result.country}`
                  : ''}
            </span>
          )}
        </div>
      </div>

      <div ref={el} className="h-[500px] w-full" />

      {countryData && !hideLegend && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
            Legenda
          </p>
          <p className="mt-0.5 text-[9px] text-slate-400">Jumlah kasus per negara</p>
          <ul className="mt-2 space-y-1.5">
            <li className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="h-3 w-3 shrink-0 rounded-[3px] bg-red-500" /> &gt;30
            </li>
            <li className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="h-3 w-3 shrink-0 rounded-[3px] bg-yellow-500" /> 1-30
            </li>
            <li className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="h-3 w-3 shrink-0 rounded-[3px] bg-slate-400" /> 0
            </li>
          </ul>
        </div>
      )}

      {selected && (
        <div
          className="absolute right-3 top-14 w-[min(296px,calc(100%-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.18)]"
          style={{ animation: 'fadeSlideIn 180ms ease' }}
        >
          <div className="flex items-center justify-between gap-2 bg-teal-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-white/80" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">
                  Negara Dipilih
                </p>
                <h4 className="text-sm font-extrabold leading-tight text-white">
                  {selected.name}
                </h4>
              </div>
            </div>
            <button
              type="button"
              onClick={resetView}
              className="rounded-lg p-1 text-white/70 transition hover:bg-white/20 hover:text-white"
              aria-label="Tutup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Total Kasus
            </p>
            <p className="text-2xl font-extrabold leading-none text-slate-900">
              {selected.totalCases.toLocaleString()}
            </p>
          </div>

          {selected.locations.length > 0 && (
            <div className="px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Per Lokasi
              </p>
              <div className="max-h-[160px] space-y-1 overflow-y-auto">
                {selected.locations.map((loc) => (
                  <div
                    key={loc.name}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate text-slate-700">{loc.name}</span>
                    <span className="ml-2 shrink-0 font-semibold text-slate-900">
                      {loc.cases.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selected.locations.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-slate-400">
                Belum ada data lokasi untuk negara ini
              </p>
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => zoom(0.8)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoom(-0.8)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={resetView}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50"
          aria-label="Reset"
          title="Reset tampilan"
        >
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
