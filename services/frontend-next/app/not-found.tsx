'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Compass, ArrowLeft, LayoutDashboard, AlertCircle } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { checkNavigationRoute, NavRouteInfo } from '@/lib/nav-route-checker'
import UnderDevelopment from '@/components/UnderDevelopment'

export default function NotFound() {
  const router = useRouter()
  const rawPathname = usePathname()
  const { settings } = useSettings()

  const [currentPath, setCurrentPath] = useState(rawPathname || '')
  const [navInfo, setNavInfo] = useState<NavRouteInfo>({ isNav: false })

  useEffect(() => {
    let path = rawPathname || ''
    if (!path && typeof window !== 'undefined') {
      path = window.location.pathname
    }

    if (path.startsWith('/nlp/') || path === '/nlp') {
      path = path.slice(4) || '/'
    }

    setCurrentPath(path)
    const result = checkNavigationRoute(path, settings.navigation_menu)
    setNavInfo(result)
  }, [rawPathname, settings.navigation_menu])

  // If the path matches a route registered in navigation, display Under Development
  if (navInfo.isNav) {
    return <UnderDevelopment />
  }

  // Otherwise, display clean 404 Page Not Found (for random/unregistered URLs)
  return (
    <div className="flex min-h-[calc(100vh-140px)] w-full items-center justify-center bg-gradient-to-b from-slate-50 via-slate-100/60 to-slate-200/50 p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-lg text-center">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-12">
          {/* Decorative Backdrops */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full bg-slate-500/5 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-60 w-60 rounded-full bg-slate-500/5 blur-2xl" />

          {/* Icon Badge */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 shadow-inner ring-8 ring-slate-50">
            <Compass className="h-10 w-10 text-slate-600 animate-spin" style={{ animationDuration: '20s' }} />
          </div>

          <div className="mt-6 space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>404 NOT FOUND</span>
            </div>

            <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">
              Page Not Found
            </h1>

            <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-600">
              The page you are looking for does not exist or has been moved.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-6">
            <Link
              href="/main-dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:bg-[#004b85]"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Back to Dashboard</span>
            </Link>

            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Go Back</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
