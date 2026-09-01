'use client'

import { useState, Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff, Lock, LogIn, ShieldCheck, User, Globe2, Activity } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loginUser } from '@/lib/api'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/'
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
      router.push(redirectTo)
    } catch (e: any) {
      setError(e.message || 'Kredensial login tidak valid atau koneksi gagal.')
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen w-full flex-col lg:flex-row bg-[#f8fafc]">
      {/* LEFT HERO / BRANDING SECTION */}
      <div className="relative hidden lg:flex lg:w-7/12 xl:w-2/3 flex-col justify-between overflow-hidden bg-[#004071] p-10 xl:p-14 text-white">
        {/* Background Cover with overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src={`${PUBLIC_BASE_PATH}/cover-login.webp`}
            alt="Disease Surveillance Background"
            fill
            className="object-cover object-center opacity-30"
            priority
          />
          {/* Subtle Grid overlay */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-[#003866]/95 via-[#0060A9]/85 to-[#00284d]/95"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
        </div>

        {/* Top Branding - Just the logo */}
        <div className="relative z-10 flex items-center">
          <div className="flex items-center rounded-2xl border border-white/30 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-md">
            <Image
              src={`${PUBLIC_BASE_PATH}/abvc-logo.webp`}
              alt="ASEAN Biological Threats Surveillance Centre"
              width={200}
              height={64}
              className="h-12 w-auto object-contain"
              priority
            />
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-xl py-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-white/10 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-blue-100 backdrop-blur-md">
            <Activity className="h-3.5 w-3.5 text-blue-300" />
            <span>Health Intelligence Platform</span>
          </div>

          <h1 className="mt-6 text-3xl xl:text-5xl font-black uppercase leading-tight tracking-tight text-white">
            DISEASE SURVEILLANCE &amp; EARLY WARNING SYSTEM
          </h1>

          <p className="mt-4 text-sm xl:text-base font-normal leading-relaxed text-blue-100/90">
            Sistem pemantauan spasial terpadu berbasis AI untuk analisis risiko wabah, penyakit menular, dan deteksi peringatan dini di kawasan Asia Tenggara.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-sm">
              <ShieldCheck className="h-5 w-5 text-blue-300" />
              <p className="mt-2 text-xs font-bold text-white">AI Detection</p>
              <p className="mt-0.5 text-[11px] text-blue-200">Deteksi dini berbasis NLP Multilingual</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-sm">
              <Globe2 className="h-5 w-5 text-blue-300" />
              <p className="mt-2 text-xs font-bold text-white">Regional Map</p>
              <p className="mt-0.5 text-[11px] text-blue-200">Pemetaan spasial &amp; GIS interaktif</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-sm">
              <Activity className="h-5 w-5 text-blue-300" />
              <p className="mt-2 text-xs font-bold text-white">EWS Alert</p>
              <p className="mt-0.5 text-[11px] text-blue-200">Peringatan dini dan respon cepat</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-blue-200/80">
          © {new Date().getFullYear()} ASEAN Biological Threats Surveillance Centre.
        </div>
      </div>

      {/* RIGHT LOGIN FORM SECTION */}
      <div className="relative flex flex-1 flex-col justify-between bg-white px-6 py-10 sm:px-12 lg:px-14 xl:px-20">
        {/* Top Header Controls */}
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

        {/* Center Form Container */}
        <div className="mx-auto my-auto w-full max-w-md py-8">
          {/* Header Title */}
          <div>
            {/* <div className="mb-4 inline-flex items-center rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
              <Image
                src={`${PUBLIC_BASE_PATH}/abvc-logo.webp`}
                alt="ABVC Logo"
                width={140}
                height={45}
                className="h-8 w-auto object-contain"
              />
            </div> */}
            <div>
              <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-[#0060A9] border border-blue-200/80">
                MASUK AKUN
              </span>
              <h2 className="mt-3 text-2xl xl:text-3xl font-black tracking-tight text-slate-900">
                Masuk ke Sistem
              </h2>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
                Silakan masukkan kredensial akun Anda untuk mengakses sistem pengawasan penyakit.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                {t('pages.login.username')}
              </label>
              <div className="relative mt-1.5">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-10 pr-4 text-sm font-semibold text-slate-900 placeholder-slate-400 transition outline-none focus:border-[#0060A9] focus:bg-white focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                {t('pages.login.password')}
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
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
                <span>{t('pages.login.loading')}</span>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  <span>MASUK</span>
                </>
              )}
            </button>

            <div className="relative my-6 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <span className="relative bg-white px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                ATAU
              </span>
            </div>

            <Link
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/60 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0060A9] transition hover:bg-blue-100"
            >
              Masuk sebagai Tamu (Akses Publik)
            </Link>
          </form>
        </div>

        {/* Bottom footer notice */}
        <div className="text-center">
          <p className="text-[11px] font-medium text-slate-400">
            Akses terbatas untuk pengguna yang berwenang. Hubungi admin jika mengalami kendala masuk.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm font-semibold text-[#0060A9]">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
