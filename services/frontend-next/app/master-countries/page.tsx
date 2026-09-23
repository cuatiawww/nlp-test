'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Globe2,
  Layers,
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from 'lucide-react'
import {
  fetchMasterCountries,
  deleteMasterCountry,
  fetchMasterRegions,
  deleteMasterRegion,
  type MasterCountry,
  type MasterRegion,
} from '@/lib/api'
import CountryFlag from '@/components/CountryFlag'
import Modal from '@/components/Modal'
import CountryMasterForm from '@/components/CountryMasterForm'
import RegionMasterForm from '@/components/RegionMasterForm'
import { toast } from 'sonner'

export default function MasterCountriesPage() {
  const [activeTab, setActiveTab] = useState<'countries' | 'regions'>('countries')

  // Data state
  const [countries, setCountries] = useState<MasterCountry[]>([])
  const [regions, setRegions] = useState<MasterRegion[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Modals state
  const [countryModalOpen, setCountryModalOpen] = useState(false)
  const [editingCountry, setEditingCountry] = useState<MasterCountry | null>(null)

  const [regionModalOpen, setRegionModalOpen] = useState(false)
  const [editingRegion, setEditingRegion] = useState<MasterRegion | null>(null)

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [countryRes, regionRes] = await Promise.all([
        fetchMasterCountries({ per_page: 200 }),
        fetchMasterRegions({ per_page: 100 }),
      ])
      setCountries(Array.isArray(countryRes) ? countryRes : [])
      setRegions(Array.isArray(regionRes) ? regionRes : [])
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load master geographic data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtered lists
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return countries
    const q = searchQuery.toLowerCase()
    return countries.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.iso2.toLowerCase().includes(q) ||
        c.iso3.toLowerCase().includes(q)
    )
  }, [countries, searchQuery])

  const filteredRegions = useMemo(() => {
    if (!searchQuery.trim()) return regions
    const q = searchQuery.toLowerCase()
    return regions.filter(
      r =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.countries && r.countries.some(c => c.name.toLowerCase().includes(q) || c.iso3.toLowerCase().includes(q)))
    )
  }, [regions, searchQuery])

  // Country actions
  const handleAddCountry = () => {
    setEditingCountry(null)
    setCountryModalOpen(true)
  }

  const handleEditCountry = (c: MasterCountry) => {
    setEditingCountry(c)
    setCountryModalOpen(true)
  }

  const handleDeleteCountry = async (c: MasterCountry) => {
    if (!confirm(`Are you sure you want to delete country ${c.name} (${c.iso3})?`)) return
    try {
      await deleteMasterCountry(c.id)
      toast.success(`Country ${c.name} removed`)
      loadData()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete country')
    }
  }

  // Region actions
  const handleAddRegion = () => {
    setEditingRegion(null)
    setRegionModalOpen(true)
  }

  const handleEditRegion = (r: MasterRegion) => {
    setEditingRegion(r)
    setRegionModalOpen(true)
  }

  const handleDeleteRegion = async (r: MasterRegion) => {
    if (!confirm(`Are you sure you want to delete region ${r.name} (${r.code})?`)) return
    try {
      await deleteMasterRegion(r.id)
      toast.success(`Region ${r.name} removed`)
      loadData()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete region')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0060A9]/10 text-[#0060A9]">
              <Globe2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
                Master Countries & Regions
              </h1>
              <p className="text-xs text-slate-500">
                Manage national entities and regional classifications with membership checkboxes
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-xs hover:bg-slate-50 transition disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {activeTab === 'countries' ? (
            <button
              onClick={handleAddCountry}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-[#004b85] transition"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Add Country</span>
            </button>
          ) : (
            <button
              onClick={handleAddRegion}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-[#004b85] transition"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>Add Region</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs & Search Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setActiveTab('countries'); setSearchQuery(''); }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'countries'
                ? 'bg-white text-[#0060A9] shadow-sm border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Globe2 className="h-4 w-4" />
            <span>Countries</span>
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600">
              {countries.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('regions'); setSearchQuery(''); }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'regions'
                ? 'bg-white text-[#0060A9] shadow-sm border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Regions</span>
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600">
              {regions.length}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'countries' ? 'Search country or ISO...' : 'Search region or country...'}
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800 shadow-xs focus:border-[#0060A9] focus:outline-none"
          />
        </div>
      </div>

      {/* Tab 1: Countries Table */}
      {activeTab === 'countries' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          {loading && countries.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin mb-2 text-[#0060A9]" />
              <p className="text-xs font-medium">Loading master countries...</p>
            </div>
          ) : filteredCountries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs font-medium">
              No countries match your search criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Country</th>
                    <th className="px-4 py-3">ISO-2</th>
                    <th className="px-4 py-3">ISO-3</th>
                    <th className="px-4 py-3 text-center">Display Order</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCountries.map(c => (
                    <tr key={c.id} className="hover:bg-blue-50/30 transition">
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        <div className="flex items-center gap-2.5">
                          <CountryFlag
                            countryCode={c.iso2}
                            countryName={c.name}
                            size={18}
                            shape="rounded"
                          />
                          <span>{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-600">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                          {c.iso2}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium text-slate-600">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
                          {c.iso3}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-slate-500">
                        {c.display_order ?? 0}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/60">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            <XCircle className="h-3 w-3" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEditCountry(c)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-[#0060A9] transition"
                            title="Edit country"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCountry(c)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title="Delete country"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      )}

      {/* Tab 2: Regions Cards & Member Countries Grid */}
      {activeTab === 'regions' && (
        <div className="space-y-4">
          {loading && regions.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="h-6 w-6 animate-spin mb-2 text-[#0060A9]" />
              <p className="text-xs font-medium">Loading master regions...</p>
            </div>
          ) : filteredRegions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs font-medium bg-white rounded-2xl border border-slate-200">
              No regions match your search criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRegions.map(r => {
                const memberCount = r.countries?.length || 0
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition"
                  >
                    <div>
                      {/* Region Header */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-lg bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-bold text-[#0060A9] border border-blue-200/60">
                              {r.code}
                            </span>
                            <h3 className="text-sm font-bold text-slate-900">{r.name}</h3>
                          </div>
                          {r.description && (
                            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                              {r.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleEditRegion(r)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-[#0060A9] transition"
                            title="Edit region and countries"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRegion(r)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title="Delete region"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Member Countries List / Badges */}
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Member Countries
                          </span>
                          <span className="text-[11px] font-bold text-[#0060A9]">
                            {memberCount} {memberCount === 1 ? 'Country' : 'Countries'}
                          </span>
                        </div>

                        {memberCount === 0 ? (
                          <p className="text-xs text-slate-400 italic py-1">
                            No countries assigned to this region yet. Click edit to check countries.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                            {r.countries?.map(c => (
                              <span
                                key={c.id}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs"
                              >
                                <CountryFlag
                                  countryCode={c.iso2}
                                  countryName={c.name}
                                  size={13}
                                  shape="rounded"
                                />
                                <span className="truncate max-w-[110px]">{c.name}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer / Status */}
                    <div className="mt-4 pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-50">
                      <div className="flex items-center gap-1">
                        {r.is_active ? (
                          <span className="text-emerald-600 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Active Region
                          </span>
                        ) : (
                          <span className="text-slate-400 flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Inactive
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ID: {r.id.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Country Modal */}
      <Modal
        open={countryModalOpen}
        onClose={() => setCountryModalOpen(false)}
        title={editingCountry ? `Edit Country: ${editingCountry.name}` : 'Add Master Country'}
      >
        <CountryMasterForm
          country={editingCountry}
          onSaved={() => {
            setCountryModalOpen(false)
            loadData()
          }}
          onCancel={() => setCountryModalOpen(false)}
        />
      </Modal>

      {/* Region Modal */}
      <Modal
        open={regionModalOpen}
        onClose={() => setRegionModalOpen(false)}
        title={editingRegion ? `Edit Region: ${editingRegion.name}` : 'Add Master Region'}
      >
        <RegionMasterForm
          region={editingRegion}
          allCountries={countries}
          onSaved={() => {
            setRegionModalOpen(false)
            loadData()
          }}
          onCancel={() => setRegionModalOpen(false)}
        />
      </Modal>
    </div>
  )
}
