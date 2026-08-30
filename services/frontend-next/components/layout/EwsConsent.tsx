'use client'

import { Bell, Check, Loader2, MapPin, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchPublicDashboard } from '@/lib/api'
import { useTranslation } from '@/lib/i18n/LanguageContext'

const CONSENT='disease-ews-consent', COORDS='disease-user-coords', LOCATION='disease-user-coords-name'
const distance=(a:number,b:number,c:number,d:number)=>{const r=6371,p=Math.PI/180,x=(c-a)*p,y=(d-b)*p;const h=Math.sin(x/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin(y/2)**2;return 2*r*Math.asin(Math.sqrt(h))}

export default function EwsConsent(){
  const { t, translateDisease } = useTranslation()
  const [show,setShow]=useState(false),[name,setName]=useState<string|null>(null),[activating,setActivating]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState<string|null>(null),[mounted,setMounted]=useState(false)
  
  useEffect(()=>{
    setMounted(true);
    const saved=localStorage.getItem(CONSENT),coords=localStorage.getItem(COORDS);
    setConsent(saved);
    if(!saved||(saved==='accepted'&&!coords)){
      const tId=setTimeout(()=>setShow(true),500);
      return()=>clearTimeout(tId)
    }
    setName(localStorage.getItem(LOCATION))
  },[])

  useEffect(()=>{
    if(localStorage.getItem(CONSENT)!=='accepted')return;
    const check=async()=>{
      try{
        const raw=localStorage.getItem(COORDS);
        if(!raw)return;
        const coords=JSON.parse(raw),snapshot=await fetchPublicDashboard(),near=snapshot.alerts.map(a=>({...a,distance:a.latitude!=null&&a.longitude!=null?distance(coords.lat,coords.lng,a.latitude,a.longitude):99999})).filter(a=>a.distance<=100).sort((a,b)=>a.distance-b.distance)[0];
        if(!near)return;
        const key=`${near.disease}|${near.location_name}|${near.latest_date}|${near.severity}`;
        if(localStorage.getItem('disease-ews-last-alert')===key)return;
        localStorage.setItem('disease-ews-last-alert',key);
        if('Notification'in window&&Notification.permission==='granted'){
          const dName = translateDisease(near.disease);
          new Notification(t('ews.notifTitle'),{body:t('ews.notifBody',{disease:dName,location:near.location_name,distance:Math.round(near.distance)})})
        }
      }catch{}
    };
    void check();
    const tId=setInterval(check,60000);
    return()=>clearInterval(tId)
  },[t, translateDisease])

  const decline=()=>{localStorage.setItem(CONSENT,'declined');setConsent('declined');setShow(false)}
  const accept=async()=>{
    if(activating)return
    setActivating(true);setError('')
    if(!navigator.geolocation){
      setError(t('ews.errNoGeo'));
      setActivating(false);
      return
    }
    navigator.geolocation.getCurrentPosition(async p=>{
      const coords={lat:p.coords.latitude,lng:p.coords.longitude};localStorage.setItem(COORDS,JSON.stringify(coords))
      localStorage.setItem(CONSENT,'accepted')
      setConsent('accepted')
      if('Notification'in window){
        void Notification.requestPermission().then(permission=>{
          if(permission==='granted'){
            new Notification(t('ews.notifActiveTitle'),{body:t('ews.notifActiveBody')})
          }
        })
      }
      try{
        const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=10`);
        if(r.ok){
          const j=await r.json(),a=j.address||{},n=a.city||a.town||a.county||a.state||'Lokasi Anda';
          localStorage.setItem(LOCATION,n);
          setName(n)
        }
      }catch{}
      try{
        const snapshot=await fetchPublicDashboard(),near=snapshot.alerts.map(a=>({...a,distance:a.latitude!=null&&a.longitude!=null?distance(coords.lat,coords.lng,a.latitude,a.longitude):99999})).filter(a=>a.distance<=100).sort((a,b)=>a.distance-b.distance)[0];
        if(near&&Notification.permission==='granted'){
          const dName = translateDisease(near.disease);
          new Notification(t('ews.notifTitle'),{body:t('ews.notifBody',{disease:dName,location:near.location_name,distance:Math.round(near.distance)})})
        }
      }catch{}
      window.dispatchEvent(new CustomEvent('disease-ews-changed',{detail:{active:true,coords,radius:100}}));
      setActivating(false);
      setShow(false)
    },err=>{
      localStorage.removeItem(CONSENT);
      setConsent(null);
      setActivating(false);
      setError(
        err.code===1
          ? t('ews.errDenied')
          : err.code===3
          ? t('ews.errTimeout')
          : t('ews.errDefault')
      )
    },{enableHighAccuracy:true,timeout:15000,maximumAge:60000})
  }

  if(!mounted)return null
  if(!show){
    if(consent==='accepted'){
      return (
        <div className="fixed bottom-4 left-4 z-[9990] flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-800 shadow-md">
          <span className="relative flex h-2 w-2">
            <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"/>
            <span className="relative h-2 w-2 rounded-full bg-emerald-500"/>
          </span>
          {t('ews.activeBadge')} {name?`? ${name}`:''}
        </div>
      );
    }
    return null
  }

  return (
    <div className="fixed bottom-6 left-6 right-6 z-[9999] animate-in slide-in-from-bottom-8 duration-500 md:left-auto md:w-[420px]">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 text-slate-800 shadow-[0_15px_40px_rgba(0,0,0,.08)]">
        <div className="space-y-2">
          <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-slate-900">
            {t('ews.title')}
          </h3>
          <p className="text-xs font-normal leading-relaxed text-slate-600">
            {t('ews.description')}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 shrink-0 text-teal-700"/>
            <span>{t('ews.pushSirine')}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-sky-600"/>
            <span>{t('ews.radiusDetect')}</span>
          </div>
        </div>
        {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold leading-relaxed text-red-700">{error}</div>}
        {activating && <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-800">{t('ews.waiting')}</div>}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button disabled={activating} onClick={decline} className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-50">
            {t('ews.continueWithout')}
          </button>
          <button disabled={activating} onClick={accept} className="flex items-center gap-2 rounded-xl bg-[#047D78] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-md hover:bg-[#03625d] disabled:cursor-wait disabled:opacity-70">
            {activating ? <Loader2 className="h-4 w-4 animate-spin"/> : <Check className="h-4 w-4"/>}
            {activating ? t('ews.enabling') : t('ews.enableBtn')}
          </button>
        </div>
        <button disabled={activating} onClick={()=>setShow(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label={t('common.close')}>
          <X className="h-4 w-4"/>
        </button>
      </div>
    </div>
  )
}
