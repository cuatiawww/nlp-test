'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Construction, ArrowLeft, LayoutDashboard } from 'lucide-react'

export default function UnderDevelopment() {
  const router = useRouter()

  return (
    <div className="flex min-h-[calc(100vh-140px)] w-full items-center justify-center bg-gradient-to-b from-slate-50 via-slate-100/60 to-slate-200/50 p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-lg text-center">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-12">
          {/* Decorative Backdrops */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full bg-blue-500/5 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-60 w-60 rounded-full bg-sky-500/5 blur-2xl" />

          {/* Icon Badge */}
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#0060A9] to-sky-600 text-white shadow-lg shadow-blue-600/20 ring-8 ring-blue-50">
            <Construction className="h-10 w-10 animate-pulse" />
          </div>

          {/* Status & Title */}
          <div className="mt-6 space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              <span>COMING SOON</span>
            </div>

            <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">
              Under Development
            </h1>

            <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-600">
              This page is currently under development. Please check back later.
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
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
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
