'use client'

import { useState, useMemo } from 'react'
import {
  Plus,
  Trash2,
  Shield,
  ShieldAlert,
  BarChart3,
  Activity,
  Crown,
  Radio,
  Pencil,
  Sparkles,
  Layers,
  KeyRound
} from 'lucide-react'
import { deleteUser } from '@/lib/api'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import UserForm, { UserItem } from '@/components/UserForm'
import { SYSTEM_MODULES } from '@/lib/auth'
import { toast } from 'sonner'

export default function ConsoleUsersPage() {
  const {
    data: users,
    loading,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    nextPage,
    prevPage,
    reload
  } = usePaginatedFetch<UserItem>('/api/v1/users')

  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)

  const handleAddUser = () => {
    setEditingUser(null)
    setShowModal(true)
  }

  const handleEditUser = (user: UserItem) => {
    setEditingUser(user)
    setShowModal(true)
  }

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus akun "${username}"? Tindakan ini tidak dapat dibatalkan.`)) return
    try {
      await deleteUser(id)
      toast.success(`Pengguna "${username}" berhasil dihapus.`)
      reload()
    } catch {
      toast.error(`Gagal menghapus pengguna "${username}".`)
    }
  }

  const renderRoleBadge = (roleStr: string) => {
    const r = (roleStr || '').toLowerCase()
    switch (r) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 border border-indigo-200 uppercase tracking-wide shadow-2xs">
            <ShieldAlert className="h-3.5 w-3.5 text-indigo-600" /> ADMIN
          </span>
        )
      case 'data_analyst':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 border border-sky-200 uppercase tracking-wide shadow-2xs">
            <BarChart3 className="h-3.5 w-3.5 text-sky-600" /> DATA ANALYST
          </span>
        )
      case 'epidemiologi':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 uppercase tracking-wide shadow-2xs">
            <Activity className="h-3.5 w-3.5 text-emerald-600" /> EPIDEMIOLOGI
          </span>
        )
      case 'executive':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 border border-amber-200 uppercase tracking-wide shadow-2xs">
            <Crown className="h-3.5 w-3.5 text-amber-600" /> EXECUTIVE
          </span>
        )
      case 'skk':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700 border border-purple-200 uppercase tracking-wide shadow-2xs">
            <Radio className="h-3.5 w-3.5 text-purple-600" /> SKK
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200 uppercase tracking-wide">
            <Shield className="h-3.5 w-3.5 text-slate-500" /> {roleStr}
          </span>
        )
    }
  }

  const renderPermissionsBadge = (user: UserItem) => {
    const isFullAccess = user.role?.toLowerCase() === 'admin' || user.permissions?.includes('*')
    if (isFullAccess) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <Sparkles className="h-3 w-3 text-emerald-600" /> Semua Modul ({SYSTEM_MODULES.length})
          </span>
        </div>
      )
    }

    const permitted = user.permissions || []
    const moduleLabels = permitted
      .map(id => SYSTEM_MODULES.find(m => m.id === id)?.label || id)
      .filter(Boolean)

    if (permitted.length === 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600 border border-rose-200">
          Tidak ada akses
        </span>
      )
    }

    return (
      <div className="flex flex-col gap-0.5 max-w-[240px]">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200 w-fit">
          <Layers className="h-3 w-3 text-slate-500" /> {permitted.length} Modul Aktif
        </span>
        <span className="text-[11px] text-slate-400 truncate" title={moduleLabels.join(', ')}>
          {moduleLabels.slice(0, 2).join(', ')}{moduleLabels.length > 2 ? ` +${moduleLabels.length - 2} lainnya` : ''}
        </span>
      </div>
    )
  }

  return (
    <div className="w-full px-4 md:px-8 py-2 md:py-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0060A9]/10 text-[#0060A9]">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
                User Management & Access Control
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelola akun pengguna, penugasan peran (ADMIN, DATA ANALYST, EPIDEMIOLOGI, EXECUTIVE, SKK), dan hak akses modul sistem.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={handleAddUser}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-[#004b85] shadow-sm transition cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Tambah Pengguna
        </button>
      </div>

      <div className="mt-6 flex gap-2">
        <div className="relative max-w-sm w-full">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <SearchInput value={search} onChange={setSearch} placeholder="Cari nama, username, atau peran..." />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs w-full">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Memuat data pengguna...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">Tidak ada data pengguna ditemukan.</div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50/80 text-left">
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Username</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Nama Lengkap</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Peran (Role)</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Hak Akses Modul</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3.5 text-center font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-right font-semibold text-slate-600 text-xs uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-3.5 font-bold text-slate-900">
                      {u.username}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{u.display_name || "—"}</td>
                    <td className="px-5 py-3.5">
                      {renderRoleBadge(u.role)}
                    </td>
                    <td className="px-5 py-3.5">
                      {renderPermissionsBadge(u)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{u.email || "—"}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          u.is_active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-600 border border-rose-200'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {u.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleEditUser(u)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-[#0060A9] transition cursor-pointer"
                          title={`Edit akun ${u.username}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.username)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                          title={`Hapus akun ${u.username}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onNext={nextPage} onPrev={prevPage} onGoTo={setPage} />

      <Modal
        open={showModal}
        maxWidth="max-w-4xl xl:max-w-5xl"
        onClose={() => { setShowModal(false); setEditingUser(null) }}
        title={editingUser ? `Edit Akun & Akses: ${editingUser.username}` : "Tambah Pengguna Baru & Hak Akses"}
      >
        <UserForm
          initialData={editingUser}
          onSaved={() => { setShowModal(false); setEditingUser(null); reload() }}
          onCancel={() => { setShowModal(false); setEditingUser(null) }}
        />
      </Modal>
    </div>
  );
}
