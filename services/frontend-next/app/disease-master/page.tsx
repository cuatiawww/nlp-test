'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { deleteDiseaseConcept, DiseaseConcept } from '@/lib/api'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import DiseaseConceptForm from '@/components/DiseaseConceptForm'

export default function DiseaseMasterPage() {
  const {
    data: concepts, loading, page, setPage, total, totalPages, search,
    setSearch, nextPage, prevPage, reload,
  } = usePaginatedFetch<DiseaseConcept>('/api/v1/disease-concepts')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<DiseaseConcept | null>(null)

  const handleDelete = async (concept: DiseaseConcept) => {
    if (!confirm(`Deactivate disease concept "${concept.canonical_name}"?`)) return
    try {
      await deleteDiseaseConcept(concept.id)
      toast.success('Disease concept deactivated.')
      reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to deactivate disease concept.')
    }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Disease Master</h1>
          <p className="mt-1 text-sm text-slate-500">WHO ICD-11 disease concepts used by the NLP pipeline</p>
        </div>
        <button onClick={() => { setEditItem(null); setShowModal(true) }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-3 py-2 text-sm font-bold uppercase text-white hover:bg-[#004b85]">
          <Plus className="h-4 w-4" /> Add Disease
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0z" /></svg>
          <SearchInput value={search} onChange={setSearch} placeholder="Search disease name or ICD-11 code..." />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="p-8 text-center text-slate-400 text-sm">Loading...</div> : concepts.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No disease concepts found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">WHO ICD-11 Disease</th>
                <th className="px-4 py-3 font-semibold text-slate-600">ICD-11 Code</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Source</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {concepts.map(concept => (
                <tr key={concept.id} className="border-b border-slate-50 hover:bg-blue-50/40">
                  <td className="px-4 py-3 font-medium text-slate-800">{concept.canonical_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{concept.ontology_code || 'Pending validation'}</td>
                  <td className="px-4 py-3 text-slate-700">{concept.source || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {concept.is_active && concept.ontology_code
                      ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-600">Validated</span>
                      : concept.is_active
                        ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Pending</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditItem(concept); setShowModal(true) }}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-[#0060A9] hover:bg-blue-50">Edit</button>
                    <button onClick={() => handleDelete(concept)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Deactivate ${concept.canonical_name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} onGoTo={setPage} />
      </div>

      <Modal open={showModal} maxWidth="max-w-2xl" title={editItem ? 'Edit Disease Concept' : 'Add Disease Concept'} onClose={() => setShowModal(false)}>
        <DiseaseConceptForm concept={editItem} onSaved={() => { setShowModal(false); reload() }} onCancel={() => setShowModal(false)} />
      </Modal>
    </div>
  )
}
