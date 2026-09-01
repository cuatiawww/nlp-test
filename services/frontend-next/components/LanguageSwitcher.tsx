'use client'

import React from "react"
import { useTranslation } from "@/lib/i18n/LanguageContext"
import { Globe } from "lucide-react"

interface LanguageSwitcherProps {
  compact?: boolean
  variant?: "light" | "dark" | "pill"
  className?: string
}

// Crisp Vector SVG Flags (immune to OS emoji rendering bugs)
function FlagID({ className = "h-3 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} rounded-[2px] shadow-[0_0_1px_rgba(0,0,0,0.35)] shrink-0 overflow-hidden`} viewBox="0 0 640 480">
      <path fill="#E70011" d="M0 0h640v240H0z" />
      <path fill="#FFFFFF" d="M0 240h640v240H0z" />
    </svg>
  )
}

function FlagEN({ className = "h-3 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} rounded-[2px] shadow-[0_0_1px_rgba(0,0,0,0.35)] shrink-0 overflow-hidden`} viewBox="0 0 640 480">
      <path fill="#012169" d="M0 0h640v480H0z" />
      <path fill="#FFF" d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-179L0 64V0h75z" />
      <path fill="#C8102E" d="m424 288 216 159v33h-44L366 317l58-29zM640 0v10L446 155l51 32L640 48V0zM0 480v-10l194-145-51-32L0 432v48zm0-480v10l194 145-51 32L0 48V0z" />
      <path fill="#FFF" d="M241 0v480h160V0H241zM0 160v160h640V160H0z" />
      <path fill="#C8102E" d="M272 0v480h96V0h-96zM0 192v96h640v-96H0z" />
    </svg>
  )
}

export default function LanguageSwitcher({
  compact = false,
  variant = "pill",
  className = "",
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useTranslation()

  if (variant === "dark") {
    return (
      <div
        className={`inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/90 p-1 text-xs font-bold shadow-sm backdrop-blur-md ${className}`}
      >
        <button
          type="button"
          onClick={() => setLocale("id")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all ${
            locale === "id"
              ? "bg-[#0060A9] text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
          title="Bahasa Indonesia"
        >
          <FlagID className="h-3 w-4" />
          <span>ID</span>
        </button>
        <button
          type="button"
          onClick={() => setLocale("en")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all ${
            locale === "en"
              ? "bg-[#0060A9] text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
          title="English"
        >
          <FlagEN className="h-3 w-4" />
          <span>EN</span>
        </button>
      </div>
    )
  }

  return (
    <div
      className={`inline-flex items-center rounded-xl border border-[#0060A9]/15 bg-white/95 p-1 text-xs font-bold shadow-xs backdrop-blur-md transition hover:border-[#0060A9]/35 ${className}`}
    >
      {!compact && (
        <div className="flex items-center gap-1 pl-1.5 pr-1 text-slate-400">
          <Globe className="h-3.5 w-3.5 text-[#0060A9]" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setLocale("id")}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all ${
          locale === "id"
            ? "bg-[#0060A9] text-white shadow-sm font-extrabold"
            : "text-slate-600 hover:bg-slate-100 hover:text-[#0060A9]"
        }`}
        title="Bahasa Indonesia"
        aria-label="Ganti ke Bahasa Indonesia"
      >
        <FlagID className="h-3 w-4" />
        <span>ID</span>
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-all ${
          locale === "en"
            ? "bg-[#0060A9] text-white shadow-sm font-extrabold"
            : "text-slate-600 hover:bg-slate-100 hover:text-[#0060A9]"
        }`}
        title="English"
        aria-label="Switch to English"
      >
        <FlagEN className="h-3 w-4" />
        <span>EN</span>
      </button>
    </div>
  )
}
