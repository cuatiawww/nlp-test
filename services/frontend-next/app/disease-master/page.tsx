'use client'

import { useState } from 'react'
import { Plus, Trash2, Settings, Pencil, ShieldAlert, Sparkles, Database } from 'lucide-react'
import { toast } from 'sonner'
import { deleteDiseaseConcept, DiseaseConcept } from '@/lib/api'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import DiseaseConceptForm from '@/components/DiseaseConceptForm'
import DiseaseAliasModal from '@/components/DiseaseAliasModal'

export default function DiseaseMasterPage() {
  const {
    data: concepts, loading, page, setPage, total, totalPages, search,
    setSearch, nextPage, prevPage, reload,
  } = usePaginatedFetch<DiseaseConcept>('/api/v1/disease-concepts')

  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<DiseaseConcept | null>(null)

  const [aliasModalOpen, setAliasModalOpen] = useState(false)
  const [aliasTargetConcept, setAliasTargetConcept] = useState<DiseaseConcept | null>(null)

  const handleDelete = async (concept: DiseaseConcept) => {
    if (!confirm(`Deactivate disease concept "${concept.canonical_name}" (${concept.disease_id || concept.id})?`)) return
    try {
      await deleteDiseaseConcept(concept.id)
      toast.success(`Disease "${concept.canonical_name}" deactivated.`)
      reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to deactivate disease concept.')
    }
  }

  const handleOpenAliases = (concept: DiseaseConcept) => {
    setAliasTargetConcept(concept)
    setAliasModalOpen(true)
  }

  return (
    <div className="px-4 md:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Disease Master</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-[#0060A9]">
              <Database className="h-3 w-3" /> Standardized
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Deduplicated master disease catalog with WHO ICD-11 ontology codes and country-specific ASEAN aliases
          </p>
        </div>
        <button
          onClick={() => { setEditItem(null); setShowModal(true) }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-4 py-2 text-sm font-bold uppercase text-white hover:bg-[#004b85] shadow-xs transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Disease
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="relative w-full max-w-sm">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by disease ID, name, category, or ICD-11..."
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Total Standardized Diseases: <span className="font-bold text-slate-800">{total}</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading disease catalog...</div>
        ) : concepts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No disease concepts found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs uppercase font-semibold text-slate-600 tracking-wider">
                <th className="px-4 py-3.5">Disease ID</th>
                <th className="px-4 py-3.5">Standardized Clinical Name</th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5 text-center">Zoonotic</th>
                <th className="px-4 py-3.5">ICD-11 Code</th>
                <th className="px-4 py-3.5 text-center">Engine / Portal</th>
                <th className="px-4 py-3.5 text-center">Aliases</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {concepts.map((concept) => (
                <tr key={concept.id} className="hover:bg-blue-50/30 transition-colors">
                  {/* Disease ID */}
                  <td className="px-4 py-3 font-mono text-xs font-bold text-[#0060A9]">
                    <span className="rounded bg-blue-50 px-2 py-0.5 border border-blue-100">
                      {concept.disease_id || concept.canonical_name.toUpperCase().replace(/\s+/g, '_')}
                    </span>
                  </td>

                  {/* Disease Name */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{concept.canonical_name}</div>
                    {concept.description && (
                      <div className="text-[11px] text-slate-400 max-w-xs truncate" title={concept.description}>
                        {concept.description}
                      </div>
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3">
                    {concept.category ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 font-medium border border-slate-200">
                        {concept.category}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>

                  {/* Zoonotic Flag */}
                  <td className="px-4 py-3 text-center">
                    {concept.is_zoonotic ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        <ShieldAlert className="h-3 w-3" /> Zoonotic
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">No</span>
                    )}
                  </td>

                  {/* ICD-11 Code */}
                  <td className="px-4 py-3">
                    {concept.ontology_code ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-800 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                          {concept.ontology_code}
                        </span>
                        {concept.ontology_uri && (
                          <a
                            href={concept.ontology_uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline"
                            title={concept.ontology_uri}
                          >
                            WHO
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-400">
                        Pending
                      </span>
                    )}
                  </td>

                  {/* Engine & Public Badges */}
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {concept.allow_engine ? (
                        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200" title="NLP Engine active">
                          NLP
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400" title="NLP Engine disabled">
                          Off
                        </span>
                      )}
                      {concept.is_public ? (
                        <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#0060A9] border border-blue-200" title="Visible on Public Portal">
                          Public
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400" title="Hidden from Public Portal">
                          Private
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Aliases Column */}
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleOpenAliases(concept)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#0060A9] transition-colors"
                      title="Manage country-specific aliases"
                    >
                      <Settings className="h-3 w-3 text-slate-500" />
                      <span>{concept.alias_count ?? 0}</span>
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => handleOpenAliases(concept)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-[#0060A9]"
                        title="Configure Country Aliases"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => { setEditItem(concept); setShowModal(true) }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        title="Edit Disease Details"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(concept)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title={`Deactivate ${concept.canonical_name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPrev={prevPage}
          onNext={nextPage}
          onGoTo={setPage}
        />
      </div>

      {/* Disease Form Modal */}
      <Modal
        open={showModal}
        maxWidth="max-w-2xl"
        title={editItem ? `Edit Disease: ${editItem.canonical_name}` : 'Add New Disease to Master'}
        onClose={() => setShowModal(false)}
      >
        <DiseaseConceptForm
          concept={editItem}
          onSaved={() => { setShowModal(false); reload() }}
          onCancel={() => setShowModal(false)}
        />
      </Modal>

      {/* Country Alias Modal */}
      <DiseaseAliasModal
        concept={aliasTargetConcept}
        open={aliasModalOpen}
        onClose={() => { setAliasModalOpen(false); setAliasTargetConcept(null) }}
        onSaved={() => reload()}
      />
    </div>
  )
}
