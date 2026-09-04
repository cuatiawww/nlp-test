/**
 * Utilities for Timeline Log & 14-Day Siaga Response Calendar
 * Pure functions designed for testability and isolation.
 */

export interface TimelineLogItem {
  tgl: string
  raw_date?: string
  date_only?: string
  time_only?: string
  judul: string
  deskripsi?: string
  user_name?: string
  user_level?: string
}

export interface CalendarCell {
  date: Date
  iso: string
  dayNum: number
  isCurrentMonth: boolean
  isIncident: boolean
  isSiaga: boolean
  siagaDayIndex?: number
  logCount: number
  isSelected: boolean
}

export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

export const DAY_NAMES_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

/**
 * Format Date object to 'YYYY-MM-DD'
 */
export function toIsoDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse date string flexibly (supports 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss', 'DD-MM-YYYY', ISO, etc)
 */
export function parseDateFlexible(val?: string | null): Date | null {
  if (!val) return null
  const clean = String(val).replace(/\s+WIB/i, '').trim()

  // Match DD-MM-YYYY or DD/MM/YYYY
  if (/^\d{2}[-/]\d{2}[-/]\d{4}/.test(clean)) {
    const parts = clean.split(/[-/ :]/)
    const day = Number(parts[0])
    const month = Number(parts[1]) - 1
    const year = Number(parts[2])
    const hours = parts[3] ? Number(parts[3]) : 0
    const mins = parts[4] ? Number(parts[4]) : 0
    const secs = parts[5] ? Number(parts[5]) : 0
    const d = new Date(year, month, day, hours, mins, secs)
    if (!isNaN(d.getTime())) return d
  }

  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const parts = clean.split(/[- :]/)
    const year = Number(parts[0])
    const month = Number(parts[1]) - 1
    const day = Number(parts[2])
    const hours = parts[3] ? Number(parts[3]) : 0
    const mins = parts[4] ? Number(parts[4]) : 0
    const secs = parts[5] ? Number(parts[5]) : 0
    const d = new Date(year, month, day, hours, mins, secs)
    if (!isNaN(d.getTime())) return d
  }

  const d = new Date(clean)
  if (!isNaN(d.getTime())) return d
  return null
}

/**
 * Format ISO date string into Indonesian human readable date
 */
export function formatIndonesianDate(isoStr: string): string {
  const d = parseDateFlexible(isoStr)
  if (!d) return isoStr
  return `${d.getDate()} ${MONTH_NAMES_ID[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Compute the 14-day Siaga period map starting from T0 (H+0 to H+13)
 * Returns Map<isoDateString, dayIndex (0..13)>
 */
export function computeSiagaRange(incidentDate: Date, durationDays: number = 14): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < durationDays; i++) {
    const d = new Date(incidentDate.getFullYear(), incidentDate.getMonth(), incidentDate.getDate() + i)
    map.set(toIsoDate(d), i)
  }
  return map
}

/**
 * Normalize logs array with standardized date_only ('YYYY-MM-DD') and time_only
 */
export function normalizeLogs(logs: TimelineLogItem[], fallbackIsoDate: string): (TimelineLogItem & { date_only: string; time_only: string })[] {
  return logs.map(l => {
    let iso = l.date_only
    let time = l.time_only
    if (!iso) {
      const d = parseDateFlexible(l.raw_date || l.tgl)
      if (d) {
        iso = toIsoDate(d)
        if (!time) {
          time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} WIB`
        }
      } else {
        iso = fallbackIsoDate
      }
    }
    return {
      ...l,
      date_only: iso,
      time_only: time || '00:00 WIB'
    }
  })
}

/**
 * Group logs by date_only string
 */
export function groupLogsByDate(normalizedLogs: (TimelineLogItem & { date_only: string })[]): Map<string, TimelineLogItem[]> {
  const map = new Map<string, TimelineLogItem[]>()
  normalizedLogs.forEach(log => {
    const k = log.date_only
    const arr = map.get(k) || []
    arr.push(log)
    map.set(k, arr)
  })
  return map
}

/**
 * Generate 35 or 42 calendar grid cells for a given month
 */
export function generateCalendarGrid(
  currentMonth: Date,
  incidentIso: string,
  siagaRange: Map<string, number>,
  logsByDate: Map<string, TimelineLogItem[]>,
  selectedDate: string
): CalendarCell[] {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const firstDayIndex = new Date(year, month, 1).getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthDays = new Date(year, month, 0).getDate()

  const cells: CalendarCell[] = []

  // 1. Previous month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i)
    const iso = toIsoDate(d)
    const isSiaga = siagaRange.has(iso)
    cells.push({
      date: d,
      iso,
      dayNum: d.getDate(),
      isCurrentMonth: false,
      isIncident: iso === incidentIso,
      isSiaga,
      siagaDayIndex: siagaRange.get(iso),
      logCount: logsByDate.get(iso)?.length || 0,
      isSelected: selectedDate === iso
    })
  }

  // 2. Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i)
    const iso = toIsoDate(d)
    const isSiaga = siagaRange.has(iso)
    cells.push({
      date: d,
      iso,
      dayNum: i,
      isCurrentMonth: true,
      isIncident: iso === incidentIso,
      isSiaga,
      siagaDayIndex: siagaRange.get(iso),
      logCount: logsByDate.get(iso)?.length || 0,
      isSelected: selectedDate === iso
    })
  }

  // 3. Next month leading days (fill up to 35 or 42 cells)
  const targetCount = cells.length > 35 ? 42 : 35
  const remaining = targetCount - cells.length
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i)
    const iso = toIsoDate(d)
    const isSiaga = siagaRange.has(iso)
    cells.push({
      date: d,
      iso,
      dayNum: i,
      isCurrentMonth: false,
      isIncident: iso === incidentIso,
      isSiaga,
      siagaDayIndex: siagaRange.get(iso),
      logCount: logsByDate.get(iso)?.length || 0,
      isSelected: selectedDate === iso
    })
  }

  return cells
}

/**
 * Filter logs based on selected date and optional search query
 */
export function filterLogs(
  logs: (TimelineLogItem & { date_only: string })[],
  selectedDate: string,
  searchQuery?: string
): (TimelineLogItem & { date_only: string })[] {
  let list = logs
  if (selectedDate !== 'all') {
    list = list.filter(l => l.date_only === selectedDate)
  }
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim()
    list = list.filter(
      l =>
        (l.judul && l.judul.toLowerCase().includes(q)) ||
        (l.deskripsi && l.deskripsi.toLowerCase().includes(q)) ||
        (l.user_name && l.user_name.toLowerCase().includes(q)) ||
        (l.user_level && l.user_level.toLowerCase().includes(q))
    )
  }
  return list
}
