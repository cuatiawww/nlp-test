'use client'

import { useEffect, useRef, useState } from "react";
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
import { X, MapPin, RotateCcw, Navigation, Activity, Skull, AlertTriangle } from "lucide-react";
import type { AnalyzeResponse, OutbreakLocation } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import CountryFlag from "@/components/CountryFlag";

import { ASEAN_GEOJSON } from "@/data/asean-countries";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";

type Props = {
  result?: AnalyzeResponse | null;
  countryData?: { name: string; cases: number }[];
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
  embedded?: boolean;
};

const HIGHLIGHT = "#0060A9";
const MARKER = "#0060A9";

function countryFill(cases: number | undefined): string {
  const opacity = 0.22;
  if (!cases) return `rgba(241,245,249,${opacity * 0.5})`;
  if (cases <= 25) return `rgba(234,179,8,${opacity})`;
  if (cases <= 75) return `rgba(249,115,22,${opacity})`;
  if (cases <= 200) return `rgba(239,68,68,${opacity})`;
  return `rgba(185,28,28,${opacity})`;
}

export default function AseanMap({

  result,
  countryData,
  locationsData,
  hideLegend,
  outbreakLocations,
  compact,
  fullBleed,
  baseMap = "osm",
  showAdmin = true,
  showMarkers = true,
  bnpbLayers,
  showWind,
  ewsRadiusKm,
  embedded,
}: Props) {
  const { t } = useTranslation();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorRef = useRef<VectorLayer<VectorSource> | null>(null);
  const markerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const tileRef = useRef<TileLayer<OSM | XYZ> | null>(null);
  const bnpbRef = useRef<Record<string, TileLayer<TileArcGISRest>>>({});
  const radiusRef = useRef<VectorLayer<VectorSource> | null>(null);
  const windRef = useRef<any>(null);

  const [selected, setSelected] = useState<{
    name: string;
    totalCases: number;
    locations: { name: string; cases: number }[];
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
        const fill = countryFill(item?.cases);
        return new Style({
          fill: new Fill({ color: fill }),
          stroke: new Stroke({ color: "#475569", width: 1 }),
        });
      },
    });
    vectorRef.current = vectorLayer;

    const markerSrc = new VectorSource();
    const markerLayer = new VectorLayer({
      source: markerSrc,
      style: (f) => {
        const exact = f.get("type") === "exact";
        const severity = f.get("severity");
        const color =
          severity === "AWAS"
            ? "#ED2939"
            : severity === "SIAGA"
              ? "#B49B58"
              : severity === "WASPADA"
                ? "#eab308"
                : MARKER;
        return new Style({
          image: new CircleStyle({
            radius: exact ? 8 : severity ? 9 : 6,
            fill: new Fill({ color: exact ? MARKER : color }),
            stroke: new Stroke({ color: "#fff", width: 2 }),
          }),
        });
      },
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
            name: l.location_name || l.disease || "Monitored Outbreak",
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
        layerFilter: (l) => l === vectorLayer,
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
    vectorRef.current?.setVisible(showAdmin);
    markerRef.current?.setVisible(showMarkers);
  }, [showAdmin, showMarkers]);

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

  useEffect(() => {
    const vectorLayer = vectorRef.current;
    const markerLayer = markerRef.current;
    if (!vectorLayer || !markerLayer) return;

    const vectorSource = vectorLayer.getSource()!;
    const markerSource = markerLayer.getSource()!;

    markerSource.clear();

    outbreakLocations?.forEach((item) => {
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
      feature.set("severity", item.severity);
      markerSource.addFeature(feature);
    });

    const hasLocation = result?.latitude != null && result?.longitude != null;
    const hasCountry = !!result?.country && result?.language !== "en";

    const targetCountry = result?.country?.toLowerCase();

    vectorLayer.setStyle((f: FeatureLike) => {
      const name = (f.get("name") as string).toLowerCase();
      const item = countryData?.find((d) => d.name.toLowerCase() === name);
      const isHighlighted =
        hasCountry && !!targetCountry && name === targetCountry;
      const fill = isHighlighted ? "#dc2626" : countryFill(item?.cases);
      const stroke = isHighlighted ? "#dc2626" : "#475569";
      const sw = isHighlighted ? 2 : 1;
      return new Style({
        fill: new Fill({ color: fill }),
        stroke: new Stroke({ color: stroke, width: sw }),
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
    } else if (hasCountry && targetCountry) {
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
  }, [countryData, result, outbreakLocations]);

  const resetView = () => {
    setSelected(null);
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
  const alertCount = countryOutbreaks.filter((x) => x.has_alert || x.severity === "AWAS").length;
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

      {countryData && !hideLegend && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
            {t("map.legend")}
          </p>
          <p className="mt-0.5 text-[9px] text-slate-400">
            {t("map.casesPerCountry")}
          </p>
          <ul className="mt-2 space-y-1.5">
            <li className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="h-3 w-3 shrink-0 rounded-[3px] bg-red-500" />{" "}
              &gt;30
            </li>
            <li className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="h-3 w-3 shrink-0 rounded-[3px] bg-yellow-500" />{" "}
              1-30
            </li>
            <li className="flex items-center gap-2 text-[10px] text-slate-600">
              <span className="h-3 w-3 shrink-0 rounded-[3px] bg-slate-400" /> 0
            </li>
          </ul>
        </div>
      )}

      {selected && (
        <div
          className="absolute bottom-16 left-1/2 z-30 w-[min(410px,calc(100%-32px))] -translate-x-1/2 overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_16px_45px_rgba(0,96,169,0.18)] backdrop-blur-md ring-1 ring-black/5"
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
                  ? `${locationsCount} Locations Monitored • ASEAN Region`
                  : "Monitored Region • ASEAN Region"}
              </p>
            </div>
          </div>

          {/* 4 Real Surveillance Metric Boxes in English (ABVC Theme Consistent) */}
          <div className="mt-3.5 grid grid-cols-4 gap-2">
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

            {/* Alerts */}
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/70 p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-[#ED2939]">
                <AlertTriangle className="h-3 w-3" />
                <span>Alerts</span>
              </div>
              <p className="mt-0.5 text-sm font-black text-[#ED2939]">{alertCount}</p>
            </div>

            {/* Monitored Locations */}
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-[#B49B58]">
                <MapPin className="h-3 w-3" />
                <span>Locations</span>
              </div>
              <p className="mt-0.5 text-sm font-black text-[#B49B58]">
                {locationsCount}
              </p>
            </div>
          </div>

          {/* Detected Diseases */}
          {uniqueDiseases.length > 0 && (
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-[9.5px] font-bold text-slate-400">Diseases:</span>
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

