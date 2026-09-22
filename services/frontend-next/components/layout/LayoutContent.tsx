'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import AuthGuard from '@/components/AuthGuard'
import AppShell from '@/components/layout/AppShell'

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'
  // The base dashboard (/nlp, represented as / here because Next basePath is stripped)
  // must require authentication. TV and the event matrix remain public monitoring views.
  const isExecutivePage =
    pathname === '/reports/executive' ||
    pathname.startsWith('/reports/executive') ||
    pathname === '/laporan/eksekutif' ||
    pathname.startsWith('/laporan/eksekutif')
  const isReportsCms =
    pathname.startsWith('/reports/cms') || pathname.startsWith('/reports/generate')
  const isSitrepPrint = pathname.startsWith('/reports/') && pathname.endsWith('/print')
  const isSitrepPublic =
    !isReportsCms &&
    (pathname === '/reports' ||
      pathname.startsWith('/reports/latest') ||
      pathname.startsWith('/reports/w/') ||
      pathname.startsWith('/reports/disease/') ||
      pathname.startsWith('/reports/country/') ||
      pathname.startsWith('/reports/archive') ||
      pathname.startsWith('/reports/methodology') ||
      (pathname.startsWith('/reports/') &&
        !pathname.startsWith('/reports/matrix') &&
        !pathname.startsWith('/reports/executive') &&
        !pathname.startsWith('/reports/generate')))
  const isPublicPage =
    pathname === '/tv' ||
    pathname === '/reports/matrix' ||
    pathname === '/laporan' ||
    pathname.startsWith('/laporan') ||
    pathname === '/detail-region' ||
    pathname === '/lite-dashboard' ||
    pathname === '/crawling-dashboard' ||
    pathname === '/disease-dashboard'
  const isConsolePage = pathname.startsWith('/console')

  if (isLoginPage) {
    return <>{children}</>
  }

  if (isExecutivePage || isSitrepPrint) {
    return (
      <>
        {children}
        <Toaster position="top-right" richColors />
      </>
    )
  }

  if (isReportsCms) {
    return (
      <AuthGuard>
        <AppShell consoleMode>
          {children}
        </AppShell>
        <Toaster position="top-right" richColors />
      </AuthGuard>
    )
  }

  if (isSitrepPublic) {
    return (
      <>
        <AppShell publicMode>{children}</AppShell>
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
