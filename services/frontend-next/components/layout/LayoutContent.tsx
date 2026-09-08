'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import AuthGuard from '@/components/AuthGuard'
import AppShell from '@/components/layout/AppShell'

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'
  // The base dashboard (/nlp, represented as / here because Next basePath is stripped)
  // must require authentication. TV/reports remain public monitoring views.
  const isPublicPage = pathname === '/tv' || pathname === '/reports' || pathname.startsWith('/reports') || pathname === '/laporan' || pathname.startsWith('/laporan') || pathname === '/detail-region'
  const isConsolePage = pathname.startsWith('/console')

  if (isLoginPage) {
    return <>{children}</>
  }

  if (isConsolePage) {
    return (
      <AuthGuard>
        <AppShell consoleMode>
          {children}
        </AppShell>
        <Toaster position="top-right" richColors />
      </AuthGuard>
    )
  }

  if (isPublicPage) {
    return <AppShell publicMode tvMode={pathname === '/tv'}>{children}</AppShell>
  }

  return (
    <AuthGuard>
      <AppShell>
        {children}
      </AppShell>
      <Toaster position="top-right" richColors />
    </AuthGuard>
  )
}
