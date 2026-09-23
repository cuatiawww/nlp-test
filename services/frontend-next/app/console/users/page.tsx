'use client'

import { useState, useEffect, useMemo } from 'react'
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
  KeyRound,
  Users as UsersIcon,
  CheckCircle2,
  SlidersHorizontal,
  Info
} from 'lucide-react'
import { deleteUser, fetchRoles, deleteRole, RoleItem } from '@/lib/api'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import UserForm, { UserItem } from '@/components/UserForm'
import RoleForm from '@/components/RoleForm'
import { useSettings } from '@/lib/settings-context'
import { getActiveModules, resolveModuleLabel } from '@/lib/modules'
import { toast } from 'sonner'

export default function ConsoleUsersPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users')
  const { settings } = useSettings()

  const activeModules = useMemo(
    () => getActiveModules(settings.navigation_menu),
    [settings.navigation_menu]
  )

  // Users data
  const {
    data: users,
    loading: usersLoading,
    page,
    setPage,
    total,
    totalPages,
    search,
    setSearch,
    nextPage,
    prevPage,
    reload: reloadUsers
  } = usePaginatedFetch<UserItem>('/api/v1/users')

  // Roles data
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [rolesLoading, setRolesLoading] = useState(false)

  // Modals state
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)

  const [showRoleModal, setShowRoleModal] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null)

  const loadRoles = async () => {
    setRolesLoading(true)
    try {
      const data = await fetchRoles()
      setRoles(data || [])
    } catch {
      // toast.error('Gagal memuat daftar level/peran')
    } finally {
      setRolesLoading(false)
    }
  }

  useEffect(() => {
    loadRoles()
  }, [])

  // User Actions
  const handleAddUser = () => {
    setEditingUser(null)
    setShowUserModal(true)
  }

  const handleEditUser = (user: UserItem) => {
    setEditingUser(user)
    setShowUserModal(true)
  }

  const handleDeleteUser = async (id: string, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) return
    try {
      await deleteUser(id)
      toast.success(`User "${username}" deleted successfully.`)
      reloadUsers()
      loadRoles()
    } catch {
      toast.error(`Failed to delete user "${username}".`)
    }
  }

  // Role Actions
  const handleAddRole = () => {
    setEditingRole(null)
    setShowRoleModal(true)
  }

  const handleEditRole = (role: RoleItem) => {
    setEditingRole(role)
    setShowRoleModal(true)
  }

  const handleDeleteRole = async (role: RoleItem) => {
    if (role.is_system) {
      toast.error('Default system roles cannot be deleted.')
      return
    }
    if ((role.user_count || 0) > 0) {
      toast.error(`This role is still used by ${role.user_count} user account(s). Reassign these users before deleting this role.`)
      return
    }
    if (!confirm(`Are you sure you want to delete role "${role.name}"?`)) return
    try {
      await deleteRole(role.id)
      toast.success(`Role "${role.name}" deleted successfully.`)
      loadRoles()
    } catch (err: any) {
      toast.error(err?.message || `Failed to delete role "${role.name}".`)
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
            <Activity className="h-3.5 w-3.5 text-emerald-600" /> EPIDEMIOLOGY
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
        // Dynamic custom roles
        return (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 border border-teal-200 uppercase tracking-wide shadow-2xs">
            <Shield className="h-3.5 w-3.5 text-teal-600" /> {roleStr.toUpperCase()}
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
            <Sparkles className="h-3 w-3 text-emerald-600" /> All Modules ({activeModules.length})
          </span>
        </div>
      )
    }

    const permitted = user.permissions || []
    const moduleLabels = permitted
      .map(id => resolveModuleLabel(id, activeModules))
      .filter(Boolean)

    if (permitted.length === 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600 border border-rose-200">
          No access
        </span>
      )
    }

    return (
      <div className="flex flex-col gap-0.5 max-w-[240px]">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200 w-fit">
          <Layers className="h-3 w-3 text-slate-500" /> {permitted.length} Active Modules
        </span>
        <span className="text-[11px] text-slate-400 truncate" title={moduleLabels.join(', ')}>
          {moduleLabels.slice(0, 2).join(', ')}{moduleLabels.length > 2 ? ` +${moduleLabels.length - 2} more` : ''}
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
                Manage user accounts, custom roles & permissions, and application module access matrices.
              </p>
            </div>
          </div>
        </div>

        {/* Tab-aware Primary Action Button */}
        <div className="flex items-center gap-2">
          {activeTab === 'users' ? (
            <button
              onClick={handleAddUser}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-[#004b85] shadow-sm transition cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add User
            </button>
          ) : (
            <button
              onClick={handleAddRole}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-[#004b85] shadow-sm transition cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add New Role
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mt-6 flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('users')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'users'
              ? 'border-[#0060A9] text-[#0060A9]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UsersIcon className="h-4 w-4" />
          <span>Registered Users</span>
          <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
            activeTab === 'users' ? 'bg-blue-100 text-[#0060A9]' : 'bg-slate-100 text-slate-600'
          }`}>
            {total || users.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('roles')}
          className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'roles'
              ? 'border-[#0060A9] text-[#0060A9]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="h-4 w-4" />
          <span>Roles & Permissions</span>
          <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
            activeTab === 'roles' ? 'bg-blue-100 text-[#0060A9]' : 'bg-slate-100 text-slate-600'
          }`}>
            {roles.length}
          </span>
        </button>
      </div>

      {/* TAB 1: USERS LIST */}
      {activeTab === 'users' && (
        <div className="mt-4">
          <div className="flex gap-2">
            <div className="relative max-w-sm w-full">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <SearchInput value={search} onChange={setSearch} placeholder="Search name, username, or role..." />
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs w-full">
            {usersLoading ? (
              <div className="p-12 text-center text-slate-400 text-sm">Loading user data...</div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">No user data found.</div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/80 text-left">
                      <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Username</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Full Name</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Role (Level)</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Module Access</th>
                      <th className="px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Email</th>
                      <th className="px-5 py-3.5 text-center font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3.5 text-right font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
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
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleEditUser(u)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-[#0060A9] transition cursor-pointer"
                              title={`Edit user ${u.username}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                              title={`Delete user ${u.username}`}
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
        </div>
      )}

      {/* TAB 2: ROLES & ACCESS LEVELS MANAGEMENT */}
      {activeTab === 'roles' && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-blue-50/60 border border-blue-100 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-[#0060A9] shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Role & Access Level Management
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  You can create custom roles (e.g., <em>PROVINCIAL SURVEILLANCE</em>, <em>AUDITOR</em>) and configure the default allowed modules for each role.
                </p>
              </div>
            </div>
            <button
              onClick={handleAddRole}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#004b85] transition shrink-0 cursor-pointer shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Create New Role
            </button>
          </div>

          {rolesLoading ? (
            <div className="p-12 text-center text-slate-400 text-sm">Loading roles list...</div>
          ) : roles.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">No roles found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map((r) => {
                const isFullAccess = r.id === 'admin' || r.permissions?.includes('*')
                const perms = r.permissions || []
                const moduleLabels = perms
                  .map(id => resolveModuleLabel(id, activeModules))
                  .filter(Boolean)

                return (
                  <div
                    key={r.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-sm transition"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {renderRoleBadge(r.name || r.id)}
                            {r.is_system && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 uppercase">
                                System
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-slate-600 line-clamp-2">
                            {r.description || 'No additional description.'}
                          </p>
                        </div>
                      </div>

                      {/* Permitted Modules */}
                      <div className="mt-3.5 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          <span>Default Module Access:</span>
                          <span className="text-[#0060A9]">
                            {isFullAccess ? 'All Modules' : `${perms.length} Modules`}
                          </span>
                        </div>

                        {isFullAccess ? (
                          <div className="flex items-center gap-1.5 rounded-xl bg-purple-50 p-2.5 text-xs font-semibold text-purple-700 border border-purple-100">
                            <Sparkles className="h-4 w-4 text-purple-600 shrink-0" />
                            <span>Full Access (All Modules)</span>
                          </div>
                        ) : perms.length === 0 ? (
                          <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-400 border border-slate-100">
                            No modules selected yet
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                            {moduleLabels.map((lbl, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-medium text-[#0060A9] border border-blue-100/80"
                              >
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> {lbl}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <UsersIcon className="h-3.5 w-3.5 text-slate-400" />
                        <span>{r.user_count || 0} Users</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleEditRole(r)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#0060A9] hover:bg-blue-50 transition cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        {!r.is_system && (
                          <button
                            onClick={() => handleDeleteRole(r)}
                            disabled={(r.user_count || 0) > 0}
                            title={(r.user_count || 0) > 0 ? 'Role cannot be deleted while assigned to users' : 'Delete role'}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition disabled:opacity-40 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* USER FORM MODAL */}
      <Modal
        open={showUserModal}
        maxWidth="max-w-4xl xl:max-w-5xl"
        onClose={() => { setShowUserModal(false); setEditingUser(null) }}
        title={editingUser ? `Edit User & Access: ${editingUser.username}` : "Add New User & Permissions"}
      >
        <UserForm
          initialData={editingUser}
          onSaved={() => {
            setShowUserModal(false)
            setEditingUser(null)
            reloadUsers()
            loadRoles()
          }}
          onCancel={() => { setShowUserModal(false); setEditingUser(null) }}
          onOpenRoleModal={() => {
            setShowUserModal(false)
            setEditingRole(null)
            setShowRoleModal(true)
          }}
        />
      </Modal>

      {/* ROLE FORM MODAL */}
      <Modal
        open={showRoleModal}
        maxWidth="max-w-4xl xl:max-w-5xl"
        onClose={() => { setShowRoleModal(false); setEditingRole(null) }}
        title={editingRole ? `Edit Role: ${editingRole.name}` : "Add New Role & Permissions"}
      >
        <RoleForm
          initialData={editingRole}
          onSaved={() => {
            setShowRoleModal(false)
            setEditingRole(null)
            loadRoles()
          }}
          onCancel={() => { setShowRoleModal(false); setEditingRole(null) }}
        />
      </Modal>
    </div>
  );
}
