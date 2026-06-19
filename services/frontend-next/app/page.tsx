import { fetchSummary } from '@/lib/api'

export default async function Page() {
  let summary: any[] = []
  try {
    summary = await fetchSummary()
  } catch {}

  const totalCases = summary.reduce((a: number, x: any) => a + Number(x.total_cases || 0), 0)
  const totalDeaths = summary.reduce((a: number, x: any) => a + Number(x.total_deaths || 0), 0)
  const totalAlerts = summary.filter((x: any) => x.has_alert).length

  return (
    <div className="px-4 md:px-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-teal-600">Total Lokasi</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-800">{summary.length}</p>
        </div>
        <div className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-teal-600">Total Kasus</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-800">{totalCases.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-red-600">Total Kematian</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-800">{totalDeaths.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-amber-600">Alert</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-800">{totalAlerts}</p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
          <h2 className="text-base font-bold uppercase tracking-[0.04em] text-slate-900">Ringkasan per Lokasi</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Lokasi</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Penyakit</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Kasus</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Kematian</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Confidence</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Alert</th>
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada data</td></tr>
              ) : (
                summary.map((row: any, idx: number) => (
                  <tr key={idx} className="border-b border-slate-50 hover:bg-teal-50/40">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.location_name || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{row.disease_classification || '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{row.total_cases}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{row.total_deaths}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{row.max_confidence ? `${row.max_confidence}%` : '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {row.has_alert
                        ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">Ya</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Tidak</span>
                      }
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
