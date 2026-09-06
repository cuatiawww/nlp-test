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
import type { FeatureLike } from "ol/Feature";
import { fromLonLat } from "ol/proj";
import { unByKey } from "ol/Observable";
import { defaults as defaultControls } from "ol/control";
import { X, MapPin, RotateCcw, Navigation, Activity, Skull, ChevronRight } from "lucide-react";
import type { AnalyzeResponse, OutbreakLocation } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import CountryFlag from "@/components/CountryFlag";

import { ASEAN_GEOJSON } from "@/data/asean-countries";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";

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
  laos: "LAO",
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
}: Props) {
  const { t, locale, translateDisease } = useTranslation();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorRef = useRef<VectorLayer<VectorSource> | null>(null);
  const markerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const regionRef = useRef<VectorLayer<VectorSource> | null>(null);
  const tileRef = useRef<TileLayer<OSM | XYZ> | null>(null);
  const bnpbRef = useRef<Record<string, TileLayer<TileArcGISRest>>>({});
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
        const name = (f.get("name") as string).toLowerCase();
        const item = countryData?.find((d) => d.name.toLowerCase() === name);
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
    const getMarkerStyle = (f: FeatureLike) => {
      const exact = f.get("type") === "exact";
      const isHot = f.get("isHot") === true;
      const rgb = "0, 96, 169";
      const coreColor = "#0060A9";

      if (!isHot) {
        return [new Style({
          image: new CircleStyle({
            radius: exact ? 7 : 5.5,
            fill: new Fill({ color: coreColor }),
            stroke: new Stroke({ color: "#ffffff", width: 2 }),
          }),
        })];
      }

      const now = Date.now();
      // Hot signals pulse uniformly. Severity/EWS colors are intentionally not
      // exposed on public map markers.
      const period = 1600;
      const wave1 = (now % period) / period;
      const wave2 = ((now + period / 2) % period) / period;

      const maxExpansion = 18;
      const r1 = 6 + wave1 * maxExpansion;
      const alpha1 = Math.max(0, (1 - wave1) * 0.75);

      const r2 = 6 + wave2 * maxExpansion;
      const alpha2 = Math.max(0, (1 - wave2) * 0.5);

      // Outer pulsating wave 1 (Denyut gelombang 1)
      const pulse1 = new Style({
        image: new CircleStyle({
          radius: r1,
          fill: new Fill({ color: `rgba(${rgb}, ${alpha1 * 0.22})` }),
          stroke: new Stroke({
            color: `rgba(${rgb}, ${alpha1})`,
            width: 1.5,
          }),
        }),
      });

      // Outer pulsating wave 2 (Denyut gelombang 2)
      const pulse2 = new Style({
        image: new CircleStyle({
          radius: r2,
          fill: new Fill({ color: `rgba(${rgb}, ${alpha2 * 0.16})` }),
          stroke: new Stroke({
            color: `rgba(${rgb}, ${alpha2 * 0.8})`,
            width: 1,
          }),
        }),
      });

      // Inner soft halo
      const halo = new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: `rgba(${rgb}, 0.28)` }),
        }),
      });

      // Center solid point
      const core = new Style({
        image: new CircleStyle({
          radius: exact ? 7 : 5.5,
          fill: new Fill({ color: coreColor }),
          stroke: new Stroke({ color: "#ffffff", width: 2 }),
        }),
      });

      return [pulse1, pulse2, halo, core];
    };

    const markerLayer = new VectorLayer({
      source: markerSrc,
      style: getMarkerStyle,
    });
    markerRef.current = markerLayer;

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
        vectorLayer,
        regionLayer,
        radiusLayer,
        markerLayer,
      ],
      view: new View({
        center: fromLonLat([110, 2]),
        zoom: 4,
        minZoom: 3,
        maxZoom: 10,
      }),
      controls: defaultControls({ attribution: false }),
    });

    const clickKey = map.on("singleclick", (evt) => {
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
        layerFilter: (l) => l === vectorLayer || l === regionLayer || l === markerLayer,
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
              paths: 1600,
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
    radiusRef.current?.setStyle((f) => {
      const danger = f.get("severity") === "AWAS",
        pulse = (Math.sin(Date.now() / 280) + 1) / 2;
      return new Style({
        fill: new Fill({
          color: danger
            ? `rgba(239,68,68,${0.08 + pulse * 0.08})`
            : `rgba(249,115,22,${0.07 + pulse * 0.06})`,
        }),
        stroke: new Stroke({
          color: danger ? "rgba(220,38,38,.85)" : "rgba(249,115,22,.8)",
          width: 2 + pulse * 2,
        }),
      });
    });
    let frame = 0;
    const animate = () => {
      radiusRef.current?.changed();
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [outbreakLocations, ewsRadiusKm]);

  // Continuous smooth pulsating animation for severity markers (Denyut-denyut)
  useEffect(() => {
    let animId: number;
    let lastTime = 0;
    const animatePulse = (time: number) => {
      if (time - lastTime >= 28) {
        lastTime = time;
        if (markerRef.current) {
          markerRef.current.changed();
        }
      }
      animId = requestAnimationFrame(animatePulse);
    };
    animId = requestAnimationFrame(animatePulse);
    return () => cancelAnimationFrame(animId);
  }, []);


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

  // Load regional boundaries only after a country is selected. Indonesia uses
  // the project's own wilayah-data route; other ASEAN countries use the free
  // geoBoundaries Open dataset at ADM1 level.
  useEffect(() => {
    const layer = regionRef.current;
    const source = layer?.getSource();
    const countryName = normalizedCountry(selected?.name);
    const iso3 = COUNTRY_ISO3[countryName];
    if (!layer || !source) return;

    source.clear();
    layer.setVisible(false);
    if (!iso3 || !showAdmin || !selected?.name) return;

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
          feature.set("regionCountry", selected.name);
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
  }, [selected?.name, showAdmin, outbreakLocations]);

  const resetView = () => {
    setSelected(null);
    setSelectedRegion(null);
    setSelectedLocation(null);
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
      `}</style>
    </div>
  );
}
