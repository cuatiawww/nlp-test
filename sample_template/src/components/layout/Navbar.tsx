'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ChevronRight, LayoutDashboard, MapPinned, Menu, X } from 'lucide-react'

const menuItems = [
  {
    label: 'NASIONAL',
    shortLabel: 'Nasional',
    href: '/',
    icon: LayoutDashboard,
    match: (pathname: string) => pathname === '/',
  },
  {
    label: 'PROVINSI',
    shortLabel: 'Provinsi',
    href: '/pscbaru',
    icon: MapPinned,
    match: (pathname: string) => pathname.startsWith('/pscbaru'),
  },
  {
    label: 'PK3D DKI JAKARTA',
    shortLabel: 'DKI Jakarta',
    href: '/pk3d/dki-jakarta',
    icon: MapPinned,
    match: (pathname: string) => pathname.startsWith('/pk3d/dki-jakarta'),
  },
]

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  const activeItem = useMemo(
    () => menuItems.find((item) => item.match(pathname)) ?? menuItems[0],
    [pathname]
  )

  return (
    <nav className="sticky top-0 left-0 right-0 z-[1000] border-b border-primary/10 bg-white/92 backdrop-blur-md">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="py-3 lg:py-4">
          <div className="hidden lg:flex items-center justify-between gap-8">
            <Link
              href="/"
              className="flex items-center gap-4 flex-shrink-0 transition-opacity hover:opacity-90"
            >
              <div className="flex items-center gap-2">
                <Image
                  src="/kemenkes.png"
                  alt="Kemenkes"
                  width={50}
                  height={50}
                  className="h-11 w-auto"
                />
                <div className="w-px h-8 bg-gray-300" />
                <Image src="/psc.png" alt="Dashboard Puskes" width={50} height={50} className="h-11 w-auto" />
              </div>
              <div className="hidden xl:block leading-tight">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Dashboard Puskes</p>
                <p className="text-xs text-gray-500">Informasi pemantauan data kesehatan nasional</p>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-2xl border border-primary/10 bg-[#f8fbfb] p-1.5">
                {menuItems.map((item) => {
                  const Icon = item.icon
                  const isActive = item.match(pathname)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                        isActive
                          ? 'bg-primary text-white shadow-sm'
                          : 'text-gray-700 hover:bg-white hover:text-primary'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex lg:hidden items-center justify-between gap-3">
            <Link href="/" className="flex min-w-0 items-center gap-2">
              <div className="flex items-center gap-1">
                <Image
                  src="/kemenkes.png"
                  alt="Kemenkes"
                  width={40}
                  height={40}
                  className="h-9 w-auto"
                />
                <div className="h-6 w-px bg-gray-300" />
                <Image src="/psc.png" alt="Dashboard Puskes" width={40} height={40} className="h-9 w-auto" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold uppercase tracking-[0.16em] text-primary">Dashboard Puskes</p>
                <p className="truncate text-[11px] text-gray-500">{activeItem.shortLabel}</p>
              </div>
            </Link>

            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="rounded-xl border border-primary/10 p-2 text-primary transition-colors hover:bg-primary/5"
              aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-primary/10 pb-4 pt-4 lg:hidden">
            <div className="space-y-2 rounded-2xl border border-primary/10 bg-[#f8fbfb] p-2">
              {menuItems.map((item) => {
                const Icon = item.icon
                const isActive = item.match(pathname)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-primary text-white'
                        : 'bg-white text-gray-700 hover:text-primary'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    <ChevronRight className="h-4 w-4 opacity-70" />
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
