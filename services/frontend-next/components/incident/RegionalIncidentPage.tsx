'use client'

import { useRouter } from 'next/navigation'
import IncidentDetailPage from './IncidentDetailPage'

// Static presentation data only. This page uses the incident-detail template
// without binding it to an external provider or a real event.
const TEMPLATE_EVENT = {
  id: 'REGION-DETAIL-TEMPLATE-001',
  kode_trans: 'REGION-DETAIL-TEMPLATE-001',
  nama: 'Regional Health Incident Overview',
  nama_bencana: 'Public Health Incident',
  jenis_bencana: 'Public Health Incident',
  provinsi: 'Indonesia',
  kabupaten: 'Regional Area',
  kecamatan: 'Multiple districts',
  tgl_kejadian: '2026-08-22',
  tgl_kejadian_riil: '2026-08-22',
  tgl_laporan: '2026-08-22',
  updated_at: '2026-08-22T10:00:00Z',
  latitude: -6.2,
  longitude: 106.816666,
  status_bencana: 'Active Response',
  keterangan: 'Static regional incident detail template for layout validation.',
  kronologis: 'Static regional incident detail template for layout validation.',
  deskripsi: 'Static regional incident detail template for layout validation.',
  buletin_eoc: 'Static regional incident detail template for layout validation.',
  meninggal: 0,
  luka_berat: 0,
  luka_ringan: 0,
  luka: 0,
  hilang: 0,
  pengungsi: 0,
  titik_pengungsian: 0,
  penduduk_terdampak: 0,
  detailData: {
    id: 'REGION-DETAIL-TEMPLATE-001',
    kode_trans: 'REGION-DETAIL-TEMPLATE-001',
    nama_bencana: 'Public Health Incident',
    jenis_bencana: 'Public Health Incident',
    provinsi: 'Indonesia',
    kabupaten: 'Regional Area',
    kecamatan: 'Multiple districts',
    tgl_kejadian: '2026-08-22',
    tgl_kejadian_riil: '2026-08-22',
    tgl_laporan: '2026-08-22',
    updated_at: '2026-08-22T10:00:00Z',
    latitude: -6.2,
    longitude: 106.816666,
    deskripsi: 'Static regional incident detail template for layout validation.',
    kronologis: 'Static regional incident detail template for layout validation.',
    keterangan: 'Static regional incident detail template for layout validation.',
    buletin_eoc: 'Static regional incident detail template for layout validation.',
    korban_meninggal: 0,
    korban_luka_berat: 0,
    korban_luka_ringan: 0,
    korban_luka: 0,
    korban_hilang: 0,
    pengungsi: 0,
    titik_pengungsian: 0,
    populasi_terdampak: 0,
    meninggal: 0,
    luka_berat: 0,
    luka_ringan: 0,
    luka: 0,
    hilang: 0,
    penduduk_terdampak: 0,
    lokasi: [],
    breakdown_kabupaten: [],
    faskes_terdampak: [],
    faskes_terdekat: [],
    pos_pengungsi: [],
    logistik: [],
    tck: [],
  },
}

export default function RegionalIncidentPage() {
  const router = useRouter()

  return (
    <div className="w-full">
      <IncidentDetailPage
        selectedEvent={TEMPLATE_EVENT}
        onBack={() => router.push('/')}
        isLoading={false}
        hideBack
      />
    </div>
  )
}
