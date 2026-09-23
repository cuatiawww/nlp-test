'use client'

import { useState, useEffect, useMemo } from 'react'
import { createRole, updateRole, RoleItem } from '@/lib/api'
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
  Shield,
  Layers,
  Sparkles,
  CheckCircle2,
  CheckSquare,
  Square,
  Check,
  CheckCheck,
  RotateCcw
} from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  initialData?: RoleItem | null
  onSaved: () => void
  onCancel: () => void
}

export default function RoleForm({ initialData, onSaved, onCancel }: Props) {
  const isEditing = Boolean(initialData)
  const isSystem = Boolean(initialData?.is_system)
  const { settings } = useSettings()

  // Get unified active modules & categories dynamically from current navigation config
  const activeModules = useMemo(
    () => getActiveModules(settings.navigation_menu),
    [settings.navigation_menu]
  )
  const categories = useMemo(
    () => getActiveCategories(activeModules),
    [activeModules]
  )

  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [permissions, setPermissions] = useState<string[]>(() => {
    if (initialData?.permissions) {
      if (initialData.permissions.includes('*')) {
        return activeModules.map(m => m.id)
      }
      return initialData.permissions
    }
    return []
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '')
      setDescription(initialData.description || '')
      if (initialData.permissions?.includes('*')) {
        setPermissions(activeModules.map(m => m.id))
      } else {
        setPermissions(initialData.permissions || [])
      }
    } else {
      setName('')
      setDescription('')
      setPermissions([])
    }
  }, [initialData, activeModules])

  const toggleModule = (mod: ActiveModule) => {
    if (initialData?.id === 'admin') return // Admin always full access

    const currentlyPermitted = isModulePermitted(mod, permissions)
    if (currentlyPermitted) {
      // Remove mod.id, mod.path, and any aliases/sub-items
      const removeSet = new Set<string>([mod.id, mod.path, ...mod.aliases])
      if (mod.subItems) {
        for (const sub of mod.subItems) {
          removeSet.add(sub.id)
          removeSet.add(sub.path)
          sub.aliases.forEach(a => removeSet.add(a))
        }
      }
      setPermissions(prev => prev.filter(p => !removeSet.has(p)))
    } else {
      // Add mod.id
      setPermissions(prev => [...prev, mod.id])
    }
  }

  const selectAll = () => {
    if (initialData?.id === 'admin') return
    setPermissions(activeModules.map(m => m.id))
  }

  const clearAll = () => {
    if (initialData?.id === 'admin') return
    setPermissions([])
  }

  const selectCategory = (categoryMods: ActiveModule[]) => {
    if (initialData?.id === 'admin') return
    const idsToAdd = categoryMods.map(m => m.id)
    setPermissions(prev => Array.from(new Set([...prev, ...idsToAdd])))
  }

  const clearCategory = (categoryMods: ActiveModule[]) => {
    if (initialData?.id === 'admin') return
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
    setPermissions(prev => prev.filter(p => !removeSet.has(p)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Role name cannot be empty.')
      return
    }

    if (initialData?.id !== 'admin' && permissions.length === 0) {
      toast.error('Select at least 1 module permission for this role.')
      return
    }

    setSaving(true)
    try {
      const finalPermissions = initialData?.id === 'admin' ? ['*'] : permissions

      if (isEditing && initialData) {
        await updateRole(initialData.id, {
          name: name.trim().toUpperCase(),
          description: description.trim(),
          permissions: finalPermissions,
        })
        toast.success(`Role "${name}" updated successfully!`)
      } else {
        await createRole({
          name: name.trim().toUpperCase(),
          description: description.trim(),
          permissions: finalPermissions,
        })
        toast.success(`Role "${name}" created successfully!`)
      }
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save role.')
    } finally {
      setSaving(false)
    }
  }

  const permittedActiveCount = activeModules.filter(m => isModulePermitted(m, permissions)).length

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pt-1">
      {/* SECTION 1: Role Information (Name & Description) */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5">
          <Shield className="h-4 w-4 text-[#0060A9]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Role & Access Level Identity
          </h3>
          {isSystem && (
            <span className="ml-auto rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase tracking-wide">
              Default System Role
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
              <span>Role Name</span>
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              disabled={isSystem}
              placeholder="e.g. REGIONAL SURVEILLANCE"
              className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm font-semibold uppercase transition ${
                isSystem
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500 shadow-inner'
                  : 'border-slate-200 bg-white text-slate-900 focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20'
              }`}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {isSystem
                ? 'Default system role names cannot be renamed to preserve system compatibility.'
                : 'Use a clear name such as REGIONAL SURVEILLANCE or AUDITOR.'}
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-600">
              <span>Description & Access Purpose</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Monitoring access for provincial surveillance operations"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-[#0060A9] focus:outline-none focus:ring-2 focus:ring-[#0060A9]/20"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Brief description of duties and access permissions for this role.
            </p>
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
                  Active Module Permissions Matrix
                </h3>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  Dynamic Real-time
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Select which active application modules and navigation items are permitted for this role.
              </p>
            </div>
          </div>

          {initialData?.id === 'admin' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-800 border border-purple-200 shadow-2xs">
              <Sparkles className="h-3.5 w-3.5 text-purple-600" />
              Full Access (All Modules)
            </span>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={selectAll}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0060A9] hover:bg-blue-50 px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                <Check className="h-3 w-3" /> Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-bold text-slate-500 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                Clear All
              </button>
              <span className="ml-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-black text-[#0060A9] border border-blue-200">
                {permittedActiveCount} / {activeModules.length} modules selected
              </span>
            </div>
          )}
        </div>

        {initialData?.id === 'admin' ? (
          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 text-xs text-purple-900 leading-relaxed flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Unlimited Full Access</p>
              <p className="mt-0.5 text-purple-700 text-[11.5px]">
                The <strong>ADMIN</strong> role always has full access to all system modules and configuration tools.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map(cat => {
              const CategoryIcon = MENU_ICON_MAP[cat.iconName] || Layers
              const allCatPermitted = cat.modules.every(m => isModulePermitted(m, permissions))
              const someCatPermitted = cat.modules.some(m => isModulePermitted(m, permissions))

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
                      const isChecked = isModulePermitted(mod, permissions)
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

                            {/* Path Badge & Description */}
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
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
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
            <span>Create New Role</span>
          )}
        </button>
      </div>
    </form>
  )
}
