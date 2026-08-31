'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { isLoggedIn } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    setMounted(true)
    const logged = isLoggedIn()
    setAuthenticated(logged)
    if (!logged) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [pathname, router])

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

  return <>{children}</>
}
