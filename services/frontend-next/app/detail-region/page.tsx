import type { Metadata } from 'next'
import ProvNttBencanaPage from '@/components/kejadian/ProvNttBencanaPage'

export const metadata: Metadata = {
  title: 'Detail Kejadian | Dashboard EOC Kemenkes',
  description: 'Detail kejadian dan dampak kesehatan berdasarkan wilayah yang dipilih.',
}

export default function DetailRegionPage() {
  return <ProvNttBencanaPage />
}
