'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  CheckCircle2,
  FolderTree,
  ListFilter,
  Search,
  Layers,
  Folder,
  Circle,
  Tv,
  AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'
import {
  SidebarGroupConfig,
  SidebarItemConfig,
  SidebarSubItemConfig,
  DEFAULT_NAVIGATION_CONFIG,
  MENU_ICON_MAP,
  resolveMenuIcon
} from '@/lib/menu'
import { useSettings } from '@/lib/settings-context'
import Modal from '@/components/Modal'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

export default function ConfigurationModulPage() {
  const { settings, refetch, updateSettings } = useSettings()

  // Main navigation configuration state
  const [config, setConfig] = useState<SidebarGroupConfig[]>([])
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'structure' | 'groups' | 'modules' | 'preview'>('structure')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL')

  // Expanded nodes in structure tree
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    grp_monitoring: true,
    grp_configuration: true,
    grp_documentation: true,
  })
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    mod_analyze: true,
    mod_reports: true,
    mod_nlp: true,
  })

  // Modal States
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<SidebarGroupConfig | null>(null)
  const [groupForm, setGroupForm] = useState<{ title: string; titleKey?: string; enabled: boolean }>({
    title: '',
    titleKey: '',
    enabled: true,
  })

  const [moduleModalOpen, setModuleModalOpen] = useState(false)
  const [editingModule, setEditingModule] = useState<{ groupId: string; module: SidebarItemConfig } | null>(null)
  const [moduleForm, setModuleForm] = useState<{
    groupId: string
    label: string
    labelKey?: string
    href: string
    icon: string
    badge: string
    enabled: boolean
  }>({
    groupId: '',
    label: '',
    labelKey: '',
    href: '',
    icon: 'Folder',
    badge: '',
    enabled: true,
  })

  const [subModalOpen, setSubModalOpen] = useState(false)
  const [editingSub, setEditingSub] = useState<{ groupId: string; moduleId: string; sub: SidebarSubItemConfig } | null>(null)
  const [subForm, setSubForm] = useState<{
    groupId: string
    moduleId: string
    label: string
    href: string
    icon: string
    badge: string
    enabled: boolean
  }>({
    groupId: '',
    moduleId: '',
    label: '',
    href: '',
    icon: 'Circle',
    badge: '',
    enabled: true,
  })

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  // Initialize from settings or fallback
  useEffect(() => {
    if (settings.navigation_menu && Array.isArray(settings.navigation_menu) && settings.navigation_menu.length > 0) {
      setConfig(JSON.parse(JSON.stringify(settings.navigation_menu)))
    } else {
      setConfig(JSON.parse(JSON.stringify(DEFAULT_NAVIGATION_CONFIG)))
    }
  }, [settings.navigation_menu])

  // Count metrics
  const stats = useMemo(() => {
    const groupCount = config.length
    let moduleCount = 0
    let subModuleCount = 0
    let enabledModules = 0

    config.forEach((grp) => {
      if (Array.isArray(grp.items)) {
        grp.items.forEach((m) => {
          moduleCount++
          if (m.enabled && grp.enabled) enabledModules++
          if (m.subItems && Array.isArray(m.subItems)) {
            subModuleCount += m.subItems.length
          }
        })
      }
    })

    return { groupCount, moduleCount, subModuleCount, enabledModules }
  }, [config])

  const toggleGroupExpand = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleModuleExpand = (id: string) => {
    setExpandedModules((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // --- REORDERING HELPERS ---
  const moveGroup = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= config.length) return
    const updated = [...config]
    const temp = updated[index]
    updated[index] = updated[targetIdx]
    updated[targetIdx] = temp
    updated.forEach((g, i) => (g.order = i + 1))
    setConfig(updated)
  }

  const moveModule = (groupId: string, index: number, direction: 'up' | 'down') => {
    const updated = [...config]
    const group = updated.find((g) => g.id === groupId)
    if (!group || !Array.isArray(group.items)) return
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= group.items.length) return
    const temp = group.items[index]
    group.items[index] = group.items[targetIdx]
    group.items[targetIdx] = temp
    group.items.forEach((m, i) => (m.order = i + 1))
    setConfig(updated)
  }

  const moveSubModule = (groupId: string, moduleId: string, index: number, direction: 'up' | 'down') => {
    const updated = [...config]
    const group = updated.find((g) => g.id === groupId)
    if (!group || !Array.isArray(group.items)) return
    const module = group.items.find((m) => m.id === moduleId)
    if (!module || !module.subItems || !Array.isArray(module.subItems)) return
    const targetIdx = direction === 'up' ? index - 1 : index + 1
    if (targetIdx < 0 || targetIdx >= module.subItems.length) return
    const temp = module.subItems[index]
    module.subItems[index] = module.subItems[targetIdx]
    module.subItems[targetIdx] = temp
    module.subItems.forEach((s, i) => (s.order = i + 1))
    setConfig(updated)
  }

  // --- TOGGLE VISIBILITY ---
  const toggleGroupVisibility = (groupId: string) => {
    setConfig((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, enabled: !g.enabled } : g))
    )
  }

  const toggleModuleVisibility = (groupId: string, moduleId: string) => {
    setConfig((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        return {
          ...g,
          items: g.items.map((m) => (m.id === moduleId ? { ...m, enabled: !m.enabled } : m)),
        }
      })
    )
  }

  const toggleSubModuleVisibility = (groupId: string, moduleId: string, subId: string) => {
    setConfig((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        return {
          ...g,
          items: g.items.map((m) => {
            if (m.id !== moduleId || !m.subItems) return m
            return {
              ...m,
              subItems: m.subItems.map((s) => (s.id === subId ? { ...s, enabled: !s.enabled } : s)),
            }
          }),
        }
      })
    )
  }

  // --- DELETE HANDLERS ---
  const handleDeleteGroup = (groupId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete navigation group "${title}" and all its modules?`)) return
    setConfig((prev) => prev.filter((g) => g.id !== groupId))
    toast.success(`Navigation group "${title}" deleted.`)
  }

  const handleDeleteModule = (groupId: string, moduleId: string, label: string) => {
    if (!confirm(`Are you sure you want to delete module "${label}"?`)) return
    setConfig((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        return { ...g, items: g.items.filter((m) => m.id !== moduleId) }
      })
    )
    toast.success(`Module "${label}" deleted.`)
  }

  const handleDeleteSubModule = (groupId: string, moduleId: string, subId: string, label: string) => {
    if (!confirm(`Are you sure you want to delete sub-module "${label}"?`)) return
    setConfig((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g
        return {
          ...g,
          items: g.items.map((m) => {
            if (m.id !== moduleId || !m.subItems) return m
            return { ...m, subItems: m.subItems.filter((s) => s.id !== subId) }
          }),
        }
      })
    )
    toast.success(`Sub-module "${label}" deleted.`)
  }

  // --- SAVE TO BACKEND ---
  const handleSave = async () => {
    setSaving(true)
    try {
      const token = localStorage.getItem('auth_token')
      const payloadConfigData = {
        ...settings,
        navigation_menu: config,
      }

      const res = await fetch('/nlp/api/v1/console/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ config_data: payloadConfigData }),
      })

      const json = await res.json()
      if (json.success) {
        toast.success('Module and sidebar navigation structure saved successfully!')
        updateSettings({ navigation_menu: config })
        refetch()
      } else {
        toast.error(json.error || 'Failed to save module configuration.')
      }
    } catch {
      toast.error('Network error while saving configuration.')
    } finally {
      setSaving(false)
    }
  }

  // --- RESET TO DEFAULT ---
  const handleResetToDefault = () => {
    const defaultData = JSON.parse(JSON.stringify(DEFAULT_NAVIGATION_CONFIG))
    setConfig(defaultData)
    setResetConfirmOpen(false)
    toast.info('Navigation configuration reset to system defaults. Click "Save Changes" to apply to server.')
  }

  // --- MODAL SUBMIT HANDLERS ---
  const handleOpenAddGroup = () => {
    setEditingGroup(null)
    setGroupForm({ title: '', titleKey: '', enabled: true })
    setGroupModalOpen(true)
  }

  const handleOpenEditGroup = (group: SidebarGroupConfig) => {
    setEditingGroup(group)
    setGroupForm({
      title: group.title,
      titleKey: group.titleKey || '',
      enabled: group.enabled,
    })
    setGroupModalOpen(true)
  }

  const handleSaveGroup = (e: React.FormEvent) => {
    e.preventDefault()
    if (!groupForm.title.trim()) {
      toast.error('Navigation group title cannot be empty.')
      return
    }

    if (editingGroup) {
      setConfig((prev) =>
        prev.map((g) =>
          g.id === editingGroup.id
            ? {
                ...g,
                title: groupForm.title.trim().toUpperCase(),
                titleKey: groupForm.titleKey?.trim() || undefined,
                enabled: groupForm.enabled,
              }
            : g
        )
      )
      toast.success(`Navigation group "${groupForm.title}" updated successfully.`)
    } else {
      const newGroup: SidebarGroupConfig = {
        id: `grp_${Date.now()}`,
        title: groupForm.title.trim().toUpperCase(),
        titleKey: groupForm.titleKey?.trim() || undefined,
        order: config.length + 1,
        enabled: groupForm.enabled,
        items: [],
      }
      setConfig((prev) => [...prev, newGroup])
      toast.success(`Navigation group "${newGroup.title}" added successfully.`)
    }
    setGroupModalOpen(false)
  }

  const handleOpenAddModule = (defaultGroupId?: string) => {
    setEditingModule(null)
    setModuleForm({
      groupId: defaultGroupId || config[0]?.id || '',
      label: '',
      labelKey: '',
      href: '',
      icon: 'Folder',
      badge: '',
      enabled: true,
    })
    setModuleModalOpen(true)
  }

  const handleOpenEditModule = (groupId: string, module: SidebarItemConfig) => {
    setEditingModule({ groupId, module })
    setModuleForm({
      groupId,
      label: module.label,
      labelKey: module.labelKey || '',
      href: module.href || '',
      icon: module.icon || 'Folder',
      badge: module.badge || '',
      enabled: module.enabled,
    })
    setModuleModalOpen(true)
  }

  const handleSaveModule = (e: React.FormEvent) => {
    e.preventDefault()
    if (!moduleForm.label.trim()) {
      toast.error('Module name cannot be empty.')
      return
    }
    if (!moduleForm.groupId) {
      toast.error('Please select a navigation group for this module.')
      return
    }

    if (editingModule) {
      setConfig((prev) => {
        if (editingModule.groupId === moduleForm.groupId) {
          return prev.map((g) => {
            if (g.id !== moduleForm.groupId) return g
            return {
              ...g,
              items: g.items.map((m) =>
                m.id === editingModule.module.id
                  ? {
                      ...m,
                      label: moduleForm.label.trim(),
                      labelKey: moduleForm.labelKey?.trim() || undefined,
                      href: moduleForm.href.trim(),
                      icon: moduleForm.icon,
                      badge: moduleForm.badge?.trim() || undefined,
                      enabled: moduleForm.enabled,
                    }
                  : m
              ),
            }
          })
        } else {
          // Moved to another group
          const targetModule: SidebarItemConfig = {
            ...editingModule.module,
            label: moduleForm.label.trim(),
            labelKey: moduleForm.labelKey?.trim() || undefined,
            href: moduleForm.href.trim(),
            icon: moduleForm.icon,
            badge: moduleForm.badge?.trim() || undefined,
            enabled: moduleForm.enabled,
          }
          return prev.map((g) => {
            if (g.id === editingModule.groupId) {
              return { ...g, items: g.items.filter((m) => m.id !== editingModule.module.id) }
            }
            if (g.id === moduleForm.groupId) {
              return { ...g, items: [...g.items, targetModule] }
            }
            return g
          })
        }
      })
      toast.success(`Module "${moduleForm.label}" updated successfully.`)
    } else {
      const newModule: SidebarItemConfig = {
        id: `mod_${Date.now()}`,
        label: moduleForm.label.trim(),
        labelKey: moduleForm.labelKey?.trim() || undefined,
        href: moduleForm.href.trim(),
        icon: moduleForm.icon,
        badge: moduleForm.badge?.trim() || undefined,
        enabled: moduleForm.enabled,
        order: (config.find((g) => g.id === moduleForm.groupId)?.items.length || 0) + 1,
        subItems: [],
      }
      setConfig((prev) =>
        prev.map((g) => {
          if (g.id !== moduleForm.groupId) return g
          return { ...g, items: [...g.items, newModule] }
        })
      )
      toast.success(`Module "${newModule.label}" added successfully.`)
    }
    setModuleModalOpen(false)
  }

  const handleOpenAddSubModule = (groupId: string, moduleId: string) => {
    setEditingSub(null)
    setSubForm({
      groupId,
      moduleId,
      label: '',
      href: '',
      icon: 'Circle',
      badge: '',
      enabled: true,
    })
    setSubModalOpen(true)
  }

  const handleOpenEditSubModule = (groupId: string, moduleId: string, sub: SidebarSubItemConfig) => {
    setEditingSub({ groupId, moduleId, sub })
    setSubForm({
      groupId,
      moduleId,
      label: sub.label,
      href: sub.href || '',
      icon: sub.icon || 'Circle',
      badge: sub.badge || '',
      enabled: sub.enabled,
    })
    setSubModalOpen(true)
  }

  const handleSaveSubModule = (e: React.FormEvent) => {
    e.preventDefault()
    if (!subForm.label.trim()) {
      toast.error('Sub-module name cannot be empty.')
      return
    }

    if (editingSub) {
      setConfig((prev) =>
        prev.map((g) => {
          if (g.id !== subForm.groupId) return g
          return {
            ...g,
            items: g.items.map((m) => {
              if (m.id !== subForm.moduleId || !m.subItems) return m
              return {
                ...m,
                subItems: m.subItems.map((s) =>
                  s.id === editingSub.sub.id
                    ? {
                        ...s,
                        label: subForm.label.trim(),
                        href: subForm.href.trim(),
                        icon: subForm.icon,
                        badge: subForm.badge?.trim() || undefined,
                        enabled: subForm.enabled,
                      }
                    : s
                ),
              }
            }),
          }
        })
      )
      toast.success(`Sub-module "${subForm.label}" updated successfully.`)
    } else {
      const newSub: SidebarSubItemConfig = {
        id: `sub_${Date.now()}`,
        label: subForm.label.trim(),
        href: subForm.href.trim(),
        icon: subForm.icon,
        badge: subForm.badge?.trim() || undefined,
        enabled: subForm.enabled,
        order: 1,
      }
      setConfig((prev) =>
        prev.map((g) => {
          if (g.id !== subForm.groupId) return g
          return {
            ...g,
            items: g.items.map((m) => {
              if (m.id !== subForm.moduleId) return m
              const existing = m.subItems || []
              newSub.order = existing.length + 1
              return { ...m, subItems: [...existing, newSub] }
            }),
          }
        })
      )
      toast.success(`Sub-module "${newSub.label}" added successfully.`)
    }
    setSubModalOpen(false)
  }

  // Filtered modules for table view
  const flatModules = useMemo(() => {
    const list: { group: SidebarGroupConfig; module: SidebarItemConfig }[] = []
    config.forEach((g) => {
      if (selectedGroupFilter !== 'ALL' && g.id !== selectedGroupFilter) return
      if (Array.isArray(g.items)) {
        g.items.forEach((m) => {
          if (
            searchQuery &&
            !m.label.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !m.href?.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !g.title.toLowerCase().includes(searchQuery.toLowerCase())
          ) {
            return
          }
          list.push({ group: g, module: m })
        })
      }
    })
    return list
  }, [config, selectedGroupFilter, searchQuery])

  return (
    <div className="w-full px-4 md:px-8 py-2 md:py-4">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
              Module & Navigation Configuration
            </h1>
            <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-[#0060A9]">
              SIDEBAR CMS
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Configure the hierarchical structure of navigation groups, modules, and sub-modules displayed in the application sidebar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setResetConfirmOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-sm cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" /> Reset Default
          </button>

          <button
            type="button"
            onClick={handleOpenAddGroup}
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-sm font-bold text-[#0060A9] hover:bg-blue-100/70 transition shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Navigation
          </button>

          <button
            type="button"
            onClick={() => handleOpenAddModule()}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Module
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#004b85] transition disabled:opacity-50 cursor-pointer"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#0060A9]">
            <FolderTree className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Navigation Groups</p>
            <p className="text-2xl font-black text-slate-900">{stats.groupCount}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Modules</p>
            <p className="text-2xl font-black text-slate-900">{stats.moduleCount}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <ListFilter className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sub-Modules</p>
            <p className="text-2xl font-black text-slate-900">{stats.subModuleCount}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <Eye className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active in Sidebar</p>
            <p className="text-2xl font-black text-slate-900">{stats.enabledModules}</p>
          </div>
        </div>
      </div>

      {/* Tabs Selection */}
      <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('structure')}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'structure'
              ? 'bg-[#0060A9] text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <FolderTree className="h-4 w-4" />
          Hierarchy Structure (Tree View)
        </button>

        <button
          onClick={() => setActiveTab('groups')}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'groups'
              ? 'bg-[#0060A9] text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Folder className="h-4 w-4" />
          Navigation Groups ({config.length})
        </button>

        <button
          onClick={() => setActiveTab('modules')}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'modules'
              ? 'bg-[#0060A9] text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          Modules & Sub-Modules Table
        </button>

        <button
          onClick={() => setActiveTab('preview')}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'preview'
              ? 'bg-[#0060A9] text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Tv className="h-4 w-4" />
          Live Sidebar Preview
        </button>
      </div>

      {/* TAB 1: HIERARCHY STRUCTURE (TREE VIEW) */}
      {activeTab === 'structure' && (
        <div className="mt-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              💡 Use arrow buttons <span className="font-bold">↑ / ↓</span> to reorder items, eye toggle <span className="font-bold">👁</span> to show/hide in the sidebar, and <span className="font-bold">+ Sub</span> to add child modules.
            </p>
          </div>

          {config.map((group, groupIdx) => {
            const isGroupExpanded = expandedGroups[group.id] !== false
            const groupItems = Array.isArray(group.items) ? group.items : []
            return (
              <div
                key={group.id}
                className={`rounded-2xl border transition shadow-sm ${
                  group.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/70 opacity-75'
                }`}
              >
                {/* Group Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-3.5 rounded-t-2xl">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpand(group.id)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition cursor-pointer"
                    >
                      {isGroupExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <span className="flex items-center gap-2 font-black text-xs tracking-wider text-slate-700 uppercase">
                      <Folder className="h-4 w-4 text-[#0060A9]" />
                      {group.title}
                    </span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {groupItems.length} Modules
                    </span>
                    {!group.enabled && (
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        Hidden
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveGroup(groupIdx, 'up')}
                      disabled={groupIdx === 0}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                      title="Move Up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveGroup(groupIdx, 'down')}
                      disabled={groupIdx === config.length - 1}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                      title="Move Down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleGroupVisibility(group.id)}
                      className={`rounded-lg p-1.5 transition cursor-pointer ${
                        group.enabled ? 'text-slate-500 hover:bg-slate-200' : 'text-amber-600 hover:bg-amber-100'
                      }`}
                      title={group.enabled ? 'Hide Group from Sidebar' : 'Show Group in Sidebar'}
                    >
                      {group.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditGroup(group)}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 transition cursor-pointer"
                      title="Edit Group"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenAddModule(group.id)}
                      className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#0060A9] hover:bg-blue-100 transition cursor-pointer flex items-center gap-1"
                      title="Add Module to this Group"
                    >
                      <Plus className="h-3.5 w-3.5" /> Module
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(group.id, group.title)}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 transition cursor-pointer"
                      title="Delete Group"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Modules List under Group */}
                {isGroupExpanded && (
                  <div className="p-4 space-y-3">
                    {groupItems.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                        No modules found under this group. Click{' '}
                        <button
                          type="button"
                          onClick={() => handleOpenAddModule(group.id)}
                          className="font-bold text-[#0060A9] underline cursor-pointer"
                        >
                          Add Module
                        </button>{' '}
                        to create one.
                      </div>
                    ) : (
                      groupItems.map((module, modIdx) => {
                        const Icon = resolveMenuIcon(module.icon)
                        const isModExpanded = expandedModules[module.id] !== false
                        const hasSubs = module.subItems && Array.isArray(module.subItems) && module.subItems.length > 0

                        return (
                          <div
                            key={module.id}
                            className={`rounded-xl border transition ${
                              module.enabled
                                ? 'border-slate-200 bg-white shadow-xs'
                                : 'border-slate-200 bg-slate-50/50 opacity-60'
                            }`}
                          >
                            {/* Module Header Row */}
                            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                              <div className="flex items-center gap-3 min-w-0">
                                {hasSubs ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleModuleExpand(module.id)}
                                    className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition cursor-pointer"
                                  >
                                    {isModExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                ) : (
                                  <div className="w-5" />
                                )}

                                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                                  <Icon className="h-4 w-4 text-[#0060A9]" />
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-slate-800 truncate">{module.label}</p>
                                    {module.badge && (
                                      <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-700">
                                        {module.badge}
                                      </span>
                                    )}
                                    {!module.enabled && (
                                      <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-semibold text-amber-800">
                                        Inactive
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-400 font-mono truncate">{module.href || '# (dropdown container)'}</p>
                                </div>
                              </div>

                              {/* Module Actions */}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveModule(group.id, modIdx, 'up')}
                                  disabled={modIdx === 0}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                  title="Move Up"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveModule(group.id, modIdx, 'down')}
                                  disabled={modIdx === groupItems.length - 1}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                  title="Move Down"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleModuleVisibility(group.id, module.id)}
                                  className={`rounded-lg p-1.5 transition cursor-pointer ${
                                    module.enabled ? 'text-slate-500 hover:bg-slate-100' : 'text-amber-600 hover:bg-amber-50'
                                  }`}
                                  title={module.enabled ? 'Hide from Sidebar' : 'Show in Sidebar'}
                                >
                                  {module.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenAddSubModule(group.id, module.id)}
                                  className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition cursor-pointer flex items-center gap-1"
                                  title="Add Sub-Module"
                                >
                                  <Plus className="h-3 w-3" /> Sub
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModule(group.id, module)}
                                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition cursor-pointer"
                                  title="Edit Module"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteModule(group.id, module.id, module.label)}
                                  className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 transition cursor-pointer"
                                  title="Delete Module"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Sub-Modules Nested Rows */}
                            {hasSubs && isModExpanded && (
                              <div className="border-t border-slate-100 bg-slate-50/40 px-6 py-2.5 space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                  Sub-Modules ({module.subItems!.length})
                                </p>
                                {module.subItems!.map((sub, subIdx) => {
                                  const SubIcon = resolveMenuIcon(sub.icon)
                                  return (
                                    <div
                                      key={sub.id}
                                      className={`flex items-center justify-between rounded-lg border bg-white px-3 py-1.5 shadow-2xs transition ${
                                        sub.enabled ? 'border-slate-200' : 'border-slate-200 opacity-60'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <SubIcon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <p className="text-xs font-semibold text-slate-800 truncate">{sub.label}</p>
                                            {sub.badge && (
                                              <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] font-bold text-slate-600">
                                                {sub.badge}
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-[10px] text-slate-400 font-mono truncate">{sub.href}</p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => moveSubModule(group.id, module.id, subIdx, 'up')}
                                          disabled={subIdx === 0}
                                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                        >
                                          <ArrowUp className="h-3 w-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => moveSubModule(group.id, module.id, subIdx, 'down')}
                                          disabled={subIdx === module.subItems!.length - 1}
                                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                        >
                                          <ArrowDown className="h-3 w-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleSubModuleVisibility(group.id, module.id, sub.id)}
                                          className="rounded p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
                                        >
                                          {sub.enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleOpenEditSubModule(group.id, module.id, sub)}
                                          className="rounded p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
                                        >
                                          <Edit2 className="h-3 w-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteSubModule(group.id, module.id, sub.id, sub.label)}
                                          className="rounded p-1 text-red-500 hover:bg-red-50 cursor-pointer"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* TAB 2: NAVIGATION GROUPS TABLE */}
      {activeTab === 'groups' && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Navigation Groups List</h2>
              <p className="text-xs text-slate-500">Navigation groups organize modules in the sidebar (e.g., MONITORING, CONFIGURATION).</p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddGroup}
              className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold text-white hover:bg-[#004b85] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Group
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Group Title</th>
                  <th className="px-4 py-3">Group ID</th>
                  <th className="px-4 py-3">Module Count</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {config.map((g, idx) => (
                  <tr key={g.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-900">{g.title}</td>
                    <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{g.id}</td>
                    <td className="px-4 py-3.5">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#0060A9]">
                        {Array.isArray(g.items) ? g.items.length : 0} Modules
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          g.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {g.enabled ? 'Active' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditGroup(g)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
                        title="Edit Group"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(g.id, g.title)}
                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 cursor-pointer"
                        title="Delete Group"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MODULES & SUB-MODULES TABLE */}
      {activeTab === 'modules' && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px]">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search module or URL..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-[#0060A9] focus:outline-hidden"
                />
              </div>

              <select
                value={selectedGroupFilter}
                onChange={(e) => setSelectedGroupFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 focus:border-[#0060A9] focus:outline-hidden"
              >
                <option value="ALL">All Navigation Groups</option>
                {config.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => handleOpenAddModule()}
              className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold text-white hover:bg-[#004b85] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Module
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Navigation Group</th>
                  <th className="px-4 py-3">URL / Href</th>
                  <th className="px-4 py-3">Sub-Modules</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {flatModules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-400">
                      No modules matching search criteria.
                    </td>
                  </tr>
                ) : (
                  flatModules.map(({ group, module }) => {
                    const Icon = resolveMenuIcon(module.icon)
                    return (
                      <tr key={module.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-[#0060A9]">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{module.label}</p>
                              {module.badge && (
                                <span className="rounded bg-blue-50 px-1.5 py-0.2 text-[9px] font-bold text-[#0060A9]">
                                  {module.badge}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-xs text-slate-600 uppercase">{group.title}</td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-500">{module.href || '-'}</td>
                        <td className="px-4 py-3.5">
                          {module.subItems && module.subItems.length > 0 ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                              {module.subItems.length} Sub-Modules
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                              module.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {module.enabled ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenAddSubModule(group.id, module.id)}
                            className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                            title="Add Sub-Module"
                          >
                            + Sub
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModule(group.id, module)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 cursor-pointer"
                            title="Edit Module"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteModule(group.id, module.id, module.label)}
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 cursor-pointer"
                            title="Delete Module"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: LIVE SIDEBAR PREVIEW */}
      {activeTab === 'preview' && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">Live Sidebar Simulation</h2>
              <p className="text-xs text-slate-500 mt-1">
                Visual preview of how the sidebar appears to users according to the current configuration.
              </p>

              {/* Sidebar Preview Box */}
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-md overflow-hidden max-w-[280px] mx-auto">
                <div className="h-[4px] bg-[#0060A9]" />
                <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 p-3.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white p-1 shadow-2xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={settings.sidebar_logo_url || `${PUBLIC_BASE_PATH}/abvc-logo.webp`}
                      alt="Logo"
                      className="h-auto max-h-6 object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-slate-800 truncate">
                      {settings.app_name || 'SURVEILLANCE DATA'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">Monitoring Portal</p>
                  </div>
                </div>

                <div className="p-3 max-h-[500px] overflow-y-auto space-y-4">
                  {config
                    .filter((g) => g.enabled)
                    .map((group) => (
                      <div key={group.id}>
                        <p className="px-2 pb-1.5 text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                          {group.title}
                        </p>
                        {(!group.items || group.items.length === 0) ? (
                          <p className="px-2 py-1 text-[10px] text-slate-400 italic">No modules</p>
                        ) : (
                          <div className="space-y-1">
                            {group.items
                              .filter((m) => m.enabled)
                              .map((module) => {
                                const Icon = resolveMenuIcon(module.icon)
                                const hasSubs = module.subItems && Array.isArray(module.subItems) && module.subItems.length > 0
                                return (
                                  <div key={module.id}>
                                    <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                      <Icon className="h-3.5 w-3.5 text-slate-400" />
                                      <span className="truncate flex-1">{module.label}</span>
                                      {module.badge && (
                                        <span className="rounded bg-blue-100 px-1 py-0.2 text-[9px] font-bold text-blue-700">
                                          {module.badge}
                                        </span>
                                      )}
                                      {hasSubs && <ChevronDown className="h-3 w-3 text-slate-400" />}
                                    </div>

                                    {hasSubs && (
                                      <div className="ml-5 pl-2 border-l border-slate-200 mt-1 space-y-1">
                                        {module.subItems!
                                          .filter((s) => s.enabled)
                                          .map((sub) => {
                                            const SubIcon = resolveMenuIcon(sub.icon)
                                            return (
                                              <div
                                                key={sub.id}
                                                className="flex items-center gap-2 rounded px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50"
                                              >
                                                <SubIcon className="h-3 w-3 text-slate-400" />
                                                <span className="truncate flex-1">{sub.label}</span>
                                              </div>
                                            )
                                          })}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900">Guidelines & System Integration</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <h3 className="font-bold text-[#0060A9] flex items-center gap-2 text-xs uppercase">
                    <CheckCircle2 className="h-4 w-4" /> Centralized Database & Audit Integration
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Navigation configurations are saved directly to the PostgreSQL database in the <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200">system_settings</code> table. Every configuration save is tracked in the system audit log.
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <h3 className="font-bold text-emerald-800 flex items-center gap-2 text-xs uppercase">
                    <Layers className="h-4 w-4" /> Full 3-Tier Navigation Hierarchy
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    The application supports: <strong>Navigation Group</strong> (Header Section) &gt; <strong>Module</strong> (Primary Menu) &gt; <strong>Sub-Module</strong> (Accordion Sub-Menu).
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 text-xs uppercase">
                    <SlidersHorizontal className="h-4 w-4" /> Flexible Reordering & Instant Sidebar Update
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    You can show or hide modules without deletion, reorder with arrow controls, and see changes reflected in the sidebar immediately.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 1: GROUP MODAL --- */}
      <Modal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        title={editingGroup ? 'Edit Navigation Group' : 'Add New Navigation Group'}
      >
        <form onSubmit={handleSaveGroup} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700">Navigation Group Title</label>
            <input
              type="text"
              required
              placeholder="e.g., MONITORING, EXTERNAL, REPORTS..."
              value={groupForm.title}
              onChange={(e) => setGroupForm((prev) => ({ ...prev, title: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm focus:border-[#0060A9] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700">I18n Translation Key (Optional)</label>
            <input
              type="text"
              placeholder="sidebar.sections.monitoring"
              value={groupForm.titleKey}
              onChange={(e) => setGroupForm((prev) => ({ ...prev, titleKey: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm focus:border-[#0060A9] focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="groupEnabled"
              checked={groupForm.enabled}
              onChange={(e) => setGroupForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-[#0060A9]"
            />
            <label htmlFor="groupEnabled" className="text-sm font-semibold text-slate-800">
              Show this group in the sidebar (Active)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setGroupModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#0060A9] px-5 py-2 text-sm font-bold text-white hover:bg-[#004b85] cursor-pointer"
            >
              Save Group
            </button>
          </div>
        </form>
      </Modal>

      {/* --- MODAL 2: MODULE MODAL --- */}
      <Modal
        open={moduleModalOpen}
        onClose={() => setModuleModalOpen(false)}
        title={editingModule ? 'Edit Module' : 'Add New Module'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSaveModule} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700">Parent Navigation Group</label>
              <select
                required
                value={moduleForm.groupId}
                onChange={(e) => setModuleForm((prev) => ({ ...prev, groupId: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm focus:border-[#0060A9] focus:outline-hidden font-medium"
              >
                {config.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700">Module Name</label>
              <input
                type="text"
                required
                placeholder="e.g., Disease Master, Reports..."
                value={moduleForm.label}
                onChange={(e) => setModuleForm((prev) => ({ ...prev, label: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm focus:border-[#0060A9] focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700">URL Path / Href</label>
              <input
                type="text"
                placeholder="e.g., /reports, /events, #"
                value={moduleForm.href}
                onChange={(e) => setModuleForm((prev) => ({ ...prev, href: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-mono focus:border-[#0060A9] focus:outline-hidden"
              />
              <p className="text-[11px] text-slate-400 mt-1">Leave empty or set &quot;#&quot; if used purely as a sub-module container.</p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700">Badge Label (Optional)</label>
              <input
                type="text"
                placeholder="e.g., NEW, BETA, LIVE..."
                value={moduleForm.badge}
                onChange={(e) => setModuleForm((prev) => ({ ...prev, badge: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm focus:border-[#0060A9] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Icon Selector Grid */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
              Select Module Icon (Lucide Icon)
            </label>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50/50 max-h-40 overflow-y-auto">
              {Object.keys(MENU_ICON_MAP).map((iconKey) => {
                const IconComp = MENU_ICON_MAP[iconKey]
                const isSelected = moduleForm.icon === iconKey
                return (
                  <button
                    key={iconKey}
                    type="button"
                    onClick={() => setModuleForm((prev) => ({ ...prev, icon: iconKey }))}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition cursor-pointer ${
                      isSelected
                        ? 'border-[#0060A9] bg-blue-50 text-[#0060A9]'
                        : 'border-transparent text-slate-600 hover:bg-slate-200/60'
                    }`}
                    title={iconKey}
                  >
                    <IconComp className="h-5 w-5" />
                    <span className="text-[9px] truncate w-full text-center mt-1">{iconKey}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="moduleEnabled"
              checked={moduleForm.enabled}
              onChange={(e) => setModuleForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-[#0060A9]"
            />
            <label htmlFor="moduleEnabled" className="text-sm font-semibold text-slate-800">
              Show this module in the sidebar (Active)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setModuleModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#0060A9] px-5 py-2 text-sm font-bold text-white hover:bg-[#004b85] cursor-pointer"
            >
              Save Module
            </button>
          </div>
        </form>
      </Modal>

      {/* --- MODAL 3: SUB-MODULE MODAL --- */}
      <Modal
        open={subModalOpen}
        onClose={() => setSubModalOpen(false)}
        title={editingSub ? 'Edit Sub-Module' : 'Add New Sub-Module'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveSubModule} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700">Sub-Module Name</label>
            <input
              type="text"
              required
              placeholder="e.g., Matrix & Ledger, Live Analysis..."
              value={subForm.label}
              onChange={(e) => setSubForm((prev) => ({ ...prev, label: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm focus:border-[#0060A9] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700">Sub-Module URL Path</label>
            <input
              type="text"
              required
              placeholder="e.g., /reports/matrix, /analyze/live..."
              value={subForm.href}
              onChange={(e) => setSubForm((prev) => ({ ...prev, href: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-mono focus:border-[#0060A9] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700">Badge Label (Optional)</label>
            <input
              type="text"
              placeholder="e.g., PRO, 2026, V2..."
              value={subForm.badge}
              onChange={(e) => setSubForm((prev) => ({ ...prev, badge: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm focus:border-[#0060A9] focus:outline-hidden"
            />
          </div>

          {/* Sub-item Icon Selector */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">
              Select Sub-Module Icon (Optional)
            </label>
            <div className="grid grid-cols-6 gap-2 p-2 rounded-xl border border-slate-200 bg-slate-50/50 max-h-36 overflow-y-auto">
              {['Circle', 'FileText', 'FileSpreadsheet', 'Database', 'Activity', 'Search', 'Layers', 'Globe2', 'Settings', 'Tv', 'Tags', 'Cpu'].map((iconKey) => {
                const IconComp = resolveMenuIcon(iconKey)
                const isSelected = subForm.icon === iconKey
                return (
                  <button
                    key={iconKey}
                    type="button"
                    onClick={() => setSubForm((prev) => ({ ...prev, icon: iconKey }))}
                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg border transition cursor-pointer ${
                      isSelected
                        ? 'border-[#0060A9] bg-blue-50 text-[#0060A9]'
                        : 'border-transparent text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    <IconComp className="h-4 w-4" />
                    <span className="text-[8px] truncate w-full text-center mt-1">{iconKey}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="subEnabled"
              checked={subForm.enabled}
              onChange={(e) => setSubForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-[#0060A9]"
            />
            <label htmlFor="subEnabled" className="text-sm font-semibold text-slate-800">
              Show this sub-module in the sidebar (Active)
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setSubModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#0060A9] px-5 py-2 text-sm font-bold text-white hover:bg-[#004b85] cursor-pointer"
            >
              Save Sub-Module
            </button>
          </div>
        </form>
      </Modal>

      {/* --- MODAL 4: RESET CONFIRMATION MODAL --- */}
      <Modal
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Confirm Reset Configuration"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              This action will reset all navigation groups, modules, and sub-modules to the system default configuration. Unsaved custom changes will be discarded.
            </div>
          </div>

          <p className="text-sm text-slate-600">
            Are you sure you want to proceed with resetting to default?
          </p>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setResetConfirmOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleResetToDefault}
              className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-bold text-white hover:bg-amber-700 cursor-pointer"
            >
              Yes, Reset to Default
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
