'use client'

import { Layers, MapPin, Settings, Wind, X, Bug, Plane, Flame, Building2, Newspaper, Users, Globe, Sun, CloudRain } from "lucide-react";
import type { NasaGibsLayers, ExternalIntelLayers } from "@/types";
import { useState } from "react";
import AseanMap, { type HazardEvent } from "./AseanMap";
import type { OutbreakLocation } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

type Base = "osm" | "terrain" | "satellite" | "light" | "dark";
type MarkerLookbackDays = 7 | 14 | 30 | 90;

const Toggle = ({
  value,
  set,
}: {
  value: boolean;
  set: (v: boolean) => void;
}) => (
  <button
    onClick={() => set(!value)}
    className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-[#0060A9]" : "bg-slate-300"}`}
  >
    <span
      className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : ""}`}
    />
  </button>
);

export default function SpatialOutbreakMap({
  countries,
  locations,
  highlightCountry,
  regionalMode = false,
  hazardEvents = [],
}: {
  countries: { name: string; cases: number; deaths?: number }[];
  locations: OutbreakLocation[];
  embedded?: boolean;
  highlightCountry?: string;
  regionalMode?: boolean;
  hazardEvents?: HazardEvent[];
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(false),
    [windLegend, setWindLegend] = useState(true),
    [base, setBase] = useState<Base>("osm"),
    [markers, setMarkers] = useState(true),
    [markerLookbackDays, setMarkerLookbackDays] = useState<MarkerLookbackDays>(30),
    [admin, setAdmin] = useState(true),
    [choropleth, setChoropleth] = useState(true),
    [wind, setWind] = useState(!regionalMode),
    [usgs, setUsgs] = useState(true),
    [gdacs, setGdacs] = useState(true),
    [bnpb, setBnpb] = useState({
      flood: false,
      earthquake: false,
      landslide: false,
      forestFire: false,
      hillshade: false,
      population: false,
    }),
    [gibs, setGibs] = useState<NasaGibsLayers>({
      viirsTrueColor: false,
      modisTrueColor: false,
      aerosol: false,
      ndvi: false,
      nightLights: false,
      landSurfaceTemp: false,
    }),
    [intel, setIntel] = useState<ExternalIntelLayers>({
      vectors: false,
      flights: false,
      fires: false,
      facilities: false,
      news: false,
      population: false,
    });

  const reset = () => {
    setBase("osm");
    setMarkers(true);
    setMarkerLookbackDays(30);
    setAdmin(true);
    setChoropleth(true);
    setWind(!regionalMode);
    setWindLegend(true);
    setUsgs(true);
    setGdacs(true);
    setBnpb({
      flood: false,
      earthquake: false,
      landslide: false,
      forestFire: false,
      hillshade: false,
      population: false,
    });
    setGibs({
      viirsTrueColor: false,
      modisTrueColor: false,
      aerosol: false,
      ndvi: false,
      nightLights: false,
      landSurfaceTemp: false,
    });
    setIntel({
      vectors: false,
      flights: false,
      fires: false,
      facilities: false,
      news: false,
      population: false,
    });
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <AseanMap
        embedded
        baseMap={base}
        showMarkers={markers}
        showAdmin={admin}
        countryData={choropleth ? countries : undefined}
        outbreakLocations={locations}
        markerLookbackDays={markerLookbackDays}
        bnpbLayers={bnpb}
        showWind={wind}
        highlightCountry={highlightCountry}
        hazardEvents={hazardEvents.filter((item) => {
          const source = (item.source || "").toLowerCase();
          if (source === "usgs") return usgs;
          if (source === "gdacs") return gdacs;
          return usgs || gdacs;
        })}
        showHazards={usgs || gdacs}
        gibsLayers={gibs}
        intelLayers={intel}
      />
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <button
          onClick={() => setSettings(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-slate-700 shadow-md transition hover:border-blue-300 hover:bg-blue-50 hover:text-[#0060A9]"
        >
          <Settings className="h-3.5 w-3.5 text-[#0060A9]" />
          <span className="text-xs font-black tracking-wide">
            {t("map.spatialControls")}
          </span>
        </button>
      </div>

      {windLegend && wind && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[320px] space-y-3 rounded-2xl border border-blue-200/90 bg-white/95 p-3.5 shadow-[0_8px_30px_rgba(0,96,169,.12)] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5 text-[#0060A9]" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                {t("map.windFlow")} (GFS)
              </span>
            </div>
            <button
              onClick={() => {
                setWindLegend(false);
              }}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
              aria-label={t("common.close")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-full rounded-full bg-gradient-to-r from-[rgb(15,60,140)] via-[rgb(85,160,115)] via-[rgb(215,195,60)] via-[rgb(210,125,35)] to-[rgb(185,35,10)] shadow-inner" />
            <div className="flex justify-between px-0.5 text-[8.5px] font-bold text-slate-500">
              <span>0 km/h</span>
              <span>20 km/h</span>
              <span>40 km/h</span>
              <span>&gt;60 km/h</span>
            </div>
          </div>
        </div>
      )}

      {settings && (
        <>
          <button
            onClick={() => setSettings(false)}
            className="absolute inset-0 z-20 bg-black/10"
            aria-label={t("common.close")}
          />
          <aside className="absolute right-0 top-0 z-30 flex h-full w-72 flex-col border-l border-slate-200 bg-white/95 shadow-[-8px_0_40px_rgba(0,0,0,.08)] backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-[#0060A9]" />
                <span className="text-sm font-bold text-slate-800">
                  {t("map.spatialControls")}
                </span>
              </div>
              <button
                onClick={() => setSettings(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <Group title="Map Layers">
                <Row
                  icon={<MapPin className="h-4 w-4" />}
                  title={t("map.outbreakMarkers")}
                  sub={t("map.outbreakMarkersSub")}
                  value={markers}
                  set={setMarkers}
                />
                <div className="ml-10 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Marker time range</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {([7, 14, 30, 90] as const).map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setMarkerLookbackDays(days)}
                        className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold transition ${markerLookbackDays === days ? "border-[#0060A9] bg-blue-50 text-[#0060A9]" : "border-slate-200 bg-white text-slate-500 hover:border-blue-200"}`}
                      >
                        {days === 90 ? "3 Months" : `${days} Days`}
                      </button>
                    ))}
                  </div>
                </div>
                <Row
                  icon={<Layers className="h-4 w-4" />}
                  title={t("map.adminBoundaries")}
                  sub={t("map.adminBoundariesSub")}
                  value={admin}
                  set={setAdmin}
                />
                <Row
                  icon={<Layers className="h-4 w-4" />}
                  title={t("map.casesChoropleth")}
                  sub={t("map.casesChoroplethSub")}
                  value={choropleth}
                  set={setChoropleth}
                />
                <Row
                  icon={<Wind className="h-4 w-4" />}
                  title={t("map.windFlow")}
                  sub={t("map.windFlowSub")}
                  value={wind}
                  set={setWind}
                />
                <Row
                  icon={<Wind className="h-4 w-4" />}
                  title={t("map.windFlow")}
                  sub={t("map.windSpeedSub")}
                  value={windLegend}
                  set={setWindLegend}
                />
                <Row
                  icon={<Layers className="h-4 w-4" />}
                  title="USGS earthquakes"
                  sub="M4.5+ in the country window"
                  value={usgs}
                  set={setUsgs}
                />
                <Row
                  icon={<Layers className="h-4 w-4" />}
                  title="GDACS alerts"
                  sub="EQ / flood / cyclone / volcano"
                  value={gdacs}
                  set={setGdacs}
                />
              </Group>

              <Group title={t("map.baseMap")}>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    ["osm", "terrain", "satellite", "light", "dark"] as Base[]
                  ).map((x) => (
                    <button
                      key={x}
                      onClick={() => setBase(x)}
                      className={`rounded-xl border px-3 py-2 text-left text-[11px] font-bold capitalize ${base === x ? "border-[#0060A9] bg-blue-50 text-[#0060A9]" : "border-slate-100 bg-slate-50 text-slate-600"}`}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </Group>

              {/* ── Surveillance & Vector Intelligence ── */}
              <Group title="Surveillance & Vector Intelligence">
                <Row
                  icon={<Bug className="h-4 w-4 text-amber-600" />}
                  title="Aedes Mosquito Sightings"
                  sub="iNaturalist community vector observations"
                  value={Boolean(intel.vectors)}
                  set={(v) => setIntel((p) => ({ ...p, vectors: v }))}
                />
                <Row
                  icon={<Plane className="h-4 w-4 text-cyan-600" />}
                  title="Live Air Traffic"
                  sub="OpenSky Network ASEAN airspace connectivity"
                  value={Boolean(intel.flights)}
                  set={(v) => setIntel((p) => ({ ...p, flights: v }))}
                />
                <Row
                  icon={<Flame className="h-4 w-4 text-rose-600" />}
                  title="Active Fire Hotspots"
                  sub="NASA FIRMS thermal anomalies & peat fire"
                  value={Boolean(intel.fires)}
                  set={(v) => setIntel((p) => ({ ...p, fires: v }))}
                />
                <Row
                  icon={<Building2 className="h-4 w-4 text-emerald-600" />}
                  title="Healthcare Facilities"
                  sub="Healthsites.io OSM healthcare access points"
                  value={Boolean(intel.facilities)}
                  set={(v) => setIntel((p) => ({ ...p, facilities: v }))}
                />
                <Row
                  icon={<Newspaper className="h-4 w-4 text-blue-600" />}
                  title="Global Disease Media"
                  sub="GDELT Doc 2.0 live news intelligence"
                  value={Boolean(intel.news)}
                  set={(v) => setIntel((p) => ({ ...p, news: v }))}
                />
                <Row
                  icon={<Users className="h-4 w-4 text-indigo-600" />}
                  title="Population Denominators"
                  sub="WorldPop density metadata & GeoTIFF"
                  value={Boolean(intel.population)}
                  set={(v) => setIntel((p) => ({ ...p, population: v }))}
                />
              </Group>

              {/* ── NASA GIBS Satellite Imagery ── */}
              <Group title="Satellite Earth Observation (NASA GIBS)">
                <Row
                  icon={<Globe className="h-4 w-4 text-blue-500" />}
                  title="VIIRS True Color"
                  sub="SNPP satellite imagery overlay"
                  value={Boolean(gibs.viirsTrueColor)}
                  set={(v) => setGibs((p) => ({ ...p, viirsTrueColor: v }))}
                />
                <Row
                  icon={<Globe className="h-4 w-4 text-teal-500" />}
                  title="MODIS Terra True Color"
                  sub="Daily Terra satellite true color overlay"
                  value={Boolean(gibs.modisTrueColor)}
                  set={(v) => setGibs((p) => ({ ...p, modisTrueColor: v }))}
                />
                <Row
                  icon={<CloudRain className="h-4 w-4 text-amber-500" />}
                  title="Aerosol Optical Depth"
                  sub="OMPS smoke/haze & air quality index"
                  value={Boolean(gibs.aerosol)}
                  set={(v) => setGibs((p) => ({ ...p, aerosol: v }))}
                />
                <Row
                  icon={<Layers className="h-4 w-4 text-emerald-500" />}
                  title="NDVI Vegetation Index"
                  sub="MODIS 8-day vegetation greenness"
                  value={Boolean(gibs.ndvi)}
                  set={(v) => setGibs((p) => ({ ...p, ndvi: v }))}
                />
                <Row
                  icon={<Sun className="h-4 w-4 text-yellow-500" />}
                  title="Nighttime Lights"
                  sub="VIIRS Black Marble urban illumination"
                  value={Boolean(gibs.nightLights)}
                  set={(v) => setGibs((p) => ({ ...p, nightLights: v }))}
                />
                <Row
                  icon={<Flame className="h-4 w-4 text-orange-500" />}
                  title="Land Surface Temp"
                  sub="MODIS daytime thermal climate"
                  value={Boolean(gibs.landSurfaceTemp)}
                  set={(v) => setGibs((p) => ({ ...p, landSurfaceTemp: v }))}
                />
              </Group>

              <Group title={t("map.bnpbInarisk")}>
                {(
                  [
                    ["flood", t("map.hazardFlood")],
                    ["earthquake", t("map.hazardQuake")],
                    ["landslide", t("map.hazardSlide")],
                    ["forestFire", t("map.hazardFire")],
                    ["hillshade", t("map.hillshade")],
                    ["population", t("map.population")],
                  ] as const
                ).map(([k, l]) => (
                  <Row
                    key={k}
                    icon={<Layers className="h-4 w-4" />}
                    title={l}
                    sub={t("map.gisBnpb")}
                    value={bnpb[k]}
                    set={(v) => setBnpb((p) => ({ ...p, [k]: v }))}
                  />
                ))}
               </Group>

            </div>
            <div className="border-t border-slate-100 p-3">
              <button
                onClick={reset}
                className="w-full rounded-xl bg-[#0060A9] py-2 text-xs font-bold text-white transition hover:bg-[#004b85]"
              >
                {t("map.resetLayers")}
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
        {title}
      </p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({
  icon,
  title,
  sub,
  value,
  set,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  value: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className="rounded-lg bg-slate-100 p-1.5 text-slate-600">
          {icon}
        </div>
        <div>
          <p className="text-xs font-bold text-slate-800">{title}</p>
          <p className="text-[10px] text-slate-400">{sub}</p>
        </div>
      </div>
      <Toggle value={value} set={set} />
    </div>
  );
}
