'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { InteroperabilityIntegration } from '@/types'
import { usePaginatedFetch } from '@/hooks/usePaginatedFetch'
import SearchInput from '@/components/SearchInput'
import Pagination from '@/components/Pagination'
import Modal from '@/components/Modal'
import {
  createInteroperabilityIntegration,
  updateInteroperabilityIntegration,
  deleteInteroperabilityIntegration,
} from '@/lib/api'

type IntegrationFormProps = {
  integration: InteroperabilityIntegration | null
  onSaved: () => void
  onCancel: () => void
}

const statusOptions = ['ACTIVE', 'IN_PROGRESS', 'INACTIVE', 'ERROR', 'PLANNED'] as const

function IntegrationForm({ integration, onSaved, onCancel }: IntegrationFormProps) {
  const [name, setName] = useState('')
  const [integrationType, setIntegrationType] = useState('API')
  const [provider, setProvider] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [status, setStatus] = useState<string>('PLANNED')
  const [integratedIn, setIntegratedIn] = useState('')
  const [description, setDescription] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [lastCheckedAt, setLastCheckedAt] = useState('')
  const [lastError, setLastError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(integration?.name || '')
    setIntegrationType(integration?.integration_type || 'API')
    setProvider(integration?.provider || '')
    setSourceUrl(integration?.source_url || '')
    setEndpoint(integration?.endpoint || '')
    setStatus(integration?.status || 'PLANNED')
    setIntegratedIn((integration?.integrated_in || []).join(', '))
    setDescription(integration?.description || '')
    setEnabled(integration?.enabled ?? true)
    setLastCheckedAt(integration?.last_checked_at ? integration.last_checked_at.slice(0, 16) : '')
    setLastError(integration?.last_error || '')
  }, [integration])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      toast.error('Integration name is required')
      return
    }
    setSaving(true)
    const payload = {
      name: name.trim(),
      integration_type: integrationType.trim() || 'API',
      provider: provider.trim() || null,
      source_url: sourceUrl.trim() || null,
      endpoint: endpoint.trim() || null,
      status,
      integrated_in: integratedIn.split(',').map((item) => item.trim()).filter(Boolean),
      description: description.trim() || null,
      enabled,
      last_checked_at: lastCheckedAt ? new Date(lastCheckedAt).toISOString() : null,
      last_error: lastError.trim() || null,
    }
    try {
      if (integration) await updateInteroperabilityIntegration(integration.id, payload)
      else await createInteroperabilityIntegration(payload)
      toast.success(integration ? 'Integration updated' : 'Integration created')
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save integration')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#0060A9] focus:ring-2 focus:ring-blue-100'
  const labelClass = 'text-xs font-semibold uppercase tracking-[0.06em] text-slate-500'

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>Integration name<input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Weather API" required /></label>
        <label className={labelClass}>Type<input className={inputClass} value={integrationType} onChange={(e) => setIntegrationType(e.target.value)} placeholder="API, RSS, Webhook, Service" required /></label>
        <label className={labelClass}>Provider / source<input className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="BMKG, WHO, Internal NLP service" /></label>
        <label className={labelClass}>Status<select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>{statusOptions.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}</select></label>
        <label className={labelClass}>Source URL<input className={inputClass} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://provider.example/feed" type="url" /></label>
        <label className={labelClass}>Integrated endpoint<input className={inputClass} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="/api/v1/weather" /></label>
      </div>
      <label className={labelClass}>Integrated in <span className="font-normal normal-case tracking-normal text-slate-400">(comma separated modules)</span><input className={inputClass} value={integratedIn} onChange={(e) => setIntegratedIn(e.target.value)} placeholder="Regional Map, Dashboard" /></label>
      <label className={labelClass}>Description<textarea className={`${inputClass} min-h-20 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this integration provides and how it is used." /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>Last checked at<input className={inputClass} value={lastCheckedAt} onChange={(e) => setLastCheckedAt(e.target.value)} type="datetime-local" /></label>
        <label className={labelClass}>Last error / note<input className={inputClass} value={lastError} onChange={(e) => setLastError(e.target.value)} placeholder="Optional diagnostic note" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[#0060A9]" /> Enabled in the catalog</label>
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Do not store API keys or credentials here. Keep secrets in environment or secret management configuration.</p>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-xl bg-[#0060A9] px-4 py-2 text-sm font-bold text-white hover:bg-[#004b85] disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving...' : integration ? 'Save changes' : 'Add integration'}</button>
      </div>
    </form>
  )
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700',
    IN_PROGRESS: 'bg-amber-100 text-amber-700',
    ERROR: 'bg-red-100 text-red-700',
    INACTIVE: 'bg-slate-100 text-slate-600',
    PLANNED: 'bg-blue-100 text-blue-700',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status] || styles.PLANNED}`}>{status.replace('_', ' ')}</span>
}

export default function InteroperabilityPage() {
  const { data, loading, page, setPage, total, totalPages, search, setSearch, nextPage, prevPage, reload } = usePaginatedFetch<InteroperabilityIntegration>('/api/v1/interoperability-integrations')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<InteroperabilityIntegration | null>(null)

  const openCreate = () => { setEditing(null); setShowModal(true) }
  const openEdit = (item: InteroperabilityIntegration) => { setEditing(item); setShowModal(true) }
  const closeModal = () => setShowModal(false)

  const handleDelete = async (item: InteroperabilityIntegration) => {
    if (!confirm(`Delete integration "${item.name}"?`)) return
    try {
      await deleteInteroperabilityIntegration(item.id)
      toast.success('Integration deleted')
      reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete integration')
    }
  }

  return (
    <div className="px-4 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">Interoperability</h1>
          <p className="mt-1 text-sm text-slate-500">Catalog external APIs, feeds, services, status, and dashboard integration points.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reload} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold uppercase text-slate-600 hover:bg-slate-50">Refresh</button>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-3 py-2 text-sm font-bold uppercase text-white hover:bg-[#004b85]"><Plus className="h-4 w-4" /> Add integration</button>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1"><SearchInput value={search} onChange={setSearch} placeholder="Search integration, provider, or type..." /></div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading integrations...</div> : data.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No integrations registered yet.</div> : (
            <table className="w-full min-w-[980px] text-sm">
              <thead><tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Integration</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Type / Provider</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Source / Endpoint</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Integrated in</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Last checked</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
              </tr></thead>
              <tbody>{data.map((item) => <tr key={item.id} className="border-b border-slate-50 hover:bg-blue-50/40">
                <td className="px-4 py-3"><span className="font-semibold text-[#0060A9]">{item.name}</span><div className="mt-0.5 text-xs text-slate-400">{item.enabled ? 'Enabled' : 'Disabled'}</div></td>
                <td className="px-4 py-3"><span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{item.integration_type}</span><div className="mt-1 text-xs text-slate-500">{item.provider || '—'}</div></td>
                <td className="max-w-[260px] px-4 py-3 text-xs text-slate-600"><div className="truncate" title={item.source_url || ''}>{item.source_url || 'No source URL'}</div><div className="mt-1 truncate text-slate-400" title={item.endpoint || ''}>{item.endpoint || 'No endpoint'}</div></td>
                <td className="px-4 py-3">{statusBadge(item.status)}{item.last_error && <div className="mt-1 max-w-[160px] truncate text-xs text-red-500" title={item.last_error}>{item.last_error}</div>}</td>
                <td className="max-w-[200px] px-4 py-3 text-xs text-slate-600">{item.integrated_in?.length ? item.integrated_in.join(', ') : '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{item.last_checked_at ? new Date(item.last_checked_at).toLocaleString() : 'Not checked'}</td>
                <td className="px-4 py-3 text-right"><button onClick={() => openEdit(item)} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-[#0060A9]" title="Edit"><Pencil className="h-4 w-4" /></button><button onClick={() => handleDelete(item)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button></td>
              </tr>)}</tbody>
            </table>
          )}
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} onPrev={prevPage} onNext={nextPage} onGoTo={setPage} />
      </div>

      <Modal open={showModal} title={editing ? 'Edit integration' : 'Add integration'} onClose={closeModal} maxWidth="max-w-3xl">
        <IntegrationForm integration={editing} onSaved={() => { closeModal(); reload() }} onCancel={closeModal} />
      </Modal>
    </div>
  )
}
