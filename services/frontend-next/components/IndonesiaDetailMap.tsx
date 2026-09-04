import dynamic from 'next/dynamic'
import type { OutbreakLocation } from '@/types'

const IndonesiaDetailMapClient = dynamic(() => import('./IndonesiaDetailMapClient'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-xl bg-[#e6f5f3]">
      <div className="flex items-center gap-2 text-xs font-bold text-teal-800">
        <span className="h-2.5 w-2.5 rounded-full bg-teal-600 animate-ping" />
        <span>Memuat Peta Spasial Wilayah Indonesia...</span>
      </div>
    </div>
  ),
})

export default function IndonesiaDetailMap({
  countries,
  locations,
}: {
  countries?: { name: string; cases: number }[]
  locations?: OutbreakLocation[]
}) {
  return <IndonesiaDetailMapClient countries={countries} locations={locations} />
}
