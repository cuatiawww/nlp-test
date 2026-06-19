'use client'

import { Bell, ChevronDown, Menu, LogOut } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getAuthUser, logout, AuthUser } from '@/lib/auth'

export default function DashboardHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => { setUser(getAuthUser()) }, [])

  return (
    <header className="sticky top-0 z-30 w-full border-b-2 border-teal-400/25 bg-white">
      <div className="relative flex min-h-[80px] items-center overflow-visible">
        <div className="absolute inset-0 bg-gradient-to-r from-teal-600/5 to-transparent" />
        <div className="relative grid w-full gap-3 px-4 py-3 md:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <button type="button" aria-label="Buka menu" onClick={onToggleSidebar}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-white"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-col">
              <h1 className="text-xl font-extrabold tracking-normal text-slate-900 md:text-2xl">DISEASE SURVEILLANCE AI</h1>
              <p className="text-sm leading-relaxed text-slate-600">Multilingual NLP Disease Monitoring Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3 lg:justify-end">
            <div className="relative">
              <button type="button" onClick={() => setProfileOpen((prev) => !prev)}
                className="inline-flex h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3 text-left shadow-sm transition hover:bg-white"
              >
                <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 text-sm font-extrabold text-white shadow-sm">
                  {user?.username?.charAt(0).toUpperCase() || 'A'}
                </div>
                <div className="hidden sm:block">
                  <p className="text-[13px] font-bold uppercase tracking-[0.03em] leading-4 text-slate-900">{user?.username || 'Admin'}</p>
                  <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.03em] text-teal-700">{user?.role || 'Operator'}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-500" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-16 z-40 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  <div className="px-3 py-2 text-xs text-slate-500">Logged in as <strong>{user?.username}</strong></div>
                  <button onClick={logout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50">
                    <LogOut className="h-4 w-4" /> Keluar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="h-[3px] bg-gradient-to-r from-teal-400/80 via-teal-400/40 to-transparent" />
    </header>
  )
}

