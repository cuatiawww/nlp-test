'use client'

import { useState } from 'react'
import rawData from '@/components/dashboard-campus/dashboard-data.json'
import DashboardSidebar from './DashboardSidebar'
import DashboardHeader from './DashboardHeader'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <main className="min-h-screen bg-white text-slate-900">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Tutup sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[1px]"
        />
      )}
      <DashboardSidebar
        open={sidebarOpen}
        menuGroups={(rawData as any).sidebarMenu}
        onClose={() => setSidebarOpen(false)}
      />
      <DashboardHeader onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
      <div className="w-full py-3 md:py-5">
        {children}
      </div>
    </main>
  )
}
