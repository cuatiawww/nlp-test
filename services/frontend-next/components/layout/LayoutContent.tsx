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
  const isExecutivePage =
    pathname === '/reports/executive' ||
    pathname.startsWith('/reports/executive') ||
    pathname === '/laporan/eksekutif' ||
    pathname.startsWith('/laporan/eksekutif')
  const isPublicPage =
    pathname === '/tv' ||
    pathname === '/reports' ||
    pathname.startsWith('/reports') ||
    pathname === '/laporan' ||
    pathname.startsWith('/laporan') ||
    pathname === '/detail-region'
  const isConsolePage = pathname.startsWith('/console')

  if (isLoginPage) {
    return <>{children}</>
  }

  if (isExecutivePage) {
    return (
      <>
        {children}
        <Toaster position="top-right" richColors />
      </>
    )
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
