"use client"

import React from "react"
import { Globe, Shield, BookOpen } from "lucide-react"

interface ReportCoverThumbnailProps {
  type: "asean_bulletin" | "kemenkes_sitrep"
  period: string
  title: string
  className?: string
}

export const ReportCoverThumbnail: React.FC<ReportCoverThumbnailProps> = ({
  type,
  period,
  title,
  className = "w-28 sm:w-32 h-36 sm:h-44",
}) => {
  if (type === "asean_bulletin") {
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-lg shadow-md border border-slate-700/30 flex flex-col justify-between p-2.5 text-white select-none ${className}`}
        style={{
          background: "linear-gradient(145deg, #021a44 0%, #063970 45%, #055052 100%)",
        }}
      >
        {/* Subtle grid and globe decoration */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <svg className="w-full h-full" viewBox="0 0 100 140" fill="none">
            <circle cx="50" cy="50" r="35" stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="3 2" />
            <ellipse cx="50" cy="50" rx="35" ry="14" stroke="#38bdf8" strokeWidth="0.6" />
            <ellipse cx="50" cy="50" rx="14" ry="35" stroke="#38bdf8" strokeWidth="0.6" />
            <path d="M 25 45 Q 40 30 65 35 T 80 55" stroke="#34d399" strokeWidth="1.5" />
            <path d="M 30 55 Q 50 60 70 75" stroke="#34d399" strokeWidth="1.2" />
          </svg>
        </div>

        {/* Top Header */}
        <div className="relative z-10">
          <div className="flex items-center gap-1 text-[7px] font-black uppercase tracking-widest text-cyan-200">
            <Globe className="h-2.5 w-2.5 text-cyan-300" />
            <span>ABVC ASEAN</span>
          </div>
          <p className="mt-1 text-[8px] font-extrabold leading-tight text-amber-300">
            Media Monitoring
          </p>
          <p className="text-[7px] font-semibold text-slate-200 leading-tight">
            Infectious &amp; Emerging Diseases
          </p>
        </div>

        {/* Center / Bottom Title & Period */}
        <div className="relative z-10 border-t border-cyan-400/30 pt-1.5 mt-auto">
          <p className="text-[6.5px] font-black uppercase tracking-wider text-cyan-300">
            ASEAN REGION
          </p>
          <p className="text-[7.5px] font-extrabold text-white line-clamp-2 leading-tight">
            {period}
          </p>
          <div className="mt-1 flex items-center justify-between text-[6px] text-slate-300 font-mono">
            <span>EOC Intel</span>
            <span className="rounded bg-white/20 px-1 py-0.2 text-[5.5px]">PDF</span>
          </div>
        </div>

        {/* Book Spine Shadow */}
        <div className="absolute left-0 inset-y-0 w-1 bg-black/40" />
      </div>
    )
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-lg shadow-md border border-slate-300 flex flex-col justify-between p-2.5 text-slate-900 select-none ${className}`}
      style={{
        background: "linear-gradient(145deg, #ffffff 0%, #f0fdfa 60%, #ccfbf1 100%)",
      }}
    >
      {/* Top Header */}
      <div className="relative z-10">
        <div className="flex items-center gap-1 text-[7px] font-black uppercase tracking-wider text-teal-800">
          <Shield className="h-2.5 w-2.5 text-teal-700" />
          <span>ABVC CENTRE</span>
        </div>
        <p className="mt-1 text-[8.5px] font-black leading-tight text-slate-900">
          Situation Report (SitRep)
        </p>
        <p className="text-[7px] font-bold text-teal-700">
          ABVC EOC Operations Centre
        </p>
      </div>

      {/* Decorative badge */}
      <div className="my-auto py-1 text-center">
        <div className="inline-block rounded border border-teal-300 bg-teal-50 px-2 py-0.5 text-[7px] font-black text-teal-900 font-mono">
          EPI-WEEKLY
        </div>
      </div>

      {/* Bottom Title & Period */}
      <div className="relative z-10 border-t border-teal-200/80 pt-1.5">
        <p className="text-[6.5px] font-bold uppercase text-slate-500">
          Regional Surveillance
        </p>
        <p className="text-[7.5px] font-extrabold text-slate-900 line-clamp-2 leading-tight">
          {period}
        </p>
        <div className="mt-1 flex items-center justify-between text-[6px] text-teal-800 font-mono font-bold">
          <span>Official ABVC</span>
          <span className="rounded bg-teal-200/80 px-1 py-0.2 text-[5.5px]">PDF</span>
        </div>
      </div>

      {/* Book Spine Shadow */}
      <div className="absolute left-0 inset-y-0 w-1 bg-black/10" />
    </div>
  )
}
