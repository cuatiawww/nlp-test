'use client'

export const dynamic = 'force-dynamic'

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-900">Terjadi Kesalahan</h1>
          <p className="mt-2 text-sm text-slate-500">{error.message}</p>
          <button onClick={() => reset()} className="mt-4 rounded-xl bg-teal-600 px-6 py-2 text-sm font-semibold text-white">
            Coba Lagi
          </button>
        </div>
      </body>
    </html>
  )
}
