import type { Metadata } from 'next'
import RegionalIncidentPage from '@/components/incident/RegionalIncidentPage'

export const metadata: Metadata = {
  title: 'Detail Kejadian | Dashboard EOC Kemenkes',
  description: 'Detail kejadian dan dampak kesehatan berdasarkan wilayah yang dipilih.',
}

export default function DetailRegionPage() {
  return <RegionalIncidentPage />
}
