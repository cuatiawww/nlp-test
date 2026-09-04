import { create } from 'zustand'

export interface User {
  id_user: number
  username: string
  email: string
  nama_lengkap: string
  no_telpon?: string
  level_user_id: number
  level_name?: string
  wilayah_scope?: WilayahScope
}

export type WilayahScopeMode = 'all' | 'provinsi' | 'kabupaten'

export interface WilayahScopeOption {
  id?: string | number | null
  value?: string
  label: string
  locked: boolean
  options?: Array<{
    id: string | number
    label: string
  }>
}

export interface WilayahScope {
  mode: WilayahScopeMode
  access_label: string
  cakupan: WilayahScopeOption
  provinsi: WilayahScopeOption
  kabupaten: WilayahScopeOption
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  isGuest: boolean
  isInitialized: boolean
  login: (token: string, user: User) => void
  loginAsGuest: () => void
  logout: () => void
  initialize: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isGuest: false,
  isInitialized: false,
  login: (token, user) => {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('auth_user', JSON.stringify(user))
    localStorage.removeItem('auth_guest')
    set({ token, user, isAuthenticated: true, isGuest: false })
  },
  loginAsGuest: () => {
    localStorage.setItem('auth_guest', 'true')
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    set({ token: null, user: null, isAuthenticated: false, isGuest: true })
  },
  logout: () => {
    // Ambil token sebelum dihapus untuk dikirim ke backend
    const currentToken = localStorage.getItem('auth_token')

    // Hapus state lokal segera (UX tetap responsif)
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    localStorage.removeItem('auth_guest')
    set({ token: null, user: null, isAuthenticated: false, isGuest: false })

    // Single Sign-Out: hit backend Yii2 agar session server juga terhapus
    if (currentToken) {
      const backendBase = process.env.NEXT_PUBLIC_SIPKK_BACKEND_BASE_URL || 'https://sipkk-new.mediaciptainformasi.co.id'
      fetch(`${backendBase}/api/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        },
        // fire-and-forget — jangan await, biarkan berjalan di background
        keepalive: true,
      }).catch(() => {
        // Abaikan error jaringan — logout lokal sudah berhasil
      })
    }
  },
  initialize: () => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem('auth_token')
    const userStr = localStorage.getItem('auth_user')
    const isGuestStr = localStorage.getItem('auth_guest')
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        set({ token, user, isAuthenticated: true, isGuest: false, isInitialized: true })
      } catch (e) {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
        set({ token: null, user: null, isAuthenticated: false, isGuest: true, isInitialized: true })
      }
    } else if (isGuestStr === 'true') {
      set({ token: null, user: null, isAuthenticated: false, isGuest: true, isInitialized: true })
    } else {
      localStorage.setItem('auth_guest', 'true')
      set({ token: null, user: null, isAuthenticated: false, isGuest: true, isInitialized: true })
    }
  }
}))
