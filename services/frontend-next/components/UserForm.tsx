'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'

import { useState } from 'react'
import { createUser } from '@/lib/api'

interface Props {
  onSaved: () => void
  onCancel: () => void
}

export default function UserForm({ onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('operator')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setSaving(true)
    try {
      await createUser({ username, password, display_name: displayName || null, role, email: email || null })
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Username</label>
        <input value={username} onChange={e => setUsername(e.target.value)} required
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Display Name</label>
        <input value={displayName} onChange={e => setDisplayName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Role</label>
        <select value={role} onChange={e => setRole(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
          <option value="operator">Operator</option>
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">{t('common.cancel')}</button>
        <button type="submit" disabled={saving || !username || !password}
          className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold uppercase text-white hover:bg-teal-700 disabled:opacity-50">
          {saving ? t('common.saving') : t('common.add')}
        </button>
      </div>
    </form>
  )
}
