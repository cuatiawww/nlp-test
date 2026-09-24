'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DiseaseConcept, DiseaseAlias, fetchDiseaseAliases, saveDiseaseAliases } from '@/lib/api'
import Modal from '@/components/Modal'
import CountryFlag from '@/components/CountryFlag'
import { Plus, X, Globe, Save, Loader2, Sparkles } from 'lucide-react'

interface Props {
  concept: DiseaseConcept | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

interface CountryEntry {
  code: string
  name: string
  lang: string
}

const ASEAN_COUNTRIES: CountryEntry[] = [
  { code: 'BN', name: 'Brunei Darussalam', lang: 'ms' },
  { code: 'KH', name: 'Cambodia', lang: 'km' },
  { code: 'ID', name: 'Indonesia', lang: 'id' },
  { code: 'LA', name: 'Lao PDR', lang: 'lo' },
  { code: 'MY', name: 'Malaysia', lang: 'ms' },
  { code: 'MM', name: 'Myanmar', lang: 'my' },
  { code: 'PH', name: 'Philippines', lang: 'tl' },
  { code: 'SG', name: 'Singapore', lang: 'en' },
  { code: 'TH', name: 'Thailand', lang: 'th' },
  { code: 'TL', name: 'Timor-Leste', lang: 'pt' },
  { code: 'VN', name: 'Viet Nam', lang: 'vi' },
]

export default function DiseaseAliasModal({ concept, open, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Map of countryCode -> list of string aliases
  const [countryAliases, setCountryAliases] = useState<Record<string, string[]>>({})
  const [newInputs, setNewInputs] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !concept) return

    setLoading(true)
    fetchDiseaseAliases(concept.id)
      .then((aliases: DiseaseAlias[]) => {
        const grouped: Record<string, string[]> = {
          GLOBAL: [],
        }
        for (const c of ASEAN_COUNTRIES) {
          grouped[c.code] = []
        }

        for (const a of aliases) {
          const cCode = a.country_code ? a.country_code.toUpperCase() : 'GLOBAL'
          if (!grouped[cCode]) grouped[cCode] = []
          if (!grouped[cCode].includes(a.alias)) {
            grouped[cCode].push(a.alias)
          }
        }
        setCountryAliases(grouped)
        setNewInputs({})
      })
      .catch((err) => {
        toast.error('Failed to load disease aliases.')
      })
      .finally(() => setLoading(false))
  }, [open, concept])

  const handleAddAlias = (code: string) => {
    const raw = newInputs[code]?.trim()
    if (!raw) return

    // Allow comma-separated entry
    const splitted = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    setCountryAliases((prev) => {
      const current = prev[code] || []
      const combined = [...current]
      for (const item of splitted) {
        if (!combined.some((x) => x.toLowerCase() === item.toLowerCase())) {
          combined.push(item)
        }
      }
      return { ...prev, [code]: combined }
    })

    setNewInputs((prev) => ({ ...prev, [code]: '' }))
  }

  const handleRemoveAlias = (code: string, aliasToRemove: string) => {
    setCountryAliases((prev) => ({
      ...prev,
      [code]: (prev[code] || []).filter((x) => x !== aliasToRemove),
    }))
  }

  const handleSave = async () => {
    if (!concept) return
    setSaving(true)

    const payloadList: { country_code?: string; alias: string; language?: string }[] = []

    // Global
    for (const alias of countryAliases['GLOBAL'] || []) {
      payloadList.push({
        country_code: undefined,
        alias,
        language: 'en',
      })
    }

    // Countries
    for (const c of ASEAN_COUNTRIES) {
      const items = countryAliases[c.code] || []
      for (const alias of items) {
        payloadList.push({
          country_code: c.code,
          alias,
          language: c.lang,
        })
      }
    }

    try {
      await saveDiseaseAliases(concept.id, { aliases: payloadList })
      toast.success(`Saved ${payloadList.length} aliases for ${concept.canonical_name}.`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save aliases.')
    } finally {
      setSaving(false)
    }
  }

  const totalAliases = Object.values(countryAliases).reduce((acc, curr) => acc + curr.length, 0)

  return (
    <Modal
      open={open}
      maxWidth="max-w-4xl"
      title={`Country Aliases: ${concept?.canonical_name || ''}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* Header Info */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 bg-[#0060A9]/10 text-[#0060A9] rounded">
              {concept?.disease_id || concept?.canonical_name}
            </span>
            <span className="text-sm font-semibold text-slate-800">{concept?.canonical_name}</span>
          </div>
          <div className="text-xs text-slate-600 font-medium">
            Total Aliases Configured: <span className="font-bold text-[#0060A9]">{totalAliases}</span>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Aliases allow the NLP engine to recognize country-specific local terms and spelling variations for this disease across ASEAN health ministries and media.
        </p>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-[#0060A9]" />
            <span className="text-xs font-medium">Loading country aliases...</span>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
            {/* Global / General Aliases */}
            <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-100">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-[#0060A9]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Global / International Aliases
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {(countryAliases['GLOBAL'] || []).length} registered
                </span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(countryAliases['GLOBAL'] || []).map((alias) => (
                  <span
                    key={alias}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white text-slate-700 border border-slate-200 shadow-2xs"
                  >
                    {alias}
                    <button
                      type="button"
                      onClick={() => handleRemoveAlias('GLOBAL', alias)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newInputs['GLOBAL'] || ''}
                  onChange={(e) => setNewInputs((prev) => ({ ...prev, GLOBAL: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddAlias('GLOBAL')
                    }
                  }}
                  placeholder="Add global alias (e.g. acronyms, Latin names)..."
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0060A9]"
                />
                <button
                  type="button"
                  onClick={() => handleAddAlias('GLOBAL')}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-[#0060A9] hover:text-white text-xs font-semibold transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 inline mr-1" /> Add
                </button>
              </div>
            </div>

            {/* ASEAN Countries Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ASEAN_COUNTRIES.map((c) => {
                const list = countryAliases[c.code] || []
                return (
                  <div
                    key={c.code}
                    className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors shadow-2xs"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CountryFlag countryCode={c.code} size="sm" shape="rounded" />
                        <div>
                          <span className="text-xs font-bold text-slate-800">{c.name}</span>
                          <span className="ml-1.5 text-[10px] font-mono text-slate-400">({c.code})</span>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {list.length} {list.length === 1 ? 'alias' : 'aliases'}
                      </span>
                    </div>

                    {/* Tags */}
                    <div className="min-h-[32px] flex flex-wrap gap-1.5 mb-2">
                      {list.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic py-1">No country-specific alias</span>
                      ) : (
                        list.map((alias) => (
                          <span
                            key={alias}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200"
                          >
                            {alias}
                            <button
                              type="button"
                              onClick={() => handleRemoveAlias(c.code, alias)}
                              className="text-slate-400 hover:text-red-500"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    {/* Input */}
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newInputs[c.code] || ''}
                        onChange={(e) => setNewInputs((prev) => ({ ...prev, [c.code]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddAlias(c.code)
                          }
                        }}
                        placeholder={`Add ${c.name} alias...`}
                        className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddAlias(c.code)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-[#0060A9] hover:text-white text-xs font-medium transition-colors"
                      >
                        <Plus className="h-3 w-3 inline" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Changes will auto-reload the NLP runtime engine</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-5 py-2 text-xs font-bold uppercase text-white hover:bg-[#004b85] disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" /> Save Aliases
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
