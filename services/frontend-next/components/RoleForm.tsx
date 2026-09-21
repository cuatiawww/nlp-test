'use client'

import { useState, useEffect } from 'react'
import { createRole, updateRole, RoleItem } from '@/lib/api'
import { SYSTEM_MODULES, SystemModule } from '@/lib/auth'
import {
  Shield,
  Layers,
  Sparkles,
  CheckCircle2,
  CheckSquare,
  Square,
  Activity,
  Sliders,
  Settings2,
  Check
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

  const [name, setName] = useState(initialData?.name || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [permissions, setPermissions] = useState<string[]>(() => {
    if (initialData?.permissions) {
      if (initialData.permissions.includes('*')) {
        return SYSTEM_MODULES.map(m => m.id)
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
        setPermissions(SYSTEM_MODULES.map(m => m.id))
      } else {
        setPermissions(initialData.permissions || [])
      }
    } else {
      setName('')
      setDescription('')
      setPermissions([])
    }
  }, [initialData])

  const toggleModule = (moduleId: string) => {
    if (initialData?.id === 'admin') return // Admin always full access
    setPermissions(prev =>
      prev.includes(moduleId)
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    )
  }

  const selectAll = () => {
    if (initialData?.id === 'admin') return
    setPermissions(SYSTEM_MODULES.map(m => m.id))
  }

  const clearAll = () => {
    if (initialData?.id === 'admin') return
    setPermissions([])
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

      {/* SECTION 2: Default Module Permissions */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0060A9]/10 text-[#0060A9]">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Default Module Permissions for this Role
              </h3>
              <p className="text-[11px] text-slate-500">
                Users assigned to this role will automatically receive default access to the selected modules below.
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
                {permissions.length} / {SYSTEM_MODULES.length} selected
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
                The <strong>ADMIN</strong> role always has full access to all system modules.
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {cat.modules.map(mod => {
                    const isChecked = permissions.includes(mod.id)
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
