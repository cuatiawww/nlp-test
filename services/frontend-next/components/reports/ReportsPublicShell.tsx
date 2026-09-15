'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'
import { useSettings } from '@/lib/settings-context'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { fetchLatestPublicReport, formatEpiBadge } from '@/lib/sitrep-api'
import { getCurrentEpiWeek } from '@/lib/epi-week'
import { getAuthUser, isLoggedIn } from '@/lib/auth'

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/', label: 'Dashboard' },
  { href: '/reports', label: 'Reports' },
  { href: '/reports/methodology#sources', label: 'Sources' },
  { href: '/reports/methodology', label: 'About' },
]

export default function ReportsPublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { settings } = useSettings()
  const epi = getCurrentEpiWeek()
  const [lastPublished, setLastPublished] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const logoSrc = settings.sidebar_logo_url || `${PUBLIC_BASE_PATH}/abvc-logo.webp`

  useEffect(() => {
    setLoggedIn(isLoggedIn())
    fetchLatestPublicReport()
      .then((item) => {
        if (item?.epi_year && item?.epi_week) {
          setLastPublished(formatEpiBadge(item.epi_year, item.epi_week))
        }
      })
      .catch(() => setLastPublished(null))
  }, [])

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="site-header no-print border-b border-[#0060A9]/20 bg-white">
        <div className="relative overflow-hidden bg-[#f0f6fc]">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-80"
            style={{ backgroundImage: `url('${PUBLIC_BASE_PATH}/bg%20header.png')` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white/85 via-white/55 to-white/70" />
          <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
            <Link href="/reports" className="flex min-w-0 items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt="ABVC" className="h-12 w-auto object-contain" />
              <div className="min-w-0 border-l border-[#0060A9]/25 pl-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0060A9]">
                  Surveillance Reports
                </p>
                <h1 className="truncate text-lg font-extrabold uppercase leading-tight text-slate-900 sm:text-xl">
                  ASEAN epidemiological bulletins
                </h1>
              </div>
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#0060A9]/20 bg-white/90 px-3 py-1 text-[11px] font-bold text-[#0060A9]">
                Current {formatEpiBadge(epi.year, epi.week)}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-600">
                Last published {lastPublished || '—'}
              </span>
              <LanguageSwitcher />
              {loggedIn ? (
                <Link
                  href="/reports/cms"
                  className="rounded-xl bg-[#0060A9] px-3 py-2 text-xs font-bold text-white"
                >
                  CMS
                </Link>
              ) : (
                <Link href="/login" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 py-2 text-sm">
          {NAV.map((item) => {
            const active =
              item.label === 'Reports'
                ? pathname.startsWith('/reports')
                : item.label === 'About' || item.label === 'Sources'
                  ? pathname.startsWith('/reports/methodology')
                  : pathname === item.href
            return (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 font-semibold ${
                  active ? 'bg-[#0060A9] text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      <footer className="no-print border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-slate-500">
          <p>Publicly available sources · ASEAN-11 KPI snapshot · Template {getAuthUser()?.username ? 'CMS enabled' : 'weekly_sitrep_v1'}</p>
          <div className="flex gap-3">
            <Link href="/reports/archive" className="font-semibold text-[#0060A9]">Archive</Link>
            <Link href="/reports/methodology" className="font-semibold text-[#0060A9]">Methodology</Link>
            <Link href="/reports/matrix" className="font-semibold text-slate-500">Event matrix</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
