'use client'

import { useEffect, useRef, useState } from 'react'
import GeoJSON from 'ol/format/GeoJSON'
import type { FeatureLike } from 'ol/Feature'
import Feature from 'ol/Feature'
import OlMap from 'ol/Map'
import { unByKey } from 'ol/Observable'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import XYZ from 'ol/source/XYZ'
import TileArcGISRest from 'ol/source/TileArcGISRest'
import { WindLayer } from 'ol-wind'
import Point from 'ol/geom/Point'
import CircleGeom from 'ol/geom/Circle'
import { Fill, Stroke, Style, Text, Circle as CircleStyle } from 'ol/style'
import { defaults as defaultControls } from 'ol/control'
import { fromLonLat } from 'ol/proj'
import {
  X,
  MapPin,
  RotateCcw,
  ChevronRight,
  Layers,
  Settings,
  Wind,
  Info,
  Building2,
  Map as MapIcon,
  Activity,
  AlertTriangle,
  Sliders,
} from 'lucide-react'
import 'ol/ol.css'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import type { OutbreakLocation } from '@/types'
import { useTranslation } from '@/lib/i18n/LanguageContext'

type Base = 'osm' | 'terrain' | 'satellite' | 'light' | 'dark'

type RegionDetail = {
  name: string
  parentProvince?: string
  level: 'provinsi' | 'kabupaten'
  status: 'TERDETEKSI' | 'BELUM ADA DATA'
  distribusi: string
  keterangan: string
  cases?: number
  faskesCount?: number
}

const KNOWN_ACTIVE_REGIONS: Record<string, { distribusi: string; cases: number }> = {
  'jawa barat': { distribusi: '14.8%', cases: 41250 },
  'dki jakarta': { distribusi: '18.2%', cases: 52100 },
  'jakarta': { distribusi: '18.2%', cases: 52100 },
  'jawa timur': { distribusi: '24.0%', cases: 68400 },
  'jawa tengah': { distribusi: '12.5%', cases: 35600 },
  'banten': { distribusi: '8.4%', cases: 23900 },
  'sumatera utara': { distribusi: '6.1%', cases: 17400 },
  'sumatera selatan': { distribusi: '4.7%', cases: 13300 },
  'kalimantan selatan': { distribusi: '24.0%', cases: 12100 },
  'sulawesi selatan': { distribusi: '5.3%', cases: 15100 },
  'bali': { distribusi: '3.8%', cases: 10800 },
  'di yogyakarta': { distribusi: '4.2%', cases: 11900 },
  'yogyakarta': { distribusi: '4.2%', cases: 11900 },
  // Sample kab/kota
  'bandung': { distribusi: '8.2%', cases: 14200 },
  'kota bandung': { distribusi: '6.6%', cases: 11400 },
  'bogor': { distribusi: '7.1%', cases: 12300 },
  'kota surabaya': { distribusi: '9.4%', cases: 16100 },
  'kota medan': { distribusi: '4.5%', cases: 7800 },
  'kota makassar': { distribusi: '3.9%', cases: 6700 },
}

function extractName(props: Record<string, unknown>): { name: string; parent?: string } {
  const kab = props.nama_kab || props.KAB_KOTA || props.kabupaten
  if (typeof kab === 'string' && kab.trim()) {
    const parent = String(props.provinsi || props.PROVINSI || props.Propinsi || '')
    return { name: kab.trim(), parent: parent.trim() }
  }

  for (const key of ['provinsi', 'Propinsi', 'PROPINSI', 'PROVINSI', 'name', 'NAME_1', 'WADMPR']) {
    const v = props[key]
    if (typeof v === 'string' && v.trim()) {
      return { name: v.trim() }
    }
  }

  const code = props.kode_kab || props.id || props.kode
  return { name: code ? `Wilayah ${code}` : 'Wilayah Tidak Dikenal' }
}

const sources: Record<Base, () => OSM | XYZ> = {
  osm: () => new OSM(),
  terrain: () =>
    new XYZ({
      url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
      crossOrigin: 'anonymous',
    }),
  satellite: () =>
    new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      crossOrigin: 'anonymous',
    }),
  light: () =>
    new XYZ({
      url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      crossOrigin: 'anonymous',
    }),
  dark: () =>
    new XYZ({
      url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      crossOrigin: 'anonymous',
    }),
}

const Toggle = ({
  value,
  set,
}: {
  value: boolean
  set: (v: boolean) => void
}) => (
  <button
    type="button"
    onClick={() => set(!value)}
    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer ${
      value ? 'bg-[#0060A9]' : 'bg-slate-300'
    }`}
  >
    <span
      className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
        value ? 'translate-x-4' : ''
      }`}
    />
  </button>
)

interface IndonesiaDetailMapClientProps {
  countries?: { name: string; cases: number }[]
  locations?: OutbreakLocation[]
}

export default function IndonesiaDetailMapClient({
  countries,
  locations,
}: IndonesiaDetailMapClientProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<OlMap | null>(null)
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const tileRef = useRef<TileLayer<OSM | XYZ> | null>(null)
  const bnpbRef = useRef<Record<string, TileLayer<TileArcGISRest>>>({})
  const windRef = useRef<any>(null)
  const markerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const radiusRef = useRef<VectorLayer<VectorSource> | null>(null)

  // Map state
  const [mapLevel, setMapLevel] = useState<'provinsi' | 'kabupaten'>('provinsi')
  const [selectedProvinceFilter, setSelectedProvinceFilter] = useState<string>('Semua Provinsi')
  const [detail, setDetail] = useState<RegionDetail | null>(null)
  const [legendOpen, setLegendOpen] = useState(true)
  const [isLoading, setIsLoading] = useState(true)

  // Spatial controls state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [baseMap, setBaseMap] = useState<Base>('osm')
  const [showAdmin, setShowAdmin] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const [showChoropleth, setShowChoropleth] = useState(true)
  const [showWind, setShowWind] = useState(false)
  const [windLegend, setWindLegend] = useState(true)
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  const [bnpb, setBnpb] = useState({
    flood: false,
    earthquake: false,
    landslide: false,
    forestFire: false,
    hillshade: false,
    population: false,
  })

  // Hover state
  const hoveredFeatureRef = useRef<FeatureLike | null>(null)

  // Style generator matching baseMap
  const getFeatureStyle = (f: FeatureLike, isHovered: boolean = false): Style => {
    const rawName = extractName(f.getProperties() || {})
    const key = rawName.name.toLowerCase()
    const isDarkBase = baseMap === 'dark' || baseMap === 'satellite'
    const activeInfo = KNOWN_ACTIVE_REGIONS[key]
    const hasData = Boolean(activeInfo)

    if (isHovered) {
      return new Style({
        fill: new Fill({
          color: hasData
            ? (isDarkBase ? 'rgba(239, 68, 68, 0.8)' : '#dc2626')
            : (isDarkBase ? 'rgba(226, 232, 240, 0.35)' : '#cbd5e1'),
        }),
        stroke: new Stroke({
          color: hasData ? '#991b1b' : '#64748b',
          width: 2.5,
        }),
        zIndex: 20,
      })
    }

    if (!showChoropleth) {
      return new Style({
        fill: new Fill({ color: 'transparent' }),
        stroke: new Stroke({
          color: isDarkBase ? 'rgba(255, 255, 255, 0.4)' : '#94a3b8',
          width: 1,
        }),
      })
    }

    if (hasData) {
      return new Style({
        fill: new Fill({
          color: isDarkBase ? 'rgba(239, 68, 68, 0.65)' : '#ef4444',
        }),
        stroke: new Stroke({
          color: isDarkBase ? '#fca5a5' : '#991b1b',
          width: 1.2,
        }),
      })
    }

    return new Style({
      fill: new Fill({
        color: isDarkBase ? 'rgba(226, 232, 240, 0.18)' : '#e2e8f0',
      }),
      stroke: new Stroke({
        color: isDarkBase ? 'rgba(255, 255, 255, 0.35)' : '#94a3b8',
        width: 0.75,
      }),
    })
  }

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const vectorSource = new VectorSource()
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (f) => getFeatureStyle(f, false),
      zIndex: 10,
    })
    layerRef.current = vectorLayer

    const markerSource = new VectorSource()
    const markerLayer = new VectorLayer({
      source: markerSource,
      zIndex: 22,
      style: (f) => {
        const col = '#dc2626'
        return new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: col }),
            stroke: new Stroke({ color: '#ffffff', width: 2 }),
          }),
        })
      },
    })
    markerRef.current = markerLayer

    const radiusSource = new VectorSource()
    const radiusLayer = new VectorLayer({
      source: radiusSource,
      zIndex: 15,
      style: new Style({
        stroke: new Stroke({ color: 'rgba(239, 68, 68, 0.8)', width: 2 }),
        fill: new Fill({ color: 'rgba(239, 68, 68, 0.15)' }),
      }),
    })
    radiusRef.current = radiusLayer

    const tileLayer = new TileLayer({
      source: new OSM(),
      opacity: 1,
      zIndex: 1,
    })
    tileRef.current = tileLayer

    // BNPB Inarisk disaster layers
    const makeBnpb = (key: string, url: string, opacity = 0.58) => {
      const l = new TileLayer({
        source: new TileArcGISRest({ url }),
        visible: false,
        opacity,
        zIndex: 5,
      })
      bnpbRef.current[key] = l
      return l
    }

    const bnpbLayersList = [
      makeBnpb('hillshade', 'https://gis.bnpb.go.id/server/rest/services/Basemap/Indo_Hillshade/MapServer', 0.45),
      makeBnpb('population', 'https://gis.bnpb.go.id/server/rest/services/Basemap/Kepadatan_penduduk_2020/MapServer', 0.5),
      makeBnpb('flood', 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir/ImageServer'),
      makeBnpb('earthquake', 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_gempabumi/ImageServer', 0.65),
      makeBnpb('landslide', 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_tanah_longsor/ImageServer'),
      makeBnpb('forestFire', 'https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_kebakaran_hutan_dan_lahan/ImageServer'),
    ]

    const map = new OlMap({
      target: containerRef.current,
      layers: [
        tileLayer,
        ...bnpbLayersList,
        vectorLayer,
        radiusLayer,
        markerLayer,
      ],
      view: new View({
        center: fromLonLat([118.0, -2.5]), // Centered across Indonesia archipelago
        zoom: 5,
        minZoom: 4,
        maxZoom: 13,
      }),
      controls: defaultControls({ attribution: false, zoom: false }),
    })

    // Pointer move / hover interaction
    const pointerKey = map.on('pointermove', (evt) => {
      if (evt.dragging) return

      let foundFeature: FeatureLike | null = null
      map.forEachFeatureAtPixel(
        evt.pixel,
        (feature, layer) => {
          if (layer === vectorLayer) {
            foundFeature = feature
            return true
          }
        },
        { hitTolerance: 4 },
      )

      if (foundFeature !== hoveredFeatureRef.current) {
        if (hoveredFeatureRef.current) {
          ;(hoveredFeatureRef.current as any).setStyle?.(getFeatureStyle(hoveredFeatureRef.current, false))
        }
        hoveredFeatureRef.current = foundFeature
        if (foundFeature) {
          ;(foundFeature as any).setStyle?.(getFeatureStyle(foundFeature, true))
          const props = (foundFeature as any).getProperties() || {}
          const { name, parent } = extractName(props)
          const key = name.toLowerCase()
          const active = KNOWN_ACTIVE_REGIONS[key]

          setDetail({
            name,
            parentProvince: parent,
            level: parent ? 'kabupaten' : 'provinsi',
            status: active ? 'TERDETEKSI' : 'BELUM ADA DATA',
            distribusi: active ? active.distribusi : '0.0%',
            keterangan: active
              ? 'Proporsi dari total kasus surveilans nasional.'
              : 'Belum ada sinyal atau laporan fasilitas kesehatan terverifikasi pada periode aktif.',
            cases: active?.cases,
          })
        }
      }

      const targetEl = map.getTargetElement()
      if (targetEl) {
        targetEl.style.cursor = foundFeature ? 'pointer' : ''
      }
    })

    // Single click interaction
    const clickKey = map.on('singleclick', (evt) => {
      let clickedFeature: FeatureLike | null = null
      map.forEachFeatureAtPixel(
        evt.pixel,
        (feature, layer) => {
          if (layer === vectorLayer) {
            clickedFeature = feature
            return true
          }
        },
        { hitTolerance: 6 },
      )

      if (clickedFeature) {
        const geom = (clickedFeature as any).getGeometry?.()
        if (geom) {
          map.getView().fit(geom.getExtent(), {
            padding: [60, 60, 60, 60],
            duration: 600,
            maxZoom: 8,
          })
        }
      }
    })

    mapRef.current = map

    return () => {
      unByKey([pointerKey, clickKey])
      map.setTarget(undefined)
      if (windRef.current) {
        try {
          windRef.current.setVisible?.(false)
          windRef.current.stop?.()
          windRef.current.dispose?.()
        } catch {}
        windRef.current = null
      }
      mapRef.current = null
    }
  }, [])

  // Update Basemap
  useEffect(() => {
    const tile = tileRef.current
    if (!tile) return
    tile.setSource(sources[baseMap]())
    layerRef.current?.changed()
  }, [baseMap])

  // Update BNPB Layers
  useEffect(() => {
    Object.entries(bnpbRef.current).forEach(([key, layer]) => {
      layer.setVisible(Boolean(bnpb[key as keyof typeof bnpb]))
    })
  }, [bnpb])

  // Update Admin & Markers visibility
  useEffect(() => {
    layerRef.current?.setVisible(showAdmin)
    markerRef.current?.setVisible(showMarkers)
  }, [showAdmin, showMarkers])

  // Update Wind Simulation Layer
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (windRef.current) {
      windRef.current.setVisible?.(showWind)
      if (showWind) windRef.current.start?.()
      else windRef.current.stop?.()
      return
    }

    if (!showWind) return

    let cancelled = false
    const startWind = async () => {
      try {
        const response = await fetch(`${PUBLIC_BASE_PATH}/wind-data`)
        if (!response.ok || cancelled) return
        const windData = await response.json()
        const layer = new WindLayer(
          windData as any,
          {
            zIndex: 18,
            windOptions: {
              velocityScale: 0.015,
              paths: 2400,
              colorScale: [
                'rgb(15,60,140)',
                'rgb(70,150,145)',
                'rgb(85,160,115)',
                'rgb(215,195,60)',
                'rgb(210,125,35)',
                'rgb(185,35,10)',
                'rgb(155,8,12)',
              ],
              lineWidth: 2.2,
              generateParticleOption: true,
            },
            fieldOptions: { wrapX: true },
          } as any,
        )
        map.addLayer(layer as any)
        windRef.current = layer
        layer.setVisible?.(true)
        ;(layer as any).start?.()
      } catch {}
    }

    void startWind()
    return () => {
      cancelled = true
    }
  }, [showWind])

  // Update Outbreak Markers
  useEffect(() => {
    const markerSource = markerRef.current?.getSource()
    if (!markerSource) return
    markerSource.clear()

    if (locations && locations.length > 0) {
      locations.forEach((loc) => {
        if (loc.latitude != null && loc.longitude != null) {
          const f = new Feature({
            geometry: new Point(fromLonLat([loc.longitude, loc.latitude])),
          })
          f.set('location', loc)
          f.set('severity', loc.severity)
          markerSource.addFeature(f)
        }
      })
    }
  }, [locations])

  // Update EWS Radius Buffer
  useEffect(() => {
    const radiusSource = radiusRef.current?.getSource()
    if (!radiusSource) return
    radiusSource.clear()

    if (radiusKm != null && radiusKm > 0) {
      const center = fromLonLat([106.8456, -6.2088]) // Default near DKI Jakarta or active focal point
      const circle = new CircleGeom(center, radiusKm * 1000)
      radiusSource.addFeature(new Feature(circle))
    }
  }, [radiusKm])

  // Load GeoJSON data when mapLevel or province filter changes
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return

    setIsLoading(true)
    const source = layer.getSource()
    if (!source) return
    source.clear()

    let url = `${PUBLIC_BASE_PATH}/wilayah-data?level=${mapLevel}`
    if (mapLevel === 'kabupaten' && selectedProvinceFilter !== 'Semua Provinsi') {
      url += `&province=${encodeURIComponent(selectedProvinceFilter)}`
    }

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        if (!data.geojson) throw new Error('Format GeoJSON tidak valid')
        const features = new GeoJSON().readFeatures(data.geojson, {
          featureProjection: 'EPSG:3857',
        })
        source.addFeatures(features)
        setIsLoading(false)

        if (mapLevel === 'kabupaten' && selectedProvinceFilter !== 'Semua Provinsi') {
          const extent = source.getExtent()
          mapRef.current?.getView().fit(extent, {
            padding: [50, 50, 50, 50],
            duration: 600,
            maxZoom: 9,
          })
        }
      })
      .catch(() => {
        const fallbackUrl =
          mapLevel === 'provinsi'
            ? `${PUBLIC_BASE_PATH}/data/indonesia-38-provinces.geojson`
            : `${PUBLIC_BASE_PATH}/data/indonesia-kabupaten.geojson`

        fetch(fallbackUrl)
          .then((res) => res.json())
          .then((geoData) => {
            const features = new GeoJSON().readFeatures(geoData, {
              featureProjection: 'EPSG:3857',
            })
            source.addFeatures(features)
            setIsLoading(false)
          })
          .catch(() => {
            setIsLoading(false)
          })
      })
  }, [mapLevel, selectedProvinceFilter])

  const resetView = () => {
    mapRef.current?.getView().animate({
      center: fromLonLat([118.0, -2.5]),
      zoom: 5,
      duration: 500,
    })
    setDetail(null)
  }

  const zoom = (delta: number) => {
    const view = mapRef.current?.getView()
    if (!view) return
    const cur = view.getZoom() || 5
    view.animate({ zoom: cur + delta, duration: 250 })
  }

  const resetLayers = () => {
    setBaseMap('osm')
    setShowAdmin(true)
    setShowMarkers(true)
    setShowChoropleth(true)
    setShowWind(false)
    setWindLegend(true)
    setRadiusKm(null)
    setBnpb({
      flood: false,
      earthquake: false,
      landslide: false,
      forestFire: false,
      hillshade: false,
      population: false,
    })
  }

  useEffect(() => {
    if (!settingsOpen) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [settingsOpen])

  return (
    <div className="relative isolate z-0 h-full w-full overflow-hidden select-none bg-slate-100">
      {/* OpenLayers Map Canvas */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Top Left Toolbar: 38 Provinsi vs 514 Kab/Kota */}
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-white/95 p-1 shadow-md border border-slate-200 backdrop-blur-xs">
          <button
            type="button"
            onClick={() => {
              setMapLevel('provinsi')
              setSelectedProvinceFilter('Semua Provinsi')
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition cursor-pointer ${
              mapLevel === 'provinsi'
                ? 'bg-[#14b8a6] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <MapIcon className="h-3.5 w-3.5" />
            <span>38 PROVINSI</span>
          </button>
          <button
            type="button"
            onClick={() => setMapLevel('kabupaten')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition cursor-pointer ${
              mapLevel === 'kabupaten'
                ? 'bg-[#14b8a6] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>514 KAB/KOTA</span>
          </button>
        </div>

        {mapLevel === 'kabupaten' && (
          <select
            value={selectedProvinceFilter}
            onChange={(e) => setSelectedProvinceFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-md backdrop-blur-xs focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          >
            <option value="Semua Provinsi">Semua Provinsi (514 Kab/Kota)</option>
            <option value="Jawa Barat">Jawa Barat</option>
            <option value="Jawa Timur">Jawa Timur</option>
            <option value="Jawa Tengah">Jawa Tengah</option>
            <option value="DKI Jakarta">DKI Jakarta</option>
            <option value="Banten">Banten</option>
            <option value="DI Yogyakarta">DI Yogyakarta</option>
            <option value="Aceh">Aceh</option>
            <option value="Sumatera Utara">Sumatera Utara</option>
            <option value="Sumatera Barat">Sumatera Barat</option>
            <option value="Sumatera Selatan">Sumatera Selatan</option>
            <option value="Riau">Riau</option>
            <option value="Kepulauan Riau">Kepulauan Riau</option>
            <option value="Lampung">Lampung</option>
            <option value="Bali">Bali</option>
            <option value="Nusa Tenggara Barat">Nusa Tenggara Barat</option>
            <option value="Nusa Tenggara Timur">Nusa Tenggara Timur</option>
            <option value="Kalimantan Barat">Kalimantan Barat</option>
            <option value="Kalimantan Selatan">Kalimantan Selatan</option>
            <option value="Kalimantan Timur">Kalimantan Timur</option>
            <option value="Sulawesi Selatan">Sulawesi Selatan</option>
            <option value="Sulawesi Utara">Sulawesi Utara</option>
            <option value="Papua">Papua</option>
          </select>
        )}

        {isLoading && (
          <div className="inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-1.5 text-xs font-bold text-teal-700 shadow-sm border border-teal-150 backdrop-blur-xs animate-pulse">
            <span className="h-2 w-2 rounded-full bg-teal-500 animate-ping" />
            <span>Memuat Batas Wilayah...</span>
          </div>
        )}
      </div>

      {/* Top Right: Spatial Controls Settings Button */}
      <div className="absolute right-3 top-3 z-50 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-slate-700 shadow-md transition hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800 cursor-pointer"
        >
          <Settings className="h-3.5 w-3.5 text-[#0060A9]" />
          <span className="text-xs font-black tracking-wide">
            {t('map.spatialControls')}
          </span>
        </button>
      </div>

      {/* Floating Detail Card (Exact Match with Reference Image) */}
      {detail && (
        <div
          key={detail.name}
          className="absolute right-3 top-14 z-20 w-[min(300px,calc(100%-24px))] overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_12px_36px_rgba(0,0,0,0.12)] transition-all animate-in fade-in slide-in-from-top-2"
        >
          {/* Card Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <div>
                <div className="flex items-center gap-1">
                  <h4 className="text-sm font-black tracking-tight text-slate-900 leading-tight">
                    {detail.name}
                  </h4>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                  {detail.parentProvince ? `KABUPATEN (${detail.parentProvince})` : 'PROVINSI'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Status Data</span>
              <span
                className={`font-black text-[11px] px-2 py-0.5 rounded-full ${
                  detail.status === 'TERDETEKSI'
                    ? 'text-red-700 bg-red-50 border border-red-200'
                    : 'text-slate-600 bg-slate-100 border border-slate-200'
                }`}
              >
                {detail.status}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Distribusi Kasus</span>
              <span className="font-extrabold text-slate-900">{detail.distribusi}</span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-slate-500 font-medium">Keterangan</span>
              <span className="text-[11px] text-slate-700 font-normal leading-relaxed">
                {detail.keterangan}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Legend (Bottom-Left) */}
      <div className="absolute bottom-3 left-3 z-10 max-w-[320px] space-y-2.5">
        {/* Availability Legend */}
        <div className="w-[min(270px,calc(100%-24px))] rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 shadow-lg backdrop-blur-xs transition-all">
          <div className="flex items-center justify-between border-b border-slate-150 pb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">LEGENDA</span>
            <button
              type="button"
              onClick={() => setLegendOpen(!legendOpen)}
              className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 hover:text-teal-900 cursor-pointer"
            >
              {legendOpen ? 'TUTUP' : 'BUKA'}
            </button>
          </div>

          {legendOpen && (
            <div className="mt-2 space-y-2">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-tight text-slate-900">
                  KETERSEDIAAN DATA PER {mapLevel === 'kabupaten' ? 'KABUPATEN' : 'PROVINSI'}
                </p>
                <p className="text-[9px] font-semibold text-slate-400">
                  BERDASARKAN {mapLevel === 'kabupaten' ? '514 KABUPATEN/KOTA' : '38 PROVINSI'}
                </p>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <span className="h-3 w-3 rounded-xs shrink-0" style={{ backgroundColor: '#ef4444' }} />
                    <span>Terdeteksi</span>
                  </div>
                  <span className="font-bold text-slate-900">
                    {mapLevel === 'kabupaten' ? '12 kab/kota' : '10 provinsi'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <span className="h-3 w-3 rounded-xs shrink-0" style={{ backgroundColor: '#e2e8f0' }} />
                    <span>Belum ada data</span>
                  </div>
                  <span className="font-bold text-slate-500">
                    {mapLevel === 'kabupaten' ? '502 kab/kota' : '28 provinsi'}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 text-[9.5px] leading-tight text-slate-500">
                Persentase = proporsi dari total kasus surveilans nasional, bukan positivity rate.
              </div>
            </div>
          )}
        </div>

        {/* Wind Speed Legend (if wind is active) */}
        {showWind && windLegend && (
          <div className="w-[min(270px,calc(100%-24px))] space-y-1.5 rounded-2xl border border-blue-200/90 bg-white/95 p-3 shadow-md backdrop-blur-xs">
            <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#0060A9]">
              <Wind className="h-3 w-3" />
              {t('map.windFlow')} (GFS)
            </p>
            <div className="h-2 w-full rounded-full bg-gradient-to-r from-[rgb(15,60,140)] via-[rgb(85,160,115)] via-[rgb(215,195,60)] via-[rgb(210,125,35)] to-[rgb(185,35,10)] shadow-inner" />
            <div className="flex justify-between px-0.5 text-[8.5px] font-bold text-slate-500">
              <span>0 km/h</span>
              <span>20 km/h</span>
              <span>40 km/h</span>
              <span>&gt;60 km/h</span>
            </div>
          </div>
        )}

        {/* EWS Radius Active Indicator */}
        {radiusKm != null && radiusKm > 0 && (
          <div className="w-[min(270px,calc(100%-24px))] rounded-xl border border-red-200 bg-white/95 p-2.5 text-[10.5px] font-bold text-red-700 shadow-md">
            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full border-2 border-red-500 bg-red-100 align-middle" />
            {t('map.activeEwsRadius')} {radiusKm} km
          </div>
        )}
      </div>

      {/* Map Controls: Zoom In / Out / Reset */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => zoom(0.8)}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-base font-black text-slate-700 shadow-sm transition hover:bg-slate-50 cursor-pointer"
          title="Zoom In"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoom(-0.8)}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-base font-black text-slate-700 shadow-sm transition hover:bg-slate-50 cursor-pointer"
          title="Zoom Out"
        >
          -
        </button>
        <button
          type="button"
          onClick={resetView}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 cursor-pointer"
          title="Reset View"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Spatial Controls Settings Drawer */}
      {settingsOpen && (
        <>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="absolute inset-0 z-30 bg-black/20 backdrop-blur-xs cursor-pointer"
            aria-label="Tutup pengaturan"
          />
          <aside className="absolute right-0 top-0 z-40 flex h-full w-76 flex-col border-l border-slate-200 bg-white shadow-[-8px_0_40px_rgba(0,0,0,0.12)]">
            <div className="flex items-center justify-between border-b border-slate-150 px-4 py-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#0060A9]" />
                <span className="text-sm font-black text-slate-800">
                  {t('map.spatialControls')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {/* Batas & Layer Wilayah */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Batas Wilayah & Data
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg bg-teal-50 p-1.5 text-teal-700">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Batas Wilayah</p>
                        <p className="text-[10px] text-slate-400">Tampilkan batas administrasi</p>
                      </div>
                    </div>
                    <Toggle value={showAdmin} set={setShowAdmin} />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg bg-teal-50 p-1.5 text-teal-700">
                        <MapIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Pewarnaan Data (Choropleth)</p>
                        <p className="text-[10px] text-slate-400">Status terdeteksi & ketersediaan</p>
                      </div>
                    </div>
                    <Toggle value={showChoropleth} set={setShowChoropleth} />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg bg-blue-50 p-1.5 text-[#0060A9]">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">Titik Kejadian (Outbreak)</p>
                        <p className="text-[10px] text-slate-400">Marker lokasi kasus terverifikasi</p>
                      </div>
                    </div>
                    <Toggle value={showMarkers} set={setShowMarkers} />
                  </div>
                </div>
              </div>

              {/* Basemap Options */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {t('map.baseMap')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['osm', 'terrain', 'satellite', 'light', 'dark'] as Base[]).map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => setBaseMap(x)}
                      className={`rounded-xl border px-3 py-2 text-left text-[11px] font-bold capitalize transition cursor-pointer ${
                        baseMap === x
                          ? 'border-[#0060A9] bg-blue-50 text-[#0060A9]'
                          : 'border-slate-150 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wind Layer */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Simulasi Angin (GFS)
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-lg bg-blue-50 p-1.5 text-[#0060A9]">
                        <Wind className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{t('map.windFlow')}</p>
                        <p className="text-[10px] text-slate-400">Aliran angin waktu nyata</p>
                      </div>
                    </div>
                    <Toggle value={showWind} set={setShowWind} />
                  </div>

                  {showWind && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-blue-50 p-1.5 text-[#0060A9]">
                          <Info className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">Legenda Kecepatan Angin</p>
                          <p className="text-[10px] text-slate-400">Tampilkan skala km/h</p>
                        </div>
                      </div>
                      <Toggle value={windLegend} set={setWindLegend} />
                    </div>
                  )}
                </div>
              </div>

              {/* BNPB Inarisk Layers */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {t('map.bnpbInarisk')}
                </p>
                <div className="space-y-2.5">
                  {(
                    [
                      ['flood', t('map.hazardFlood')],
                      ['earthquake', t('map.hazardQuake')],
                      ['landslide', t('map.hazardSlide')],
                      ['forestFire', t('map.hazardFire')],
                      ['hillshade', t('map.hillshade')],
                      ['population', t('map.population')],
                    ] as const
                  ).map(([k, l]) => (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-lg bg-slate-100 p-1.5 text-slate-600">
                          <Layers className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">{l}</p>
                          <p className="text-[10px] text-slate-400">{t('map.gisBnpb')}</p>
                        </div>
                      </div>
                      <Toggle
                        value={bnpb[k]}
                        set={(v) => setBnpb((prev) => ({ ...prev, [k]: v }))}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Active EWS Radius Buffer */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {t('map.activeEwsRadius')}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-lg bg-red-50 p-1.5 text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800">{t('map.activeEwsRadius')}</p>
                      <p className="text-[10px] text-slate-400">Buffer radius peringatan dini</p>
                    </div>
                  </div>
                  <Toggle
                    value={radiusKm != null}
                    set={(v) => setRadiusKm(v ? 25 : null)}
                  />
                </div>

                {radiusKm != null && (
                  <div className="mt-2 rounded-xl bg-slate-50 p-3 border border-slate-150">
                    <div className="flex justify-between text-[11px] font-bold text-slate-700">
                      <span>{t('map.impactRadius')}</span>
                      <span className="text-red-600 font-extrabold">{radiusKm} km</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="250"
                      step="5"
                      value={radiusKm}
                      onChange={(e) => setRadiusKm(+e.target.value)}
                      className="mt-2 w-full accent-[#0060A9] cursor-pointer"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Reset Button */}
            <div className="border-t border-slate-150 p-3 bg-slate-50">
              <button
                type="button"
                onClick={resetLayers}
                className="w-full rounded-xl bg-[#0060A9] py-2 text-xs font-bold text-white transition hover:bg-[#004b85] cursor-pointer shadow-sm"
              >
                {t('map.resetLayers')}
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
