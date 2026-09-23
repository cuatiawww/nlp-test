'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import {
  createMasterRegion,
  updateMasterRegion,
  type MasterRegion,
  type MasterCountry,
} from '@/lib/api'
import { Check, Search } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  region?: MasterRegion | null
  allCountries: MasterCountry[]
  onSaved: () => void
  onCancel: () => void
}

export default function RegionMasterForm({
  region,
  allCountries,
  onSaved,
  onCancel,
}: Props) {
  const { t } = useTranslation()
  const isEdit = !!region
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [selectedCountryIds, setSelectedCountryIds] = useState<string[]>([])
  const [countrySearch, setCountrySearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (region) {
      setName(region.name || '')
      setCode(region.code || '')
      setDescription(region.description || '')
      setIsActive(region.is_active !== false)
      setSelectedCountryIds(region.countries?.map(c => c.id) || [])
    } else {
      setName('')
      setCode('')
      setDescription('')
      setIsActive(true)
      setSelectedCountryIds([])
    }
  }, [region])

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return allCountries
    const q = countrySearch.toLowerCase()
    return allCountries.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.iso2.toLowerCase().includes(q) ||
        c.iso3.toLowerCase().includes(q)
    )
  }, [allCountries, countrySearch])

  const toggleCountry = (id: string) => {
    setSelectedCountryIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    setSelectedCountryIds(allCountries.map(c => c.id))
  }

  const clearAll = () => {
    setSelectedCountryIds([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !code) {
      toast.error('Name and Code are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || undefined,
        is_active: isActive,
        country_ids: selectedCountryIds,
      }
      if (isEdit) {
        await updateMasterRegion(region.id, payload)
        toast.success(t('common.savedSuccess') || 'Region updated successfully')
      } else {
        await createMasterRegion(payload)
        toast.success(t('common.createdSuccess') || 'Region created successfully')
      }
      onSaved()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save region')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Region Name</label>
          <input
            value={name}
            onChange={e => {
              setName(e.target.value)
              if (!code) setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))
            }}
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0060A9] focus:outline-none"
            placeholder="e.g. ASEAN"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Region Code</label>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono uppercase focus:border-[#0060A9] focus:outline-none"
            placeholder="ASEAN"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0060A9] focus:outline-none"
          placeholder="Brief description of this regional group"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="regionActive"
          checked={isActive}
          onChange={e => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
        />
        <label htmlFor="regionActive" className="text-xs font-semibold text-slate-700">Active Status</label>
      </div>

      {/* Member Countries Checkboxes Section */}
      <div className="pt-2 border-t border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-[0.06em] text-slate-700">Member Countries</label>
            <span className="ml-2 text-xs font-semibold text-[#0060A9]">
              ({selectedCountryIds.length} selected)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] font-bold text-[#0060A9] hover:underline"
            >
              Select All
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] font-bold text-slate-500 hover:underline"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Quick search input for countries */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={countrySearch}
            onChange={e => setCountrySearch(e.target.value)}
            placeholder="Filter countries by name or ISO..."
            className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs focus:border-[#0060A9] focus:outline-none"
          />
        </div>

        {/* Checkbox Grid Container */}
        <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {filteredCountries.map(country => {
            const isChecked = selectedCountryIds.includes(country.id)
            return (
              <label
                key={country.id}
                className={`flex items-center gap-2 rounded-lg border p-2 text-xs font-medium cursor-pointer transition select-none ${
                  isChecked
                    ? 'border-[#0060A9] bg-blue-50/80 text-[#0060A9] font-bold shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCountry(country.id)}
                  className="sr-only"
                />
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isChecked
                      ? 'border-[#0060A9] bg-[#0060A9] text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                </span>
                <span className="truncate">{country.name}</span>
                <span className="text-[10px] text-slate-400 font-mono ml-auto">{country.iso3}</span>
              </label>
            )
          })}
          {filteredCountries.length === 0 && (
            <p className="col-span-full py-4 text-center text-xs text-slate-400 font-semibold">
              No matching countries found.
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          {t('common.cancel') || 'Cancel'}
        </button>
        <button
          type="submit"
          disabled={saving || !name || !code}
          className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-[#004b85] disabled:opacity-50"
        >
          {saving ? (t('common.saving') || 'Saving...') : isEdit ? (t('common.save') || 'Save') : (t('common.add') || 'Add Region')}
        </button>
      </div>
    </form>
  )
}
