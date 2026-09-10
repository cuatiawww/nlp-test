'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createDiseaseConcept, DiseaseConcept, updateDiseaseConcept } from '@/lib/api'

interface Props {
  concept?: DiseaseConcept | null
  onSaved: () => void
  onCancel: () => void
}

export default function DiseaseConceptForm({ concept, onSaved, onCancel }: Props) {
  const isEdit = !!concept
  const [canonicalName, setCanonicalName] = useState('')
  const [ontologyCode, setOntologyCode] = useState('')
  const [ontologyUri, setOntologyUri] = useState('')
  const [ontologyRelease, setOntologyRelease] = useState('')
  const [ontologySystem, setOntologySystem] = useState('WHO ICD-11 MMS')
  const [source, setSource] = useState('manual')
  const [confidence, setConfidence] = useState(1)
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCanonicalName(concept?.canonical_name || '')
    setOntologyCode(concept?.ontology_code || '')
    setOntologyUri(concept?.ontology_uri || '')
    setOntologyRelease(concept?.ontology_release || '')
    setOntologySystem(concept?.ontology_system || 'WHO ICD-11 MMS')
    setSource(concept?.source || 'manual')
    setConfidence(typeof concept?.confidence === 'number' ? concept.confidence : 1)
    setIsActive(concept?.is_active !== false)
  }, [concept])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canonicalName.trim()) return
    setSaving(true)
    try {
      const payload = {
        canonical_name: canonicalName.trim(),
        ontology_code: ontologyCode.trim() || null,
        ontology_uri: ontologyUri.trim() || null,
        ontology_release: ontologyRelease.trim() || null,
        ontology_system: ontologySystem.trim() || 'WHO ICD-11 MMS',
        source: source.trim() || 'manual',
        confidence: Math.min(1, Math.max(0, Number(confidence) || 0)),
        is_active: isActive,
      }
      if (isEdit && concept) await updateDiseaseConcept(concept.id, payload)
      else await createDiseaseConcept(payload)
      toast.success(isEdit ? 'Disease concept updated.' : 'Disease concept created.')
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save disease concept.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">WHO ICD-11 disease name</label>
        <input value={canonicalName} onChange={e => setCanonicalName(e.target.value)} required
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Dengue" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">ICD-11 code</label>
          <input value={ontologyCode} onChange={e => setOntologyCode(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono" placeholder="1D2Z" />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Release</label>
          <input value={ontologyRelease} onChange={e => setOntologyRelease(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="11/2026-01/mms" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">ICD-11 URI</label>
        <input value={ontologyUri} onChange={e => setOntologyUri(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="https://id.who.int/icd/entity/..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Ontology system</label>
          <input value={ontologySystem} onChange={e => setOntologySystem(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Source</label>
          <input value={source} onChange={e => setSource(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="who_api" />
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">Confidence (0–1)</label>
        <input type="number" min="0" max="1" step="0.01" value={confidence}
          onChange={e => setConfidence(Number(e.target.value))}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="diseaseConceptActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-4 w-4" />
        <label htmlFor="diseaseConceptActive" className="text-xs font-semibold uppercase text-slate-500">Active</label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
        <button type="submit" disabled={saving || !canonicalName.trim()}
          className="rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-[#004b85] disabled:opacity-50">
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Disease'}
        </button>
      </div>
    </form>
  )
}
