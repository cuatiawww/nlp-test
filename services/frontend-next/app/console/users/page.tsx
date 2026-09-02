'use client'

import { useState } from 'react'
import { Plus, Trash2, Shield } from 'lucide-react'
import { deleteUser } from '@/lib/api'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import UserForm from '@/components/UserForm'
import { toast } from 'sonner'

interface User {
  id: string; username: string; display_name?: string; role: string; email?: string; is_active: boolean; created_at?: string
}

export default function ConsoleUsersPage() {
  const { data: users, loading, page, setPage, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<User>('/api/v1/users')
  const [showModal, setShowModal] = useState(false)

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return
    try {
      await deleteUser(id)
      toast.success("User deleted successfully.")
      reload()
    } catch {
      toast.error("Failed to delete user.")
    }
  }

  return (
    <div className="w-full px-4 md:px-8 py-2 md:py-4">
      {/* Header (Clean title, NO icon next to title) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
            User Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage user accounts, roles, access permissions, email addresses, and active status.
          </p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-[#004b85] shadow-sm transition"
        >
          <Plus className="h-4 w-4" /> Add User
        </button>
      </div>

      <div className="mt-6 flex gap-2">
        <div className="relative max-w-sm w-full">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <SearchInput value={search} onChange={setSearch} placeholder="Search users..." />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm w-full">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No users found.</div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left">
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Username</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Full Name</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Role</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3.5 text-center font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-right font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-3.5 font-bold text-slate-900">{u.username}</td>
                    <td className="px-5 py-3.5 text-slate-600">{u.display_name || "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-[#0060A9] border border-blue-100">
                        <Shield className="h-3 w-3" /> {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{u.email || "—"}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-block h-2 w-2 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button 
                        onClick={() => handleDelete(u.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                        title="Delete User"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onNext={nextPage} onPrev={prevPage} onGoTo={setPage} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add New User">
        <UserForm onSaved={() => { setShowModal(false); reload() }} onCancel={() => setShowModal(false)} />
      </Modal>
    </div>
  );
}
