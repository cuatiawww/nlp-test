'use client'

import { toast } from 'sonner'

const API = ''

export default function CleanupButton({ onDone }: { onDone?: () => void }) {
  const handleCleanup = () => {
    if (!confirm('Hapus semua data events? Data sumber tidak akan terhapus.')) return
    toast.promise(
      fetch(`${API}/api/v1/data/cleanup-events`, { method: 'POST' }),
      {
        loading: 'Menghapus data events...',
        success: () => {
          window.location.reload()
          return 'Data events berhasil dihapus'
        },
        error: 'Gagal menghapus data',
      }
    )
  }

  return (
    <button onClick={handleCleanup}
      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold uppercase text-red-600 transition hover:bg-red-100">
      Hapus Semua Events
    </button>
  )
}
