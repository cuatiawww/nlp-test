'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import IncidentDetailPage from './IncidentDetailPage'
import { fetchPublicDashboard } from '@/lib/api'
import type { PublicDashboard } from '@/types'

export default function RegionalIncidentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const countryParam = searchParams.get('country') || 'Indonesia'
  const [dashboard, setDashboard] = useState<PublicDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchPublicDashboard({ country: countryParam })
      .then((data) => {
        if (!cancelled) setDashboard(data)
      })
      .catch(() => {
        if (!cancelled) setDashboard(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [countryParam])

  const firstLocation = dashboard?.locations?.[0]
  const eventForRegion = useMemo(() => {
    const cases = dashboard?.kpis.cases ?? 0
    const deaths = dashboard?.kpis.deaths ?? 0
    const now = dashboard?.updated_at || new Date().toISOString()
    return {
      id: `region-${countryParam}`,
      kode_trans: `region-${countryParam}`,
      nama: `Regional health incident: ${countryParam}`,
      nama_bencana: dashboard?.by_disease?.[0]?.name || 'Regional surveillance',
      jenis_bencana: 'Public Health Incident',
      provinsi: countryParam,
      kabupaten: firstLocation?.location_name || `Region: ${countryParam}`,
      kecamatan: '',
      tgl_kejadian: now.slice(0, 10),
      tgl_kejadian_riil: now.slice(0, 10),
      tgl_laporan: now.slice(0, 10),
      updated_at: now,
      latitude: firstLocation?.latitude ?? null,
      longitude: firstLocation?.longitude ?? null,
      lat: firstLocation?.latitude ?? null,
      lng: firstLocation?.longitude ?? null,
      total_korban: cases,
      status_bencana: dashboard?.kpis.active_alerts ? 'Active Response' : 'Monitoring',
      keterangan: dashboard?.ai_summary?.text || '',
      kronologis: dashboard?.ai_summary?.text || '',
      deskripsi: dashboard?.ai_summary?.text || '',
      buletin_eoc: '',
      meninggal: deaths,
      luka_berat: 0,
      luka_ringan: 0,
      luka: 0,
      hilang: 0,
      pengungsi: 0,
      titik_pengungsian: 0,
      penduduk_terdampak: cases,
      detailData: {
        id: `region-${countryParam}`,
        kode_trans: `region-${countryParam}`,
        nama_bencana: dashboard?.by_disease?.[0]?.name || 'Regional surveillance',
        jenis_bencana: 'Public Health Incident',
        provinsi: countryParam,
        kabupaten: firstLocation?.location_name || `Region: ${countryParam}`,
        kecamatan: '',
        tgl_kejadian: now.slice(0, 10),
        tgl_kejadian_riil: now.slice(0, 10),
        tgl_laporan: now.slice(0, 10),
        updated_at: now,
        latitude: firstLocation?.latitude ?? null,
        longitude: firstLocation?.longitude ?? null,
        deskripsi: dashboard?.ai_summary?.text || '',
        kronologis: dashboard?.ai_summary?.text || '',
        keterangan: dashboard?.ai_summary?.text || '',
        buletin_eoc: '',
        korban_meninggal: deaths,
        korban_luka_berat: 0,
        korban_luka_ringan: 0,
        korban_luka: 0,
        korban_hilang: 0,
        pengungsi: 0,
        titik_pengungsian: 0,
        populasi_terdampak: cases,
        meninggal: deaths,
        luka_berat: 0,
        luka_ringan: 0,
        hilang: 0,
        penduduk_terdampak: cases,
        lokasi: [],
        breakdown_kabupaten: [],
        faskes_terdampak: [],
        faskes_terdekat: [],
        pos_pengungsi: [],
        logistik: [],
        tck: [],
      },
    }
  }, [countryParam, dashboard, firstLocation])

  return (
    <div className="w-full">
      <IncidentDetailPage
        selectedEvent={eventForRegion}
        onBack={() => router.push('/')}
        isLoading={loading}
        hideBack
      />
    </div>
  )
}
