'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DetailKejadianPage from './DetailKejadianPage'
import { useHeaderStore } from '@/lib/headerStore'

const safeParseInt = (val: any): number => {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.floor(val)
  }
  const clean = String(val)
    .replace(/\s*[a-zA-Z]+/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '')
    .trim()
  const parsed = parseInt(clean, 10)
  return isNaN(parsed) ? 0 : parsed
}

// Data Dasar Struktur Gempa NTT (Sinkron dengan BMKG & API Collector /api/ntt-data)
const NTT_KRONOLOGIS_TEXT = 'Telah terjadi gempa bumi dengan M 7.7 pada kedalaman 15 km. Gempa berpusat di Laut 30 km Timur laut Mbay-Nagekeo-NTT, Provinsi Nusa Tenggara Timur. Gempa berpotensi Tsunami dengan Status Siaga: Kabupaten Manggarai, Ngada, Manggarai Barat, Selayar, Ende, Sikka , Jeneponto, Banteang dan Status Waspada:Kabupaten Bima, Kota-bima, Flores-timur, Dompu, Kota-bau-bau, Takalar, Bone, Wajo, Luwu,  dan Kota-palopo.'

const BASE_NTT_GEMPA_EVENT = {
  id: 'EVT-NTT-2026-0819-01',
  kode_trans: 'EVT-NTT-2026-0819-01',
  nama: 'Gempa Bumi M 7.7 Laut Flores - 30 km Timur Laut Mbay-Nagekeo-NTT',
  nama_bencana: 'Gempa Bumi',
  jenis_bencana: 'Gempa Bumi',
  provinsi: 'NUSA TENGGARA TIMUR',
  kabupaten: 'FLORES TIMUR',
  kecamatan: 'Mbay, Larantuka, Tanjung Bunga, Ile Mandiri, Adonara, Borong, Ruteng, Bajawa, Ende',
  waktu_kejadian_bmkg: '15 Agu 2026, 09:18:22 WITA (M 7.7)',
  tgl_kejadian_riil: '2026-08-15 09:18:22',
  tgl_kejadian: '2026-08-15 09:18:22',
  tgl_laporan: '22 Agustus 2026, 01:47 WIB',
  updated_at: '2026-08-22 01:47:00',
  latitude: -8.3421,
  longitude: 122.9814,
  status_bencana: 'Tanggap Darurat',
  keterangan: NTT_KRONOLOGIS_TEXT,
  kronologis: NTT_KRONOLOGIS_TEXT,
  deskripsi: NTT_KRONOLOGIS_TEXT,
  buletin_eoc: NTT_KRONOLOGIS_TEXT,
  
  // Parameter Seismisitas BMKG
  magnitudo: 7.7,
  kedalaman: '15 km',
  potensi_tsunami: 'Berpotensi Tsunami (Status Siaga & Waspada)',
  tsunami: 'Berpotensi Tsunami (Status Siaga & Waspada)',
  skala_mmi: 'VII - VIII MMI (Mbay-Nagekeo, Flores Timur, Alor, Sikka, Manggarai)',

  // Data Korban Ringkasan (Sinkron secara dinamis dengan collector)
  meninggal: 0,
  luka_berat: 0,
  luka_ringan: 0,
  luka: 0,
  hilang: 0,
  pengungsi: 0,
  titik_pengungsian: 0,
  penduduk_terdampak: 0,

  detailData: {
    id: 'EVT-NTT-2026-0819-01',
    kode_trans: 'EVT-NTT-2026-0819-01',
    nama_bencana: 'Gempa Bumi',
    jenis_bencana: 'Gempa Bumi',
    provinsi: 'NUSA TENGGARA TIMUR',
    kabupaten: 'FLORES TIMUR',
    kecamatan: 'Mbay, Larantuka, Tanjung Bunga, Ile Mandiri, Adonara, Borong, Ruteng, Bajawa, Ende',
    waktu_kejadian_bmkg: '15 Agu 2026, 09:18:22 WITA (M 7.7)',
    tgl_kejadian_riil: '2026-08-15 09:18:22',
    tgl_kejadian: '2026-08-15 09:18:22',
    tgl_laporan: '',
    updated_at: '',
    latitude: -8.3421,
    longitude: 122.9814,
    deskripsi: NTT_KRONOLOGIS_TEXT,
    kronologis: NTT_KRONOLOGIS_TEXT,
    keterangan: NTT_KRONOLOGIS_TEXT,
    buletin_eoc: NTT_KRONOLOGIS_TEXT,
    
    // Parameter Seismisitas
    magnitudo: 7.7,
    kedalaman: '15 km',
    potensi_tsunami: 'Berpotensi Tsunami (Status Siaga & Waspada)',
    tsunami: 'Berpotensi Tsunami (Status Siaga & Waspada)',
    skala_mmi: 'VII - VIII MMI (Mbay-Nagekeo, Flores Timur, Alor, Sikka, Manggarai)',
    status_tanggap_darurat: 'Tanggap Darurat (Level Provinsi & Nasional)',

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

    breakdown_kabupaten: [],
    faskes_terdampak: [],
    faskes_terdekat: [],
    lokasi: [
      { id: 'loc-1', kecamatan: 'Mbay', kabupaten: 'Nagekeo', latitude: -8.562, longitude: 121.284 },
      { id: 'loc-2', kecamatan: 'Borong', kabupaten: 'Manggarai Timur', latitude: -8.621, longitude: 120.612 },
      { id: 'loc-3', kecamatan: 'Ruteng', kabupaten: 'Manggarai', latitude: -8.614, longitude: 120.463 },
      { id: 'loc-4', kecamatan: 'Bajawa', kabupaten: 'Ngada', latitude: -8.792, longitude: 120.965 },
      { id: 'loc-5', kecamatan: 'Maumere', kabupaten: 'Sikka', latitude: -8.621, longitude: 122.211 },
      { id: 'loc-6', kecamatan: 'Ende', kabupaten: 'Ende', latitude: -8.843, longitude: 121.662 },
      { id: 'loc-7', kecamatan: 'Labuan Bajo', kabupaten: 'Manggarai Barat', latitude: -8.496, longitude: 119.887 },
    ],
    pos_pengungsi: [],
    logistik: [],
    tck: []
  }
}

// Global memory cache agar saat berpindah halaman data langsung muncul instan tanpa skeleton reload
let globalNttEventCache: any = null
let globalNttHasLoadedOnce = false

export default function ProvNttBencanaPage() {
  const router = useRouter()
  const { setHeader, resetHeader } = useHeaderStore()
  const [eventData, setEventData] = useState<any>(globalNttEventCache || BASE_NTT_GEMPA_EVENT)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [isLoadingDate, setIsLoadingDate] = useState<boolean>(!globalNttHasLoadedOnce && !globalNttEventCache)

  useEffect(() => {
    setHeader({
      title: 'DASHBOARD GEMPA BUMI - PROV. NTT',
      description: 'Analisis spasial kejadian bencana dan dampaknya terhadap sumber daya kesehatan di wilayah PROV. NUSA TENGGARA TIMUR.',
    })

    return () => {
      resetHeader()
    }
  }, [setHeader, resetHeader])

  // 1. Inisialisasi data gempa NTT
  useEffect(() => {
    let active = true
    const fetchBmkg = async () => {
      try {
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
        const res = await fetch(`${basePath}/api/bmkg-gempa`, { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (!active || !json.success || !json.data) return

        const allGempa = [
          ...(Array.isArray(json.data.gempadirasakan) ? json.data.gempadirasakan : (json.data.gempadirasakan ? [json.data.gempadirasakan] : [])),
          ...(Array.isArray(json.data.gempaterkini) ? json.data.gempaterkini : (json.data.gempaterkini ? [json.data.gempaterkini] : [])),
          json.data.autogempa,
        ].filter(Boolean)

        const nttKeywords = ['manggarai', 'ruteng', 'sikka', 'mbay', 'nagekeo', 'flores', 'ende', 'ntt', 'kupang', 'alor']
        const matched = allGempa.find((g: any) => {
          const text = `${g.Wilayah || ''} ${g.Dirasakan || ''} ${g.region || ''}`.toLowerCase()
          return nttKeywords.some(kw => text.includes(kw))
        })

        if (matched && active) {
          // Tetap pertahankan kronologis resmi yang diinput oleh EOC Kemenkes
          setEventData((prev: any) => ({
            ...prev,
            keterangan: NTT_KRONOLOGIS_TEXT,
            kronologis: NTT_KRONOLOGIS_TEXT,
            buletin_eoc: NTT_KRONOLOGIS_TEXT,
            bmkg_live: matched,
            skala_mmi: matched.Dirasakan || prev.skala_mmi,
            waktu_kejadian_bmkg: matched.Jam ? `${matched.Tanggal}, ${matched.Jam}` : prev.waktu_kejadian_bmkg
          }))
        }
      } catch (err) {
        console.warn('[ProvNttBencanaPage] Gagal memuat data BMKG live:', err)
      }
    }

    fetchBmkg()
  }, [])

  // 2. Ambil data real-time dari API resmi collector (/api/ntt-data)
  const loadCollectorData = async (targetDate?: string) => {
    // Hanya tampilkan full skeleton loading jika data belum pernah dimuat sama sekali
    if (!globalNttHasLoadedOnce && !globalNttEventCache) {
      setIsLoadingDate(true)
    }
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
      const url = targetDate ? `${basePath}/api/ntt-data?tanggal=${targetDate}` : `${basePath}/api/ntt-data`
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        if (json.success) {
          let tot: any = {}
          let tgl = json.tanggal || targetDate || ''
          const breakdownKab: any[] = []
          const faskesList: any[] = []

          // 1. Situasi Kesehatan Per Kabupaten
          if (json.tables?.situasi_kesehatan && Array.isArray(json.tables.situasi_kesehatan) && json.tables.situasi_kesehatan.length > 0) {
            const rows = json.tables.situasi_kesehatan
            let sm = 0, slb = 0, slr = 0, sp = 0, stp = 0, sterdampak = 0, shilang = 0
            rows.forEach((r: any) => {
              const meninggal = safeParseInt(r.meninggal || r.korban_meninggal)
              const lukaBerat = safeParseInt(r.luka_berat || r.korban_luka_berat)
              const lukaRingan = safeParseInt(r.luka_ringan || r.korban_luka_ringan)
              const pengungsi = safeParseInt(r.pengungsi || r.jumlah_pengungsi)
              const titikPosko = safeParseInt(r.titik_pengungsian || r.titik_posko)
              const terdampak = safeParseInt(r.populasi_terdampak || r.penduduk_terdampak)
              const hilang = safeParseInt(r.hilang || r.korban_hilang)

              sm += meninggal
              slb += lukaBerat
              slr += lukaRingan
              sp += pengungsi
              stp += titikPosko
              sterdampak += terdampak
              shilang += hilang

              breakdownKab.push({
                kabupaten: r.kabupaten || '',
                ibukota: r.ibukota || '',
                meninggal,
                luka_berat: lukaBerat,
                luka_ringan: lukaRingan,
                total_luka: lukaBerat + lukaRingan,
                hilang,
                pengungsi,
                titik_posko: titikPosko,
                populasi_terdampak: terdampak,
                zona: meninggal > 10 ? 'Zona Merah' : meninggal > 0 ? 'Zona Oranye' : 'Zona Kuning',
                zonaColor: meninggal > 10 ? 'bg-rose-50 text-rose-700 border-rose-200' : meninggal > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-yellow-50 text-yellow-800 border-yellow-200'
              })
            })
            tot = {
              meninggal: sm,
              luka_berat: slb,
              luka_ringan: slr,
              total_luka: slb + slr,
              hilang: shilang,
              pengungsi: sp,
              titik_pengungsian: stp,
              populasi_terdampak: sterdampak
            }
          } else if (json.tables?.analisa_ringkasan_harian) {
            const rows = json.tables.analisa_ringkasan_harian
            const lastRow = rows[rows.length - 1] || {}
            tot = {
              meninggal: Number(lastRow.meninggal || lastRow.korban_meninggal || 0),
              luka_berat: Number(lastRow.luka_berat || lastRow.korban_luka_berat || 0),
              luka_ringan: Number(lastRow.luka_ringan || lastRow.korban_luka_ringan || 0),
              total_luka: Number(lastRow.total_luka || lastRow.luka || 0),
              hilang: Number(lastRow.hilang || 0),
              pengungsi: Number(lastRow.pengungsi || lastRow.jumlah_pengungsi || 0),
              titik_pengungsian: Number(lastRow.titik_pengungsian || 0),
              populasi_terdampak: Number(lastRow.populasi_terdampak || lastRow.penduduk_terdampak || 0)
            }
          }

          if (json.summary_korban) {
            tot = {
              meninggal: safeParseInt(json.summary_korban.total_meninggal ?? json.summary_korban.meninggal) || tot.meninggal,
              luka_berat: safeParseInt(json.summary_korban.total_luka_berat ?? json.summary_korban.luka_berat) || tot.luka_berat,
              luka_ringan: safeParseInt(json.summary_korban.total_luka_ringan ?? json.summary_korban.luka_ringan) || tot.luka_ringan,
              total_luka: safeParseInt(json.summary_korban.total_korban_luka ?? json.summary_korban.total_luka) || (tot.luka_berat + tot.luka_ringan),
              hilang: tot.hilang || 0,
              pengungsi: safeParseInt(json.summary_korban.total_pengungsi ?? json.summary_korban.pengungsi) || tot.pengungsi,
              titik_pengungsian: safeParseInt(json.summary_korban.total_titik_pengungsian ?? json.summary_korban.titik_pengungsian) || tot.titik_pengungsian,
              populasi_terdampak: safeParseInt(json.summary_korban.total_populasi_terdampak ?? json.summary_korban.populasi_terdampak) || tot.populasi_terdampak
            }
          }

          // 2. Data Pasien RS & Puskesmas dari Collector (Faskes Siaga yang melayani pasien)
          if (Array.isArray(json.tables?.pasien_rs)) {
            json.tables.pasien_rs.forEach((rs: any, idx: number) => {
              faskesList.push({
                id: `rs-${idx + 1}`,
                nama: rs.nama_master || rs.nama_resmi || rs.nama_rs || rs.rs || rs.nama || 'RS Rujukan',
                nama_faskes: rs.nama_master || rs.nama_resmi || rs.nama_rs || rs.rs || rs.nama || 'RS Rujukan',
                jenis: 'RS',
                jenis_faskes: 'Rumah Sakit',
                kode_sarana: rs.kode_sarana || '-',
                kode_satusehat: rs.kode_satusehat || '-',
                kabupaten: rs.nama_kab || rs.kabupaten || '',
                kecamatan: rs.nama_kecamatan || rs.kecamatan || '-',
                alamat: rs.alamat || '-',
                latitude: rs.latitude ?? null,
                longitude: rs.longitude ?? null,
                lat: rs.latitude ?? null,
                lng: rs.longitude ?? null,
                status: rs.status || 'Beroperasi Siaga Bencana',
                kondisi_bangunan: rs.kondisi_bangunan || 'Normal / Siaga',
                triase_merah: safeParseInt(rs.triase_merah),
                triase_kuning: safeParseInt(rs.triase_kuning),
                triase_hijau: safeParseInt(rs.triase_hijau),
                triase_hitam: safeParseInt(rs.triase_hitam),
                total_pasien: safeParseInt(rs.total),
                kapasitas_tersedia: rs.kapasitas_tersedia || '-',
                stok_darah: rs.stok_darah || '-',
                listrik: rs.listrik || 'PLN / Genset Siaga',
                pj_medis: rs.pj_medis || '-',
                telp: rs.telp || '-',
                email: rs.email || '-',
                has_collector_data: true,
              })
            })
          }

          if (Array.isArray(json.tables?.pasien_puskesmas)) {
            json.tables.pasien_puskesmas.forEach((pkm: any, idx: number) => {
              faskesList.push({
                id: `pkm-${idx + 1}`,
                nama: pkm.nama_master ? `Puskesmas ${pkm.nama_master}` : (pkm.nama_puskesmas || pkm.puskesmas || pkm.nama || 'Puskesmas'),
                nama_faskes: pkm.nama_master ? `Puskesmas ${pkm.nama_master}` : (pkm.nama_puskesmas || pkm.puskesmas || pkm.nama || 'Puskesmas'),
                jenis: 'Puskesmas',
                jenis_faskes: 'Puskesmas',
                kode_sarana: pkm.kode_sarana || '-',
                kode_satusehat: pkm.kode_satusehat || '-',
                kabupaten: pkm.nama_kab || pkm.kabupaten || '',
                kecamatan: pkm.nama_kecamatan || pkm.kecamatan || '-',
                alamat: pkm.alamat || '-',
                latitude: pkm.latitude ?? null,
                longitude: pkm.longitude ?? null,
                lat: pkm.latitude ?? null,
                lng: pkm.longitude ?? null,
                status: pkm.status || 'Beroperasi',
                kondisi_bangunan: pkm.kondisi_bangunan || 'Normal',
                triase_merah: safeParseInt(pkm.triase_merah),
                triase_kuning: safeParseInt(pkm.triase_kuning),
                triase_hijau: safeParseInt(pkm.triase_hijau),
                triase_hitam: safeParseInt(pkm.triase_hitam),
                total_pasien: safeParseInt(pkm.total),
                kapasitas_tersedia: pkm.kapasitas_tersedia || '-',
                listrik: pkm.listrik || 'PLN',
                pj_medis: pkm.pj_medis || '-',
                telp: pkm.telp || '-',
                email: pkm.email || '-',
                has_collector_data: true,
              })
            })
          }

          // 3. Seluruh Master Data Faskes NTT (1.818 faskes) dari Master Dataset API
          const allMasterFaskes = Array.isArray(json.tables?.master_faskes) && json.tables.master_faskes.length > 0
            ? json.tables.master_faskes
            : (faskesList.length > 0 ? faskesList : [])
          
          // Fetch data upaya kesehatan spesifik dari API /api/upaya-kesehatan
          let upayaKesehatanData = json.upaya_kesehatan || json.tables?.upaya_kesehatan || null
          if (!upayaKesehatanData || !Array.isArray(upayaKesehatanData.data) || upayaKesehatanData.data.length === 0) {
            try {
              const uRes = await fetch(`${basePath}/api/upaya-kesehatan`, { cache: 'no-store' })
              if (uRes.ok) {
                const uJson = await uRes.json()
                if (uJson && uJson.success) {
                  upayaKesehatanData = uJson
                }
              }
            } catch (uErr) {
              console.warn('[ProvNttBencanaPage] Fetch /api/upaya-kesehatan error:', uErr)
            }
          }

          const updateTimestamp = json.updated_at || (tgl ? `${tgl} 10:01:00` : new Date().toISOString())
          setEventData((prev: any) => {
            const next = {
              ...prev,
              tgl_laporan: updateTimestamp || prev.tgl_laporan,
              updated_at: updateTimestamp,
              meninggal: tot.meninggal ?? prev.meninggal,
              luka_berat: tot.luka_berat ?? prev.luka_berat,
              luka_ringan: tot.luka_ringan ?? prev.luka_ringan,
              luka: tot.total_luka ?? prev.luka,
              hilang: tot.hilang ?? prev.hilang,
              pengungsi: tot.pengungsi ?? prev.pengungsi,
              titik_pengungsian: tot.titik_pengungsian ?? prev.titik_pengungsian,
              penduduk_terdampak: tot.populasi_terdampak ?? prev.penduduk_terdampak,
              upaya_kesehatan: upayaKesehatanData || prev.upaya_kesehatan || null,
              detailData: {
                ...prev.detailData,
                tgl_laporan: updateTimestamp || prev.detailData.tgl_laporan,
                updated_at: updateTimestamp,
                korban_meninggal: tot.meninggal ?? prev.detailData.korban_meninggal,
                korban_luka_berat: tot.luka_berat ?? prev.detailData.korban_luka_berat,
                korban_luka_ringan: tot.luka_ringan ?? prev.detailData.korban_luka_ringan,
                korban_luka: tot.total_luka ?? prev.detailData.korban_luka,
                korban_hilang: tot.hilang ?? prev.detailData.korban_hilang,
                pengungsi: tot.pengungsi ?? prev.detailData.pengungsi,
                titik_pengungsian: tot.titik_pengungsian ?? prev.detailData.titik_pengungsian,
                populasi_terdampak: tot.populasi_terdampak ?? prev.detailData.populasi_terdampak,
                meninggal: tot.meninggal ?? prev.detailData.meninggal,
                luka_berat: tot.luka_berat ?? prev.detailData.luka_berat,
                luka_ringan: tot.luka_ringan ?? prev.detailData.luka_ringan,
                luka: tot.total_luka ?? prev.detailData.luka,
                hilang: tot.hilang ?? prev.detailData.hilang,
                penduduk_terdampak: tot.populasi_terdampak ?? prev.detailData.penduduk_terdampak,
                breakdown_kabupaten: breakdownKab.length > 0 ? breakdownKab : prev.detailData.breakdown_kabupaten,
                faskes_terdampak: Array.isArray(json.faskes_terdampak) && json.faskes_terdampak.length > 0 ? json.faskes_terdampak : (Array.isArray(json.tables?.faskes_terdampak) && json.tables.faskes_terdampak.length > 0 ? json.tables.faskes_terdampak : (faskesList.length > 0 ? faskesList : prev.detailData.faskes_terdampak)),
                faskes_terdekat: allMasterFaskes.length > 0 ? allMasterFaskes : prev.detailData.faskes_terdekat,
                summary_faskes: json.summary_faskes || null,
                upaya_kesehatan: upayaKesehatanData || prev.detailData?.upaya_kesehatan || null,
                pos_pengungsi: prev.detailData.pos_pengungsi || [],
                logistik: prev.detailData.logistik || [],
                tck: prev.detailData.tck || []
              }
            }
            globalNttEventCache = next
            globalNttHasLoadedOnce = true
            return next
          })
        }
      }
    } catch (e) {
      console.warn('Error loading collector data:', e)
    } finally {
      setIsLoadingDate(false)
    }
  }

  useEffect(() => {
    loadCollectorData(selectedDate)

    // Auto-refresh di background secara wajar setiap 30 menit (tanpa trigger blocking refresh saat ganti tab)
    const interval = setInterval(() => {
      loadCollectorData(selectedDate)
    }, 30 * 60 * 1000)

    return () => {
      clearInterval(interval)
    }
  }, [selectedDate])

  return (
    <div className="w-full">
      <DetailKejadianPage
        selectedEvent={eventData}
        onBack={() => router.push('/')}
        isLoading={isLoadingDate}
        hideBack={true}
      />
    </div>
  )
}
