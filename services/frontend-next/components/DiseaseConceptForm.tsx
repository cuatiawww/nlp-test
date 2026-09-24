'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createDiseaseConcept, DiseaseConcept, updateDiseaseConcept } from '@/lib/api'

interface Props {
  concept?: DiseaseConcept | null
  onSaved: () => void
  onCancel: () => void
}

const COMMON_CATEGORIES = [
  'Vector-borne',
  'Viral / Respiratory',
  'Zoonotic',
  'Water-borne / Enteric',
  'Bacterial',
  'Hemorrhagic Fever',
  'Vaccine-preventable',
  'Parasitic / Neglected',
  'Neurological / Encephalitis',
  'Fungal',
  'General Surveillance',
]

export default function DiseaseConceptForm({ concept, onSaved, onCancel }: Props) {
  const isEdit = !!concept
  const [diseaseId, setDiseaseId] = useState('')
  const [canonicalName, setCanonicalName] = useState('')
  const [category, setCategory] = useState('')
  const [isZoonotic, setIsZoonotic] = useState(false)
  const [isPublic, setIsPublic] = useState(true)
  const [allowEngine, setAllowEngine] = useState(true)
  const [description, setDescription] = useState('')

  const [source, setSource] = useState('manual')
  const [confidence, setConfidence] = useState(1)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDiseaseId(concept?.disease_id || '')
    setCanonicalName(concept?.canonical_name || '')
    setCategory(concept?.category || '')
    setIsZoonotic(concept?.is_zoonotic || false)
    setIsPublic(concept?.is_public !== false)
    setAllowEngine(concept?.allow_engine !== false)
    setDescription(concept?.description || '')

    setSource(concept?.source || 'asean_master_database')
    setConfidence(typeof concept?.confidence === 'number' ? concept.confidence : 1)
    setIsActive(concept?.is_active !== false)
  }, [concept])

  const handleNameChange = (val: string) => {
    setCanonicalName(val)
    if (!isEdit && !diseaseId) {
      // Auto suggest uppercase ID
      const autoId = val
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
      setDiseaseId(autoId)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canonicalName.trim()) {
      toast.error('Disease name is required')
      return
    }
    setSaving(true)
    try {
      const payload: Partial<DiseaseConcept> = {
        disease_id: diseaseId.trim().toUpperCase() || canonicalName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        canonical_name: canonicalName.trim(),
        category: category.trim() || null,
        is_zoonotic: isZoonotic,
        is_public: isPublic,
        allow_engine: allowEngine,
        description: description.trim() || null,
        source: source.trim() || 'asean_master_database',
        confidence: Math.min(1, Math.max(0, Number(confidence) || 0)),
        is_active: isActive,
      }
      if (isEdit && concept) {
        await updateDiseaseConcept(concept.id, payload)
        toast.success(`Disease "${payload.canonical_name}" updated successfully.`)
      } else {
        await createDiseaseConcept(payload)
        toast.success(`Disease "${payload.canonical_name}" created successfully.`)
      }
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save disease concept.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Basic Disease Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
            Disease Master ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={diseaseId}
            onChange={(e) => setDiseaseId(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono uppercase bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0060A9]"
            placeholder="e.g. DENGUE, COVID-19"
          />
          <p className="mt-1 text-[11px] text-slate-400">Unique identifier for database and API references</p>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
            Clinical Disease Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={canonicalName}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0060A9]"
            placeholder="e.g. Dengue, Rabies, COVID-19"
          />
          <p className="mt-1 text-[11px] text-slate-400">Canonical standard clinical term</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
            Category
          </label>
          <input
            type="text"
            list="disease-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0060A9]"
            placeholder="Select or type category..."
          />
          <datalist id="disease-categories">
            {COMMON_CATEGORIES.map((cat) => (
              <option key={cat} value={cat} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2.5 p-2 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              checked={isZoonotic}
              onChange={(e) => setIsZoonotic(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
            />
            <div>
              <span className="text-xs font-bold text-slate-700">Zoonotic Disease</span>
              <p className="text-[11px] text-slate-400">Transmissible from animals to humans</p>
            </div>
          </label>
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
          Description / Clinical Notes
        </label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0060A9]"
          placeholder="Brief description of etiology, transmission, and public health impact..."
        />
      </div>

      {/* Surveillance & System Toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
          />
          <span className="text-xs font-medium text-slate-700">Public Portal</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allowEngine}
            onChange={(e) => setAllowEngine(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
          />
          <span className="text-xs font-medium text-slate-700">NLP Engine Active</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
          />
          <span className="text-xs font-medium text-slate-700">Master Record Active</span>
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Master Source</label>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="asean_master_database"
          />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Confidence (0-1)</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !canonicalName.trim()}
          className="rounded-xl bg-[#0060A9] px-5 py-2 text-xs font-bold uppercase text-white hover:bg-[#004b85] disabled:opacity-50 transition-colors shadow-sm"
        >
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Disease'}
        </button>
      </div>
    </form>
  )
}
