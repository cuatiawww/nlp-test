'use client'

import { useState, Suspense } from 'react'
import Image from 'next/image'
import { Eye, EyeOff, Lock, LogIn, ShieldCheck, User, Globe2, Activity } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loginUser } from '@/lib/api'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryRedirect = searchParams.get('redirect')
  
  const [username, setUsername] = useState('webmaster')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { t } = useTranslation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await loginUser(username, password)
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('auth_user', JSON.stringify(data))
      
      router.push(queryRedirect || '/')
    } catch (e: any) {
      setError(e.message || 'Invalid credentials or network connection failed.')
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row bg-[#f8fafc]">
      {/* LEFT HERO / BRANDING SECTION */}
      <div className="relative hidden lg:flex lg:w-7/12 xl:w-2/3 flex-col justify-between overflow-hidden bg-[#004071] p-10 xl:p-14 text-white">
        <div className="absolute inset-0 z-0">
          <Image
            src={`${PUBLIC_BASE_PATH}/cover-login.webp`}
            alt="Disease Surveillance Background"
            fill
            className="object-cover object-center opacity-30"
            priority
          />
          <div
            className="absolute inset-0 bg-gradient-to-br from-[#003866]/95 via-[#0060A9]/85 to-[#00284d]/95"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        {/* Top Branding Logo */}
        <div className="relative z-10 flex items-center">
          <div className="flex items-center rounded-2xl border border-white/30 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-md">
            <Image
              src={`${PUBLIC_BASE_PATH}/abvc-logo.webp`}
              alt="ASEAN Biological Threats Surveillance Centre"
              width={200}
              height={64}
              className="h-9 w-auto object-contain"
              priority
            />
          </div>
        </div>

        {/* Mid Title Description */}
        <div className="relative z-10 max-w-xl my-auto py-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/40 bg-blue-500/20 px-3.5 py-1 text-xs font-semibold tracking-wide text-blue-200 backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-300" />
            <span>Integrated Communicable Disease Early Warning System</span>
          </div>
          <h1 className="mt-4 text-3xl xl:text-4xl font-black leading-tight tracking-tight text-white drop-shadow-sm">
            ASEAN Disease Outbreak Surveillance AI
          </h1>
          <p className="mt-4 text-sm xl:text-base leading-relaxed text-blue-100/90">
            Integrated health intelligence platform to detect, monitor, and analyze disease outbreak signals in real-time across Southeast Asia.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <Globe2 className="h-5 w-5 text-cyan-300" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">Multilingual NLP</span>
              </div>
              <p className="mt-2 text-xs text-blue-100">
                Detects health reports & news in 6 primary ASEAN languages.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <Activity className="h-5 w-5 text-emerald-300" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">Early Warning Signals</span>
              </div>
              <p className="mt-2 text-xs text-blue-100">
                Automated outbreak alerts with precise geospatial extraction.
              </p>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-6 text-xs text-blue-200/80">
          <span>&copy; 2026 Ministry of Health RI &bull; ABVC</span>
          <span>Security Level: Tier-3 Restricted</span>
        </div>
      </div>

      {/* RIGHT LOGIN FORM */}
      <div className="flex flex-1 flex-col justify-between p-6 sm:p-10 lg:p-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:hidden">
            <Image
              src={`${PUBLIC_BASE_PATH}/abvc-logo.webp`}
              alt="Logo"
              width={140}
              height={45}
              className="h-9 w-auto object-contain"
            />
          </div>
          <div className="ml-auto">
            <LanguageSwitcher compact />
          </div>
        </div>

        <div className="mx-auto my-auto w-full max-w-md py-6">
          <div>
            <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-[#0060A9] border border-blue-200/80">
              ACCESS PORTAL
            </span>
            <h2 className="mt-2 text-2xl xl:text-3xl font-black tracking-tight text-slate-900">
              Sign in to Dashboard
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Enter your account credentials to access the disease surveillance platform.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Username
              </label>
              <div className="relative mt-1.5">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-10 pr-4 text-sm font-semibold text-slate-900 placeholder-slate-400 transition outline-none focus:border-[#0060A9] focus:bg-white focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-10 pr-10 text-sm font-semibold text-slate-900 placeholder-slate-400 transition outline-none focus:border-[#0060A9] focus:bg-white focus:ring-2 focus:ring-blue-100"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0060A9] py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-[#0060A9]/20 transition hover:bg-[#004b85] active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  <span>SIGN IN TO DASHBOARD</span>
                </>
              )}
            </button>

            <div className="relative my-5 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <span className="relative bg-[#f8fafc] px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                OR
              </span>
            </div>

            <a
              href="https://abvc-surveillance.org/"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
            >
              Return to Main Website
            </a>
          </form>
        </div>

        <div className="text-center text-xs text-slate-400">
          Disease Outbreak Surveillance & Early Warning System &bull; v1.0
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}
