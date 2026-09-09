'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useState, useEffect } from 'react'
import { createUser, updateUser, fetchRoles, RoleItem } from '@/lib/api'
import {
  Eye,
  EyeOff,
  Lock,
  User as UserIcon,
  Mail,
  Shield,
  CheckCircle2,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  Activity,
  Sliders,
  Settings2,
  RotateCcw,
  Check
} from 'lucide-react'
import { toast } from 'sonner'
import { SYSTEM_MODULES, ROLE_PRESET_MODULES, SystemModule } from '@/lib/auth'

export interface UserItem {
  id: string
  username: string
  display_name?: string
  role: string
  email?: string
  is_active: boolean
  created_at?: string
  permissions?: string[]
}

interface Props {
  initialData?: UserItem | null
  onSaved: () => void
  onCancel: () => void
  onOpenRoleModal?: () => void
}

export const USER_ROLES = [
  { id: 'admin', label: 'ADMIN', desc: 'Akses Penuh Seluruh Modul & Konfigurasi' },
  { id: 'data_analyst', label: 'DATA ANALYST', desc: 'Akses Analisis Data, Kejadian & Laporan' },
  { id: 'epidemiologi', label: 'EPIDEMIOLOGI', desc: 'Surveilans Penyakit, Aturan KLB & Geospasial' },
  { id: 'executive', label: 'EXECUTIVE', desc: 'Ringkasan Eksekutif, TV Center & Matriks' },
  { id: 'skk', label: 'SKK', desc: 'Monitoring Feed Sumber Data & Pemrosesan' },
]

export default function UserForm({ initialData, onSaved, onCancel, onOpenRoleModal }: Props) {
  const [availableRoles, setAvailableRoles] = useState<Array<{ id: string; label: string; desc: string; permissions?: string[] }>>(USER_ROLES)
  const { t } = useTranslation()
  const isEditing = Boolean(initialData)

  const [username, setUsername] = useState(initialData?.username || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [displayName, setDisplayName] = useState(initialData?.display_name || '')
  const [role, setRole] = useState(initialData?.role?.toLowerCase() || 'data_analyst')
  const [email, setEmail] = useState(initialData?.email || '')
  const [isActive, setIsActive] = useState<boolean>(initialData ? initialData.is_active : true)
  const [saving, setSaving] = useState(false)

  // Module permissions state
  const [selectedModules, setSelectedModules] = useState<string[]>(() => {
    if (initialData?.permissions && initialData.permissions.length > 0) {
      if (initialData.permissions.includes('*')) {
        return SYSTEM_MODULES.map(m => m.id)
      }
      return initialData.permissions
    }
    const defaultRole = initialData?.role?.toLowerCase() || 'data_analyst'
    if (defaultRole === 'admin') {
      return SYSTEM_MODULES.map(m => m.id)
    }
    return ROLE_PRESET_MODULES[defaultRole] || ROLE_PRESET_MODULES.data_analyst
  })

  // Load dynamic roles from API
  useEffect(() => {
    fetchRoles()
      .then(roles => {
        if (roles && roles.length > 0) {
          const mapped = roles.map(r => ({
            id: r.id,
            label: r.name,
            desc: r.description || 'Level Pengguna',
            permissions: r.permissions,
          }))
          setAvailableRoles(mapped)
        }
      })
      .catch(() => {
        // Fallback to static USER_ROLES on network/auth error
      })
  }, [])

  // Sync initialData changes
  useEffect(() => {
    if (initialData) {
      setUsername(initialData.username || '')
      setDisplayName(initialData.display_name || '')
      const r = initialData.role?.toLowerCase() || 'data_analyst'
      setRole(r)
      setEmail(initialData.email || '')
      setIsActive(initialData.is_active)
      setPassword('')
      if (initialData.permissions && initialData.permissions.length > 0) {
        if (initialData.permissions.includes('*')) {
          setSelectedModules(SYSTEM_MODULES.map(m => m.id))
        } else {
          setSelectedModules(initialData.permissions)
        }
      } else if (r === 'admin') {
        setSelectedModules(SYSTEM_MODULES.map(m => m.id))
      } else {
        setSelectedModules(ROLE_PRESET_MODULES[r] || [])
      }
    }
  }, [initialData])

  // Handle role switch & automatically adapt preset
  const handleRoleChange = (newRole: string) => {
    setRole(newRole)
    if (newRole === 'admin') {
      setSelectedModules(SYSTEM_MODULES.map(m => m.id))
    } else {
      const foundRole = availableRoles.find(r => r.id === newRole)
      if (foundRole?.permissions && foundRole.permissions.length > 0) {
        if (foundRole.permissions.includes('*')) {
          setSelectedModules(SYSTEM_MODULES.map(m => m.id))
        } else {
          setSelectedModules(foundRole.permissions)
        }
      } else {
        const preset = ROLE_PRESET_MODULES[newRole] || []
        setSelectedModules(preset)
      }
    }
  }

  const toggleModule = (moduleId: string) => {
    if (role === 'admin') return // Admin always has full access
    setSelectedModules(prev =>
      prev.includes(moduleId)
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    )
  }

  const selectAllModules = () => {
    if (role === 'admin') return
    setSelectedModules(SYSTEM_MODULES.map(m => m.id))
  }

  const clearAllModules = () => {
    if (role === 'admin') return
    setSelectedModules([])
  }

  const resetToRolePreset = () => {
    if (role === 'admin') {
      setSelectedModules(SYSTEM_MODULES.map(m => m.id))
    } else {
      const foundRole = availableRoles.find(r => r.id === role)
      if (foundRole?.permissions && foundRole.permissions.length > 0) {
        if (foundRole.permissions.includes('*')) {
          setSelectedModules(SYSTEM_MODULES.map(m => m.id))
        } else {
          setSelectedModules(foundRole.permissions)
        }
      } else {
        setSelectedModules(ROLE_PRESET_MODULES[role] || [])
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      toast.error('Username tidak boleh kosong.')
      return
    }

    if (!isEditing && !password.trim()) {
      toast.error('Password wajib diisi untuk pengguna baru.')
      return
    }

    if (password && password.length < 6) {
      toast.error('Password minimal 6 karakter.')
      return
    }

    if (role !== 'admin' && selectedModules.length === 0) {
      toast.error('Pilih minimal 1 modul hak akses untuk pengguna ini.')
      return
    }

    setSaving(true)
    try {
      const finalPermissions = role === 'admin' ? ['*'] : selectedModules

      if (isEditing && initialData) {
        const payload: Record<string, any> = {
          display_name: displayName.trim(),
          role: role.toUpperCase(),
          email: email.trim(),
          is_active: isActive,
          permissions: finalPermissions,
        }
        if (password.trim()) {
          payload.password = password
        }

        await updateUser(initialData.id, payload)
        toast.success(`Akun "${initialData.username}" berhasil diperbarui!`)
      } else {
        const payload = {
          username: username.trim(),
          password,
          display_name: displayName.trim(),
          role: role.toUpperCase(),
          email: email.trim(),
          is_active: isActive,
          permissions: finalPermissions,
        }

        await createUser(payload)
        toast.success(`Akun "${username}" berhasil ditambahkan!`)
      }
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || (isEditing ? 'Gagal memperbarui akun pengguna.' : 'Gagal membuat akun pengguna.'))
    } finally {
      setSaving(false)
    }
  }

  const categories: Array<{ name: string; icon: any; modules: SystemModule[] }> = [
    {
      name: 'Surveillance & Monitoring',
      icon: Activity,
      modules: SYSTEM_MODULES.filter(m => m.category === 'Surveillance & Monitoring'),
    },
    {
      name: 'Master Data & Configuration',
      icon: Sliders,
      modules: SYSTEM_MODULES.filter(m => m.category === 'Master Data & Configuration'),
    },
    {
      name: 'System Management',
      icon: Settings2,
      modules: SYSTEM_MODULES.filter(m => m.category === 'System Management'),
    },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-1">
      {/* SECTION 1: Informasi Akun (2 Kolom Responsif) */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-200/80 pb-2.5">
          <UserIcon className="h-4 w-4 text-[#0060A9]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Informasi Akun Pengguna
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {/* Kolom Kiri */}
          <div className="space-y-4">
            {/* Username */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                <span>{t('pages.users.colUsername') || 'Username'}</span>
                {!isEditing && <span className="text-rose-500">*</span>}
                {isEditing && (
                  <span className="ml-auto text-[11px] font-normal lowercase tracking-normal text-slate-400">
                    (tidak dapat diubah)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                disabled={isEditing}
                placeholder="contoh: joko_analis"
                className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm transition ${
                  isEditing
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 font-medium text-slate-500 shadow-inner'
                    : 'border-slate-200 bg-white text-slate-900 focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20'
                }`}
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  <span>{isEditing ? 'Ganti Password' : 'Password'}</span>
                  {!isEditing && <span className="text-rose-500">*</span>}
                </label>
                {isEditing && (
                  <span className="text-[11px] text-slate-400 font-normal">
                    Kosongkan bila tetap
                  </span>
                )}
              </div>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required={!isEditing}
                  placeholder={isEditing ? 'Ketik password baru jika ingin mengubah...' : 'Minimal 6 karakter...'}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                  title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Peran Pengguna (Role) */}
            <div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                  <Shield className="h-3.5 w-3.5 text-slate-400" />
                  <span>{t('pages.users.colRole') || 'Peran Pengguna (Role / Level)'}</span>
                </label>
                {onOpenRoleModal && (
                  <button
                    type="button"
                    onClick={onOpenRoleModal}
                    className="text-[11px] font-bold text-[#0060A9] hover:underline cursor-pointer"
                  >
                    + Buat Level Baru
                  </button>
                )}
              </div>
              <select
                value={role}
                onChange={e => handleRoleChange(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20 cursor-pointer"
              >
                {availableRoles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.label} — {r.desc}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Kolom Kanan */}
          <div className="space-y-4">
            {/* Display Name */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                <span>{t('pages.users.colDisplayName') || 'Nama Lengkap'}</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="contoh: Dr. Joko Susilo"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span>{t('pages.users.colEmail') || 'Alamat Email'}</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="contoh: joko@dinkes.go.id"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
              />
            </div>

            {/* Status Akun Toggle */}
            <div className="pt-0.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600 mb-1.5">
                <span>Status Akun</span>
              </label>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-rose-500 ring-4 ring-rose-100'}`} />
                  <span className="text-xs font-bold text-slate-800">
                    {isActive ? 'Aktif (Bisa Login)' : 'Nonaktif (Akses Diblokir)'}
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Hak Akses Modul Aplikasi (Lebar & Rapi) */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0060A9]/10 text-[#0060A9]">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Hak Akses Modul Aplikasi
              </h3>
              <p className="text-[11px] text-slate-500">
                Pilih modul mana saja yang diizinkan untuk diakses oleh akun pengguna ini.
              </p>
            </div>
          </div>

          {role === 'admin' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-800 border border-purple-200 shadow-2xs">
              <Sparkles className="h-3.5 w-3.5 text-purple-600" />
              Full Access (Semua Modul)
            </span>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={selectAllModules}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0060A9] hover:bg-blue-50 px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                <Check className="h-3 w-3" /> Pilih Semua
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearAllModules}
                className="text-xs font-bold text-slate-500 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                Kosongkan
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={resetToRolePreset}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition cursor-pointer"
                title="Kembalikan modul ke rekomendasi bawaan peran ini"
              >
                <RotateCcw className="h-3 w-3" /> Rekomendasi Peran
              </button>
              <span className="ml-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-black text-[#0060A9] border border-blue-200">
                {selectedModules.length} / {SYSTEM_MODULES.length} dipilih
              </span>
            </div>
          )}
        </div>

        {role === 'admin' ? (
          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 text-xs text-purple-900 leading-relaxed flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Akses Penuh Tanpa Batas</p>
              <p className="mt-0.5 text-purple-700 text-[11.5px]">
                Pengguna dengan peran <strong>ADMIN</strong> otomatis memiliki izin penuh ke seluruh 13 modul sistem dan fitur manajemen tingkat lanjut tanpa perlu memilih secara manual.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {categories.map(cat => (
              <div key={cat.name} className="space-y-2.5">
                <div className="flex items-center gap-2 text-[11px] font-black text-slate-600 uppercase tracking-wider">
                  <cat.icon className="h-3.5 w-3.5 text-[#0060A9]" />
                  <span>{cat.name}</span>
                </div>
                {/* 3-Kolom Layout pada layar lebar / 2-kolom pada medium */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {cat.modules.map(mod => {
                    const isChecked = selectedModules.includes(mod.id)
                    return (
                      <label
                        key={mod.id}
                        onClick={() => toggleModule(mod.id)}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer select-none ${
                          isChecked
                            ? 'bg-blue-50/70 border-blue-200 shadow-2xs'
                            : 'bg-white border-slate-200/90 hover:bg-slate-50/80 hover:border-slate-300'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0 text-[#0060A9]">
                          {isChecked ? (
                            <CheckSquare className="h-4.5 w-4.5 text-[#0060A9]" />
                          ) : (
                            <Square className="h-4.5 w-4.5 text-slate-300" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold leading-snug ${isChecked ? 'text-slate-900' : 'text-slate-700'}`}>
                            {mod.label}
                          </p>
                          <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                            {mod.description}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition disabled:opacity-50 cursor-pointer"
        >
          {t('common.cancel') || 'Batal'}
        </button>
        <button
          type="submit"
          disabled={saving || !username.trim() || (!isEditing && !password.trim())}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#004b85] shadow-sm transition disabled:opacity-50 cursor-pointer"
        >
          {saving ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              <span>Menyimpan...</span>
            </>
          ) : isEditing ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>Simpan Perubahan</span>
            </>
          ) : (
            <span>Tambah Pengguna</span>
          )}
        </button>
      </div>
    </form>
  )
}
