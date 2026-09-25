'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import {
  Plus,
  Trash2,
  Edit2,
  Search,
  Filter,
  Check,
  X,
  Copy,
  CheckCircle2,
  Layers,
  Activity,
  ShieldCheck,
  FolderTree,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchExtractionRules,
  updateExtractionRule,
  deleteExtractionRule,
} from '@/lib/api'
import Modal from '@/components/Modal'
import ExtractionRuleForm, {
  ExtractionRuleItem,
} from '@/components/ExtractionRuleForm'

export default function ExtractionRulesPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<ExtractionRuleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<ExtractionRuleItem | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchExtractionRules()
      setData(Array.isArray(res) ? res : [])
    } catch {
      setData([])
      toast.error('Gagal memuat aturan ekstraksi dari database.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Derive categories completely dynamically from database rows
  const categories = useMemo(() => {
    const set = new Set<string>()
    data.forEach((r) => {
      if (r.field_name) set.add(r.field_name)
    })
    return Array.from(set).sort()
  }, [data])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    data.forEach((r) => {
      counts[r.field_name] = (counts[r.field_name] || 0) + 1
    })
    return counts
  }, [data])

  // Filtered dataset
  const filteredData = useMemo(() => {
    return data.filter((rule) => {
      if (selectedCategory !== 'all' && rule.field_name !== selectedCategory) {
        return false
      }
      if (statusFilter === 'active' && !rule.is_active) return false
      if (statusFilter === 'inactive' && rule.is_active) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchField = rule.field_name.toLowerCase().includes(q)
        const matchRegex = rule.regex_pattern.toLowerCase().includes(q)
        if (!matchField && !matchRegex) return false
      }
      return true
    })
  }, [data, selectedCategory, statusFilter, searchQuery])

  const stats = useMemo(() => {
    const total = data.length
    const active = data.filter((r) => r.is_active).length
    const inactive = total - active
    const catCount = categories.length
    return { total, active, inactive, catCount }
  }, [data, categories])

  const handleToggleActive = async (rule: ExtractionRuleItem) => {
    const newStatus = !rule.is_active
    setData((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, is_active: newStatus } : r))
    )
    try {
      await updateExtractionRule(rule.id, {
        field_name: rule.field_name,
        regex_pattern: rule.regex_pattern,
        priority: rule.priority,
        is_active: newStatus,
      })
      toast.success(
        newStatus
          ? `Rule "${rule.field_name}" diaktifkan`
          : `Rule "${rule.field_name}" dinonaktifkan`
      )
    } catch {
      setData((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, is_active: rule.is_active } : r))
      )
      toast.error('Gagal memperbarui status rule di database.')
    }
  }

  const handleDelete = async (rule: ExtractionRuleItem) => {
    if (!confirm(`Hapus aturan ekstraksi untuk "${rule.field_name}"?`)) return
    try {
      await deleteExtractionRule(rule.id)
      toast.success('Aturan ekstraksi berhasil dihapus dari database.')
      loadData()
    } catch {
      toast.error('Gagal menghapus aturan ekstraksi.')
    }
  }

  const handleCopyPattern = (id: string, pattern: string) => {
    navigator.clipboard.writeText(pattern)
    setCopiedId(id)
    toast.success('Regex pattern disalin ke clipboard')
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-6 px-4 py-4 md:px-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
              Extraction Rules
            </h1>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-[#0060A9]">
              PostgreSQL Driven
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Konfigurasi regex dinamis untuk ekstraksi metrik kasus/kematian dan penyaringan false-positive (skripsi, non-health, dll).
          </p>
        </div>

        <button
          onClick={() => {
            setEditingRule(null)
            setModalOpen(true)
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase text-white shadow-sm transition hover:bg-[#004b85]"
        >
          <Plus className="h-4 w-4" /> Tambah Rule
        </button>
      </div>

      {/* KPI Cards (Live from Database) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Rules
            </span>
            <Layers className="h-4 w-4 text-[#0060A9]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="mt-1 text-[11px] text-slate-400">Tersimpan di tabel extraction_rules</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Active Rules
            </span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">{stats.active}</div>
          <div className="mt-1 text-[11px] text-slate-400">Aktif di pipeline NLP runtime</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Inactive Rules
            </span>
            <Activity className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-600">{stats.inactive}</div>
          <div className="mt-1 text-[11px] text-slate-400">Dinonaktifkan sementara</div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Categories
            </span>
            <FolderTree className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-600">{stats.catCount}</div>
          <div className="mt-1 text-[11px] text-slate-400">Kategori target field dinamis</div>
        </div>
      </div>

      {/* Dynamic Categories Tab Bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-slate-100/70 p-1.5">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
            selectedCategory === 'all'
              ? 'bg-white text-[#0060A9] shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>All Categories</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              selectedCategory === 'all'
                ? 'bg-blue-100 text-[#0060A9]'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            {stats.total}
          </span>
        </button>

        {categories.map((cat) => {
          const count = categoryCounts[cat] || 0
          const isSelected = selectedCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold tracking-wider transition ${
                isSelected
                  ? 'bg-white text-[#0060A9] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="font-mono text-[11px]">{cat}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  isSelected
                    ? 'bg-blue-100 text-[#0060A9]'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kategori atau pola regex..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 shadow-sm focus:border-[#0060A9] focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs text-slate-600 shadow-sm">
            <Filter className="ml-1 h-3.5 w-3.5 text-slate-400" />
            <button
              onClick={() => setStatusFilter('all')}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                statusFilter === 'all'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                statusFilter === 'active'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Aktif
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                statusFilter === 'inactive'
                  ? 'bg-rose-50 text-rose-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Nonaktif
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Memuat aturan ekstraksi dari database...
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-slate-600">Tidak ada aturan yang sesuai filter.</p>
            <p className="mt-1 text-xs text-slate-400">
              Ubah kueri pencarian atau klik &ldquo;Tambah Rule&rdquo; untuk menambahkan pola baru.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider">
                    Category / Field
                  </th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-wider">
                    Regex Pattern
                  </th>
                  <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-4 py-3 text-center font-semibold uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((rule) => {
                  return (
                    <tr
                      key={rule.id}
                      className="transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100/80 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700">
                          {rule.field_name}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-mono">
                        <div className="flex max-w-md items-center gap-2">
                          <code className="truncate rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-800">
                            {rule.regex_pattern}
                          </code>
                          <button
                            onClick={() => handleCopyPattern(rule.id, rule.regex_pattern)}
                            title="Salin regex pattern"
                            className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                          >
                            {copiedId === rule.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {rule.priority}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(rule)}
                          title="Klik untuk toggle status aktif"
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                            rule.is_active
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              rule.is_active ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingRule(rule)
                              setModalOpen(true)
                            }}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#0060A9] transition hover:bg-blue-50"
                          >
                            <Edit2 className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(rule)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            title="Hapus Rule"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add / Edit */}
      <Modal
        open={modalOpen}
        title={editingRule ? 'Edit Extraction Rule' : 'Tambah Extraction Rule Baru'}
        onClose={() => {
          setModalOpen(false)
          setEditingRule(null)
        }}
      >
        <ExtractionRuleForm
          rule={editingRule}
          existingCategories={categories}
          defaultCategory={selectedCategory !== 'all' ? selectedCategory : ''}
          onSaved={() => {
            setModalOpen(false)
            setEditingRule(null)
            loadData()
          }}
          onCancel={() => {
            setModalOpen(false)
            setEditingRule(null)
          }}
        />
      </Modal>
    </div>
  )
}
