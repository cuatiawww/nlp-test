'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import AuthGuard from '@/components/AuthGuard'
import AppShell from '@/components/layout/AppShell'

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'
  const isPublicPage = pathname === '/' || pathname === '/tv' || pathname === '/reports' || pathname.startsWith('/reports') || pathname === '/laporan' || pathname.startsWith('/laporan') || pathname === '/detail-region'
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
