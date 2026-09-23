'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { isLoggedIn, getAuthUser, hasModuleAccess, AuthUser } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useSettings } from '@/lib/settings-context'
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react'
import Link from 'next/link'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()
  const { settings } = useSettings()
  const [mounted, setMounted] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [hasAccess, setHasAccess] = useState(true)

  useEffect(() => {
    setMounted(true)
    const logged = isLoggedIn()
    setAuthenticated(logged)

    if (!logged) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }

    const currentAuth = getAuthUser()
    setUser(currentAuth)

    // Bypass check for public/neutral paths
    if (
      pathname === '/business-process' ||
      pathname === '/login' ||
      pathname === '/nlp-ai' ||
      pathname === '/spatial-dashboard' ||
      pathname === '/countries-dashboard'
    ) {
      setHasAccess(true)
      return
    }

    const allowed = hasModuleAccess(currentAuth, pathname, settings.navigation_menu)
    setHasAccess(allowed)
  }, [pathname, router, settings.navigation_menu])

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-400">{t('common.loading')}</div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-400">{t('common.redirecting')}</div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-slate-900">
            Module Access Restricted (403)
          </h2>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            Your account with the{' '}
            <span className="font-bold text-slate-900 uppercase">
              {user?.role || 'PENGGUNA'}
            </span>{' '}
            role does not have access to this page or module ({pathname}).
          </p>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-left border border-slate-100">
            <p className="text-[11px] text-slate-500">
              💡 <strong>Next step:</strong> Contact a system administrator to update your permissions in <em>User Management</em>.
            </p>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              onClick={() => router.back()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-semibold text-white hover:bg-[#004b85] shadow-xs transition"
            >
              <Home className="h-3.5 w-3.5" /> Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
