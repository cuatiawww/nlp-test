'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { isLoggedIn } from '@/lib/auth'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [pathname, router])

  if (!isLoggedIn()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-400">Mengalihkan ke login...</div>
      </div>
    )
  }

  return <>{children}</>
}
