'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useState, useEffect } from 'react'
import { createUser, updateUser } from '@/lib/api'
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
  Settings2
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
}

export const USER_ROLES = [
  { id: 'admin', label: 'ADMIN', desc: 'Akses Penuh Seluruh Modul & Konfigurasi' },
  { id: 'data_analyst', label: 'DATA ANALYST', desc: 'Akses Analisis Data, Kejadian & Laporan' },
  { id: 'epidemiologi', label: 'EPIDEMIOLOGI', desc: 'Surveilans Penyakit, Aturan KLB & Geospasial' },
  { id: 'executive', label: 'EXECUTIVE', desc: 'Ringkasan Eksekutif, TV Center & Matriks' },
  { id: 'skk', label: 'SKK', desc: 'Monitoring Feed Sumber Data & Pemrosesan' },
]

export default function UserForm({ initialData, onSaved, onCancel }: Props) {
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
      const preset = ROLE_PRESET_MODULES[newRole] || []
      setSelectedModules(preset)
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
      // Calculate final permissions
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

        const res = await updateUser(initialData.id, payload)
        if (res?.success) {
          toast.success(`Akun "${initialData.username}" berhasil diperbarui!`)
        } else {
          throw new Error(res?.error || 'Gagal memperbarui akun.')
        }
      } else {
        const payload = {
          username: username.trim(),
          password,
          display_name: displayName.trim(),
          role: role.toUpperCase(),
          email: email.trim(),
          permissions: finalPermissions,
        }

        const res = await createUser(payload)
        if (res?.success) {
          toast.success(`Akun "${username}" berhasil ditambahkan!`)
        } else {
          throw new Error(res?.error || 'Gagal menambahkan akun.')
        }
      }
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || (isEditing ? 'Gagal memperbarui akun pengguna.' : 'Gagal membuat akun pengguna.'))
    } finally {
      setSaving(false)
    }
  }

  // Group modules by category
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
    <form onSubmit={handleSubmit} className="space-y-4 pt-1 max-h-[80vh] overflow-y-auto pr-1">
      {/* Username Field */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
          <UserIcon className="h-3.5 w-3.5 text-slate-400" />
          {t('pages.users.colUsername') || 'Username'}
          {isEditing && (
            <span className="ml-auto text-[10px] font-normal lowercase tracking-normal text-slate-400">
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

      {/* Password Field */}
      <div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            {isEditing ? 'Ganti Password (Opsional)' : 'Password'}
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

      {/* Full Name / Display Name */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
          {t('pages.users.colDisplayName') || 'Nama Lengkap'}
        </label>
        <input
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="contoh: Dr. Joko Susilo"
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
        />
      </div>

      {/* Role Selection (5 Roles) */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
          <Shield className="h-3.5 w-3.5 text-slate-400" />
          {t('pages.users.colRole') || 'Peran Pengguna (Role)'}
        </label>
        <select
          value={role}
          onChange={e => handleRoleChange(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
        >
          {USER_ROLES.map(r => (
            <option key={r.id} value={r.id}>
              {r.label} — {r.desc}
            </option>
          ))}
        </select>
      </div>

      {/* Module Permissions Checklist Section */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#0060A9]" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Hak Akses Modul Aplikasi
            </span>
          </div>
          {role === 'admin' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-black text-purple-800 border border-purple-200">
              <Sparkles className="h-3 w-3" />
              Full Access (Semua Modul)
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllModules}
                className="text-[11px] font-bold text-[#0060A9] hover:underline cursor-pointer"
              >
                Pilih Semua
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearAllModules}
                className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
              >
                Kosongkan
              </button>
              <span className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-[#0060A9]">
                {selectedModules.length} dipilih
              </span>
            </div>
          )}
        </div>

        {role === 'admin' ? (
          <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 text-xs text-purple-900 leading-relaxed">
            Peran <strong>ADMIN</strong> memiliki akses penuh tanpa batas ke seluruh modul dan konfigurasi sistem.
          </div>
        ) : (
          <div className="space-y-4">
            {categories.map(cat => (
              <div key={cat.name} className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <cat.icon className="h-3 w-3 text-slate-400" />
                  <span>{cat.name}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cat.modules.map(mod => {
                    const isChecked = selectedModules.includes(mod.id)
                    return (
                      <label
                        key={mod.id}
                        onClick={() => toggleModule(mod.id)}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition cursor-pointer select-none ${
                          isChecked
                            ? 'bg-blue-50/60 border-blue-200 shadow-2xs'
                            : 'bg-white border-slate-200/90 hover:bg-slate-50'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0 text-[#0060A9]">
                          {isChecked ? (
                            <CheckSquare className="h-4 w-4 text-[#0060A9]" />
                          ) : (
                            <Square className="h-4 w-4 text-slate-300" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold leading-tight ${isChecked ? 'text-slate-900' : 'text-slate-700'}`}>
                            {mod.label}
                          </p>
                          <p className="text-[10.5px] text-slate-500 leading-tight mt-0.5 truncate">
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

      {/* Email Address */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
          <Mail className="h-3.5 w-3.5 text-slate-400" />
          {t('pages.users.colEmail') || 'Alamat Email'}
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="contoh: joko@dinkes.go.id"
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
        />
      </div>

      {/* Active Status (Switch / Toggle) */}
      {isEditing && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 transition">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-700 block">
                Status Akun
              </span>
              <span className="text-[12px] text-slate-500">
                {isActive ? 'Akun aktif dan dapat masuk ke sistem' : 'Akun dinonaktifkan (akses diblokir)'}
              </span>
            </div>
            <div className="relative inline-flex items-center">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </div>
          </label>
        </div>
      )}

      {/* Modal Actions */}
      <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition disabled:opacity-50 cursor-pointer"
        >
          {t('common.cancel') || 'Batal'}
        </button>
        <button
          type="submit"
          disabled={saving || !username.trim() || (!isEditing && !password.trim())}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#004b85] shadow-sm transition disabled:opacity-50 cursor-pointer"
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
