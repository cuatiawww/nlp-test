'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Sparkles, Table } from 'lucide-react'

const MODES = [
  { href: '/reports', id: 'published', label: 'Published bulletins', match: (p: string) => p === '/reports' || p.startsWith('/reports/archive') || p.startsWith('/reports/latest') },
  { href: '/reports/generate', id: 'generate', label: 'Generate draft', match: (p: string) => p.startsWith('/reports/generate') || p.startsWith('/reports/cms') },
  { href: '/reports/matrix', id: 'matrix', label: 'Matrix & ledger', match: (p: string) => p.startsWith('/reports/matrix') },
]

const ICONS = {
  published: FileText,
  generate: Sparkles,
  matrix: Table,
}

export default function ReportsModeNav() {
  const pathname = usePathname() || '/reports'
  return (
    <div className="no-print flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1 text-xs font-bold">
      {MODES.map((mode) => {
        const Icon = ICONS[mode.id as keyof typeof ICONS]
        const active = mode.match(pathname)
        return (
          <Link
            key={mode.id}
            href={mode.href}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 ${
              active ? 'bg-[#0060A9] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {mode.label}
          </Link>
        )
      })}
    </div>
  )
}
