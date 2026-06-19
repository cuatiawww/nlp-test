import { Home } from 'lucide-react'
import { sidebarIconByKey } from './data'
import type { SidebarMenuGroup } from './types'

type DashboardSidebarProps = {
  open: boolean
  menuGroups: SidebarMenuGroup[]
}

export default function DashboardSidebar({ open, menuGroups }: DashboardSidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen w-[280px] border-r border-teal-950/30 bg-gradient-to-b from-[#083d59] via-[#06324a] to-[#05273c] text-slate-100 shadow-2xl transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-lg font-bold tracking-wide">LAPORAN KIE</p>
        <p className="text-xs text-slate-300">Kementerian Kesehatan RI</p>
      </div>

      <nav className="h-[calc(100vh-84px)] space-y-5 overflow-y-auto px-3 py-4">
        {menuGroups.map((group) => (
          <section key={group.title}>
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-300">{group.title}</p>
            <div className="mt-2 space-y-1.5">
              {group.items.map((item) => {
                const Icon = sidebarIconByKey[item.iconKey as keyof typeof sidebarIconByKey] ?? Home
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                      item.active
                        ? 'bg-teal-500/20 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(148,240,232,0.35)]'
                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  )
}
