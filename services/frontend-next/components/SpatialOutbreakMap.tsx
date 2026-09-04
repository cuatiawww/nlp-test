'use client'

import { Info, Layers, MapPin, Settings, Wind, X } from "lucide-react";
import { useState } from "react";
import AseanMap from "./AseanMap";
import type { OutbreakLocation } from "@/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

type Base = "osm" | "terrain" | "satellite" | "light" | "dark";

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
  surveillanceOnly = false,
}: {
  countries: { name: string; cases: number }[];
  locations: OutbreakLocation[];
  embedded?: boolean;
  highlightCountry?: string;
  surveillanceOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(false),
    [legend, setLegend] = useState(true),
    [windLegend, setWindLegend] = useState(true),
    [base, setBase] = useState<Base>("osm"),
    [markers, setMarkers] = useState(true),
    [admin, setAdmin] = useState(true),
    [choropleth, setChoropleth] = useState(true),
    [wind, setWind] = useState(!surveillanceOnly),
    [radius, setRadius] = useState<number | null>(null),
    [bnpb, setBnpb] = useState({
      flood: false,
      earthquake: false,
      landslide: false,
      forestFire: false,
      hillshade: false,
      population: false,
    });

  const reset = () => {
    setBase("osm");
    setMarkers(true);
    setAdmin(true);
    setChoropleth(true);
    setWind(!surveillanceOnly);
    setWindLegend(true);
    setRadius(null);
    setBnpb({
      flood: false,
      earthquake: false,
      landslide: false,
      forestFire: false,
      hillshade: false,
      population: false,
    });
    setLegend(true);
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
        bnpbLayers={surveillanceOnly ? undefined : bnpb}
        showWind={surveillanceOnly ? false : wind}
        ewsRadiusKm={radius}
        highlightCountry={highlightCountry}
        hideLegend
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

      {(legend || (!surveillanceOnly && windLegend && wind)) && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[320px] space-y-3 rounded-2xl border border-blue-200/90 bg-white/95 p-3.5 shadow-[0_8px_30px_rgba(0,96,169,.12)] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-[#0060A9]" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                {t("map.legend")}
              </span>
            </div>
            <button
              onClick={() => {
                setLegend(false);
                setWindLegend(false);
              }}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
              aria-label={t("common.close")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {legend && (
            <div>
              <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#0060A9]">
                {t("dashboard.labelEwsStatus")}
              </p>
              <div className="space-y-1 text-[10px] font-medium text-slate-700">
                {[
                  ["bg-red-500", t("map.legendAwas")],
                  ["bg-orange-500", t("map.legendSiaga")],
                  ["bg-yellow-400", t("map.legendWaspada")],
                  ["bg-slate-400", t("severity.NORMAL")],
                ].map(([c, l]) => (
                  <div key={l} className="flex items-center gap-2">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full border border-white shadow ${c}`}
                    />
                    <span>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {legend && radius && (
            <div className="border-t border-slate-100 pt-2 text-[10px] font-semibold text-red-700">
              <span className="mr-2 inline-block h-3 w-3 rounded-full border-2 border-red-500 bg-red-100 align-middle" />
              {t("map.activeEwsRadius")} {radius} km
            </div>
          )}
          {!surveillanceOnly && windLegend && wind && (
            <div className="space-y-1.5 border-t border-slate-100 pt-2">
              <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#0060A9]">
                <Wind className="h-3 w-3" />
                {t("map.windFlow")} (GFS)
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
              <Group title={t("map.legend")}>
                <Row
                  icon={<MapPin className="h-4 w-4" />}
                  title={t("map.outbreakMarkers")}
                  sub={t("map.outbreakMarkersSub")}
                  value={markers}
                  set={setMarkers}
                />
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
                  icon={<Info className="h-4 w-4" />}
                  title={t("map.legend")}
                  sub={t("map.spatialControlsSub")}
                  value={legend}
                  set={setLegend}
                />
                {!surveillanceOnly && (
                  <>
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
                  </>
                )}
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

              {!surveillanceOnly && <Group title={t("map.bnpbInarisk")}>
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
              </Group>}

              {!surveillanceOnly && <Group title={t("map.activeEwsRadius")}>
                <Row
                  icon={<MapPin className="h-4 w-4" />}
                  title={t("map.activeEwsRadius")}
                  sub={t("map.activeEwsRadiusSub")}
                  value={radius != null}
                  set={(v) => setRadius(v ? 25 : null)}
                />
                {radius && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] font-bold text-slate-600">
                      <span>{t("map.impactRadius")}</span>
                      <span>{radius} km</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="250"
                      step="5"
                      value={radius}
                      onChange={(e) => setRadius(+e.target.value)}
                      className="mt-1 w-full accent-[#0060A9]"
                    />
                  </div>
                )}
              </Group>}
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
