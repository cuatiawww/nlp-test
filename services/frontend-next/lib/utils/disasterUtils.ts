/**
 * Helper utility to map and format disaster codes / numeric IDs to human-readable names.
 */

const DISASTER_CODE_MAP: Record<string, string> = {
  '12': 'Kebakaran Hutan dan Lahan',
  '2.02': 'Kebakaran Hutan dan Lahan',
  'dl': 'Kebakaran Hutan dan Lahan',
  'dm': 'Kebakaran Hutan dan Lahan',
  'karhutla': 'Kebakaran Hutan dan Lahan',
  '11': 'Kebakaran Permukiman',
  '2.01': 'Kebakaran Permukiman',
  '3': 'Banjir',
  '1.01': 'Banjir',
  'f': 'Banjir',
  '5': 'Letusan Gunung Api',
  '1.02': 'Letusan Gunung Api',
  'h': 'Letusan Gunung Api',
  '6': 'Gempa Bumi',
  '1.03': 'Gempa Bumi',
  'i': 'Gempa Bumi',
  '7': 'Gempa Bumi dan Tsunami',
  '1.04': 'Gempa Bumi dan Tsunami',
  '8': 'Tanah Longsor',
  '1.05': 'Tanah Longsor',
  'do': 'Tanah Longsor',
  '9': 'Banjir Bandang',
  '1.06': 'Banjir Bandang',
  '10': 'Kekeringan',
  '1.07': 'Kekeringan',
  '13': 'Angin Puting Beliung',
  '1.08': 'Angin Puting Beliung',
  'dp': 'Angin Puting Beliung',
  '14': 'Gelombang Pasang/Badai',
  '1.09': 'Gelombang Pasang/Badai',
  '16': 'Kecelakaan Transportasi Darat',
  '2.03': 'Kecelakaan Transportasi Darat',
  '17': 'Kecelakaan Industri',
  '2.04': 'Kecelakaan Industri',
  '18': 'KLB Penyakit',
  '2.05': 'KLB Penyakit',
  'ds': 'KLB Penyakit',
  '19': 'Konflik Sosial atau Kerusuhan Sosial',
  '3.01': 'Konflik Sosial atau Kerusuhan Sosial',
  '20': 'Aksi Teror dan Sabotase',
  '3.03': 'Aksi Teror dan Sabotase',
  '22': 'Keracunan',
  '2.08': 'Keracunan',
  '25': 'Gagal Teknologi',
  '2.06': 'Gagal Teknologi',
  '28': 'Banjir dan Tanah Longsor',
  '1.13': 'Banjir dan Tanah Longsor',
  '29': 'Wabah Penyakit (Epidemi - Pandemi)',
  '2.09': 'Wabah Penyakit (Epidemi - Pandemi)',
  '33': 'Tsunami',
  '1.14': 'Tsunami',
  '34': 'Kecelakaan Transportasi Laut-Udara',
  '2.10': 'Kecelakaan Transportasi Laut-Udara',
}

export function formatDisasterName(val: any): string {
  if (val === null || val === undefined) return 'Kejadian Bencana'
  const str = String(val).trim()
  if (!str) return 'Kejadian Bencana'

  const lowerStr = str.toLowerCase()
  if (DISASTER_CODE_MAP[lowerStr]) {
    return DISASTER_CODE_MAP[lowerStr]
  }

  if (DISASTER_CODE_MAP[str]) {
    return DISASTER_CODE_MAP[str]
  }

  // If already a human readable text (not a numeric string)
  if (isNaN(Number(str)) && str.length > 2) {
    return str
  }

  return DISASTER_CODE_MAP[str] || str || 'Kejadian Bencana'
}
