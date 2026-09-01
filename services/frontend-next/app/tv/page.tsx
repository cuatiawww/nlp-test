'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { Activity, AlertTriangle, ArrowLeft, Bug, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Globe2, Layers, MapPin, Maximize, Minimize, RefreshCw, Settings, ShieldAlert, Skull, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fetchPublicDashboard } from '@/lib/api'
import type { PublicDashboard } from '@/types'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import CrawlingFeedPanel from '@/components/CrawlingFeedPanel'

const AseanMap = dynamic(() => import('@/components/AseanMap'), { ssr: false })
type BaseMap = 'osm'|'terrain'|'satellite'|'light'|'dark'
function Toggle({checked,onChange}:{checked:boolean;onChange:(v:boolean)=>void}) {
  return (
    <button
      onClick={()=>onChange(!checked)}
      className={`relative inline-flex h-6 w-11 rounded-full border-2 border-transparent transition ${checked?'bg-[#0060A9]':'bg-slate-200'}`}
    >
      <span className={`h-5 w-5 rounded-full bg-white shadow transition ${checked?'translate-x-5':'translate-x-0'}`}/>
    </button>
  )
}

export default function TvPage() {
  const { t, locale, translateDisease, translateSeverity } = useTranslation()
  const numLocale = locale === 'en' ? 'en-US' : 'id-ID'

  const [data,setData]=useState<PublicDashboard|null>(null), [loading,setLoading]=useState(true), [countdown,setCountdown]=useState(60)
  const [drawer,setDrawer]=useState(false), [sound,setSound]=useState(false), [fullscreen,setFullscreen]=useState(false), [kpiHidden,setKpiHidden]=useState(false), [leftHidden,setLeftHidden]=useState(false), [rightHidden,setRightHidden]=useState(false)
  const [baseMap,setBaseMap]=useState<BaseMap>('osm'), [admin,setAdmin]=useState(true), [markers,setMarkers]=useState(true), [choropleth,setChoropleth]=useState(true)
  const [bnpb,setBnpb]=useState({flood:false,earthquake:false,landslide:false,forestFire:false,hillshade:false,population:false}), [wind,setWind]=useState(false), [ewsRadius,setEwsRadius]=useState<number|null>(null)
  const [clock,setClock]=useState({wib:'',wita:'',wit:'',date:''})
  const load=useCallback(async()=>{try{setData(await fetchPublicDashboard());setCountdown(60)}finally{setLoading(false)}},[])

  useEffect(()=>{load();const i=setInterval(load,60000);return()=>clearInterval(i)},[load])
  useEffect(()=>{const i=setInterval(()=>setCountdown(c=>c<=1?60:c-1),1000);return()=>clearInterval(i)},[])
  useEffect(()=>{
    const tick=()=>{
      const now=new Date()
      setClock({
        wib:now.toLocaleTimeString(numLocale,{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' WIB',
        wita:now.toLocaleTimeString(numLocale,{timeZone:'Asia/Makassar',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' WITA',
        wit:now.toLocaleTimeString(numLocale,{timeZone:'Asia/Jayapura',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' WIT',
        date:now.toLocaleDateString(numLocale,{weekday:'long',year:'numeric',month:'long',day:'numeric'})
      })
    }
    tick();const i=setInterval(tick,1000);return()=>clearInterval(i)
  },[numLocale])

  useEffect(()=>{
    const onFs=()=>setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange',onFs)
    return()=>document.removeEventListener('fullscreenchange',onFs)
  },[])

  useEffect(()=>{
    if(localStorage.getItem('disease-ews-consent')==='accepted')setEwsRadius(100)
    const handler=(e:Event)=>{const d=(e as CustomEvent).detail;if(d?.active)setEwsRadius(d.radius||100)}
    window.addEventListener('disease-ews-changed',handler)
    return()=>window.removeEventListener('disease-ews-changed',handler)
  },[])

  const toggleFs=()=>fullscreen?document.exitFullscreen?.():document.documentElement.requestFullscreen?.()
  const alerts=data?.alerts??[]
  const playSound=()=>{setSound(v=>!v);if(!sound){const c=new AudioContext(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);g.gain.value=.04;o.start();o.stop(c.currentTime+.25)}}

  const cards=[
    [t('tv.casesDetected'),data?.kpis.cases??0,Bug,'text-[#0060A9]','bg-blue-50 text-[#0060A9] border-blue-200'],
    [t('tv.deaths'),data?.kpis.deaths??0,Skull,'text-[#ED2939]','bg-red-50 text-[#ED2939] border-red-200'],
    [t('tv.eventsVerified'),data?.kpis.events??0,Activity,'text-sky-600','bg-sky-50 text-sky-600 border-sky-200'],
    [t('tv.activeAlerts'),data?.kpis.active_alerts??0,ShieldAlert,'text-[#B49B58]','bg-[#fbf8ee] text-[#B49B58] border-[#e9dfc4]']
  ] as const

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#f8fafc] text-slate-800 select-none">
      <div className="absolute inset-0">
        <AseanMap
          fullBleed
          baseMap={baseMap}
          showAdmin={admin}
          showMarkers={markers}
          countryData={choropleth?data?.by_country:undefined}
          outbreakLocations={data?.locations}
          bnpbLayers={bnpb}
          showWind={wind}
          ewsRadiusKm={ewsRadius}
          hideLegend
        />
      </div>

      <header className="pointer-events-none fixed left-2 right-2 top-2 z-40 flex items-center justify-between gap-3 sm:left-3 sm:right-3 sm:top-3">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[#cfe0f1] bg-white/95 px-4 py-2 text-slate-800 shadow-[0_8px_24px_rgba(0,96,169,.09)] backdrop-blur-xl">
          <Link href="/" className="grid h-9 w-9 place-items-center rounded-xl border border-blue-200 bg-blue-50 text-[#0060A9] transition hover:bg-blue-100">
            <ArrowLeft className="h-4 w-4"/>
          </Link>
          <Image src={`${PUBLIC_BASE_PATH}/abvc-logo.webp`} alt="Logo ABVC" width={120} height={38} className="h-8 w-auto object-contain" priority/>
          <div className="h-7 w-px bg-slate-200"/>
          <div>
            <span className="block text-sm font-extrabold tracking-wider text-[#0060A9]">
              {t('tv.title')}
            </span>
            <span className="hidden max-w-[480px] truncate text-[10px] font-semibold text-slate-600 sm:block">
              {t('tv.subtitle')}
            </span>
          </div>
          <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 xl:flex">
            <span className="rounded-xl border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-xs font-black text-[#0060A9]">
              {t('tv.surveillanceAsean', { count: data?.kpis.locations ?? 0 })}
            </span>
          </div>
        </div>

        <div className="pointer-events-auto hidden items-center gap-3 rounded-2xl border border-[#cfe0f1] bg-white/95 px-4 py-1.5 shadow-[0_8px_24px_rgba(0,96,169,.09)] backdrop-blur-xl md:flex">
          <div className="text-center">
            <div className="flex gap-2 font-mono text-sm font-black text-[#0060A9]">
              <span>{clock.wib}</span><b className="text-slate-300">•</b>
              <span>{clock.wita}</span><b className="text-slate-300">•</b>
              <span>{clock.wit}</span>
            </div>
            <span className="text-[10px] font-semibold text-slate-600">{clock.date}</span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <LanguageSwitcher compact />
          <button onClick={()=>setDrawer(v=>!v)} className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-extrabold ${drawer?'border-[#0060A9] bg-[#0060A9] text-white':'border-blue-200 bg-blue-50 text-[#0060A9]'}`}>
            <Layers className="h-4 w-4"/>
            <span className="hidden sm:inline">{t('tv.controls')}</span>
          </button>
          <button onClick={playSound} className="grid h-8 w-8 place-items-center rounded-xl border border-blue-200 bg-blue-50 text-[#0060A9]">
            {sound?<Volume2 className="h-4 w-4"/>:<VolumeX className="h-4 w-4"/>}
          </button>
          <button onClick={load} className="relative grid h-8 w-8 place-items-center rounded-xl border border-blue-200 bg-blue-50 text-[#0060A9]">
            <RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>
            <span className="absolute -bottom-1 -right-1 rounded bg-white px-1 text-[7px]">{countdown}</span>
          </button>
          <button onClick={toggleFs} className="grid h-8 w-8 place-items-center rounded-xl border border-blue-200 bg-blue-50 text-[#0060A9]">
            {fullscreen?<Minimize className="h-4 w-4"/>:<Maximize className="h-4 w-4"/>}
          </button>
        </div>
      </header>

      <div className="pointer-events-none fixed left-2 right-2 top-[60px] z-[35] sm:left-3 sm:right-3">
        <div className="mx-auto flex max-w-[1680px] flex-col items-center">
          <button onClick={()=>setKpiHidden(v=>!v)} className="pointer-events-auto mb-1 flex items-center gap-1.5 rounded-full border border-[#cfe0f1] bg-white/95 px-3 py-0.5 text-[9.5px] font-extrabold shadow-sm">
            {kpiHidden ? t('tv.showKpi') : t('tv.hideKpi')}
            {kpiHidden?<ChevronDown className="h-3 w-3 text-[#0060A9]"/>:<ChevronUp className="h-3 w-3 text-[#0060A9]"/>}
          </button>
          {!kpiHidden && (
            <div className="pointer-events-auto grid w-full grid-cols-2 gap-2 lg:grid-cols-4">
              {cards.map(([label,value,Icon,color,bg])=>(
                <div key={label} className="rounded-xl border border-[#cfe0f1] bg-white/95 p-2.5 shadow-[0_4px_14px_rgba(0,96,169,.06)] backdrop-blur-xl">
                  <div className="flex items-center gap-2">
                    <div className={`rounded-lg border p-1 ${bg}`}><Icon className="h-3.5 w-3.5"/></div>
                    <span className="text-[9.5px] font-black tracking-wider text-slate-600">{label}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <b className={`font-mono text-xl ${color}`}>{loading?'...':Number(value).toLocaleString(numLocale)}</b>
                    <span className="text-[9px] font-bold text-slate-500">{label===t('tv.deaths')?'Jiwa':'Data'}</span>
                  </div>
                  <div className="mt-1 border-t border-slate-100 pt-1 text-[9px] font-bold text-slate-500">
                    Snapshot NLP multilingual
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`pointer-events-none fixed bottom-12 left-3 z-30 transition-all ${leftHidden?'w-11':'w-80 2xl:w-96'} ${kpiHidden?'top-[74px]':'top-[198px]'}`}>
        <CrawlingFeedPanel
          collapsed={leftHidden}
          onToggle={() => setLeftHidden((value) => !value)}
          t={t}
          translateDisease={translateDisease}
        />
      </div>

      <div className={`pointer-events-none fixed bottom-12 right-3 z-30 transition-all ${rightHidden?'w-11':'w-80 2xl:w-96'} ${kpiHidden?'top-[74px]':'top-[198px]'}`}>
        <div className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-2xl border border-[#cfe0f1] bg-white/95 shadow-[0_8px_24px_rgba(0,96,169,.1)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-2.5">
            <button onClick={()=>setRightHidden(v=>!v)} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white">
              {rightHidden?<ChevronLeft className="h-3.5 w-3.5 text-[#0060A9]"/>:<ChevronRight className="h-3.5 w-3.5 text-[#0060A9]"/>}
            </button>
            <div className={rightHidden?'hidden':'flex items-center gap-2'}>
              <Sparkles className="h-4 w-4 text-[#0060A9]"/>
              <h3 className="text-xs font-black uppercase tracking-wider text-[#0060A9]">{t('tv.situationAnalytics')}</h3>
            </div>
          </div>
          {!rightHidden && (
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-600">{t('tv.casesPerDisease')}</p>
                <div className="mt-2 h-48">
                  <ResponsiveContainer>
                    <BarChart data={(data?.by_disease??[]).slice(0,7).map(d=>({...d, name: translateDisease(d.name)}))} layout="vertical">
                      <XAxis type="number" tick={{fontSize:9}}/>
                      <YAxis type="category" dataKey="name" width={85} tick={{fontSize:9}}/>
                      <Tooltip/>
                      <Bar dataKey="cases" fill="#0060A9" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#0060A9]">
                  <Sparkles className="h-3.5 w-3.5"/>{t('tv.localAiSummary')}
                </p>
                <p className="mt-2 text-xs font-medium leading-5 text-slate-700">{data?.ai_summary.text}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-600">{t('tv.regionDistribution')}</p>
                {(data?.by_country??[]).slice(0,8).map(c=>(
                  <div key={c.name} className="mt-2 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2 font-bold"><MapPin className="h-3 w-3 text-[#0060A9]"/>{c.name}</span>
                    <b className="font-mono text-[#0060A9]">{c.cases.toLocaleString(numLocale)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-slate-200 bg-white/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between bg-[#0060A9] p-4 text-white">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5"/>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wide">{t('map.spatialControls')}</h3>
                <p className="text-[10px] font-semibold text-blue-100">{t('map.spatialControlsSub')}</p>
              </div>
            </div>
            <button onClick={()=>setDrawer(false)} className="grid h-7 w-7 place-items-center rounded-lg bg-black/15">
              <X className="h-4 w-4"/>
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/50 p-3.5">
            <LayerToggle icon={<Globe2 className="h-4 w-4"/>} title={t('map.adminBoundaries')} sub={t('map.adminBoundariesSub')} value={admin} set={setAdmin}/>
            <LayerToggle icon={<MapPin className="h-4 w-4"/>} title={t('map.outbreakMarkers')} sub={t('map.outbreakMarkersSub')} value={markers} set={setMarkers}/>
            <LayerToggle icon={<ShieldAlert className="h-4 w-4"/>} title={t('map.casesChoropleth')} sub={t('map.casesChoroplethSub')} value={choropleth} set={setChoropleth}/>
            <LayerToggle icon={<Activity className="h-4 w-4"/>} title={t('map.windFlow')} sub={t('map.windFlowSub')} value={wind} set={setWind}/>
            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-700">{t('map.bnpbInarisk')}</p>
              <div className="space-y-2">
                {([['flood',t('map.hazardFlood')],['earthquake',t('map.hazardQuake')],['landslide',t('map.hazardSlide')],['forestFire',t('map.hazardFire')],['hillshade',t('map.hillshade')],['population',t('map.population')]] as const).map(([key,label])=>(
                  <LayerToggle key={key} icon={<Layers className="h-4 w-4"/>} title={label} sub={t('map.gisBnpb')} value={bnpb[key]} set={v=>setBnpb(p=>({...p,[key]:v}))}/>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold">{t('map.activeEwsRadius')}</p>
                  <p className="text-[10px] font-semibold text-slate-500">{t('map.activeEwsRadiusSub')}</p>
                </div>
                <Toggle checked={ewsRadius!=null} onChange={v=>setEwsRadius(v?25:null)}/>
              </div>
              {ewsRadius!=null && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] font-bold text-slate-600">
                    <span>{t('map.impactRadius')}</span>
                    <span>{ewsRadius} km</span>
                  </div>
                  <input type="range" min="5" max="250" step="5" value={ewsRadius} onChange={e=>setEwsRadius(Number(e.target.value))} className="mt-2 w-full accent-[#0060A9]"/>
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-700">{t('map.baseMap')}</p>
              <div className="grid grid-cols-2 gap-2">
                {(['osm','terrain','satellite','light','dark'] as BaseMap[]).map(b=>(
                  <button key={b} onClick={()=>setBaseMap(b)} className={`rounded-xl border p-3 text-left text-xs font-bold capitalize ${baseMap===b?'border-[#0060A9] bg-blue-50 text-[#0060A9]':'border-slate-200 bg-white text-slate-600'}`}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[10px] font-semibold text-slate-600">
              <p className="mb-2 text-xs font-black">{t('map.legend')}</p>
              <p><i className="mr-2 inline-block h-3 w-3 rounded-full bg-[#ED2939]"/>{t('map.legendAwas')}</p>
              <p className="mt-1"><i className="mr-2 inline-block h-3 w-3 rounded-full bg-[#B49B58]"/>{t('map.legendSiaga')}</p>
              <p className="mt-1"><i className="mr-2 inline-block h-3 w-3 rounded-full bg-yellow-400"/>{t('map.legendWaspada')}</p>
              <p className="mt-1"><i className="mr-2 inline-block h-3 w-3 rounded-full border-2 border-red-500 bg-red-100"/>{t('map.activeEwsRadius')}</p>
            </div>
            <button onClick={()=>{setBaseMap('osm');setAdmin(true);setMarkers(true);setChoropleth(true);setWind(false);setEwsRadius(null);setBnpb({flood:false,earthquake:false,landslide:false,forestFire:false,hillshade:false,population:false})}} className="w-full rounded-xl border border-blue-300 bg-blue-50 py-2 text-xs font-black text-[#0060A9]">
              {t('map.resetLayers')}
            </button>
          </div>
        </div>
      )}

      <footer className="fixed bottom-2 left-2 right-2 z-40 flex h-9 items-center overflow-hidden rounded-xl border border-[#cfe0f1] bg-white/95 shadow-[0_-4px_16px_rgba(0,96,169,.08)] backdrop-blur-xl">
        <div className="flex h-full shrink-0 items-center gap-2 bg-gradient-to-r from-[#0060A9] to-[#0284c7] px-4 text-[10px] font-black tracking-widest text-white">
          <span className="relative flex h-2 w-2">
            <span className="absolute h-full w-full animate-ping rounded-full bg-white opacity-75"/>
            <span className="relative h-2 w-2 rounded-full bg-white"/>
          </span>
          {t('tv.liveUpdate')}
        </div>
        <div className="overflow-hidden">
          <div className="flex whitespace-nowrap animate-marquee">
            {[...alerts,...alerts].map((a,i)=>(
              <div key={i} className="mx-6 flex items-center gap-2 text-xs font-bold text-slate-700">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500"/>
                {translateSeverity(a.severity)}: {translateDisease(a.disease)} {t('tv.inLocation')} {a.location_name} • {a.cases.toLocaleString(numLocale)} {t('dashboard.casesUnit')} <b className="ml-4 text-slate-300">•</b>
              </div>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}

function LayerToggle({icon,title,sub,value,set}:{icon:React.ReactNode;title:string;sub:string;value:boolean;set:(v:boolean)=>void}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex gap-2.5">
        <div className="rounded-xl bg-blue-50 p-1.5 text-[#0060A9]">{icon}</div>
        <div>
          <p className="text-xs font-bold">{title}</p>
          <p className="text-[10px] font-semibold text-slate-500">{sub}</p>
        </div>
      </div>
      <Toggle checked={value} onChange={set}/>
    </div>
  )
}
