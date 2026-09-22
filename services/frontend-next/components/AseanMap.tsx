'use client'

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import TileArcGISRest from "ol/source/TileArcGISRest";
import { WindLayer } from "ol-wind";
import GeoJSON from "ol/format/GeoJSON";
import { Style, Fill, Stroke, Circle as CircleStyle } from "ol/style";
import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import CircleGeom from "ol/geom/Circle";
import Point from "ol/geom/Point";
import type { FeatureLike } from "ol/Feature";
import { fromLonLat } from "ol/proj";
import { unByKey } from "ol/Observable";
import { defaults as defaultControls } from "ol/control";
import { X, MapPin, RotateCcw, Navigation, Activity, Skull, ChevronRight, Bug, Plane, Flame, Building2, Newspaper, Users, ExternalLink, Globe, CloudSun } from "lucide-react";
import type {
  AnalyzeResponse,
  OutbreakLocation,
  NasaGibsLayers,
  ExternalIntelLayers,
  VectorSighting,
  LiveFlight,
  FireHotspot,
  HealthFacility,
  DiseaseNewsArticle,
  WorldPopMeta,
  MapLayerStatus,
  EnvironmentMarker,
} from "@/types";
import {
  fetchVectorSightings,
  fetchLiveFlights,
  fetchFireHotspots,
  fetchHealthFacilities,
  fetchDiseaseNews,
  fetchWorldPopMeta,
  fetchMapEnvironment,
} from "@/lib/api";
import { classifyLayerError, statusFromPayload } from "@/lib/map-layer-client.mjs";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import CountryFlag from "@/components/CountryFlag";

import { ASEAN_GEOJSON } from "@/data/asean-countries";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";

export type HazardEvent = {
  id?: string | number | null;
  source?: string | null;
  kind?: string | null;
  title?: string | null;
  latitude: number;
  longitude: number;
  magnitude?: number | null;
  alert_level?: string | null;
  when?: string | number | null;
  url?: string | null;
};

type Props = {
  result?: AnalyzeResponse | null;
  countryData?: { name: string; cases: number; deaths?: number }[];
  locationsData?: { name: string; cases: number; country?: string }[];
  hideLegend?: boolean;
  outbreakLocations?: OutbreakLocation[];
  compact?: boolean;
  fullBleed?: boolean;
  baseMap?: "osm" | "terrain" | "satellite" | "light" | "dark";
  showAdmin?: boolean;
  showMarkers?: boolean;
  bnpbLayers?: {
    flood?: boolean;
    earthquake?: boolean;
    landslide?: boolean;
    forestFire?: boolean;
    hillshade?: boolean;
    population?: boolean;
  };
  showWind?: boolean;
  ewsRadiusKm?: number | null;
  markerLookbackDays?: 7 | 14 | 30 | 90;
  embedded?: boolean;
  highlightCountry?: string;
  hazardEvents?: HazardEvent[];
  showHazards?: boolean;
  gibsLayers?: NasaGibsLayers;
  intelLayers?: ExternalIntelLayers;
  onLayerStatus?: (key: string, status: MapLayerStatus) => void;
};

type RegionMetric = {
  cases: number;
  deaths: number;
  eventCount: number;
};

const COUNTRY_ISO3: Record<string, string> = {
  brunei: "BRN",
  "brunei darussalam": "BRN",
  cambodia: "KHM",
  indonesia: "IDN",
  "laos": "LAO",
  "lao pdr": "LAO",
  malaysia: "MYS",
  myanmar: "MMR",
  philippines: "PHL",
  singapore: "SGP",
  thailand: "THA",
  "timor-leste": "TLS",
  "timor leste": "TLS",
  vietnam: "VNM",
  "viet nam": "VNM",
};

const HIGHLIGHT = "#0060A9";
const MARKER = "#0060A9";

function heatFill(value: number, maximum: number): string {
  if (value <= 0 || maximum <= 0) return "rgba(226, 232, 240, 0.28)";
  const intensity = Math.sqrt(Math.min(value / maximum, 1));
  return `rgba(0, 96, 169, ${0.12 + intensity * 0.58})`;
}

function regionName(properties: Record<string, unknown>): string {
  for (const key of [
    "name",
    "shapeName",
    "NAME_1",
    "NAME_2",
    "provinsi",
    "PROVINSI",
    "WADMPR",
    "VARNAME_1",
  ]) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Unknown region";
}

function normalizedCountry(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isWithinRecentWindowForDays(value: string | null | undefined, days: 7 | 14 | 30 | 90): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function fieldOrNone(value: unknown): string {
  if (value == null) return "No data";
  if (typeof value === "string" && !value.trim()) return "No data";
  if (typeof value === "number" && !Number.isFinite(value)) return "No data";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatUnixSeconds(ts?: number | null): string {
  if (ts == null || !Number.isFinite(ts)) return "No data";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "No data" : date.toLocaleString();
}

function formatSpeedMs(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "No data";
  return `${Math.round(ms)} m/s (${Math.round(ms * 3.6)} km/h)`;
}

function formatAltitudeM(m?: number | null): string {
  if (m == null || !Number.isFinite(m)) return "No data";
  return `${Math.round(m).toLocaleString()} m`;
}

function formatHeading(deg?: number | null): string {
  if (deg == null || !Number.isFinite(deg)) return "No data";
  return `${Math.round(deg)}°`;
}

function layerOutcome(
  count: number,
  source?: string,
  error?: string | null,
  payload?: {
    status?: string;
    cached?: boolean;
    stale?: boolean;
    fromCache?: boolean;
  },
): MapLayerStatus {
  return statusFromPayload(count, {
    source,
    error: error || undefined,
    status: payload?.status,
    cached: payload?.cached,
    stale: payload?.stale,
    fromCache: payload?.fromCache,
  }) as MapLayerStatus;
}

function statusFromCatch(err: unknown): MapLayerStatus {
  const classified = classifyLayerError(err);
  if (classified.aborted) {
    return { state: "idle" };
  }
  return classified as MapLayerStatus;
}

export default function AseanMap({

  result,
  countryData,
  locationsData,
  outbreakLocations,
  compact,
  fullBleed,
  baseMap = "osm",
  showAdmin = true,
  showMarkers = true,
  bnpbLayers,
  showWind,
  ewsRadiusKm,
  markerLookbackDays = 30,
  embedded,
  highlightCountry,
  hideLegend = false,
  gibsLayers,
  intelLayers,
  hazardEvents,
  showHazards = true,
  onLayerStatus,
}: Props) {
  const { t, locale, translateDisease } = useTranslation();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorRef = useRef<VectorLayer<VectorSource> | null>(null);
  const markerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const hazardRef = useRef<VectorLayer<VectorSource> | null>(null);
  const regionRef = useRef<VectorLayer<VectorSource> | null>(null);
  const currentCountryBoundaryRef = useRef<VectorLayer<VectorSource> | null>(null);
  const tileRef = useRef<TileLayer<OSM | XYZ> | null>(null);
  const bnpbRef = useRef<Record<string, TileLayer<TileArcGISRest>>>({});
  const gibsRef = useRef<Record<string, TileLayer<XYZ>>>({});
  const vectorSightingsRef = useRef<VectorLayer<VectorSource> | null>(null);
  const flightsRef = useRef<VectorLayer<VectorSource> | null>(null);
  const firesRef = useRef<VectorLayer<VectorSource> | null>(null);
  const facilitiesRef = useRef<VectorLayer<VectorSource> | null>(null);
  const environmentRef = useRef<VectorLayer<VectorSource> | null>(null);
  const statusCbRef = useRef(onLayerStatus);
  useEffect(() => {
    statusCbRef.current = onLayerStatus;
  }, [onLayerStatus]);
  const reportStatus = (key: string, status: MapLayerStatus) => {
    statusCbRef.current?.(key, status);
  };

  const [selectedIntel, setSelectedIntel] = useState<
    | { type: "vector_sighting"; data: VectorSighting }
    | { type: "live_flight"; data: LiveFlight }
    | { type: "fire_hotspot"; data: FireHotspot }
    | { type: "health_facility"; data: HealthFacility }
    | { type: "hazard_event"; data: HazardEvent }
    | { type: "environment"; data: EnvironmentMarker }
    | null
  >(null);
  const [diseaseNews, setDiseaseNews] = useState<DiseaseNewsArticle[]>([]);
  const [newsMeta, setNewsMeta] = useState<{ source?: string; error?: string | null }>({});
  const [newsOpen, setNewsOpen] = useState(true);
  const [worldPopMeta, setWorldPopMeta] = useState<WorldPopMeta | null>(null);
  const radiusRef = useRef<VectorLayer<VectorSource> | null>(null);
  const windRef = useRef<any>(null);

  const [selected, setSelected] = useState<{
    name: string;
    totalCases: number;
    locations: { name: string; cases: number }[];
  } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<OutbreakLocation | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<{
    name: string;
    country: string;
    cases: number;
    deaths: number;
    eventCount: number;
  } | null>(null);

  const latestPropsRef = useRef({ countryData, outbreakLocations, locationsData });
  useEffect(() => {
    latestPropsRef.current = { countryData, outbreakLocations, locationsData };
  }, [countryData, outbreakLocations, locationsData]);

  useEffect(() => {
    if (!el.current || mapRef.current) return;

    const vectorSrc = new VectorSource({
      features: new GeoJSON().readFeatures(ASEAN_GEOJSON, {
        featureProjection: "EPSG:3857",
      }),
    });

    const vectorLayer = new VectorLayer({
      source: vectorSrc,
      style: (f: FeatureLike) => {
        const name = String(f.get("name") || "").toLowerCase();
        const item = countryData?.find((d) => d.name?.toLowerCase() === name);
        const maximum = Math.max(...(countryData || []).map((d) => d.cases || 0), 0);
        const fill = heatFill(item?.cases || 0, maximum);
        return new Style({
          fill: new Fill({ color: fill }),
          stroke: new Stroke({
            color: (item?.deaths || 0) > 0 ? "#be123c" : "#475569",
            width: (item?.deaths || 0) > 0 ? 1.6 : 1,
            lineDash: (item?.deaths || 0) > 0 ? [5, 3] : undefined,
          }),
        });
      },
    });
    vectorRef.current = vectorLayer;

    const currentCountryBoundaryLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 12,
      style: new Style({
        fill: new Fill({ color: 'rgba(0, 96, 169, 0.06)' }),
        stroke: new Stroke({ color: '#0060A9', width: 2.8 }),
      }),
    });
    currentCountryBoundaryRef.current = currentCountryBoundaryLayer;

    const regionSource = new VectorSource();
    const regionLayer = new VectorLayer({
      source: regionSource,
      visible: false,
      zIndex: 11,
      style: (f: FeatureLike) => {
        const metric = (f.get("regionMetric") as RegionMetric | undefined) || {
          cases: 0,
          deaths: 0,
          eventCount: 0,
        };
        const maximum = Number(f.get("regionMaximumCases")) || 0;
        return new Style({
          fill: new Fill({ color: heatFill(metric.cases, maximum) }),
          stroke: new Stroke({
            color: metric.deaths > 0 ? "#be123c" : "#64748b",
            width: metric.deaths > 0 ? 1.8 : 0.8,
            lineDash: metric.deaths > 0 ? [5, 3] : undefined,
          }),
        });
      },
    });
    regionRef.current = regionLayer;

    const markerSrc = new VectorSource();

    // Pre-allocated cached styles to eliminate GC pressure and main thread stalls
    const normalExactStyle = [new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color: "#0060A9" }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
    })];

    const normalApproxStyle = [new Style({
      image: new CircleStyle({
        radius: 5.5,
        fill: new Fill({ color: "#0060A9" }),
        stroke: new Stroke({ color: "#ffffff", width: 2 }),
      }),
    })];

    const hotExactStyle = [
      new Style({
        image: new CircleStyle({
          radius: 15,
          fill: new Fill({ color: "rgba(0, 96, 169, 0.16)" }),
          stroke: new Stroke({ color: "rgba(0, 96, 169, 0.45)", width: 1.5 }),
        }),
      }),
      new Style({
        image: new CircleStyle({
          radius: 10,
          fill: new Fill({ color: "rgba(0, 96, 169, 0.28)" }),
        }),
      }),
      new Style({
        image: new CircleStyle({
          radius: 7,
          fill: new Fill({ color: "#0060A9" }),
          stroke: new Stroke({ color: "#ffffff", width: 2 }),
        }),
      }),
    ];

    const hotApproxStyle = [
      new Style({
        image: new CircleStyle({
          radius: 13,
          fill: new Fill({ color: "rgba(0, 96, 169, 0.16)" }),
          stroke: new Stroke({ color: "rgba(0, 96, 169, 0.45)", width: 1.5 }),
        }),
      }),
      new Style({
        image: new CircleStyle({
          radius: 9,
          fill: new Fill({ color: "rgba(0, 96, 169, 0.28)" }),
        }),
      }),
      new Style({
        image: new CircleStyle({
          radius: 5.5,
          fill: new Fill({ color: "#0060A9" }),
          stroke: new Stroke({ color: "#ffffff", width: 2 }),
        }),
      }),
    ];

    const getMarkerStyle = (f: FeatureLike) => {
      const exact = f.get("type") === "exact";
      const isHot = f.get("isHot") === true;
      if (isHot) {
        return exact ? hotExactStyle : hotApproxStyle;
      }
      return exact ? normalExactStyle : normalApproxStyle;
    };

    const markerLayer = new VectorLayer({
      source: markerSrc,
      style: getMarkerStyle,
    });
    markerRef.current = markerLayer;

    const hazardLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 21,
      style: (f: FeatureLike) => {
        const source = String(f.get("source") || "");
        const color = source === "usgs" ? "#ea580c" : "#be123c";
        return new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color }),
            stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
          }),
        });
      },
    });
    hazardRef.current = hazardLayer;

    const radiusLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 19,
    });
    radiusRef.current = radiusLayer;

    const tileLayer = new TileLayer({
      source: new OSM(),
      opacity: fullBleed ? 1 : 0.35,
    });
    tileRef.current = tileLayer;
    // ── External Intel Vector Layers ─────────────────────────
    const vectorSightingsLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 22,
      style: () =>
        new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: "rgba(245, 158, 11, 0.9)" }),
            stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
          }),
        }),
    });
    vectorSightingsRef.current = vectorSightingsLayer;

    const flightsLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 23,
      style: () =>
        new Style({
          image: new CircleStyle({
            radius: 5.5,
            fill: new Fill({ color: "rgba(6, 182, 212, 0.9)" }),
            stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
          }),
        }),
    });
    flightsRef.current = flightsLayer;

    const firesLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 24,
      style: () =>
        new Style({
          image: new CircleStyle({
            radius: 5.5,
            fill: new Fill({ color: "rgba(239, 68, 68, 0.9)" }),
            stroke: new Stroke({ color: "#fef08a", width: 1.5 }),
          }),
        }),
    });
    firesRef.current = firesLayer;

    const facilitiesLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 22,
      style: () =>
        new Style({
          image: new CircleStyle({
            radius: 5,
            fill: new Fill({ color: "rgba(16, 185, 129, 0.9)" }),
            stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
          }),
        }),
    });
    facilitiesRef.current = facilitiesLayer;

    const environmentLayer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 22,
      style: () =>
        new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: "rgba(14, 165, 233, 0.92)" }),
            stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
          }),
        }),
    });
    environmentRef.current = environmentLayer;

    // ── NASA GIBS WMTS Overlays ──────────────────────────────
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const makeGibs = (key: string, url: string, maxZoom: number, opacity = 0.65, zIndex = 6) => {
      const layer = new TileLayer({
        source: new XYZ({ url, maxZoom, crossOrigin: "anonymous" }),
        visible: false,
        opacity,
        zIndex,
      });
      gibsRef.current[key] = layer;
      return layer;
    };

    const gibsLayersList = [
      makeGibs(
        "viirsTrueColor",
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        9, 0.7, 6
      ),
      makeGibs(
        "modisTrueColor",
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        9, 0.7, 6
      ),
      makeGibs(
        "aerosol",
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OMPS_Aerosol_Index/default/${yesterday}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
        6, 0.6, 7
      ),
      makeGibs(
        "ndvi",
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/${yesterday}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
        9, 0.6, 7
      ),
      makeGibs(
        "nightLights",
        "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png",
        8, 0.7, 6
      ),
      makeGibs(
        "landSurfaceTemp",
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Land_Surface_Temp_Day/default/${yesterday}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`,
        7, 0.6, 7
      ),
      makeGibs(
        "populationDensity",
        "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPW_Population_Density_2020/default/2020-01-01/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png",
        7, 0.55, 7
      ),
    ];

    const makeBnpb = (key: string, url: string, opacity = 0.58) => {
      const layer = new TileLayer({
        source: new TileArcGISRest({ url }),
        visible: false,
        opacity,
        zIndex: 5,
      });
      bnpbRef.current[key] = layer;
      return layer;
    };
    const externalLayers = [
      makeBnpb(
        "hillshade",
        "https://gis.bnpb.go.id/server/rest/services/Basemap/Indo_Hillshade/MapServer",
        0.45,
      ),
      makeBnpb(
        "population",
        "https://gis.bnpb.go.id/server/rest/services/Basemap/Kepadatan_penduduk_2020/MapServer",
        0.5,
      ),
      makeBnpb(
        "flood",
        "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_banjir/ImageServer",
      ),
      makeBnpb(
        "earthquake",
        "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_gempabumi/ImageServer",
        0.65,
      ),
      makeBnpb(
        "landslide",
        "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_tanah_longsor/ImageServer",
      ),
      makeBnpb(
        "forestFire",
        "https://gis.bnpb.go.id/server/rest/services/inarisk/layer_bahaya_kebakaran_hutan_dan_lahan/ImageServer",
      ),
    ];

    const map = new Map({
      target: el.current,
      layers: [
        tileLayer,
        ...externalLayers,
        ...gibsLayersList,
        vectorLayer,
        currentCountryBoundaryLayer,
        regionLayer,
        radiusLayer,
        markerLayer,
        hazardLayer,
        vectorSightingsLayer,
        flightsLayer,
        firesLayer,
        facilitiesLayer,
        environmentLayer,
      ],
      view: new View({
        center: fromLonLat([110, 2]),
        zoom: 4,
        minZoom: 3,
        maxZoom: 12,
      }),
      controls: defaultControls({ attribution: false }),
    });

    const clickKey = map.on("singleclick", (evt) => {
      const intelHits: FeatureLike[] = [];
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          intelHits.push(f);
          return true;
        },
        {
          hitTolerance: 10,
          layerFilter: (l) =>
            l === vectorSightingsLayer ||
            l === flightsLayer ||
            l === firesLayer ||
            l === facilitiesLayer ||
            l === environmentLayer ||
            l === hazardLayer,
        },
      );

      if (intelHits.length > 0) {
        const f = intelHits[0];
        const intelType = f.get("intelType");
        const intelData = f.get("intelData");
        const hazard = f.get("hazard") as HazardEvent | undefined;
        if (intelType && intelData) {
          setSelected(null);
          setSelectedRegion(null);
          setSelectedLocation(null);
          setSelectedIntel({ type: intelType, data: intelData });
          return;
        }
        if (hazard) {
          setSelected(null);
          setSelectedRegion(null);
          setSelectedLocation(null);
          setSelectedIntel({ type: "hazard_event", data: hazard });
          return;
        }
      }

      const markerHits: FeatureLike[] = [];
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          markerHits.push(f);
          return true;
        },
        { hitTolerance: 10, layerFilter: (l) => l === markerLayer },
      );

      const clickedLocation = markerHits[0]?.get("location") as OutbreakLocation | undefined;
      if (clickedLocation) {
        setSelected(null);
        setSelectedRegion(null);
        setSelectedIntel(null);
        setSelectedLocation(clickedLocation);
        return;
      }

      const regionHits: FeatureLike[] = [];
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          regionHits.push(f);
          return true;
        },
        { hitTolerance: 8, layerFilter: (l) => l === regionLayer },
      );
      if (regionHits.length > 0) {
        const feature = regionHits[0];
        const metric = (feature.get("regionMetric") as RegionMetric | undefined) || {
          cases: 0,
          deaths: 0,
          eventCount: 0,
        };
        setSelected(null);
        setSelectedLocation(null);
        setSelectedIntel(null);
        setSelectedRegion({
          name: String(feature.get("regionName") || "Region"),
          country: String(feature.get("regionCountry") || ""),
          cases: metric.cases,
          deaths: metric.deaths,
          eventCount: metric.eventCount,
        });
        return;
      }

      const hits: FeatureLike[] = [];
      map.forEachFeatureAtPixel(
        evt.pixel,
        (f) => {
          hits.push(f);
          return true;
        },
        { hitTolerance: 8, layerFilter: (l) => l === vectorLayer },
      );

      if (hits.length === 0) {
        setSelected(null);
        setSelectedRegion(null);
        setSelectedLocation(null);
        setSelectedIntel(null);
        return;
      }

      const name = hits[0].get("name") as string;
      const { countryData: curCountryData, outbreakLocations: curOutbreaks, locationsData: curLocs } = latestPropsRef.current;
      const item = curCountryData?.find((d) => d.name?.toLowerCase() === name.toLowerCase());
      
      const matchingOutbreaks = curOutbreaks?.filter(
        (l) => l.country?.toLowerCase() === name.toLowerCase()
      ) ?? [];

      const locs = (curLocs && curLocs.length > 0)
        ? curLocs.filter((l) => l.country?.toLowerCase() === name.toLowerCase())
        : matchingOutbreaks.map((l) => ({
            name: l.location_name || l.disease || "Monitored Location",
            cases: l.cases || 1,
          }));

      const totalCases = (item && item.cases > 0)
        ? item.cases
        : matchingOutbreaks.reduce((sum, cur) => sum + (cur.cases || 1), 0);

      setSelected({
        name,
        totalCases,
        locations: locs.sort((a, b) => b.cases - a.cases),
      });
      setSelectedRegion(null);
      setSelectedLocation(null);
      setSelectedIntel(null);

      const geom = (hits[0] as Feature<Geometry>).getGeometry();
      if (geom) {
        map.getView().fit(geom.getExtent(), {
          duration: 450,
          padding: [50, 200, 50, 50],
          maxZoom: 6,
        });
      }
    });

    const hoverKey = map.on("pointermove", (evt) => {
      if (evt.dragging) return;
      const hit = map.hasFeatureAtPixel(evt.pixel, {
        hitTolerance: 8,
        layerFilter: (l) =>
          l === vectorLayer ||
          l === regionLayer ||
          l === markerLayer ||
          l === vectorSightingsLayer ||
          l === flightsLayer ||
          l === firesLayer ||
          l === facilitiesLayer ||
          l === environmentLayer ||
          l === hazardLayer,
      });
      (map.getTargetElement() as HTMLElement).style.cursor = hit
        ? "pointer"
        : "";
    });

    mapRef.current = map;

    return () => {
      unByKey([clickKey, hoverKey]);
      map.setTarget(undefined);
      if (windRef.current) {
        try {
          windRef.current.setVisible?.(false);
          windRef.current.stop?.();
          windRef.current.dispose?.();
        } catch {}
        windRef.current = null;
      }
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (windRef.current) {
      windRef.current.setVisible?.(showWind);
      if (showWind) windRef.current.start?.();
      else windRef.current.stop?.();
      return;
    }
    if (!showWind) return;
    let cancelled = false;
    const start = async () => {
      try {
        const response = await fetch(`${PUBLIC_BASE_PATH}/wind-data`);
        if (!response.ok || cancelled) return;
        const windData = await response.json();
        const layer = new WindLayer(
          windData as any,
          {
            zIndex: 18,
            windOptions: {
              velocityScale: 0.015,
              paths: 350,
              colorScale: [
                "rgb(15,60,140)",
                "rgb(70,150,145)",
                "rgb(85,160,115)",
                "rgb(215,195,60)",
                "rgb(210,125,35)",
                "rgb(185,35,10)",
                "rgb(155,8,12)",
              ],
              lineWidth: 2.2,
              generateParticleOption: true,
            },
            fieldOptions: { wrapX: true },
          } as any,
        );
        map.addLayer(layer as any);
        windRef.current = layer;
        layer.setVisible?.(true);
        (layer as any).start?.();
      } catch {}
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [showWind]);

  useEffect(() => {
    const layer = tileRef.current;
    if (!layer) return;
    const sources = {
      osm: () => new OSM(),
      terrain: () =>
        new XYZ({
          url: "https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png",
          crossOrigin: "anonymous",
        }),
      satellite: () =>
        new XYZ({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          crossOrigin: "anonymous",
        }),
      light: () =>
        new XYZ({
          url: "https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          crossOrigin: "anonymous",
        }),
      dark: () =>
        new XYZ({
          url: "https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          crossOrigin: "anonymous",
        }),
    };
    layer.setSource(sources[baseMap]());
    layer.setOpacity(fullBleed ? 1 : 0.35);
  }, [baseMap, fullBleed]);

  useEffect(() => {
    const drilldownCountry = normalizedCountry(selected?.name);
    const hasRegionBoundary = Boolean(COUNTRY_ISO3[drilldownCountry]);
    vectorRef.current?.setVisible(Boolean(showAdmin && !hasRegionBoundary));
    regionRef.current?.setVisible(Boolean(showAdmin && hasRegionBoundary));
    markerRef.current?.setVisible(showMarkers);
  }, [showAdmin, showMarkers, selected?.name]);

  useEffect(() => {
    Object.entries(bnpbRef.current).forEach(([key, layer]) =>
      layer.setVisible(Boolean(bnpbLayers?.[key as keyof typeof bnpbLayers])),
    );
  }, [bnpbLayers]);

  // NASA GIBS WMTS Tile Layer Toggles
  useEffect(() => {
    Object.entries(gibsRef.current).forEach(([key, layer]) => {
      if (!layer) return;
      if (key === "populationDensity") {
        layer.setVisible(Boolean(intelLayers?.population));
        return;
      }
      layer.setVisible(Boolean(gibsLayers?.[key as keyof NasaGibsLayers]));
    });
  }, [gibsLayers, intelLayers?.population]);

  // iNaturalist Aedes Vector Sightings
  useEffect(() => {
    const layer = vectorSightingsRef.current;
    if (!layer) return;
    const visible = Boolean(intelLayers?.vectors);
    layer.setVisible(visible);
    if (!visible) {
      reportStatus("vectors", { state: "idle" });
      return;
    }
    const src = layer.getSource();
    if (!src) return;
    const ac = new AbortController();
    let cancelled = false;
    reportStatus("vectors", { state: "loading", message: "Loading iNaturalist observations…" });
    fetchVectorSightings({ signal: ac.signal })
      .then((res) => {
        if (cancelled) return;
        src.clear();
        const features = (res?.sightings || []).map((s) => {
          const f = new Feature({
            geometry: new Point(fromLonLat([s.longitude, s.latitude])),
          });
          f.set("intelType", "vector_sighting");
          f.set("intelData", s);
          return f;
        });
        src.addFeatures(features);
        reportStatus("vectors", layerOutcome(features.length, res?.source, res?.error, res));
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        reportStatus("vectors", statusFromCatch(err));
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [intelLayers?.vectors]);

  // OpenSky Live Flights
  useEffect(() => {
    const layer = flightsRef.current;
    if (!layer) return;
    const visible = Boolean(intelLayers?.flights);
    layer.setVisible(visible);
    if (!visible) {
      reportStatus("flights", { state: "idle" });
      return;
    }
    const src = layer.getSource();
    if (!src) return;
    const ac = new AbortController();
    let cancelled = false;
    reportStatus("flights", { state: "loading", message: "Loading OpenSky traffic…" });
    fetchLiveFlights({ signal: ac.signal })
      .then((res) => {
        if (cancelled) return;
        src.clear();
        const features = (res?.flights || []).map((flight) => {
          const f = new Feature({
            geometry: new Point(fromLonLat([flight.longitude, flight.latitude])),
          });
          f.set("intelType", "live_flight");
          f.set("intelData", flight);
          return f;
        });
        src.addFeatures(features);
        reportStatus("flights", layerOutcome(features.length, res?.source, res?.error, res));
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        reportStatus("flights", statusFromCatch(err));
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [intelLayers?.flights]);

  // NASA FIRMS Active Fire Hotspots
  useEffect(() => {
    const layer = firesRef.current;
    if (!layer) return;
    const visible = Boolean(intelLayers?.fires);
    layer.setVisible(visible);
    if (!visible) {
      reportStatus("fires", { state: "idle" });
      return;
    }
    const src = layer.getSource();
    if (!src) return;
    const ac = new AbortController();
    let cancelled = false;
    reportStatus("fires", { state: "loading", message: "Loading NASA FIRMS hotspots…" });
    fetchFireHotspots({ signal: ac.signal })
      .then((res) => {
        if (cancelled) return;
        src.clear();
        const features = (res?.hotspots || []).map((h) => {
          const f = new Feature({
            geometry: new Point(fromLonLat([h.longitude, h.latitude])),
          });
          f.set("intelType", "fire_hotspot");
          f.set("intelData", h);
          return f;
        });
        src.addFeatures(features);
        reportStatus("fires", layerOutcome(features.length, res?.source, res?.error, res));
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        reportStatus("fires", statusFromCatch(err));
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [intelLayers?.fires]);

  // Healthcare facilities (Healthsites or OSM Overpass)
  useEffect(() => {
    const layer = facilitiesRef.current;
    if (!layer) return;
    const visible = Boolean(intelLayers?.facilities);
    layer.setVisible(visible);
    if (!visible) {
      reportStatus("facilities", { state: "idle" });
      return;
    }
    const targetCountry = selected?.name || highlightCountry || "Indonesia";
    const src = layer.getSource();
    if (!src) return;
    const ac = new AbortController();
    let cancelled = false;
    reportStatus("facilities", { state: "loading", message: `Loading facilities in ${targetCountry}…` });
    fetchHealthFacilities(targetCountry, { signal: ac.signal })
      .then((res) => {
        if (cancelled) return;
        src.clear();
        const features = (res?.facilities || []).map((fac) => {
          const f = new Feature({
            geometry: new Point(fromLonLat([fac.longitude, fac.latitude])),
          });
          f.set("intelType", "health_facility");
          f.set("intelData", fac);
          return f;
        });
        src.addFeatures(features);
        reportStatus("facilities", layerOutcome(features.length, res?.source, res?.error, res));
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        reportStatus("facilities", statusFromCatch(err));
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [intelLayers?.facilities, selected?.name, highlightCountry]);

  // GDELT / WHO disease news — fetch only when toggled on; abort when off.
  useEffect(() => {
    if (!intelLayers?.news) {
      setDiseaseNews([]);
      setNewsMeta({});
      reportStatus("news", { state: "idle" });
      return;
    }
    const ac = new AbortController();
    let cancelled = false;
    reportStatus("news", { state: "loading", message: "Loading disease media…" });
    fetchDiseaseNews(undefined, { signal: ac.signal })
      .then((res) => {
        if (cancelled) return;
        const articles = res?.articles || [];
        setDiseaseNews(articles);
        setNewsMeta({ source: res?.source, error: res?.error });
        setNewsOpen(true);
        reportStatus("news", layerOutcome(articles.length, res?.source, res?.error, res));
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        setDiseaseNews([]);
        const status = statusFromCatch(err);
        setNewsMeta({ error: status.message || "Failed to load news" });
        reportStatus("news", status);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [intelLayers?.news]);

  // WorldPop metadata + GPW density overlay
  useEffect(() => {
    if (!intelLayers?.population) {
      setWorldPopMeta(null);
      reportStatus("population", { state: "idle" });
      return;
    }
    const country = normalizedCountry(selected?.name || highlightCountry || "indonesia");
    const iso3 = COUNTRY_ISO3[country] || "IDN";
    const ac = new AbortController();
    let cancelled = false;
    reportStatus("population", { state: "loading", message: `Loading WorldPop metadata for ${iso3}…` });
    fetchWorldPopMeta(iso3, { signal: ac.signal })
      .then((res) => {
        if (cancelled) return;
        if (res && (res.status === "ok" || res.fromCache || res.cached) && !res.error) {
          setWorldPopMeta(res);
          const label = `${res.country || iso3} ${res.year || ""}`.trim();
          reportStatus("population", {
            state: res.fromCache || res.cached ? "cached" : "ok",
            source: res.source,
            message: label || "WorldPop metadata",
          });
        } else {
          setWorldPopMeta(res || null);
          reportStatus("population", layerOutcome(0, res?.source, res?.error || "WorldPop metadata unavailable", res));
        }
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        setWorldPopMeta(null);
        reportStatus("population", statusFromCatch(err));
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [intelLayers?.population, selected?.name, highlightCountry]);

  // Open-Meteo weather / AQI capital markers
  useEffect(() => {
    const layer = environmentRef.current;
    if (!layer) return;
    const visible = Boolean(intelLayers?.weather || intelLayers?.airQuality);
    layer.setVisible(visible);
    if (!visible) {
      reportStatus("weather", { state: "idle" });
      reportStatus("airQuality", { state: "idle" });
      return;
    }
    const src = layer.getSource();
    if (!src) return;
    const ac = new AbortController();
    let cancelled = false;
    if (intelLayers?.weather) {
      reportStatus("weather", { state: "loading", message: "Loading capital weather…" });
    }
    if (intelLayers?.airQuality) {
      reportStatus("airQuality", { state: "loading", message: "Loading capital AQI…" });
    }
    fetchMapEnvironment({ signal: ac.signal })
      .then((res) => {
        if (cancelled) return;
        src.clear();
        const features = (res?.markers || []).map((marker) => {
          const f = new Feature({
            geometry: new Point(fromLonLat([marker.longitude, marker.latitude])),
          });
          f.set("intelType", "environment");
          f.set("intelData", marker);
          return f;
        });
        src.addFeatures(features);
        const status = layerOutcome(features.length, res?.source, res?.error, res);
        if (intelLayers?.weather) reportStatus("weather", status);
        if (intelLayers?.airQuality) reportStatus("airQuality", status);
      })
      .catch((err) => {
        if (cancelled || err?.name === "AbortError") return;
        const status = statusFromCatch(err);
        if (intelLayers?.weather) reportStatus("weather", status);
        if (intelLayers?.airQuality) reportStatus("airQuality", status);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [intelLayers?.weather, intelLayers?.airQuality]);

  useEffect(() => {
    const source = radiusRef.current?.getSource();
    if (!source) return;
    source.clear();
    if (!ewsRadiusKm || ewsRadiusKm <= 0) return;
    outbreakLocations
      ?.filter((x) => x.has_alert && x.latitude != null && x.longitude != null)
      .forEach((item) => {
        const feature = new Feature({
          geometry: new CircleGeom(
            fromLonLat([item.longitude!, item.latitude!]),
            ewsRadiusKm * 1000,
          ),
        });
        feature.set("severity", item.severity);
        source.addFeature(feature);
      });
    const dangerRadiusStyle = new Style({
      fill: new Fill({ color: "rgba(239,68,68,0.12)" }),
      stroke: new Stroke({ color: "rgba(220,38,38,0.85)", width: 2 }),
    });
    const warningRadiusStyle = new Style({
      fill: new Fill({ color: "rgba(249,115,22,0.10)" }),
      stroke: new Stroke({ color: "rgba(249,115,22,0.8)", width: 1.8 }),
    });

    radiusRef.current?.setStyle((f) => {
      const danger = f.get("severity") === "AWAS";
      return danger ? dangerRadiusStyle : warningRadiusStyle;
    });
  }, [outbreakLocations, ewsRadiusKm]);

  useEffect(() => {
    const layer = hazardRef.current;
    const source = layer?.getSource();
    if (!layer || !source) return;
    source.clear();
    layer.setVisible(Boolean(showHazards));
    if (!showHazards || !hazardEvents?.length) return;
    hazardEvents.forEach((item) => {
      if (item.latitude == null || item.longitude == null) return;
      const feature = new GeoJSON().readFeature(
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [item.longitude, item.latitude],
          },
          properties: {},
        },
        { featureProjection: "EPSG:3857" },
      ) as Feature;
      feature.set("source", item.source || "gdacs");
      feature.set("hazard", item);
      source.addFeature(feature);
    });
  }, [hazardEvents, showHazards]);

  useEffect(() => {
    const vectorLayer = vectorRef.current;
    const markerLayer = markerRef.current;
    if (!vectorLayer || !markerLayer) return;

    const vectorSource = vectorLayer.getSource()!;
    const markerSource = markerLayer.getSource()!;

    markerSource.clear();

    outbreakLocations?.forEach((item) => {
      // Public pins are intentionally limited to the rolling recent window
      // calculated by the backend. Historical aggregates remain available to
      // the choropleth and dashboard totals, but do not become live markers.
      const isRecent = isWithinRecentWindowForDays(item.latest_date, markerLookbackDays);
      if (!isRecent || item.latitude == null || item.longitude == null) return;
      const feature = new GeoJSON().readFeature(
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [item.longitude, item.latitude],
          },
          properties: {},
        },
        { featureProjection: "EPSG:3857" },
      ) as Feature;
      feature.set("severity", item.severity);
      feature.set("isHot", item.is_hot === true);
      feature.set("location", item);
      markerSource.addFeature(feature);
    });

    const hasLocation = result?.latitude != null && result?.longitude != null;
    const hasCountry = !!result?.country && result?.language !== "en";

    const targetCountry = (result?.country || highlightCountry)?.toLowerCase();

    vectorLayer.setStyle((f: FeatureLike) => {
      const name = (f.get("name") as string).toLowerCase();
      const item = countryData?.find((d) => d.name?.toLowerCase() === name);
      const maximum = Math.max(...(countryData || []).map((d) => d.cases || 0), 0);
      const isHighlighted =
        !!targetCountry && (name === targetCountry || name === highlightCountry?.toLowerCase());
      const fill = isHighlighted
        ? heatFill(Math.max(item?.cases || 0, maximum * 0.18), maximum || 1)
        : heatFill(item?.cases || 0, maximum);
      const stroke = isHighlighted
        ? "#0060A9"
        : (item?.deaths || 0) > 0
          ? "#be123c"
          : "#cbd5e1";
      const sw = isHighlighted ? 2.5 : (item?.deaths || 0) > 0 ? 1.6 : 1;
      return new Style({
        fill: new Fill({ color: fill }),
        stroke: new Stroke({
          color: stroke,
          width: sw,
          lineDash: !isHighlighted && (item?.deaths || 0) > 0 ? [5, 3] : undefined,
        }),
      });
    });
    vectorLayer.changed();

    if (result?.locations && result.locations.length > 0) {
      result.locations.forEach((loc) => {
        if (loc.latitude != null && loc.longitude != null) {
          const f = new GeoJSON().readFeature(
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [loc.longitude, loc.latitude],
              },
            },
            { featureProjection: "EPSG:3857" },
          ) as Feature;
          f.set("type", "exact");
          f.set("name", loc.name);
          markerSource.addFeature(f);
        }
      });
      if (markerSource.getFeatures().length > 0) {
        const extent = markerSource.getExtent();
        mapRef.current?.getView().fit(extent, {
          padding: [60, 60, 60, 60],
          maxZoom: 8,
          duration: 800,
        });
      }
    } else if (hasLocation) {
      const f = new GeoJSON().readFeature(
        {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [result.longitude!, result.latitude!],
          },
        },
        { featureProjection: "EPSG:3857" },
      ) as Feature;
      f.set("type", "exact");
      markerSource.addFeature(f);
    } else if ((hasCountry || highlightCountry) && targetCountry) {
      const feature = vectorSource
        .getFeatures()
        .find((f) => (f.get("name") as string).toLowerCase() === targetCountry);
      if (feature) {
        const extent = feature.getGeometry()!.getExtent();
        mapRef.current?.getView().fit(extent, {
          padding: [50, 50, 50, 50],
          duration: 500,
          maxZoom: 6,
        });
      }
    } else if (!selected) {
      mapRef.current
        ?.getView()
        .animate({ center: fromLonLat([110, 2]), zoom: 4, duration: 500 });
    }
  }, [countryData, result, outbreakLocations, highlightCountry, markerLookbackDays]);

  // Refresh the selected country's outer polygon from the current
  // geoBoundaries gbOpen dataset. The bundled ASEAN geometry remains as a
  // resilient fallback, while this overlay prevents a country selection from
  // reusing Indonesia's old administrative geometry.
  useEffect(() => {
    const layer = currentCountryBoundaryRef.current;
    const source = layer?.getSource();
    const countryName = normalizedCountry(highlightCountry);
    const iso3 = COUNTRY_ISO3[countryName];
    if (!source) return;

    source.clear();
    if (!iso3) return;

    let cancelled = false;
    fetch(`${PUBLIC_BASE_PATH}/boundaries?country=${iso3}&level=ADM0`)
      .then((response) => {
        if (!response.ok) throw new Error(`Country boundary HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        if (cancelled || !payload?.geojson) return;
        const features = new GeoJSON().readFeatures(payload.geojson, {
          featureProjection: 'EPSG:3857',
        });
        source.addFeatures(features);
        const extent = source.getExtent();
        if (features.length > 0 && extent.every(Number.isFinite)) {
          mapRef.current?.getView().fit(extent, {
            padding: [60, 60, 60, 60],
            duration: 650,
            maxZoom: 7,
          });
        }
      })
      .catch(() => {
        // The bundled ASEAN polygon remains visible when the boundary proxy
        // or the upstream dataset is temporarily unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, [highlightCountry]);

  // Load ADM1 province polygons for the focused country (clicked or query-highlighted).
  // Indonesia uses the project's own wilayah-data route; other ASEAN countries use
  // geoBoundaries Open dataset at ADM1 level.
  useEffect(() => {
    const layer = regionRef.current;
    const source = layer?.getSource();
    const countryName = normalizedCountry(selected?.name || highlightCountry);
    const iso3 = COUNTRY_ISO3[countryName];
    if (!layer || !source) return;

    source.clear();
    layer.setVisible(false);
    if (!iso3 || !showAdmin || !countryName) return;

    let cancelled = false;
    const load = async () => {
      try {
        let geojson: unknown;
        if (iso3 === "IDN") {
          const response = await fetch(`${PUBLIC_BASE_PATH}/wilayah-data?level=provinsi`);
          if (!response.ok) throw new Error(`Indonesia boundary HTTP ${response.status}`);
          const payload = await response.json();
          geojson = payload.geojson;
        } else {
          const metadataResponse = await fetch(
            `${PUBLIC_BASE_PATH}/boundaries?country=${iso3}&level=ADM1`,
          );
          if (!metadataResponse.ok) throw new Error(`Boundary proxy HTTP ${metadataResponse.status}`);
          const payload = await metadataResponse.json();
          if (!payload.geojson) throw new Error("Boundary GeoJSON is missing");
          geojson = payload.geojson;
        }

        if (cancelled || !geojson) return;
        const features = new GeoJSON().readFeatures(geojson as any, {
          featureProjection: "EPSG:3857",
        });
        const locations = (latestPropsRef.current.outbreakLocations || []).filter(
          (item) => normalizedCountry(item.country) === countryName
            && item.latitude != null
            && item.longitude != null,
        );
        const points = locations.map((item) => ({
          item,
          coordinate: fromLonLat([item.longitude!, item.latitude!]),
        }));

        let maximumCases = 0;
        features.forEach((feature) => {
          const geometry = feature.getGeometry();
          const metric: RegionMetric = { cases: 0, deaths: 0, eventCount: 0 };
          if (geometry) {
            points.forEach(({ item, coordinate }) => {
              if (!geometry.intersectsCoordinate(coordinate)) return;
              metric.cases += Math.max(item.cases || 0, 0);
              metric.deaths += Math.max(item.deaths || 0, 0);
              metric.eventCount += Math.max(item.event_count || 0, 0);
            });
          }
          maximumCases = Math.max(maximumCases, metric.cases);
          feature.set("regionName", regionName(feature.getProperties()));
          feature.set("regionCountry", selected?.name || highlightCountry || countryName);
          feature.set("regionMetric", metric);
        });
        features.forEach((feature) => feature.set("regionMaximumCases", maximumCases));
        if (cancelled) return;
        source.addFeatures(features);
        layer.setVisible(Boolean(showAdmin));
        layer.changed();
      } catch {
        if (!cancelled) layer.setVisible(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      source.clear();
      layer.setVisible(false);
    };
  }, [selected?.name, highlightCountry, showAdmin, outbreakLocations]);

  const resetView = () => {
    setSelected(null);
    setSelectedRegion(null);
    setSelectedLocation(null);
    setSelectedIntel(null);
    mapRef.current
      ?.getView()
      .animate({ center: fromLonLat([110, 2]), zoom: 4, duration: 450 });
  };

  const zoom = (d: number) => {
    const v = mapRef.current?.getView();
    if (v) v.animate({ zoom: (v.getZoom() ?? 4) + d, duration: 250 });
  };

  const countryOutbreaks = outbreakLocations?.filter(
    (x) => x.country?.toLowerCase() === selected?.name.toLowerCase()
  ) ?? [];

  const countryItem = countryData?.find(
    (d) => d.name?.toLowerCase() === selected?.name.toLowerCase()
  );

  const calculatedCases = (countryItem && countryItem.cases > 0)
    ? countryItem.cases
    : (selected?.totalCases && selected.totalCases > 0)
      ? selected.totalCases
      : countryOutbreaks.reduce((acc, c) => acc + (c.cases || 0), 0);

  const displayTotalCases = calculatedCases > 0
    ? calculatedCases
    : countryOutbreaks.length;

  const totalDeaths = countryOutbreaks.reduce((acc, curr) => acc + (curr.deaths || 0), 0);
  const uniqueDiseases = Array.from(
    new Set(
      countryOutbreaks
        .map((x) => x.disease)
        .filter((d): d is string => Boolean(d && d !== "UNKNOWN"))
    )
  ).slice(0, 4);

  const displayLocations = (selected?.locations && selected.locations.length > 0)
    ? selected.locations
    : (locationsData && locationsData.length > 0)
      ? locationsData.filter((l) => l.country?.toLowerCase() === selected?.name.toLowerCase())
      : countryOutbreaks.map((l) => ({
          name: l.location_name || l.disease || "Monitored Location",
          cases: l.cases || 1,
        }));

  const locationsCount = displayLocations.length || countryOutbreaks.length || (selected?.locations.length ?? 0);
  const popupPositionClass = fullBleed
    ? "bottom-16 left-1/2 -translate-x-1/2"
    : "right-4 top-20";

  return (
    <div
      className={
        fullBleed
          ? "relative h-full w-full overflow-hidden bg-white"
          : embedded
            ? "relative h-full w-full overflow-hidden rounded-xl bg-white"
            : "relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      }
    >
      {!fullBleed && !embedded && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("map.monitoringTitle")}
            </span>
            {result && (
              <span className="ml-2 text-xs text-slate-400">
                {result.locations && result.locations.length > 1
                  ? `📍 ${result.locations.length} ${t("map.mappedLocations")}`
                  : result.latitude != null
                  ? `📍 ${result.location_name || t("dashboard.labelLocation")}`
                  : result.country
                    ? `🌏 ${result.country}`
                    : ""}
              </span>
            )}
          </div>
        </div>
      )}

      <div
        ref={el}
        className={
          fullBleed
            ? "h-full min-h-screen w-full"
            : embedded
              ? "h-full min-h-[300px] w-full"
              : compact
                ? "h-[390px] w-full"
                : "h-[500px] w-full"
        }
      />

      {selectedIntel && (
        <IntelPopup
          selected={selectedIntel}
          className={popupPositionClass}
          onClose={() => setSelectedIntel(null)}
          showWeather={Boolean(intelLayers?.weather)}
          showAir={Boolean(intelLayers?.airQuality)}
        />
      )}

      {intelLayers?.news && newsOpen && (
        <div className="absolute left-4 top-16 z-30 w-[min(340px,calc(100%-32px))] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_16px_45px_rgba(0,96,169,0.18)] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Newspaper className="h-3.5 w-3.5 text-[#0060A9]" />
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-800">Disease media</p>
            </div>
            <button type="button" onClick={() => setNewsOpen(false)} className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="px-3 pt-2 text-[10px] font-semibold text-slate-500">
            {newsMeta.source || "GDELT / WHO News"}
            {newsMeta.error ? ` — ${newsMeta.error}` : ""}
          </p>
          <div className="max-h-56 space-y-1.5 overflow-y-auto p-3 pt-2">
            {diseaseNews.length === 0 ? (
              <p className="text-[11px] font-semibold text-slate-500">
                {newsMeta.error || "No articles returned for the current query."}
              </p>
            ) : (
              diseaseNews.slice(0, 12).map((article, index) => (
                <a
                  key={`${article.url}-${index}`}
                  href={article.url || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2 hover:border-blue-200 hover:bg-blue-50"
                >
                  <p className="line-clamp-2 text-[11px] font-bold text-slate-800">{fieldOrNone(article.title)}</p>
                  <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400">
                    {[article.domain, article.source_country, article.seen_date].filter(Boolean).join(" · ") || "No data"}
                  </p>
                </a>
              ))
            )}
          </div>
        </div>
      )}

      {intelLayers?.population && worldPopMeta && (
        <div className="absolute left-4 bottom-28 z-30 w-[min(320px,calc(100%-32px))] rounded-2xl border border-indigo-200/90 bg-white/95 p-3 shadow-[0_12px_30px_rgba(0,96,169,0.14)] backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-indigo-600" />
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-800">Population denominators</p>
          </div>
          <p className="mt-1 text-[11px] font-bold text-slate-800">
            {fieldOrNone(worldPopMeta.country || worldPopMeta.iso3)} · {fieldOrNone(worldPopMeta.year)}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
            {worldPopMeta.status === "ok"
              ? fieldOrNone(worldPopMeta.title)
              : fieldOrNone(worldPopMeta.error)}
          </p>
          <p className="mt-1 text-[9px] font-semibold text-slate-400">
            Density overlay: NASA SEDAC GPWv4 2020. WorldPop GeoTIFF is linked when the provider returns a file URL.
          </p>
          {worldPopMeta.tif_url ? (
            <a href={worldPopMeta.tif_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#0060A9] hover:underline">
              Open GeoTIFF <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <p className="mt-1 text-[10px] font-semibold text-slate-400">GeoTIFF URL: No data</p>
          )}
        </div>
      )}

      {selectedRegion && (
        <div
          className={`absolute ${popupPositionClass} z-30 w-[min(360px,calc(100%-32px))] overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_16px_45px_rgba(0,96,169,0.18)] backdrop-blur-md ring-1 ring-black/5`}
          style={{ animation: "fadeSlideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <button
            type="button"
            onClick={resetView}
            className="absolute right-3.5 top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="pr-8">
            <p className="text-[10px] font-black uppercase tracking-wider text-[#0060A9]">
              Regional NLP Coverage
            </p>
            <h3 className="mt-1 truncate text-base font-black text-slate-900">
              {selectedRegion.name}
            </h3>
            <p className="truncate text-[11px] font-semibold text-slate-500">
              {selectedRegion.country}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-2 text-center">
              <span className="text-[9px] font-bold text-[#0060A9]">Cases</span>
              <p className="mt-0.5 text-sm font-black text-[#0060A9]">
                {selectedRegion.cases.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/70 p-2 text-center">
              <span className="text-[9px] font-bold text-rose-700">Deaths</span>
              <p className="mt-0.5 text-sm font-black text-rose-700">
                {selectedRegion.deaths.toLocaleString()}
              </p>
            </div>
          </div>
          <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500">
            Aggregated from processed NLP locations in this region.
          </p>
          <p className="mt-1 text-[9px] font-semibold text-slate-400">
            Boundary source: {selectedRegion.country.toLowerCase() === "indonesia" ? "Internal project data" : "geoBoundaries gbOpen"}
          </p>
        </div>
      )}

      {selectedLocation && (
        <div
          className={`absolute ${popupPositionClass} z-35 w-[min(410px,calc(100%-32px))] overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_16px_45px_rgba(0,96,169,0.18)] backdrop-blur-md ring-1 ring-black/5 transition-all duration-300 hover:z-50`}
          style={{ animation: "fadeSlideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <button
            type="button"
            onClick={resetView}
            className="absolute right-3.5 top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="pr-8">
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedLocation.detail?.source_type && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 border border-slate-200">
                  {selectedLocation.detail.source_type}
                </span>
              )}
            </div>

            <h3 className="mt-1.5 truncate text-base font-black text-slate-900">
              {selectedLocation.location_name}
            </h3>
            <p className="truncate text-[11px] font-semibold text-slate-500">
              {translateDisease(selectedLocation.disease)} • {selectedLocation.country}
              {(selectedLocation.province || selectedLocation.city || selectedLocation.detail?.province || selectedLocation.detail?.city)
                ? ` · ${[selectedLocation.province || selectedLocation.detail?.province, selectedLocation.city || selectedLocation.detail?.city].filter(Boolean).join(" / ")}`
                : ""}
            </p>
            <p className="mt-1 text-[10px] font-semibold text-slate-400">
              Aggregated NLP result for this location and disease
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-2 text-center">
              <span className="text-[9px] font-bold text-[#0060A9]">Cases</span>
              <p className="mt-0.5 text-sm font-black text-[#0060A9]">{selectedLocation.cases.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/70 p-2 text-center">
              <span className="text-[9px] font-bold text-rose-700">Deaths</span>
              <p className="mt-0.5 text-sm font-black text-rose-700">{selectedLocation.deaths.toLocaleString()}</p>
            </div>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] font-semibold text-slate-500">
            <div className="flex items-center justify-between gap-3">
              <span>Source: {selectedLocation.detail?.source_name || (selectedLocation.detail?.source_type ? selectedLocation.detail.source_type.toUpperCase() : "Surveillance AI")}</span>
              <span>{selectedLocation.latest_date ? new Date(selectedLocation.latest_date).toLocaleDateString("en-US") : "-"}</span>
            </div>
            <p className="mt-1 text-[9px] font-medium leading-relaxed text-slate-400">
              Cases and deaths are aggregated from processed NLP reports. The source above is the latest representative article.
            </p>
            {(selectedLocation.recent_event_count ?? 0) > 0 && (
              <p className="mt-1 text-[9px] font-semibold leading-relaxed text-[#0060A9]">
                Recent activity: {(selectedLocation.recent_cases ?? 0).toLocaleString()} cases • {(selectedLocation.recent_event_count ?? 0).toLocaleString()} reports • {(selectedLocation.recent_source_count ?? 0).toLocaleString()} sources (7 days)
              </p>
            )}
            {(selectedLocation.sources?.length ?? 0) > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Related sources</p>
                <div className="mt-1 space-y-0.5">
                  {selectedLocation.sources?.slice(0, 3).map((source, index) => (
                    source.url ? (
                      <a
                        key={`${source.url}-${index}`}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-[9px] font-semibold text-[#0060A9] hover:underline"
                      >
                        {source.source_name || source.source_type || source.url}
                      </a>
                    ) : null
                  ))}
                </div>
                {(selectedLocation.sources?.length ?? 0) > 3 && (
                  <p className="mt-1 text-[9px] text-slate-400">+{(selectedLocation.sources?.length ?? 0) - 3} more sources</p>
                )}
              </div>
            )}
            {selectedLocation.detail?.url && (
              <a
                href={selectedLocation.detail.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex font-bold text-[#0060A9] hover:underline"
              >
                Open source article
              </a>
            )}
          </div>
        </div>
      )}

      {selected && (
        <div
          className={`absolute ${popupPositionClass} z-35 w-[min(410px,calc(100%-32px))] overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_16px_45px_rgba(0,96,169,0.18)] backdrop-blur-md ring-1 ring-black/5 transition-all duration-300 hover:z-50`}
          style={{ animation: "fadeSlideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          {/* Close Button - Clean top-right positioning without badge */}
          <button
            type="button"
            onClick={resetView}
            className="absolute top-3.5 right-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Country Flag & Title */}
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0060A9] ring-1 ring-blue-200/80 shadow-xs overflow-hidden">
              <CountryFlag countryName={selected.name} shape="circle" size="md" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-black uppercase tracking-tight text-slate-900">
                {selected.name}
              </h3>
              <p className="truncate text-[11px] font-semibold text-slate-500">
                {locationsCount > 0
                  ? t("map.mappedLocationsRegion", { count: locationsCount })
                  : t("map.monitoredRegion")}
              </p>
            </div>
          </div>

          {/* Public NLP metrics in English (ABVC Theme Consistent) */}
          <div className="mt-3.5 grid grid-cols-3 gap-2">
            {/* Total Cases */}
            <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-[#0060A9]">
                <Activity className="h-3 w-3" />
                <span>Cases</span>
              </div>
              <p className="mt-0.5 text-sm font-black text-[#0060A9]">
                {displayTotalCases > 9999
                  ? `${(displayTotalCases / 1000).toFixed(1)}k`
                  : displayTotalCases.toLocaleString()}
              </p>
            </div>

            {/* Deaths */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-600">
                <Skull className="h-3 w-3 text-slate-500" />
                <span>Deaths</span>
              </div>
              <p className="mt-0.5 text-sm font-black text-slate-800">
                {totalDeaths.toLocaleString()}
              </p>
            </div>

            {/* Monitored Locations */}
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-[#B49B58]">
                <MapPin className="h-3 w-3" />
                <span>{t("map.mappedLocations")}</span>
              </div>
              <p className="mt-0.5 text-sm font-black text-[#B49B58]">
                {locationsCount}
              </p>
            </div>
          </div>

          {/* Detected Diseases */}
          {uniqueDiseases.length > 0 && (
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-[9.5px] font-bold text-slate-400">{t("map.healthTopics")}:</span>
              {uniqueDiseases.map((dis) => (
                <span key={dis} className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#0060A9] ring-1 ring-blue-200/60">
                  {dis}
                </span>
              ))}
            </div>
          )}

          {/* Location Breakdown if available */}
          {displayLocations.length > 0 && (
            <div className="mt-2.5 border-t border-slate-100 pt-2">
              <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Top Locations
              </p>
              <div className="max-h-[80px] space-y-1 overflow-y-auto pr-1">
                {displayLocations.slice(0, 5).map((loc) => (
                  <div
                    key={loc.name}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate text-slate-700">{loc.name}</span>
                    <span className="ml-2 shrink-0 font-bold text-slate-900">
                      {loc.cases.toLocaleString()} cases
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tactical Action Button in English */}
          <button
            type="button"
            onClick={() => {
              const geom = (vectorRef.current?.getSource()?.getFeatures() || []).find(
                (f) => (f.get("name") as string).toLowerCase() === selected.name.toLowerCase()
              )?.getGeometry();
              if (geom) {
                mapRef.current?.getView().fit(geom.getExtent(), {
                  duration: 500,
                  padding: [60, 60, 220, 60],
                  maxZoom: 7,
                });
              }
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0060A9] py-2.5 text-xs font-black text-white shadow-md transition hover:bg-[#004d88] active:scale-[0.98]"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>Focus Map on {selected.name}</span>
          </button>

          <Link
            href={`/detail-region?country=${encodeURIComponent(selected.name)}`}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0060A9] to-[#004d88] py-2.5 text-xs font-black text-white shadow-[0_4px_14px_rgba(0,96,169,0.28)] transition hover:brightness-110 active:scale-[0.98]"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Lihat Detail Region {selected.name.toLowerCase() === 'indonesia' ? '(Indonesia)' : `(${selected.name})`}</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link></div>
      )}



      {/* ── Gradient Bar Legend for Region Intensity ── */}
      {!hideLegend && (
        <div className="absolute bottom-3 left-3 z-20 max-w-[280px] sm:max-w-[320px] rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-300 pointer-events-auto">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#0060A9]" />
              {locale === 'id' ? 'Intensitas Kasus & Kematian' : 'Case & Mortality Burden'}
            </span>
            <span className="text-[9px] font-bold text-slate-400">
              Choropleth
            </span>
          </div>

          {/* Color Gradient Bar */}
          <div className="relative h-2.5 w-full rounded-full bg-gradient-to-r from-[#e2e8f0] via-[#60a5fa] to-[#004d88] shadow-inner" />

          {/* Scale Labels */}
          <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-500">
            <span>{locale === 'id' ? 'Rendah (0)' : 'Low (0)'}</span>
            <span>{locale === 'id' ? 'Sedang' : 'Moderate'}</span>
            <span className="text-[#0060A9] font-black">{locale === 'id' ? 'Pekat (Tertinggi)' : 'Deep Blue (Peak)'}</span>
          </div>

          {/* Explicit Helper Note */}
          <p className="mt-1.5 text-[9.5px] leading-relaxed text-slate-500 border-t border-slate-100 pt-1.5">
            {locale === 'id'
              ? 'Wilayah berwarna biru pekat mengindikasikan konsentrasi jumlah kasus dan tingkat kematian tertinggi.'
              : 'Regions shaded in deep blue indicate higher concentrations of reported cases and mortality.'}
          </p>
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
          title={t("map.resetView")}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity:0; transform:translateY(-6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeSlideUp {
          from { opacity:0; transform:translateY(8px); }
          to   { opacity:1; transform:translateY(0); }
        }
      `}</style>
    </div>
  );
}

function IntelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[11px]">
      <span className="shrink-0 font-semibold text-slate-500">{label}</span>
      <span className={`text-right font-bold ${value === "No data" ? "text-slate-400" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}

function IntelPopup({
  selected,
  className,
  onClose,
  showWeather,
  showAir,
}: {
  selected:
    | { type: "vector_sighting"; data: VectorSighting }
    | { type: "live_flight"; data: LiveFlight }
    | { type: "fire_hotspot"; data: FireHotspot }
    | { type: "health_facility"; data: HealthFacility }
    | { type: "hazard_event"; data: HazardEvent }
    | { type: "environment"; data: EnvironmentMarker };
  className: string;
  onClose: () => void;
  showWeather: boolean;
  showAir: boolean;
}) {
  const icon =
    selected.type === "live_flight" ? <Plane className="h-4 w-4" /> :
    selected.type === "vector_sighting" ? <Bug className="h-4 w-4" /> :
    selected.type === "fire_hotspot" ? <Flame className="h-4 w-4" /> :
    selected.type === "health_facility" ? <Building2 className="h-4 w-4" /> :
    selected.type === "environment" ? <CloudSun className="h-4 w-4" /> :
    <Globe className="h-4 w-4" />;

  const title =
    selected.type === "live_flight" ? (selected.data.callsign || selected.data.icao24 || "Aircraft") :
    selected.type === "vector_sighting" ? (selected.data.species || "Aedes sighting") :
    selected.type === "fire_hotspot" ? "Active fire hotspot" :
    selected.type === "health_facility" ? (selected.data.name || "Health facility") :
    selected.type === "hazard_event" ? (selected.data.title || selected.data.kind || "Hazard") :
    `${selected.data.capital}, ${selected.data.display_name}`;

  const kicker =
    selected.type === "live_flight" ? "Live air traffic · OpenSky" :
    selected.type === "vector_sighting" ? "Vector sighting · iNaturalist" :
    selected.type === "fire_hotspot" ? "Thermal anomaly · NASA FIRMS" :
    selected.type === "health_facility" ? "Healthcare facility" :
    selected.type === "hazard_event" ? `${fieldOrNone(selected.data.source).toUpperCase()} ${fieldOrNone(selected.data.kind)}` :
    "Capital environment · Open-Meteo";

  return (
    <div
      className={`absolute ${className} z-40 w-[min(380px,calc(100%-32px))] overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_16px_45px_rgba(0,96,169,0.18)] backdrop-blur-md ring-1 ring-black/5`}
      style={{ animation: "fadeSlideUp 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3.5 top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-2.5 pr-8">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#0060A9] ring-1 ring-blue-200/80">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#0060A9]">{kicker}</p>
          <h3 className="mt-0.5 truncate text-base font-black text-slate-900">{fieldOrNone(title)}</h3>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
        {selected.type === "live_flight" && (
          <>
            <IntelRow label="Callsign" value={fieldOrNone(selected.data.callsign)} />
            <IntelRow label="ICAO24 hex" value={fieldOrNone(selected.data.icao24)} />
            <IntelRow label="Origin country" value={fieldOrNone(selected.data.origin_country)} />
            <IntelRow label="Altitude" value={formatAltitudeM(selected.data.altitude_m)} />
            <IntelRow label="Ground speed" value={formatSpeedMs(selected.data.velocity_ms)} />
            <IntelRow label="Heading" value={formatHeading(selected.data.heading)} />
            <IntelRow label="On ground" value={fieldOrNone(selected.data.on_ground)} />
            <IntelRow label="Squawk" value={fieldOrNone(selected.data.squawk)} />
            <IntelRow label="Last contact" value={formatUnixSeconds(selected.data.last_contact)} />
            <IntelRow label="Origin / destination" value="No data" />
            <p className="pt-1 text-[9px] font-semibold leading-relaxed text-slate-400">
              OpenSky state vectors do not include origin or destination airports. Missing fields are shown as No data.
            </p>
          </>
        )}
        {selected.type === "vector_sighting" && (
          <>
            <IntelRow label="Species" value={fieldOrNone(selected.data.species)} />
            <IntelRow label="Place" value={fieldOrNone(selected.data.place)} />
            <IntelRow label="Observed" value={fieldOrNone(selected.data.observed_on)} />
            {selected.data.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.data.photo_url} alt="" className="mt-2 h-24 w-full rounded-xl object-cover" />
            ) : (
              <IntelRow label="Photo" value="No data" />
            )}
          </>
        )}
        {selected.type === "fire_hotspot" && (
          <>
            <IntelRow label="Brightness" value={fieldOrNone(selected.data.brightness)} />
            <IntelRow label="Confidence" value={fieldOrNone(selected.data.confidence)} />
            <IntelRow label="Acquired" value={fieldOrNone([selected.data.acq_date, selected.data.acq_time].filter(Boolean).join(" "))} />
            <IntelRow label="Satellite" value={fieldOrNone(selected.data.satellite)} />
            <IntelRow label="FRP" value={fieldOrNone(selected.data.frp)} />
          </>
        )}
        {selected.type === "health_facility" && (
          <>
            <IntelRow label="Name" value={fieldOrNone(selected.data.name)} />
            <IntelRow label="Type" value={fieldOrNone(selected.data.amenity_type)} />
            <IntelRow label="OSM id" value={fieldOrNone(selected.data.osm_id)} />
          </>
        )}
        {selected.type === "hazard_event" && (
          <>
            <IntelRow label="Source" value={fieldOrNone(selected.data.source)} />
            <IntelRow label="Kind" value={fieldOrNone(selected.data.kind)} />
            <IntelRow label="Magnitude" value={fieldOrNone(selected.data.magnitude)} />
            <IntelRow label="Alert" value={fieldOrNone(selected.data.alert_level)} />
            <IntelRow label="When" value={typeof selected.data.when === "number" ? formatUnixSeconds(selected.data.when > 1e12 ? selected.data.when / 1000 : selected.data.when) : fieldOrNone(selected.data.when)} />
            {"url" in selected.data && (selected.data as { url?: string }).url ? (
              <a href={(selected.data as { url?: string }).url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0060A9] hover:underline">
                Open source <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <IntelRow label="Source URL" value="No data" />
            )}
          </>
        )}
        {selected.type === "environment" && (
          <>
            {(showWeather || !showAir) && (
              <>
                <IntelRow label="Temperature" value={selected.data.temperature_c == null ? "No data" : `${selected.data.temperature_c} °C`} />
                <IntelRow label="Humidity" value={selected.data.relative_humidity_pct == null ? "No data" : `${selected.data.relative_humidity_pct}%`} />
                <IntelRow label="Precipitation" value={selected.data.precipitation_mm == null ? "No data" : `${selected.data.precipitation_mm} mm`} />
                <IntelRow label="Wind" value={selected.data.wind_speed_kmh == null ? "No data" : `${selected.data.wind_speed_kmh} km/h`} />
                <IntelRow label="Weather observed" value={fieldOrNone(selected.data.weather_observed_at)} />
              </>
            )}
            {(showAir || !showWeather) && (
              <>
                <IntelRow label="European AQI" value={fieldOrNone(selected.data.european_aqi)} />
                <IntelRow label="AQI band" value={fieldOrNone(selected.data.aqi_label)} />
                <IntelRow label="PM2.5" value={selected.data.pm2_5 == null ? "No data" : `${selected.data.pm2_5} µg/m³`} />
                <IntelRow label="PM10" value={selected.data.pm10 == null ? "No data" : `${selected.data.pm10} µg/m³`} />
                <IntelRow label="SO2" value={selected.data.so2 == null ? "No data" : `${selected.data.so2} µg/m³`} />
                <IntelRow label="Air observed" value={fieldOrNone(selected.data.air_observed_at)} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
