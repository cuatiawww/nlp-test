"use client";
import { Info, Layers, MapPin, Settings, Wind, X } from "lucide-react";
import { useState } from "react";
import AseanMap from "./AseanMap";
import type { OutbreakLocation } from "@/types";
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
    className={`relative h-5 w-9 rounded-full transition-colors ${value ? "bg-teal-600" : "bg-slate-300"}`}
  >
    <span
      className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : ""}`}
    />
  </button>
);

export default function SpatialOutbreakMap({
  countries,
  locations,
}: {
  countries: { name: string; cases: number }[];
  locations: OutbreakLocation[];
}) {
  const [settings, setSettings] = useState(false),
    [legend, setLegend] = useState(true),
    [windLegend, setWindLegend] = useState(true),
    [base, setBase] = useState<Base>("osm"),
    [markers, setMarkers] = useState(true),
    [admin, setAdmin] = useState(true),
    [choropleth, setChoropleth] = useState(true),
    [wind, setWind] = useState(true),
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
    setWind(true);
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
        bnpbLayers={bnpb}
        showWind={wind}
        ewsRadiusKm={radius}
        hideLegend
      />
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <button
          onClick={() => setSettings(true)}
          className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 px-3 py-2 text-slate-700 shadow-md transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
        >
          <Settings className="h-3.5 w-3.5 text-teal-600" />
          <span className="text-xs font-black tracking-wide">
            Pengaturan Peta
          </span>
        </button>
      </div>
      {(legend || (windLegend && wind)) && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[320px] space-y-3 rounded-2xl border border-teal-200/90 bg-white/95 p-3.5 shadow-[0_8px_30px_rgba(15,118,110,.15)] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-teal-700" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                Legenda Peta Spasial
              </span>
            </div>
            <button
              onClick={() => {
                setLegend(false);
                setWindLegend(false);
              }}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {legend && (
            <div>
              <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#0f766e]">
                Status Outbreak
              </p>
              <div className="space-y-1 text-[10px] font-medium text-slate-700">
                {[
                  ["bg-red-500", "Awas / kasus ≥ 2× ambang atau ada kematian"],
                  ["bg-orange-500", "Siaga / kasus melewati ambang"],
                  ["bg-yellow-400", "Waspada / kasus mencapai 75% ambang"],
                  ["bg-slate-400", "Normal / belum melewati ambang"],
                ].map(([c, l]) => (
                  <div key={l} className="flex items-center gap-2">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-full border border-white shadow ${c}`}
                    />
                    {l}
                  </div>
                ))}
              </div>
            </div>
          )}
          {legend && radius && (
            <div className="border-t border-slate-100 pt-2 text-[10px] font-semibold text-red-700">
              <span className="mr-2 inline-block h-3 w-3 rounded-full border-2 border-red-500 bg-red-100 align-middle" />
              Denyut radius EWS {radius} km
            </div>
          )}
          {windLegend && wind && (
            <div className="space-y-1.5 border-t border-slate-100 pt-2">
              <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-teal-800">
                <Wind className="h-3 w-3" />
                Aliran &amp; Kecepatan Angin (GFS)
              </p>
              <div className="h-2 w-full rounded-full bg-gradient-to-r from-[rgb(15,60,140)] via-[rgb(85,160,115)] via-[rgb(215,195,60)] via-[rgb(210,125,35)] to-[rgb(185,35,10)] shadow-inner" />
              <div className="flex justify-between px-0.5 text-[8.5px] font-bold text-slate-500">
                <span>0 km/j</span>
                <span>20 km/j</span>
                <span>40 km/j</span>
                <span>&gt;60 km/j</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 text-[9.5px] font-semibold text-slate-700">
                <span>🟢 Normal / Tenang</span>
                <span>🟡 Sedang</span>
                <span>🔴 Kencang / Bahaya</span>
                <span>🟣 Badai Ekstrem</span>
              </div>
              <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-1.5 text-[9px] leading-tight text-teal-800">
                🧭 <strong>Mata Angin:</strong> Partikel bergerak mengikuti arah
                tiupan angin.
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
            aria-label="Tutup pengaturan"
          />
          <aside className="absolute right-0 top-0 z-30 flex h-full w-72 flex-col border-l border-slate-200 bg-white/95 shadow-[-8px_0_40px_rgba(0,0,0,.08)] backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-teal-700" />
                <span className="text-sm font-bold text-slate-800">
                  Pengaturan Peta
                </span>
              </div>
              <button
                onClick={() => setSettings(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <Group title="Tampilan">
                <Row
                  icon={<MapPin className="h-4 w-4" />}
                  title="Tampilkan Pin Marker"
                  sub="Titik lokasi outbreak"
                  value={markers}
                  set={setMarkers}
                />
                <Row
                  icon={<Layers className="h-4 w-4" />}
                  title="Batas Administrasi"
                  sub="Wilayah ASEAN"
                  value={admin}
                  set={setAdmin}
                />
                <Row
                  icon={<Layers className="h-4 w-4" />}
                  title="Choropleth Kasus"
                  sub="Warna jumlah kasus"
                  value={choropleth}
                  set={setChoropleth}
                />
                <Row
                  icon={<Info className="h-4 w-4" />}
                  title="Legenda Peta"
                  sub="Keterangan simbol"
                  value={legend}
                  set={setLegend}
                />
                <Row
                  icon={<Wind className="h-4 w-4" />}
                  title="Aliran Angin"
                  sub="Pola pergerakan angin GFS"
                  value={wind}
                  set={setWind}
                />
                <Row
                  icon={<Wind className="h-4 w-4" />}
                  title="Legenda Aliran Angin"
                  sub="Gradasi warna & kecepatan"
                  value={windLegend}
                  set={setWindLegend}
                />
              </Group>
              <Group title="Peta Dasar">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    ["osm", "terrain", "satellite", "light", "dark"] as Base[]
                  ).map((x) => (
                    <button
                      key={x}
                      onClick={() => setBase(x)}
                      className={`rounded-xl border px-3 py-2 text-left text-[11px] font-bold capitalize ${base === x ? "border-teal-400 bg-teal-50 text-teal-700" : "border-slate-100 bg-slate-50 text-slate-600"}`}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </Group>
              <Group title="BNPB InaRISK">
                {(
                  [
                    ["flood", "Bahaya Banjir"],
                    ["earthquake", "Bahaya Gempa"],
                    ["landslide", "Bahaya Longsor"],
                    ["forestFire", "Bahaya Karhutla"],
                    ["hillshade", "Hillshade"],
                    ["population", "Kepadatan Penduduk"],
                  ] as const
                ).map(([k, l]) => (
                  <Row
                    key={k}
                    icon={<Layers className="h-4 w-4" />}
                    title={l}
                    sub="GIS BNPB"
                    value={bnpb[k]}
                    set={(v) => setBnpb((p) => ({ ...p, [k]: v }))}
                  />
                ))}
              </Group>
              <Group title="EWS Radius">
                <Row
                  icon={<MapPin className="h-4 w-4" />}
                  title="EWS Radius Aktif"
                  sub="Denyut radius lokasi"
                  value={radius != null}
                  set={(v) => setRadius(v ? 25 : null)}
                />
                {radius && (
                  <input
                    type="range"
                    min="5"
                    max="250"
                    step="5"
                    value={radius}
                    onChange={(e) => setRadius(+e.target.value)}
                    className="w-full accent-teal-600"
                  />
                )}
              </Group>
            </div>
            <div className="border-t border-slate-100 p-3">
              <button
                onClick={reset}
                className="w-full rounded-xl bg-teal-700 py-2 text-xs font-bold text-white"
              >
                RESET PENGATURAN
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
    <div
      onClick={() => set(!value)}
      className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 transition hover:border-teal-100 hover:bg-teal-50/50"
    >
      <div className="flex items-center gap-2.5 text-teal-600">
        {icon}
        <div>
          <p className="text-xs font-semibold text-slate-800">{title}</p>
          <p className="text-[10px] text-slate-400">{sub}</p>
        </div>
      </div>
      <Toggle value={value} set={set} />
    </div>
  );
}
