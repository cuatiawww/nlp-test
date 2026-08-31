'use client'

import { useState, Suspense } from 'react'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loginUser } from '@/lib/api'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import LanguageSwitcher from '@/components/LanguageSwitcher'

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

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
      setError(e.message || 'Connection failed')
    }
    setLoading(false)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
      {/* Background cover image */}
      <div className="absolute inset-0 z-0">
        <Image
          src={`${PUBLIC_BASE_PATH}/cover-login.webp`}
          alt="Background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      </div>

      {/* Language switcher */}
      <div className="absolute right-6 top-6 z-20">
        <LanguageSwitcher compact />
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/20 bg-white/90 p-8 shadow-2xl backdrop-blur-xl">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image
            src={`${PUBLIC_BASE_PATH}/abvc-logo.webp`}
            alt="ABVC Logo"
            width={180}
            height={60}
            className="h-16 w-auto object-contain"
            priority
          />
          <div className="text-center">
            <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
              {t('pages.login.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{t('pages.login.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
              {t('pages.login.username')}
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
              {t('pages.login.password')}
            </label>
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-10 text-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-bold uppercase text-white transition hover:bg-teal-700 disabled:opacity-50"
          >
            {loading ? t('pages.login.loading') : t('pages.login.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}