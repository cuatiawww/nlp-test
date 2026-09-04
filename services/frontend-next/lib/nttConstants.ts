export const NTT_TABLES = [
  'analisa_ringkasan_harian',
  'situasi_kesehatan',
  'pasien_rs',
  'pasien_puskesmas',
] as const

export type NttTableName = (typeof NTT_TABLES)[number]

export interface NttTableMeta {
  id: NttTableName
  label: string
  description: string
  headers: string[]
  sampleRow: Record<string, string | number>
}

export const NTT_TABLE_DEFINITIONS: Record<NttTableName, NttTableMeta> = {
  analisa_ringkasan_harian: {
    id: 'analisa_ringkasan_harian',
    label: 'Analisa Ringkasan Harian',
    description: 'Ringkasan dampak per kabupaten (korban luka, pasien RS, pasien PKM, total fasyankes)',
    headers: ['tanggal', 'kabupaten', 'korban_luka', 'pasien_rs', 'pasien_pkm', 'total_fasyankes'],
    sampleRow: {
      kabupaten: 'Sikka',
      korban_luka: 0,
      pasien_rs: 0,
      pasien_pkm: 0,
      total_fasyankes: 0,
    },
  },
  situasi_kesehatan: {
    id: 'situasi_kesehatan',
    label: 'Situasi Kesehatan',
    description: 'Data dampak kesehatan per kabupaten (populasi terdampak, meninggal, luka, pengungsi)',
    headers: [
      'tanggal',
      'waktu',
      'kabupaten',
      'populasi_terdampak',
      'meninggal',
      'luka_berat',
      'luka_ringan',
      'pengungsi',
      'titik_pengungsian',
    ],
    sampleRow: {
      waktu: '20.00 WIB',
      kabupaten: 'Sikka',
      populasi_terdampak: 0,
      meninggal: 0,
      luka_berat: 0,
      luka_ringan: 0,
      pengungsi: 0,
      titik_pengungsian: 0,
    },
  },
  pasien_rs: {
    id: 'pasien_rs',
    label: 'Pasien Rumah Sakit (RS)',
    description: 'Daftar pasien per Rumah Sakit (kategori triase merah, kuning, hijau, hitam)',
    headers: ['tanggal', 'kabupaten', 'nama_rs', 'merah', 'kuning', 'hijau', 'hitam', 'total'],
    sampleRow: {
      kabupaten: 'Sikka',
      nama_rs: 'RSUD dr. TC Hillers Maumere',
      merah: 0,
      kuning: 0,
      hijau: 0,
      hitam: 0,
      total: 0,
    },
  },
  pasien_puskesmas: {
    id: 'pasien_puskesmas',
    label: 'Pasien Puskesmas (PKM)',
    description: 'Daftar pasien per Puskesmas se-NTT (triase dan diagnosis/catatan)',
    headers: [
      'tanggal',
      'kabupaten',
      'nama_puskesmas',
      'merah',
      'kuning',
      'hijau',
      'hitam',
      'total',
      'diagnosis_catatan',
    ],
    sampleRow: {
      kabupaten: 'Sikka',
      nama_puskesmas: 'Puskesmas Watubaing',
      merah: 0,
      kuning: 0,
      hijau: 0,
      hitam: 0,
      total: 0,
      diagnosis_catatan: '',
    },
  },
}

export function isNttTableName(value: unknown): value is NttTableName {
  return typeof value === 'string' && (NTT_TABLES as readonly string[]).includes(value)
}

export function isValidDateFormat(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr
}
