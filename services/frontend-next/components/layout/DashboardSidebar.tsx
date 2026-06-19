'use client'

import { Home, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import type { SidebarGroup } from '@/lib/menu'

type Props = {
  open: boolean
  menuGroups: SidebarGroup[]
  onClose: () => void
}

const iconMap: Record<string, any> = {}

export default function DashboardSidebar({ open, menuGroups, onClose }: Props) {
  const pathname = usePathname()

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  const isActive = (item: SidebarGroup['items'][0]) => {
    if (item.href === '/') return pathname === '/'
    if (item.href) return pathname.startsWith(item.href)
    return false
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen w-[280px] border-r border-teal-300/30 bg-gradient-to-b from-[#0f8f96] via-[#076176] to-[#03384d] text-slate-100 shadow-2xl transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="h-[3px] bg-gradient-to-r from-teal-300 via-cyan-200 to-transparent" />
      <div className="border-b border-teal-200/20 px-5 py-5">
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold tracking-wide">Disease Surveillance AI</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-teal-200 hover:bg-white/10 hover:text-white transition" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-teal-50/80">Multilingual NLP Disease Monitoring</p>
      </div>
      <nav className="h-[calc(100vh-84px)] space-y-5 overflow-y-auto px-3 py-4">
        {menuGroups.map((group) => (
          <section key={group.title}>
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-300">{group.title}</p>
            <div className="mt-2 space-y-1.5">
              {group.items.map((item) => {
                const Icon = item.icon || Home
                const active = isActive(item)
                if (item.url) {
                  return (
                    <a key={item.label} href={item.url} target="_blank" rel="noopener noreferrer"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold uppercase tracking-[0.03em] transition text-teal-50/85 hover:bg-white/10 hover:text-white"
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </a>
                  )
                }
                return (
                  <Link key={item.label} href={item.href || '/'} onClick={onClose}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold uppercase tracking-[0.03em] transition ${
                      active
                        ? 'bg-white/14 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(94,234,212,0.55)]'
                        : 'text-teal-50/85 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  )
}
