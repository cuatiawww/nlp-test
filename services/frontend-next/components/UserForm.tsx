'use client'

import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useState, useEffect, useMemo } from 'react'
import { createUser, updateUser, fetchRoles, RoleItem } from '@/lib/api'
import { useSettings } from '@/lib/settings-context'
import {
  getActiveModules,
  getActiveCategories,
  isModulePermitted,
  ActiveModule,
  ActiveModuleCategory
} from '@/lib/modules'
import { resolveMenuIcon, MENU_ICON_MAP } from '@/lib/menu'
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
  RotateCcw,
  Check
} from 'lucide-react'
import { toast } from 'sonner'
import { ROLE_PRESET_MODULES } from '@/lib/auth'

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
  { id: 'admin', label: 'ADMIN', desc: 'Full access to all modules and configurations' },
  { id: 'data_analyst', label: 'DATA ANALYST', desc: 'Access to data analysis, events, and reports' },
  { id: 'epidemiologi', label: 'EPIDEMIOLOGY', desc: 'Disease surveillance, outbreak rules, and geospatial data' },
  { id: 'executive', label: 'EXECUTIVE', desc: 'Executive summary, TV command center, and matrix' },
  { id: 'skk', label: 'SKK', desc: 'Data source feed monitoring and processing' },
]

export default function UserForm({ initialData, onSaved, onCancel, onOpenRoleModal }: Props) {
  const [availableRoles, setAvailableRoles] = useState<Array<{ id: string; label: string; desc: string; permissions?: string[] }>>(USER_ROLES)
  const { t } = useTranslation()
  const { settings } = useSettings()
  const isEditing = Boolean(initialData)

  // Dynamically derive active modules and categories from active navigation config
  const activeModules = useMemo(
    () => getActiveModules(settings.navigation_menu),
    [settings.navigation_menu]
  )
  const categories = useMemo(
    () => getActiveCategories(activeModules),
    [activeModules]
  )

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
        return activeModules.map(m => m.id)
      }
      return initialData.permissions
    }
    const defaultRole = initialData?.role?.toLowerCase() || 'data_analyst'
    if (defaultRole === 'admin') {
      return activeModules.map(m => m.id)
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
            desc: r.description || 'User Role',
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
          setSelectedModules(activeModules.map(m => m.id))
        } else {
          setSelectedModules(initialData.permissions)
        }
      } else if (r === 'admin') {
        setSelectedModules(activeModules.map(m => m.id))
      } else {
        setSelectedModules(ROLE_PRESET_MODULES[r] || [])
      }
    }
  }, [initialData, activeModules])

  // Handle role switch & automatically adapt preset
  const handleRoleChange = (newRole: string) => {
    setRole(newRole)
    if (newRole === 'admin') {
      setSelectedModules(activeModules.map(m => m.id))
    } else {
      const foundRole = availableRoles.find(r => r.id === newRole)
      if (foundRole?.permissions && foundRole.permissions.length > 0) {
        if (foundRole.permissions.includes('*')) {
          setSelectedModules(activeModules.map(m => m.id))
        } else {
          setSelectedModules(foundRole.permissions)
        }
      } else {
        const preset = ROLE_PRESET_MODULES[newRole] || []
        setSelectedModules(preset)
      }
    }
  }

  const toggleModule = (mod: ActiveModule) => {
    if (role === 'admin') return // Admin always has full access

    const currentlyPermitted = isModulePermitted(mod, selectedModules)
    if (currentlyPermitted) {
      const removeSet = new Set<string>([mod.id, mod.path, ...mod.aliases])
      if (mod.subItems) {
        for (const sub of mod.subItems) {
          removeSet.add(sub.id)
          removeSet.add(sub.path)
          sub.aliases.forEach(a => removeSet.add(a))
        }
      }
      setSelectedModules(prev => prev.filter(id => !removeSet.has(id)))
    } else {
      setSelectedModules(prev => [...prev, mod.id])
    }
  }

  const selectAllModules = () => {
    if (role === 'admin') return
    setSelectedModules(activeModules.map(m => m.id))
  }

  const clearAllModules = () => {
    if (role === 'admin') return
    setSelectedModules([])
  }

  const selectCategory = (categoryMods: ActiveModule[]) => {
    if (role === 'admin') return
    const idsToAdd = categoryMods.map(m => m.id)
    setSelectedModules(prev => Array.from(new Set([...prev, ...idsToAdd])))
  }

  const clearCategory = (categoryMods: ActiveModule[]) => {
    if (role === 'admin') return
    const removeSet = new Set<string>()
    for (const m of categoryMods) {
      removeSet.add(m.id)
      removeSet.add(m.path)
      m.aliases.forEach(a => removeSet.add(a))
      if (m.subItems) {
        for (const s of m.subItems) {
          removeSet.add(s.id)
          removeSet.add(s.path)
          s.aliases.forEach(a => removeSet.add(a))
        }
      }
    }
    setSelectedModules(prev => prev.filter(p => !removeSet.has(p)))
  }

  const resetToRolePreset = () => {
    if (role === 'admin') {
      setSelectedModules(activeModules.map(m => m.id))
    } else {
      const foundRole = availableRoles.find(r => r.id === role)
      if (foundRole?.permissions && foundRole.permissions.length > 0) {
        if (foundRole.permissions.includes('*')) {
          setSelectedModules(activeModules.map(m => m.id))
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
      toast.error('Username cannot be empty.')
      return
    }

    if (!isEditing && !password.trim()) {
      toast.error('Password is required for new users.')
      return
    }

    if (password && password.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }

    if (role !== 'admin' && selectedModules.length === 0) {
      toast.error('Select at least 1 module permission for this user.')
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
        toast.success(`User "${initialData.username}" updated successfully!`)
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
        toast.success(`User "${username}" created successfully!`)
      }
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || (isEditing ? 'Failed to update user account.' : 'Failed to create user account.'))
    } finally {
      setSaving(false)
    }
  }

  const permittedActiveCount = activeModules.filter(m => isModulePermitted(m, selectedModules)).length

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-1">
      {/* SECTION 1: Account Information (2 Responsive Columns) */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-200/80 pb-2.5">
          <UserIcon className="h-4 w-4 text-[#0060A9]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            User Account Information
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Username */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                <span>{t('users.colUsername') || 'Username'}</span>
                {!isEditing && <span className="text-rose-500">*</span>}
                {isEditing && (
                  <span className="ml-auto text-[11px] font-normal lowercase tracking-normal text-slate-400">
                    (cannot be changed)
                  </span>
                )}
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                disabled={isEditing}
                placeholder="e.g. joko_analyst"
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
                  <span>{isEditing ? 'Change Password' : 'Password'}</span>
                  {!isEditing && <span className="text-rose-500">*</span>}
                </label>
                {isEditing && (
                  <span className="text-[11px] text-slate-400 font-normal">
                    Leave blank to keep current
                  </span>
                )}
              </div>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required={!isEditing}
                  placeholder={isEditing ? 'Enter new password to change...' : 'Minimum 6 characters'}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                <span>{t('users.colDisplayName') || 'Full Name'}</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. Joko Susanto, M.Epid"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Email */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                <span>{t('users.colEmail') || 'Email Address'}</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. joko@kemkes.go.id"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
              />
            </div>

            {/* Role / Level */}
            <div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
                  <Shield className="h-3.5 w-3.5 text-[#0060A9]" />
                  <span>{t('users.colRole') || 'User Role (Level)'}</span>
                  <span className="text-rose-500">*</span>
                </label>
                {onOpenRoleModal && (
                  <button
                    type="button"
                    onClick={onOpenRoleModal}
                    className="text-[11px] font-semibold text-[#0060A9] hover:underline cursor-pointer"
                  >
                    + Manage Roles
                  </button>
                )}
              </div>
              <select
                value={role}
                onChange={e => handleRoleChange(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold uppercase text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20 cursor-pointer"
              >
                {availableRoles.map(r => (
                  <option key={r.id} value={r.id.toLowerCase()}>
                    {r.label} — {r.desc}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">
                Choosing a role automatically presets recommended module permissions below.
              </p>
            </div>

            {/* Account Status Switch */}
            <div className="pt-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600 mb-2">
                <span>Account Status</span>
              </label>
              <div
                onClick={() => setIsActive(!isActive)}
                className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer select-none ${
                  isActive ? 'bg-emerald-50/70 border-emerald-200' : 'bg-rose-50/70 border-rose-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <div>
                    <p className={`text-xs font-bold ${isActive ? 'text-emerald-900' : 'text-rose-900'}`}>
                      {isActive ? 'Account Active' : 'Account Inactive / Disabled'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isActive ? 'User can log in and access allowed modules.' : 'User login is temporarily blocked.'}
                    </p>
                  </div>
                </div>
                <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  isActive ? 'bg-emerald-600' : 'bg-slate-300'
                }`}>
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isActive ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Active Module Permissions Matrix */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0060A9]/10 text-[#0060A9]">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Application Module Access Permissions
                </h3>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  Dynamic Active Modules
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Grant or restrict access to specific active modules for this user account.
              </p>
            </div>
          </div>

          {role === 'admin' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-800 border border-purple-200 shadow-2xs">
              <Sparkles className="h-3.5 w-3.5 text-purple-600" />
              Full Access (All Modules)
            </span>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={selectAllModules}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0060A9] hover:bg-blue-50 px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                <Check className="h-3 w-3" /> Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearAllModules}
                className="text-xs font-bold text-slate-500 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                Clear All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={resetToRolePreset}
                className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition cursor-pointer"
                title="Reset modules to role default preset"
              >
                <RotateCcw className="h-3 w-3" /> Role Preset
              </button>
              <span className="ml-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-black text-[#0060A9] border border-blue-200">
                {permittedActiveCount} / {activeModules.length} selected
              </span>
            </div>
          )}
        </div>

        {role === 'admin' ? (
          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 text-xs text-purple-900 leading-relaxed flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Unlimited Full Access</p>
              <p className="mt-0.5 text-purple-700 text-[11.5px]">
                Users with the <strong>ADMIN</strong> role automatically have full access to all system modules and management features.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map(cat => {
              const CategoryIcon = MENU_ICON_MAP[cat.iconName] || Layers

              return (
                <div key={cat.name} className="space-y-2.5 rounded-xl bg-white p-3.5 border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-50 text-[#0060A9]">
                        <CategoryIcon className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                        {cat.name}
                      </span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-500">
                        {cat.modules.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => selectCategory(cat.modules)}
                        className="font-semibold text-[#0060A9] hover:underline cursor-pointer"
                      >
                        All
                      </button>
                      <span className="text-slate-300">/</span>
                      <button
                        type="button"
                        onClick={() => clearCategory(cat.modules)}
                        className="font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        None
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                    {cat.modules.map(mod => {
                      const isChecked = isModulePermitted(mod, selectedModules)
                      const ModIcon = resolveMenuIcon(mod.icon)

                      return (
                        <div
                          key={mod.id}
                          onClick={() => toggleModule(mod)}
                          className={`flex flex-col justify-between p-3 rounded-xl border transition cursor-pointer select-none ${
                            isChecked
                              ? 'bg-blue-50/70 border-blue-300 shadow-2xs ring-1 ring-blue-300/50'
                              : 'bg-white border-slate-200 hover:bg-slate-50/80 hover:border-slate-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                                  isChecked ? 'bg-[#0060A9] text-white' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  <ModIcon className="h-3.5 w-3.5" />
                                </div>
                                <p className={`text-xs font-bold truncate ${isChecked ? 'text-[#0060A9]' : 'text-slate-800'}`}>
                                  {mod.label}
                                </p>
                              </div>

                              <div className="shrink-0 text-[#0060A9] mt-0.5">
                                {isChecked ? (
                                  <CheckSquare className="h-4.5 w-4.5 text-[#0060A9]" />
                                ) : (
                                  <Square className="h-4.5 w-4.5 text-slate-300" />
                                )}
                              </div>
                            </div>

                            {/* Path Badge */}
                            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                              {mod.path && (
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/60 truncate max-w-full">
                                  {mod.path}
                                </span>
                              )}
                            </div>

                            {mod.description && (
                              <p className="text-[11px] text-slate-500 leading-snug mt-1.5 line-clamp-2">
                                {mod.description}
                              </p>
                            )}

                            {/* Sub-modules listing if present */}
                            {mod.subItems && mod.subItems.length > 0 && (
                              <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                  Includes {mod.subItems.length} Sub-Modul:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {mod.subItems.map(sub => (
                                    <span
                                      key={sub.id}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-slate-100 text-slate-700 border border-slate-200/80"
                                    >
                                      <span className="h-1 w-1 rounded-full bg-[#0060A9]" />
                                      {sub.label}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
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
          {t('common.cancel') || 'Cancel'}
        </button>
        <button
          type="submit"
          disabled={saving || !username.trim() || (!isEditing && !password.trim())}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#004b85] shadow-sm transition disabled:opacity-50 cursor-pointer"
        >
          {saving ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              <span>Saving...</span>
            </>
          ) : isEditing ? (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>Save Changes</span>
            </>
          ) : (
            <span>Add User</span>
          )}
        </button>
      </div>
    </form>
  )
}
