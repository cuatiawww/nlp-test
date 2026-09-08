'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useState, useEffect } from 'react'
import { createUser, updateUser } from '@/lib/api'
import { Eye, EyeOff, Lock, User as UserIcon, Mail, Shield, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

export interface UserItem {
  id: string
  username: string
  display_name?: string
  role: string
  email?: string
  is_active: boolean
  created_at?: string
}

interface Props {
  initialData?: UserItem | null
  onSaved: () => void
  onCancel: () => void
}

export default function UserForm({ initialData, onSaved, onCancel }: Props) {
  const { t } = useTranslation()
  const isEditing = Boolean(initialData)

  const [username, setUsername] = useState(initialData?.username || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [displayName, setDisplayName] = useState(initialData?.display_name || '')
  const [role, setRole] = useState(initialData?.role || 'operator')
  const [email, setEmail] = useState(initialData?.email || '')
  const [isActive, setIsActive] = useState<boolean>(initialData ? initialData.is_active : true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initialData) {
      setUsername(initialData.username || '')
      setDisplayName(initialData.display_name || '')
      setRole(initialData.role || 'operator')
      setEmail(initialData.email || '')
      setIsActive(initialData.is_active ?? true)
      setPassword('')
    } else {
      setUsername('')
      setDisplayName('')
      setRole('operator')
      setEmail('')
      setIsActive(true)
      setPassword('')
    }
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      toast.error('Username wajib diisi.')
      return
    }
    if (!isEditing && !password.trim()) {
      toast.error('Password wajib diisi untuk akun baru.')
      return
    }

    setSaving(true)
    try {
      if (isEditing && initialData) {
        const payload: Record<string, any> = {
          display_name: displayName.trim() || null,
          role,
          email: email.trim() || null,
          is_active: isActive,
        }
        if (password.trim()) {
          payload.password = password.trim()
        }

        await updateUser(initialData.id, payload)
        toast.success(`Akun "${initialData.username}" berhasil diperbarui.`)
      } else {
        await createUser({
          username: username.trim(),
          password: password.trim(),
          display_name: displayName.trim() || null,
          role,
          email: email.trim() || null,
        })
        toast.success(`Akun "${username.trim()}" berhasil dibuat.`)
      }
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || (isEditing ? 'Gagal memperbarui akun pengguna.' : 'Gagal membuat akun pengguna.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-1">
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
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
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

      {/* Role Selection */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
          <Shield className="h-3.5 w-3.5 text-slate-400" />
          {t('pages.users.colRole') || 'Peran (Role)'}
        </label>
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
        >
          <option value="operator">Operator — Akses Input Data & Laporan</option>
          <option value="admin">Admin — Akses Penuh Sistem & Pengguna</option>
          <option value="viewer">Viewer — Hanya Melihat Dashboard</option>
        </select>
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
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition disabled:opacity-50"
        >
          {t('common.cancel') || 'Batal'}
        </button>
        <button
          type="submit"
          disabled={saving || !username.trim() || (!isEditing && !password.trim())}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#004b85] shadow-sm transition disabled:opacity-50"
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
