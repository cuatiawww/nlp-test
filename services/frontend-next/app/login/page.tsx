'use client'

import { useState, Suspense } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

const API = ''

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/'
  const [username, setUsername] = useState('webmaster')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('auth_token', data.data.token)
        localStorage.setItem('auth_user', JSON.stringify(data.data))
        router.push(redirectTo)
      } else {
        setError(data.error || 'Login failed')
      }
    } catch (e: any) {
      setError(e.message || 'Connection failed')
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-teal-200 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
            Disease Surveillance AI
          </h1>
          <p className="mt-1 text-sm text-slate-500">Masuk ke dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" required />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Password</label>
            <div className="relative mt-1">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-10 text-sm" required />
              <button type="button" onClick={() => setShowPassword(p => !p)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-bold uppercase text-white transition hover:bg-teal-700 disabled:opacity-50">
            {loading ? 'Memuat...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Memuat...</div>}>
      <LoginForm />
    </Suspense>
  )
}
