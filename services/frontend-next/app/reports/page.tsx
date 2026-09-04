'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import {
  Download,
  Filter,
  Search,
  Calendar,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
  Eye,
  ExternalLink,
  ShieldAlert,
  Building2,
  Users,
  Sparkles,
  Printer,
  RotateCcw,
  Info,
  Check,
  Globe,
  Copy,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Activity,
  Layers,
  TrendingUp,
  SlidersHorizontal,
  Table as TableIcon,
  CalendarDays,
  Loader2,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { useSettings } from '@/lib/settings-context'
import CountryFlag from '@/components/CountryFlag'
import SocialMediaIcon from '@/components/SocialMediaIcon'
import { fetchPublicDashboard, fetchEvents } from '@/lib/api'
import type { PublicDashboard, OutbreakLocation, DiseaseEvent } from '@/types'
import { PUBLIC_BASE_PATH } from '@/lib/public-path'

// Unified surveillance report row model (100% mapped from live NLP pipeline)
export type SurveillanceReportRow = {
  id: string
  date: string
  dateFormatted: string
  country: string
  countryCode: string
  locationName: string
  disease: string
  rawDisease: string
  cases: number
  deaths: number
  cfr: number
  severity: 'AWAS' | 'SIAGA' | 'WASPADA' | 'NORMAL'
  threshold: number
  confidence: number
  sourceType: string
  sourceName: string
  url?: string | null
  content?: string | null
  symptoms?: string[]
  sentiment?: string | null
  eventConfidence?: number | null
  sourceCredibility?: number | null
}

// Master ASEAN country definitions for standardized flags & metadata
const ASEAN_COUNTRY_MAP: Record<string, { name: string; code: string }> = {
  indonesia: { name: 'Indonesia', code: 'ID' },
  philippines: { name: 'Philippines', code: 'PH' },
  malaysia: { name: 'Malaysia', code: 'MY' },
  singapore: { name: 'Singapore', code: 'SG' },
  thailand: { name: 'Thailand', code: 'TH' },
  vietnam: { name: 'Vietnam', code: 'VN' },
  myanmar: { name: 'Myanmar', code: 'MM' },
  cambodia: { name: 'Cambodia', code: 'KH' },
  laos: { name: 'Laos', code: 'LA' },
  brunei: { name: 'Brunei', code: 'BN' },
  'timor-leste': { name: 'Timor-Leste', code: 'TL' },
  timor: { name: 'Timor-Leste', code: 'TL' },
}

// Smart disease normalizer to unify NLP variants (e.g., 'dengue fever DBD' & 'DBD' -> 'Dengue Fever')
function formatDiseaseName(raw?: string | null): string {
  if (!raw || !raw.trim()) return 'Unspecified Health Event'
  const r = raw.trim()
  const lower = r.toLowerCase()

  if (lower.includes('dengue') || lower.includes('dbd')) return 'Dengue Fever'
  if (lower.includes('hand foot') || lower.includes('hfmd')) return 'Hand, Foot & Mouth Disease (HFMD)'
  if (lower.includes('malaria')) return 'Malaria'
  if (lower.includes('mpox') || lower.includes('monkeypox') || lower.includes('cacar')) return 'Mpox'
  if (lower.includes('covid') || lower.includes('sars-cov-2') || lower.includes('coronavirus')) return 'COVID-19'
  if (lower.includes('flu burung') || lower.includes('avian') || lower.includes('h5n1')) return 'Avian Influenza (H5N1)'
  if (lower.includes('cholera') || lower.includes('kolera')) return 'Cholera'
  if (lower.includes('rabies')) return 'Rabies'
  if (lower.includes('leptospiro')) return 'Leptospirosis'
  if (lower.includes('measles') || lower.includes('campak')) return 'Measles'
  if (lower.includes('pertussis') || lower.includes('rejan')) return 'Pertussis'
  if (lower.includes('diphtheria') || lower.includes('difteri')) return 'Diphtheria'
  if (lower.includes('typhoid') || lower.includes('tifoid')) return 'Typhoid Fever'
  if (lower.includes('anthrax') || lower.includes('antraks')) return 'Anthrax'
  if (lower.includes('zika')) return 'Zika Virus'
  if (lower.includes('chikungunya')) return 'Chikungunya'
  if (lower.includes('hanta')) return 'Hantavirus'
  if (lower.includes('ebola')) return 'Ebola Virus'
  if (lower.includes('mers')) return 'MERS-CoV'
  if (lower.includes('polio')) return 'Polio'
  if (lower.includes('rubella')) return 'Rubella'
  if (lower.includes('meningitis')) return 'Meningitis'
  if (lower.includes('leprosy')) return 'Leprosy'
  if (lower.includes('diare') || lower.includes('diarrhea')) return 'Acute Diarrhea'
  if (lower === 'flu' || lower.includes('influenza')) return 'Influenza'

  // Proper Case fallback
  return r
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

// Smart country resolver from geographic text and NLP metadata
function resolveCountry(country?: string | null, locationName?: string | null): { country: string; code: string } {
  const c = (country || '').trim()
  const l = (locationName || '').trim()
  const target = `${c} ${l}`.toLowerCase()

  for (const [key, val] of Object.entries(ASEAN_COUNTRY_MAP)) {
    if (target.includes(key)) {
      return val
    }
  }

  if (target.includes('jakarta') || target.includes('surabaya') || target.includes('jawa') || target.includes('bali') || target.includes('sumatera')) {
    return { name: 'Indonesia', code: 'ID' }
  }
  if (target.includes('manila') || target.includes('filipino') || target.includes('cebu') || target.includes('davao')) {
    return { name: 'Philippines', code: 'PH' }
  }
  if (target.includes('kuala lumpur') || target.includes('johor') || target.includes('selangor') || target.includes('penang')) {
    return { name: 'Malaysia', code: 'MY' }
  }
  if (target.includes('bangkok') || target.includes('chiang mai') || target.includes('phuket')) {
    return { name: 'Thailand', code: 'TH' }
  }
  if (target.includes('hanoi') || target.includes('ho chi minh') || target.includes('mekong') || target.includes('da nang')) {
    return { name: 'Vietnam', code: 'VN' }
  }

  if (c && c.toUpperCase() !== 'OUTSIDE ASEAN' && c.toUpperCase() !== 'UNKNOWN') {
    return { name: c, code: 'GLOBAL' }
  }

  return { name: 'Outside ASEAN', code: 'GLOBAL' }
}

export default function ReportsPage() {
  const { t, setLocale } = useTranslation()
  const { settings } = useSettings()

  // Ensure interface locale is in English
  useEffect(() => {
    if (setLocale) setLocale('en')
  }, [setLocale])

  // State: Real Data loading (Strictly ZERO Hardcoded Seed Data)
  const [dataList, setDataList] = useState<SurveillanceReportRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<string>('')

  // State: Active View Tab
  const [activeTab, setActiveTab] = useState<'cross_matrix' | 'event_log' | 'time_distribution'>('cross_matrix')
  const [matrixMetric, setMatrixMetric] = useState<'both' | 'cases' | 'deaths' | 'severity'>('both')

  // State: Detail Modal
  const [selectedDetailItem, setSelectedDetailItem] = useState<SurveillanceReportRow | null>(null)

  // State: Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [countrySearch, setCountrySearch] = useState('')
  const [selectedDiseases, setSelectedDiseases] = useState<string[]>([])
  const [diseaseSearch, setDiseaseSearch] = useState('')
  const [selectedDatePreset, setSelectedDatePreset] = useState<string>('all')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([])
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [filterCasesOnly, setFilterCasesOnly] = useState<boolean>(false)
  const [filterDeathsOnly, setFilterDeathsOnly] = useState<boolean>(false)
  const [filterAlertOnly, setFilterAlertOnly] = useState<boolean>(false)

  // State: Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [sortField, setSortField] = useState<'date' | 'country' | 'disease' | 'cases' | 'deaths' | 'cfr'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // State: Collapsible Filter Sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    countries: true,
    diseases: true,
    dates: true,
    severity: true,
    sources: false,
    specific: true,
  })

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Toast Helper
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Load Real Data from NLP Pipeline & Database
  const loadRealSurveillanceData = async () => {
    setLoading(true)
    try {
      const [dashRes, eventsRes] = await Promise.allSettled([
        fetchPublicDashboard(),
        fetchEvents({ per_page: 250 }),
      ])

      const combined: SurveillanceReportRow[] = []
      const seenIds = new Set<string>()

      // 1. Process OutbreakLocations from Public Dashboard API (Aggregated NLP clusters)
      if (dashRes.status === 'fulfilled' && dashRes.value && Array.isArray(dashRes.value.locations)) {
        dashRes.value.locations.forEach((loc: OutbreakLocation, idx: number) => {
          const rowId = loc.detail?.event_id || `LOC-CLUSTER-${idx + 1}`
          if (seenIds.has(rowId)) return
          seenIds.add(rowId)

          const dateStr = loc.latest_date || loc.detail?.published_at || new Date().toISOString()
          const dObj = new Date(dateStr)
          const dateFormatted = !isNaN(dObj.getTime())
            ? dObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'Recent'

          const resolved = resolveCountry(loc.country, loc.location_name)
          const diseaseFormatted = formatDiseaseName(loc.disease)
          const cases = Number(loc.cases) || 0
          const deaths = Number(loc.deaths) || 0
          const cfr = cases > 0 ? Number(((deaths / cases) * 100).toFixed(2)) : 0

          combined.push({
            id: rowId,
            date: dateStr,
            dateFormatted,
            country: resolved.name,
            countryCode: resolved.code,
            locationName: loc.location_name || resolved.name,
            disease: diseaseFormatted,
            rawDisease: loc.disease || 'Unknown',
            cases,
            deaths,
            cfr,
            severity: loc.severity || (loc.has_alert ? 'AWAS' : 'NORMAL'),
            threshold: loc.threshold || 10,
            confidence: loc.confidence || 0.88,
            sourceType: loc.detail?.source_type || 'news',
            sourceName: loc.detail?.source_name || 'Health Intelligence Feed',
            url: loc.detail?.url || null,
            content: loc.detail?.content || null,
            symptoms: loc.detail?.symptoms || [],
            sentiment: loc.detail?.sentiment || null,
            eventConfidence: loc.detail?.event_confidence || null,
            sourceCredibility: loc.detail?.source_credibility || 0.9,
          })
        })
      }

      // 2. Process Individual DiseaseEvents from Events API (Extracted by NLP Worker)
      if (eventsRes.status === 'fulfilled' && Array.isArray(eventsRes.value)) {
        eventsRes.value.forEach((ev: DiseaseEvent, idx: number) => {
          const rowId = ev.id || `EVT-${idx + 1}`
          if (seenIds.has(rowId)) return
          seenIds.add(rowId)

          const dateStr = ev.published_at || ev.created_at || new Date().toISOString()
          const dObj = new Date(dateStr)
          const dateFormatted = !isNaN(dObj.getTime())
            ? dObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'Recent'

          const resolved = resolveCountry(ev.country, ev.location_name)
          const diseaseFormatted = formatDiseaseName(ev.disease_classification)
          const cases = Number(ev.case_count) || 0
          const deaths = Number(ev.death_count) || 0
          const cfr = cases > 0 ? Number(((deaths / cases) * 100).toFixed(2)) : 0

          const severity: 'AWAS' | 'SIAGA' | 'WASPADA' | 'NORMAL' = ev.outbreak_alert
            ? 'AWAS'
            : cases > 50
            ? 'SIAGA'
            : cases > 10
            ? 'WASPADA'
            : 'NORMAL'

          combined.push({
            id: rowId,
            date: dateStr,
            dateFormatted,
            country: resolved.name,
            countryCode: resolved.code,
            locationName: ev.location_name || resolved.name,
            disease: diseaseFormatted,
            rawDisease: ev.disease_classification || 'Unknown',
            cases,
            deaths,
            cfr,
            severity,
            threshold: 10,
            confidence: ev.confidence || 0.85,
            sourceType: ev.source_type || 'rss',
            sourceName: ev.source_name || 'Surveillance Wire',
            url: ev.url || null,
            content: ev.title || null,
            symptoms: [],
            sentiment: ev.sentiment || null,
            eventConfidence: ev.confidence || null,
            sourceCredibility: ev.source_credibility || 0.85,
          })
        })
      }

      setDataList(combined)
      setLastRefreshed(new Date().toLocaleTimeString('en-US'))
    } catch (err) {
      console.error('Failed to retrieve live NLP surveillance data:', err)
      setDataList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRealSurveillanceData()
  }, [])

  // Dynamically extract active diseases from the real dataset (Zero Hardcoding!)
  const availableDiseases = useMemo(() => {
    const set = new Set<string>()
    dataList.forEach((d) => {
      if (d.disease) set.add(d.disease.trim())
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [dataList])

  // Dynamically extract active countries from the real dataset (Zero Hardcoding!)
  const availableCountries = useMemo(() => {
    const set = new Set<string>()
    dataList.forEach((d) => {
      if (d.country) set.add(d.country.trim())
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [dataList])

  // Filter Handlers
  const handleToggleCountry = (countryName: string) => {
    setSelectedCountries((prev) =>
      prev.includes(countryName)
        ? prev.filter((c) => c !== countryName)
        : [...prev, countryName]
    )
    setCurrentPage(1)
  }

  const handleSelectAllCountries = () => {
    if (selectedCountries.length === availableCountries.length) {
      setSelectedCountries([])
    } else {
      setSelectedCountries([...availableCountries])
    }
    setCurrentPage(1)
  }

  const handleToggleDisease = (diseaseName: string) => {
    setSelectedDiseases((prev) =>
      prev.includes(diseaseName)
        ? prev.filter((d) => d !== diseaseName)
        : [...prev, diseaseName]
    )
    setCurrentPage(1)
  }

  const handleSelectAllDiseases = () => {
    if (selectedDiseases.length === availableDiseases.length) {
      setSelectedDiseases([])
    } else {
      setSelectedDiseases([...availableDiseases])
    }
    setCurrentPage(1)
  }

  const handleToggleSeverity = (sev: string) => {
    setSelectedSeverities((prev) =>
      prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]
    )
    setCurrentPage(1)
  }

  const handleToggleSource = (src: string) => {
    setSelectedSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]
    )
    setCurrentPage(1)
  }

  const handleResetFilters = () => {
    setSearchQuery('')
    setSelectedCountries([])
    setSelectedDiseases([])
    setSelectedDatePreset('all')
    setCustomStartDate('')
    setCustomEndDate('')
    setSelectedSeverities([])
    setSelectedSources([])
    setFilterCasesOnly(false)
    setFilterDeathsOnly(false)
    setFilterAlertOnly(false)
    setCountrySearch('')
    setDiseaseSearch('')
    setCurrentPage(1)
    showToast('All filter criteria have been reset.')
  }

  // Active filter count calculation
  const activeFilterCount = useMemo(() => {
    let count = 0
    count += selectedCountries.length
    count += selectedDiseases.length
    count += selectedSeverities.length
    count += selectedSources.length
    if (selectedDatePreset !== 'all') count += 1
    if (filterCasesOnly) count += 1
    if (filterDeathsOnly) count += 1
    if (filterAlertOnly) count += 1
    if (searchQuery.trim() !== '') count += 1
    return count
  }, [
    selectedCountries,
    selectedDiseases,
    selectedSeverities,
    selectedSources,
    selectedDatePreset,
    filterCasesOnly,
    filterDeathsOnly,
    filterAlertOnly,
    searchQuery,
  ])

  // Master Real-time Filter Engine
  const filteredData = useMemo(() => {
    return dataList.filter((item) => {
      // 1. Free-text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matches =
          item.id.toLowerCase().includes(q) ||
          item.country.toLowerCase().includes(q) ||
          item.locationName.toLowerCase().includes(q) ||
          item.disease.toLowerCase().includes(q) ||
          (item.content && item.content.toLowerCase().includes(q))
        if (!matches) return false
      }

      // 2. Country filter
      if (selectedCountries.length > 0) {
        if (!selectedCountries.includes(item.country)) return false
      }

      // 3. Disease filter
      if (selectedDiseases.length > 0) {
        if (!selectedDiseases.includes(item.disease)) return false
      }

      // 4. Date range filter
      if (selectedDatePreset !== 'all') {
        const itemDate = new Date(item.date).getTime()
        const now = Date.now()

        if (selectedDatePreset === '24h') {
          if (now - itemDate > 24 * 60 * 60 * 1000) return false
        } else if (selectedDatePreset === '7days') {
          if (now - itemDate > 7 * 24 * 60 * 60 * 1000) return false
        } else if (selectedDatePreset === '30days') {
          if (now - itemDate > 30 * 24 * 60 * 60 * 1000) return false
        } else if (selectedDatePreset === '90days') {
          if (now - itemDate > 90 * 24 * 60 * 60 * 1000) return false
        } else if (selectedDatePreset === 'this_year') {
          const year = new Date(item.date).getFullYear()
          if (year !== new Date().getFullYear()) return false
        } else if (selectedDatePreset === 'custom') {
          if (customStartDate) {
            const start = new Date(customStartDate).getTime()
            if (itemDate < start) return false
          }
          if (customEndDate) {
            const end = new Date(customEndDate).getTime() + 24 * 60 * 60 * 1000 - 1
            if (itemDate > end) return false
          }
        }
      }

      // 5. Severity filter
      if (selectedSeverities.length > 0) {
        if (!selectedSeverities.includes(item.severity)) return false
      }

      // 6. Source filter
      if (selectedSources.length > 0) {
        if (!selectedSources.includes(item.sourceType)) return false
      }

      // 7. Special impact criteria
      if (filterCasesOnly && item.cases <= 0) return false
      if (filterDeathsOnly && item.deaths <= 0) return false
      if (filterAlertOnly && item.severity === 'NORMAL') return false

      return true
    })
  }, [
    dataList,
    searchQuery,
    selectedCountries,
    selectedDiseases,
    selectedDatePreset,
    customStartDate,
    customEndDate,
    selectedSeverities,
    selectedSources,
    filterCasesOnly,
    filterDeathsOnly,
    filterAlertOnly,
  ])

  // Sorting
  const sortedData = useMemo(() => {
    const list = [...filteredData]
    list.sort((a, b) => {
      let valA: any = a[sortField]
      let valB: any = b[sortField]

      if (sortField === 'date') {
        valA = new Date(a.date).getTime()
        valB = new Date(b.date).getTime()
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase()
        valB = valB.toLowerCase()
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [filteredData, sortField, sortOrder])

  // Pagination for Detailed Table (Tab 2)
  const totalPages = Math.max(1, Math.ceil(sortedData.length / itemsPerPage))
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return sortedData.slice(start, start + itemsPerPage)
  }, [sortedData, currentPage, itemsPerPage])

  // MODE 1: EPIDEMIOLOGICAL CROSS-TABULATION MATRIX (Real Disease x Real Country)
  const crossTabMatrix = useMemo(() => {
    const activeDiseases =
      selectedDiseases.length > 0
        ? selectedDiseases
        : Array.from(new Set(filteredData.map((d) => d.disease))).sort()

    const activeCountries =
      selectedCountries.length > 0
        ? selectedCountries
        : Array.from(new Set(filteredData.map((d) => d.country))).sort()

    const matrix: Record<
      string,
      Record<
        string,
        {
          cases: number
          deaths: number
          cfr: number
          count: number
          severity: 'AWAS' | 'SIAGA' | 'WASPADA' | 'NORMAL'
        }
      >
    > = {}

    const diseaseTotals: Record<
      string,
      { cases: number; deaths: number; cfr: number; totalReports: number }
    > = {}

    const countryTotals: Record<
      string,
      { cases: number; deaths: number; totalReports: number }
    > = {}

    let grandCases = 0
    let grandDeaths = 0

    // Initialize matrix cells
    activeDiseases.forEach((dis) => {
      matrix[dis] = {}
      diseaseTotals[dis] = { cases: 0, deaths: 0, cfr: 0, totalReports: 0 }
      activeCountries.forEach((ctr) => {
        matrix[dis][ctr] = {
          cases: 0,
          deaths: 0,
          cfr: 0,
          count: 0,
          severity: 'NORMAL',
        }
      })
    })

    activeCountries.forEach((ctr) => {
      countryTotals[ctr] = { cases: 0, deaths: 0, totalReports: 0 }
    })

    // Populate real data
    filteredData.forEach((row) => {
      if (!matrix[row.disease]) {
        matrix[row.disease] = {}
        diseaseTotals[row.disease] = { cases: 0, deaths: 0, cfr: 0, totalReports: 0 }
        activeCountries.forEach((ctr) => {
          matrix[row.disease][ctr] = {
            cases: 0,
            deaths: 0,
            cfr: 0,
            count: 0,
            severity: 'NORMAL',
          }
        })
      }

      if (matrix[row.disease] && matrix[row.disease][row.country]) {
        const cell = matrix[row.disease][row.country]
        cell.cases += row.cases
        cell.deaths += row.deaths
        cell.count += 1
        if (row.severity === 'AWAS') cell.severity = 'AWAS'
        else if (row.severity === 'SIAGA' && cell.severity !== 'AWAS') cell.severity = 'SIAGA'
        else if (
          row.severity === 'WASPADA' &&
          cell.severity !== 'AWAS' &&
          cell.severity !== 'SIAGA'
        ) {
          cell.severity = 'WASPADA'
        }
      }

      if (diseaseTotals[row.disease]) {
        diseaseTotals[row.disease].cases += row.cases
        diseaseTotals[row.disease].deaths += row.deaths
        diseaseTotals[row.disease].totalReports += 1
      }

      if (countryTotals[row.country]) {
        countryTotals[row.country].cases += row.cases
        countryTotals[row.country].deaths += row.deaths
        countryTotals[row.country].totalReports += 1
      }

      grandCases += row.cases
      grandDeaths += row.deaths
    })

    // Recalculate CFRs
    activeDiseases.forEach((dis) => {
      const dt = diseaseTotals[dis]
      if (dt && dt.cases > 0) {
        dt.cfr = Number(((dt.deaths / dt.cases) * 100).toFixed(2))
      }
      activeCountries.forEach((ctr) => {
        if (matrix[dis] && matrix[dis][ctr]) {
          const c = matrix[dis][ctr]
          c.cfr = c.cases > 0 ? Number(((c.deaths / c.cases) * 100).toFixed(2)) : 0
        }
      })
    })

    const grandCfr =
      grandCases > 0 ? Number(((grandDeaths / grandCases) * 100).toFixed(2)) : 0

    return {
      diseases: activeDiseases,
      countries: activeCountries,
      matrix,
      diseaseTotals,
      countryTotals,
      grandCases,
      grandDeaths,
      grandCfr,
    }
  }, [filteredData, selectedDiseases, selectedCountries])

  // MODE 3: TEMPORAL DISTRIBUTION (Real Disease x Month of Year)
  const temporalDistribution = useMemo(() => {
    const months = [
      { key: 0, label: 'Jan' },
      { key: 1, label: 'Feb' },
      { key: 2, label: 'Mar' },
      { key: 3, label: 'Apr' },
      { key: 4, label: 'May' },
      { key: 5, label: 'Jun' },
      { key: 6, label: 'Jul' },
      { key: 7, label: 'Aug' },
      { key: 8, label: 'Sep' },
      { key: 9, label: 'Oct' },
      { key: 10, label: 'Nov' },
      { key: 11, label: 'Dec' },
    ]

    const dist: Record<string, number[]> = {}
    const monthlyTotals = new Array(12).fill(0)

    crossTabMatrix.diseases.forEach((d) => {
      dist[d] = new Array(12).fill(0)
    })

    filteredData.forEach((item) => {
      const d = new Date(item.date)
      if (!isNaN(d.getTime())) {
        const m = d.getMonth()
        if (!dist[item.disease]) {
          dist[item.disease] = new Array(12).fill(0)
        }
        dist[item.disease][m] += item.cases
        monthlyTotals[m] += item.cases
      }
    })

    return { months, dist, monthlyTotals }
  }, [filteredData, crossTabMatrix.diseases])

  // Overall KPIs calculated from real database records
  const metrics = useMemo(() => {
    const totalReports = filteredData.length
    const totalCases = filteredData.reduce((acc, curr) => acc + curr.cases, 0)
    const totalDeaths = filteredData.reduce((acc, curr) => acc + curr.deaths, 0)
    const totalAlerts = filteredData.filter(
      (d) => d.severity === 'AWAS' || d.severity === 'SIAGA'
    ).length
    const affectedCountries = new Set(filteredData.map((d) => d.country)).size
    const avgCfr = totalCases > 0 ? Number(((totalDeaths / totalCases) * 100).toFixed(2)) : 0

    return {
      totalReports,
      totalCases,
      totalDeaths,
      totalAlerts,
      affectedCountries,
      avgCfr,
    }
  }, [filteredData])

  // Export to Excel / CSV with UTF-8 BOM
  const handleExportExcel = () => {
    if (filteredData.length === 0) {
      showToast('No surveillance data available to export.')
      return
    }

    const headers = [
      'Report ID',
      'Date',
      'Country',
      'Country Code',
      'Location / Province',
      'Disease Classification',
      'Raw NLP Tag',
      'Reported Cases',
      'Deaths',
      'CFR (%)',
      'Alert Severity',
      'Detection Threshold',
      'NLP Confidence (%)',
      'Source Platform',
      'Source Name',
      'Source URL',
    ]

    const csvRows = [headers.join(',')]

    filteredData.forEach((row) => {
      const line = [
        `"${row.id}"`,
        `"${row.dateFormatted}"`,
        `"${row.country}"`,
        `"${row.countryCode}"`,
        `"${row.locationName.replace(/"/g, '""')}"`,
        `"${row.disease.replace(/"/g, '""')}"`,
        `"${row.rawDisease.replace(/"/g, '""')}"`,
        row.cases,
        row.deaths,
        row.cfr,
        `"${row.severity === "AWAS" ? "CRITICAL" : row.severity === "SIAGA" ? "HIGH" : row.severity === "WASPADA" ? "WARNING" : "NORMAL"}"`,
        row.threshold,
        Math.round(row.confidence * 100),
        `"${row.sourceType}"`,
        `"${row.sourceName.replace(/"/g, '""')}"`,
        `"${row.url || ''}"`,
      ]
      csvRows.push(line.join(','))
    })

    const csvContent = '﻿' + csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const timestamp = new Date().toISOString().slice(0, 10)
    link.setAttribute('href', url)
    link.setAttribute('download', `ASEAN_Surveillance_Matrix_Report_${timestamp}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    showToast(`Excel export (${filteredData.length} records) downloaded successfully!`)
  }

  // Copy Executive Summary to Clipboard
  const handleCopySummary = () => {
    const summaryLines = [
      `=== ASEAN COMMUNICABLE DISEASE SURVEILLANCE SUMMARY REPORT ===`,
      `Generated at: ${new Date().toUTCString()}`,
      `Total Surveillance Events: ${metrics.totalReports}`,
      `Total Confirmed Cases: ${metrics.totalCases.toLocaleString()}`,
      `Total Fatalities: ${metrics.totalDeaths.toLocaleString()} (CFR: ${metrics.avgCfr}%)`,
      `Active Outbreak Alerts: ${metrics.totalAlerts}`,
      `Affected Countries: ${metrics.affectedCountries} Countries`,
      '',
      `Top Diseases by Morbidity:`,
      ...crossTabMatrix.diseases.slice(0, 5).map((dis) => {
        const stats = crossTabMatrix.diseaseTotals[dis]
        return `• ${dis}: ${stats?.cases || 0} Cases, ${stats?.deaths || 0} Deaths (CFR: ${stats?.cfr || 0}%)`
      }),
    ]

    navigator.clipboard.writeText(summaryLines.join('\n')).then(() => {
      showToast('Report summary copied to clipboard!')
    })
  }

  // Print Document Trigger
  const handlePrint = () => {
    window.print()
  }

  // Severity Badge Component
  const getSeverityBadge = (sev: 'AWAS' | 'SIAGA' | 'WASPADA' | 'NORMAL') => {
    switch (sev) {
      case 'AWAS':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold text-rose-700 border border-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
            CRITICAL
          </span>
        )
      case 'SIAGA':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
            HIGH
          </span>
        )
      case 'WASPADA':
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-yellow-50 px-2 py-0.5 text-[10px] font-extrabold text-yellow-700 border border-yellow-200">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            WARNING
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            NORMAL
          </span>
        )
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16 font-sans">
      {/* Toast Notification Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Official Print Header (Visible ONLY when printing) */}
      <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              MINISTRY OF HEALTH & REGIONAL CDC NETWORK
            </h1>
            <p className="text-xs font-bold text-[#0060A9] uppercase tracking-wider mt-0.5">
              ASEAN COMMUNICABLE DISEASE SURVEILLANCE & OUTBREAK INTELLIGENCE
            </p>
            <p className="text-[11px] text-slate-600 mt-1">
              Official Epidemiological Matrix Report — Live NLP Extraction Database
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold text-slate-800">Date: {new Date().toLocaleDateString('en-US')}</p>
            <p className="text-slate-500">Filter Criteria: {activeFilterCount} active filters</p>
          </div>
        </div>
      </div>

      <div className="max-w-[1680px] mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* ==================== 4 TOP KPI STAT CARDS ==================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 print:grid-cols-4">
          {/* Card 1: Filtered Reports */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Filtered Events
                </p>
                <h3 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {loading ? '...' : metrics.totalReports.toLocaleString()}{' '}
                  <span className="text-xs font-semibold text-slate-500">Events</span>
                </h3>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#0060A9] border border-blue-100">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {activeFilterCount > 0
                ? `${activeFilterCount} active filter criteria`
                : `Live NLP dataset (${dataList.length} total records)`}
            </p>
          </div>

          {/* Card 2: Total Cases */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Total Cases Detected
                </p>
                <h3 className="mt-1 text-2xl font-extrabold text-slate-900">
                  {loading ? '...' : metrics.totalCases.toLocaleString()}{' '}
                  <span className="text-xs font-semibold text-slate-500">Cases</span>
                </h3>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Across {metrics.affectedCountries} monitored jurisdictions
            </p>
          </div>

          {/* Card 3: Deaths & CFR */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Deaths & CFR
                </p>
                <h3 className="mt-1 text-2xl font-extrabold text-rose-600">
                  {loading ? '...' : metrics.totalDeaths.toLocaleString()}{' '}
                  <span className="text-xs font-semibold text-slate-500">
                    ({metrics.avgCfr}% CFR)
                  </span>
                </h3>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                <ShieldAlert className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Epidemiological Case Fatality Rate
            </p>
          </div>

          {/* Card 4: Active Alerts */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Outbreak Alerts
                </p>
                <h3 className="mt-1 text-2xl font-extrabold text-amber-600">
                  {loading ? '...' : metrics.totalAlerts}{' '}
                  <span className="text-xs font-semibold text-slate-500">
                    Active Signals
                  </span>
                </h3>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Critical &amp; High outbreak triggers
            </p>
          </div>
        </div>

        {/* ==================== MAIN EQUAL-HEIGHT LAYOUT: FILTER SIDEBAR + DATA MATRIX ==================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch lg:min-h-[760px]">
          {/* ==================== LEFT MULTI FILTER SIDEBAR (PRINT HIDDEN) ==================== */}
          <aside className="lg:col-span-3 xl:col-span-3 flex flex-col h-full rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden print:hidden">
            {/* Filter Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/70 flex-shrink-0">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[#0060A9]" />
                <h2 className="text-xs font-extrabold tracking-wider text-slate-800 uppercase">
                  Matrix Filters
                </h2>
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-[#0060A9]">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 transition cursor-pointer"
                  title="Reset All Filters"
                >
                  <RotateCcw className="h-3 w-3" />
                  Clear All
                </button>
              )}
            </div>

            {/* Scrollable Filter Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[calc(100vh-230px)] lg:max-h-[720px] custom-scrollbar">
              {/* SECTION 1: FILTER COUNTRIES (Extracted Dynamically from NLP Data) */}
              <div className="space-y-3">
                <div
                  className="flex items-center justify-between cursor-pointer select-none py-1"
                  onClick={() => toggleSection('countries')}
                >
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-[#0060A9]" />
                    Country / Member State ({availableCountries.length})
                  </span>
                  {expandedSections.countries ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>

                {expandedSections.countries && (
                  <div className="space-y-2 pt-1">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        placeholder="Search country..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-700 focus:border-[#0060A9] focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
                      />
                    </div>

                    <div className="flex items-center justify-between px-1 text-[10px] text-[#0060A9] font-bold">
                      <button
                        type="button"
                        onClick={handleSelectAllCountries}
                        className="hover:underline cursor-pointer"
                      >
                        {selectedCountries.length === availableCountries.length ? 'Clear All' : 'Select All'}
                      </button>
                      {selectedCountries.length > 0 && (
                        <span className="text-slate-400">{selectedCountries.length} selected</span>
                      )}
                    </div>

                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {availableCountries
                        .filter((c) => c.toLowerCase().includes(countrySearch.toLowerCase()))
                        .map((ctr) => {
                          const isChecked = selectedCountries.includes(ctr)
                          return (
                            <label
                              key={ctr}
                              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs transition cursor-pointer ${
                                isChecked
                                  ? 'bg-blue-50 text-[#0060A9] font-bold'
                                  : 'hover:bg-slate-50 text-slate-600'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleCountry(ctr)}
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
                                />
                                <CountryFlag countryName={ctr} shape="rounded" size="xs" />
                                <span className="truncate">{ctr}</span>
                              </div>
                            </label>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: FILTER DISEASES (Extracted Dynamically from NLP Data) */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div
                  className="flex items-center justify-between cursor-pointer select-none py-1"
                  onClick={() => toggleSection('diseases')}
                >
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-rose-500" />
                    Target Disease ({availableDiseases.length})
                  </span>
                  {expandedSections.diseases ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>

                {expandedSections.diseases && (
                  <div className="space-y-2 pt-1">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={diseaseSearch}
                        onChange={(e) => setDiseaseSearch(e.target.value)}
                        placeholder="Search disease..."
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-700 focus:border-[#0060A9] focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
                      />
                    </div>

                    <div className="flex items-center justify-between px-1 text-[10px] text-[#0060A9] font-bold">
                      <button
                        type="button"
                        onClick={handleSelectAllDiseases}
                        className="hover:underline cursor-pointer"
                      >
                        {selectedDiseases.length === availableDiseases.length ? 'Clear All' : 'Select All'}
                      </button>
                      {selectedDiseases.length > 0 && (
                        <span className="text-slate-400">{selectedDiseases.length} selected</span>
                      )}
                    </div>

                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                      {availableDiseases
                        .filter((d) => d.toLowerCase().includes(diseaseSearch.toLowerCase()))
                        .map((dis) => {
                          const isChecked = selectedDiseases.includes(dis)
                          return (
                            <label
                              key={dis}
                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition cursor-pointer ${
                                isChecked
                                  ? 'bg-rose-50 text-rose-700 font-bold'
                                  : 'hover:bg-slate-50 text-slate-600'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleDisease(dis)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                              />
                              <span className="truncate">{dis}</span>
                            </label>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: DATE RANGE */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div
                  className="flex items-center justify-between cursor-pointer select-none py-1"
                  onClick={() => toggleSection('dates')}
                >
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                    Date Range
                  </span>
                  {expandedSections.dates ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>

                {expandedSections.dates && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: '24h', label: '24 Hours' },
                        { id: '7days', label: 'Last 7 Days' },
                        { id: '30days', label: 'Last 30 Days' },
                        { id: '90days', label: 'Last 90 Days' },
                        { id: 'this_year', label: 'Year 2026' },
                        { id: 'all', label: 'All Time' },
                        { id: 'custom', label: 'Custom Range' },
                      ].map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setSelectedDatePreset(preset.id)}
                          className={`rounded-lg py-1 px-2 text-[11px] font-semibold transition border text-center cursor-pointer ${
                            selectedDatePreset === preset.id
                              ? 'border-[#0060A9] bg-[#0060A9] text-white font-bold'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {selectedDatePreset === 'custom' && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            From Date
                          </label>
                          <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1 text-xs text-slate-700"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            To Date
                          </label>
                          <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1 text-xs text-slate-700"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* SECTION 4: ALERT SEVERITY */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div
                  className="flex items-center justify-between cursor-pointer select-none py-1"
                  onClick={() => toggleSection('severity')}
                >
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                    Alert Severity
                  </span>
                  {expandedSections.severity ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>

                {expandedSections.severity && (
                  <div className="space-y-1.5 pt-1">
                    {[
                      { id: 'AWAS', label: 'CRITICAL', color: 'text-rose-700 bg-rose-50 border-rose-200' },
                      { id: 'SIAGA', label: 'HIGH', color: 'text-amber-700 bg-amber-50 border-amber-200' },
                      { id: 'WASPADA', label: 'WARNING', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
                      { id: 'NORMAL', label: 'NORMAL', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                    ].map((sev) => {
                      const isChecked = selectedSeverities.includes(sev.id)
                      return (
                        <label
                          key={sev.id}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition border cursor-pointer ${
                            isChecked
                              ? `${sev.color} font-bold shadow-xs`
                              : 'border-slate-100 hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSeverity(sev.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
                          />
                          <span>{sev.label}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* SECTION 5: PLATFORM SOURCES */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div
                  className="flex items-center justify-between cursor-pointer select-none py-1"
                  onClick={() => toggleSection('sources')}
                >
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-cyan-600" />
                    Data Sources
                  </span>
                  {expandedSections.sources ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>

                {expandedSections.sources && (
                  <div className="space-y-1 pt-1">
                    {[
                      { id: 'news', label: 'News Media & Press' },
                      { id: 'rss', label: 'RSS News Feeds' },
                      { id: 'social_media', label: 'Social Media Crawls' },
                      { id: 'facebook', label: 'Facebook Feeds' },
                      { id: 'instagram', label: 'Instagram Public' },
                      { id: 'tiktok', label: 'TikTok Video Descs' },
                      { id: 'mastodon', label: 'Mastodon Fediverse' },
                      { id: 'who', label: 'WHO Official Bulletins' },
                      { id: 'kemenkes', label: 'MoH Surveillance Net' },
                    ].map((src) => {
                      const isChecked = selectedSources.includes(src.id)
                      return (
                        <label
                          key={src.id}
                          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition cursor-pointer ${
                            isChecked
                              ? 'bg-blue-50 text-[#0060A9] font-bold'
                              : 'hover:bg-slate-50 text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSource(src.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
                          />
                          <SocialMediaIcon platform={src.id} size="xs" />
                          <span className="truncate">{src.label}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* SECTION 6: SPECIFIC IMPACT CRITERIA */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div
                  className="flex items-center justify-between cursor-pointer select-none py-1"
                  onClick={() => toggleSection('specific')}
                >
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                    Specific Criteria
                  </span>
                  {expandedSections.specific ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  )}
                </div>

                {expandedSections.specific && (
                  <div className="space-y-1.5 pt-1 text-xs text-slate-700">
                    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterCasesOnly}
                        onChange={(e) => {
                          setFilterCasesOnly(e.target.checked)
                          setCurrentPage(1)
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
                      />
                      <span>Has Cases (&gt; 0)</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterDeathsOnly}
                        onChange={(e) => {
                          setFilterDeathsOnly(e.target.checked)
                          setCurrentPage(1)
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
                      />
                      <span>Has Deaths (&gt; 0)</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 transition cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterAlertOnly}
                        onChange={(e) => {
                          setFilterAlertOnly(e.target.checked)
                          setCurrentPage(1)
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-[#0060A9] focus:ring-[#0060A9]"
                      />
                      <span>Active Alerts Only</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Filter Footer */}
            <div className="p-3.5 border-t border-slate-100 bg-slate-50/70 flex-shrink-0">
              <button
                type="button"
                onClick={handleResetFilters}
                className="w-full py-2 px-3 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-700 font-extrabold text-xs uppercase tracking-wider transition text-center cursor-pointer"
              >
                Clear All Filters
              </button>
            </div>
          </aside>

          {/* ==================== RIGHT MAIN DATA MATRIX (EQUAL HEIGHT) ==================== */}
          <main className="lg:col-span-9 xl:col-span-9 flex flex-col h-full">
            <div className="flex-1 flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm h-full">
              {/* Header Title & Subtitle + Export Actions */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-100 flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                      DISEASE OUTBREAK SURVEILLANCE REPORT MATRIX
                    </h1>
                    <span className="hidden sm:inline-flex items-center rounded-md bg-[#0060A9]/10 px-2 py-0.5 text-[10px] font-bold text-[#0060A9] border border-[#0060A9]/20">
                      LIVE NLP DATA
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Real-time cross-tabulation and event logs extracted directly from social media, news feeds, and official disease surveillance databases.
                  </p>
                </div>

                {/* Export Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 print:hidden flex-shrink-0">
                  <button
                    type="button"
                    onClick={loadRealSurveillanceData}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs cursor-pointer disabled:opacity-50"
                    title="Reload live data from NLP pipeline"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-xs cursor-pointer"
                    title="Export to Excel (.CSV with UTF-8 BOM)"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                    <span>Export Excel (.CSV)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition shadow-xs cursor-pointer"
                    title="Print official report or save to PDF"
                  >
                    <Printer className="h-4 w-4 text-slate-600" />
                    <span>Print / PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-[#0060A9] hover:bg-blue-100 transition shadow-xs cursor-pointer"
                    title="Copy summary to clipboard"
                  >
                    <Copy className="h-4 w-4" />
                    <span className="hidden sm:inline">Copy Summary</span>
                  </button>
                </div>
              </div>

              {/* View Tabs & Metric Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 pb-3 flex-shrink-0">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveTab('cross_matrix')}
                    className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition cursor-pointer ${
                      activeTab === 'cross_matrix'
                        ? 'bg-[#0060A9] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <TableIcon className="h-3.5 w-3.5" />
                    <span>Cross-Tabulation Matrix (Disease × Country)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('event_log')}
                    className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition cursor-pointer ${
                      activeTab === 'event_log'
                        ? 'bg-[#0060A9] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Surveillance Events Ledger (Detailed Log)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('time_distribution')}
                    className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 transition cursor-pointer ${
                      activeTab === 'time_distribution'
                        ? 'bg-[#0060A9] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span>Monthly Temporal Distribution (Seasonality)</span>
                  </button>
                </div>

                {/* Sub-Metric Switcher for Cross-Matrix */}
                {activeTab === 'cross_matrix' && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Metric:
                    </span>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                      {[
                        { id: 'both', label: 'Cases & Deaths' },
                        { id: 'cases', label: 'Cases Only' },
                        { id: 'deaths', label: 'Deaths Only' },
                        { id: 'severity', label: 'Alert Level' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMatrixMetric(m.id as any)}
                          className={`rounded-md px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                            matrixMetric === m.id
                              ? 'bg-white text-[#0060A9] shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Active Filter Tags */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pb-3 flex-shrink-0">
                  <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">
                    Active Filters:
                  </span>
                  {selectedCountries.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold text-[#0060A9]"
                    >
                      Country: {c}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-blue-900"
                        onClick={() => handleToggleCountry(c)}
                      />
                    </span>
                  ))}
                  {selectedDiseases.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-700"
                    >
                      Disease: {d}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-rose-900"
                        onClick={() => handleToggleDisease(d)}
                      />
                    </span>
                  ))}
                  {selectedSeverities.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                    >
                      Alert: {s}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-amber-900"
                        onClick={() => handleToggleSeverity(s)}
                      />
                    </span>
                  ))}
                  {selectedSources.map((src) => (
                    <span
                      key={src}
                      className="inline-flex items-center gap-1 rounded-md bg-cyan-50 border border-cyan-200 px-2 py-0.5 text-[11px] font-semibold text-cyan-800"
                    >
                      Source: {src}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-cyan-900"
                        onClick={() => handleToggleSource(src)}
                      />
                    </span>
                  ))}
                  {searchQuery && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      Search: &quot;{searchQuery}&quot;
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-slate-900"
                        onClick={() => setSearchQuery('')}
                      />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-[11px] font-bold text-rose-600 hover:underline ml-1 cursor-pointer"
                  >
                    Reset All
                  </button>
                </div>
              )}

              {/* Loading State Display */}
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center py-24 space-y-4">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-[#0060A9] animate-spin" />
                    <Activity className="h-5 w-5 text-[#0060A9] absolute inset-0 m-auto" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-800">
                      Connecting to NLP Intelligence Pipeline...
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Retrieving real surveillance events, morbidities, and outbreak triggers from database.
                    </p>
                  </div>
                </div>
              ) : dataList.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 space-y-3 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-800">No NLP Surveillance Events Found</h3>
                  <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                    There are currently no processed disease records in the database. When the crawling feeds and NLP workers process incoming news and social posts, reports will populate here automatically.
                  </p>
                  <button
                    type="button"
                    onClick={loadRealSurveillanceData}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-[#0060A9] px-4 py-2 text-xs font-bold text-white hover:bg-[#004b85] transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Check Again</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* ==================== TAB 1: CROSS-TABULATION MATRIX ==================== */}
                  {activeTab === 'cross_matrix' && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 custom-scrollbar">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead className="sticky top-0 z-10 bg-[#0060A9] text-white">
                            <tr>
                              <th className="py-3 px-3.5 font-bold uppercase tracking-wider border-r border-[#004b85] whitespace-nowrap bg-[#0060A9]">
                                DISEASE CLASSIFICATION
                              </th>
                              {crossTabMatrix.countries.map((ctr) => (
                                <th
                                  key={ctr}
                                  className="py-3 px-3 font-bold text-center border-r border-[#004b85] whitespace-nowrap bg-[#0060A9]"
                                >
                                  <div className="flex flex-col items-center gap-1">
                                    <CountryFlag countryName={ctr} shape="rounded" size="xs" />
                                    <span className="text-[11px] font-semibold">{ctr}</span>
                                  </div>
                                </th>
                              ))}
                              <th className="py-3 px-3.5 font-extrabold text-center border-r border-[#004b85] whitespace-nowrap bg-[#004b85]">
                                TOTAL CASES
                              </th>
                              <th className="py-3 px-3 font-extrabold text-center border-r border-[#004b85] whitespace-nowrap bg-[#004b85]">
                                TOTAL DEATHS
                              </th>
                              <th className="py-3 px-3 font-extrabold text-center whitespace-nowrap bg-[#004b85]">
                                REGIONAL CFR
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                            {crossTabMatrix.diseases.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={crossTabMatrix.countries.length + 4}
                                  className="py-12 text-center text-slate-400 font-semibold text-xs"
                                >
                                  No surveillance records matched the active filter criteria.
                                </td>
                              </tr>
                            ) : (
                              crossTabMatrix.diseases.map((dis, rowIdx) => {
                                const rowTotals = crossTabMatrix.diseaseTotals[dis]
                                return (
                                  <tr
                                    key={dis}
                                    className={`transition ${
                                      rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                    } hover:bg-blue-50/40`}
                                  >
                                    <td className="py-2.5 px-3.5 font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap sticky left-0 bg-inherit">
                                      <div className="flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-[#0060A9]" />
                                        <span>{dis}</span>
                                      </div>
                                    </td>

                                    {crossTabMatrix.countries.map((ctr) => {
                                      const cell =
                                        crossTabMatrix.matrix[dis] &&
                                        crossTabMatrix.matrix[dis][ctr]
                                          ? crossTabMatrix.matrix[dis][ctr]
                                          : {
                                              cases: 0,
                                              deaths: 0,
                                              cfr: 0,
                                              count: 0,
                                              severity: 'NORMAL',
                                            }

                                      return (
                                        <td
                                          key={ctr}
                                          className="py-2.5 px-2 text-center border-r border-slate-200 whitespace-nowrap font-mono text-[11px]"
                                        >
                                          {cell.cases === 0 && cell.deaths === 0 ? (
                                            <span className="text-slate-300 font-normal">-</span>
                                          ) : matrixMetric === 'both' ? (
                                            <div className="inline-flex flex-col items-center">
                                              <span className="font-extrabold text-slate-800">
                                                {cell.cases.toLocaleString()}
                                              </span>
                                              {cell.deaths > 0 && (
                                                <span className="text-[10px] font-bold text-rose-600">
                                                  +{cell.deaths} dth
                                                </span>
                                              )}
                                            </div>
                                          ) : matrixMetric === 'cases' ? (
                                            <span className="font-extrabold text-blue-950">
                                              {cell.cases.toLocaleString()}
                                            </span>
                                          ) : matrixMetric === 'deaths' ? (
                                            <span
                                              className={`font-bold ${
                                                cell.deaths > 0 ? 'text-rose-600' : 'text-slate-300'
                                              }`}
                                            >
                                              {cell.deaths}
                                            </span>
                                          ) : (
                                            <div className="flex justify-center">
                                              {getSeverityBadge(cell.severity)}
                                            </div>
                                          )}
                                        </td>
                                      )
                                    })}

                                    <td className="py-2.5 px-3 text-center font-extrabold text-slate-900 border-r border-slate-200 bg-slate-50/70 font-mono">
                                      {rowTotals?.cases.toLocaleString() || 0}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-bold text-rose-600 border-r border-slate-200 bg-rose-50/30 font-mono">
                                      {rowTotals?.deaths.toLocaleString() || 0}
                                    </td>
                                    <td className="py-2.5 px-3 text-center font-extrabold text-amber-700 bg-amber-50/30 font-mono">
                                      {rowTotals?.cfr || 0}%
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                          <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
                            <tr>
                              <td className="py-3 px-3.5 uppercase tracking-wider border-r border-slate-200">
                                REGIONAL TOTAL
                              </td>
                              {crossTabMatrix.countries.map((ctr) => {
                                const ct = crossTabMatrix.countryTotals[ctr]
                                return (
                                  <td
                                    key={ctr}
                                    className="py-3 px-2 text-center border-r border-slate-200 font-mono text-[11px]"
                                  >
                                    {ct?.cases ? (
                                      <div className="flex flex-col items-center">
                                        <span className="text-blue-900 font-extrabold">
                                          {ct.cases.toLocaleString()}
                                        </span>
                                        {ct.deaths > 0 && (
                                          <span className="text-[10px] text-rose-600 font-bold">
                                            +{ct.deaths}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 font-normal">-</span>
                                    )}
                                  </td>
                                )
                              })}
                              <td className="py-3 px-3 text-center font-extrabold text-[#0060A9] border-r border-slate-200 bg-blue-50 font-mono">
                                {crossTabMatrix.grandCases.toLocaleString()} Cases
                              </td>
                              <td className="py-3 px-3 text-center font-extrabold text-rose-700 border-r border-slate-200 bg-rose-50 font-mono">
                                {crossTabMatrix.grandDeaths.toLocaleString()}
                              </td>
                              <td className="py-3 px-3 text-center font-black text-amber-800 bg-amber-50 font-mono">
                                {crossTabMatrix.grandCfr}%
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ==================== TAB 2: DETAILED EVENT SURVEILLANCE LOG ==================== */}
                  {activeTab === 'event_log' && (
                    <div className="flex-1 flex flex-col min-h-0 space-y-3">
                      {/* Table Search Toolbar */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
                        <div className="relative w-full sm:w-80">
                          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                              setSearchQuery(e.target.value)
                              setCurrentPage(1)
                            }}
                            placeholder="Search location, event ID, intelligence text..."
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#0060A9] focus:outline-none focus:ring-1 focus:ring-[#0060A9]"
                          />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>Per page</span>
                          <select
                            value={itemsPerPage}
                            onChange={(e) => {
                              setItemsPerPage(Number(e.target.value))
                              setCurrentPage(1)
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 focus:border-[#0060A9]"
                          >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                      </div>

                      {/* Table Viewport */}
                      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 custom-scrollbar">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead className="sticky top-0 z-10 bg-[#0060A9] text-white">
                            <tr>
                              <th
                                className="py-3 px-3.5 font-bold cursor-pointer hover:bg-[#004b85] border-b border-[#004b85] whitespace-nowrap"
                                onClick={() => {
                                  if (sortField === 'date') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                                  else {
                                    setSortField('date')
                                    setSortOrder('desc')
                                  }
                                }}
                              >
                                <div className="flex items-center gap-1">
                                  <span>ID &amp; DATE</span>
                                  <ArrowUpDown className="h-3 w-3" />
                                </div>
                              </th>
                              <th
                                className="py-3 px-3 font-bold cursor-pointer hover:bg-[#004b85] border-b border-[#004b85] whitespace-nowrap"
                                onClick={() => {
                                  if (sortField === 'country') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                                  else {
                                    setSortField('country')
                                    setSortOrder('asc')
                                  }
                                }}
                              >
                                <div className="flex items-center gap-1">
                                  <span>COUNTRY &amp; REGION</span>
                                  <ArrowUpDown className="h-3 w-3" />
                                </div>
                              </th>
                              <th
                                className="py-3 px-3 font-bold cursor-pointer hover:bg-[#004b85] border-b border-[#004b85] whitespace-nowrap"
                                onClick={() => {
                                  if (sortField === 'disease') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                                  else {
                                    setSortField('disease')
                                    setSortOrder('asc')
                                  }
                                }}
                              >
                                <div className="flex items-center gap-1">
                                  <span>DISEASE</span>
                                  <ArrowUpDown className="h-3 w-3" />
                                </div>
                              </th>
                              <th
                                className="py-3 px-3 font-bold text-center cursor-pointer hover:bg-[#004b85] border-b border-[#004b85] whitespace-nowrap"
                                onClick={() => {
                                  if (sortField === 'cases') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                                  else {
                                    setSortField('cases')
                                    setSortOrder('desc')
                                  }
                                }}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <span>CASES</span>
                                  <ArrowUpDown className="h-3 w-3" />
                                </div>
                              </th>
                              <th
                                className="py-3 px-3 font-bold text-center cursor-pointer hover:bg-[#004b85] border-b border-[#004b85] whitespace-nowrap"
                                onClick={() => {
                                  if (sortField === 'deaths') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                                  else {
                                    setSortField('deaths')
                                    setSortOrder('desc')
                                  }
                                }}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <span>DEATHS</span>
                                  <ArrowUpDown className="h-3 w-3" />
                                </div>
                              </th>
                              <th
                                className="py-3 px-3 font-bold text-center cursor-pointer hover:bg-[#004b85] border-b border-[#004b85] whitespace-nowrap"
                                onClick={() => {
                                  if (sortField === 'cfr') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                                  else {
                                    setSortField('cfr')
                                    setSortOrder('desc')
                                  }
                                }}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <span>CFR</span>
                                  <ArrowUpDown className="h-3 w-3" />
                                </div>
                              </th>
                              <th className="py-3 px-3 font-bold text-center border-b border-[#004b85] whitespace-nowrap">
                                <span>ALERT LEVEL</span>
                              </th>
                              <th className="py-3 px-3 border-b border-[#004b85] whitespace-nowrap">
                                <span>SOURCE PLATFORM</span>
                              </th>
                              <th className="py-3 px-3 font-bold text-center border-b border-[#004b85] whitespace-nowrap">
                                <span>ACTION</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {paginatedData.length === 0 ? (
                              <tr>
                                <td colSpan={9} className="py-12 text-center text-slate-400 font-semibold text-xs">
                                  No surveillance records match the active filter criteria.
                                </td>
                              </tr>
                            ) : (
                              paginatedData.map((item, idx) => (
                                <tr
                                  key={item.id}
                                  className={`transition ${
                                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                                  } hover:bg-blue-50/50`}
                                >
                                  <td className="py-2.5 px-3.5 whitespace-nowrap font-mono">
                                    <div className="font-bold text-slate-800 text-[11px] truncate max-w-[130px]" title={item.id}>
                                      {item.id.slice(0, 16)}...
                                    </div>
                                    <div className="text-[10px] text-slate-400">{item.dateFormatted}</div>
                                  </td>

                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                      <CountryFlag countryName={item.country} shape="rounded" size="xs" />
                                      <span>{item.country}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{item.locationName}</div>
                                  </td>

                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span className="font-extrabold text-slate-900">{item.disease}</span>
                                  </td>

                                  <td className="py-2.5 px-3 text-center font-mono font-extrabold text-slate-900 whitespace-nowrap">
                                    {item.cases.toLocaleString()}
                                  </td>

                                  <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-600 whitespace-nowrap">
                                    {item.deaths.toLocaleString()}
                                  </td>

                                  <td className="py-2.5 px-3 text-center font-mono font-bold text-amber-700 whitespace-nowrap">
                                    {item.cfr}%
                                  </td>

                                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                    {getSeverityBadge(item.severity)}
                                  </td>

                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-1.5 text-[11px] text-slate-700 font-medium">
                                      <SocialMediaIcon platform={item.sourceType} size="xs" />
                                      <span className="truncate max-w-[120px]">{item.sourceName}</span>
                                    </div>
                                  </td>

                                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedDetailItem(item)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-[#0060A9] hover:bg-blue-50 hover:border-blue-200 transition cursor-pointer"
                                    >
                                      <Eye className="h-3 w-3" />
                                      <span>Details</span>
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination Toolbar */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-500 flex-shrink-0">
                        <div>
                          Showing{' '}
                          <span className="font-bold text-slate-800">
                            {sortedData.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
                          </span>{' '}
                          to{' '}
                          <span className="font-bold text-slate-800">
                            {Math.min(currentPage * itemsPerPage, sortedData.length)}
                          </span>{' '}
                          of <span className="font-bold text-slate-800">{sortedData.length}</span> total events
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>

                          <span className="px-2 font-bold text-slate-700">
                            Page {currentPage} of {totalPages}
                          </span>

                          <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ==================== TAB 3: MONTHLY TEMPORAL MATRIX ==================== */}
                  {activeTab === 'time_distribution' && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 custom-scrollbar">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead className="sticky top-0 z-10 bg-[#0060A9] text-white">
                            <tr>
                              <th className="py-3 px-3.5 font-bold uppercase tracking-wider border-r border-[#004b85] whitespace-nowrap bg-[#0060A9]">
                                DISEASE CLASSIFICATION
                              </th>
                              {temporalDistribution.months.map((m) => (
                                <th
                                  key={m.key}
                                  className="py-3 px-2 text-center font-bold border-r border-[#004b85] whitespace-nowrap bg-[#0060A9]"
                                >
                                  {m.label}
                                </th>
                              ))}
                              <th className="py-3 px-3.5 text-center font-extrabold whitespace-nowrap bg-[#004b85]">
                                ANNUAL TOTAL
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white font-mono text-[11px]">
                            {crossTabMatrix.diseases.length === 0 ? (
                              <tr>
                                <td colSpan={14} className="py-12 text-center text-slate-400 font-semibold text-xs font-sans">
                                  No surveillance records in the selected time range.
                                </td>
                              </tr>
                            ) : (
                              crossTabMatrix.diseases.map((dis, idx) => {
                                const monthData = temporalDistribution.dist[dis] || new Array(12).fill(0)
                                const diseaseAnnual = monthData.reduce((acc, c) => acc + c, 0)
                                return (
                                  <tr
                                    key={dis}
                                    className={`transition ${
                                      idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                                    } hover:bg-blue-50/40`}
                                  >
                                    <td className="py-2.5 px-3.5 font-sans font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap sticky left-0 bg-inherit">
                                      {dis}
                                    </td>
                                    {monthData.map((val, mIdx) => (
                                      <td
                                        key={mIdx}
                                        className="py-2.5 px-2 text-center border-r border-slate-200 whitespace-nowrap"
                                      >
                                        {val > 0 ? (
                                          <span
                                            className={`font-extrabold ${
                                              val > 100
                                                ? 'text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded'
                                                : val > 30
                                                ? 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded'
                                                : 'text-slate-800'
                                            }`}
                                          >
                                            {val.toLocaleString()}
                                          </span>
                                        ) : (
                                          <span className="text-slate-300 font-normal">-</span>
                                        )}
                                      </td>
                                    ))}
                                    <td className="py-2.5 px-3.5 text-center font-extrabold text-[#0060A9] bg-blue-50/40">
                                      {diseaseAnnual.toLocaleString()}
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                          <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900 font-mono text-[11px]">
                            <tr>
                              <td className="py-3 px-3.5 font-sans uppercase tracking-wider border-r border-slate-200">
                                MONTHLY TOTAL CASES
                              </td>
                              {temporalDistribution.monthlyTotals.map((tot, mIdx) => (
                                <td key={mIdx} className="py-3 px-2 text-center border-r border-slate-200">
                                  <span className="text-blue-900 font-extrabold">
                                    {tot > 0 ? tot.toLocaleString() : '-'}
                                  </span>
                                </td>
                              ))}
                              <td className="py-3 px-3.5 text-center font-black text-[#0060A9] bg-blue-100">
                                {temporalDistribution.monthlyTotals
                                  .reduce((a, b) => a + b, 0)
                                  .toLocaleString()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* ==================== DETAIL EVENT INSIGHT MODAL ==================== */}
      {selectedDetailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-[#0060A9]">
                  {selectedDetailItem.id.slice(0, 18)}...
                </span>
                {getSeverityBadge(selectedDetailItem.severity)}
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailItem(null)}
                className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Title */}
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {selectedDetailItem.disease} — {selectedDetailItem.locationName}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Surveillance Intelligence Record Details (NLP Processed)
              </p>
            </div>

            {/* Modal Key Metrics Bar */}
            <div className="grid grid-cols-4 gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200 text-center">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Cases</p>
                <p className="text-xl font-extrabold text-slate-900 mt-0.5">
                  {selectedDetailItem.cases.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Deaths</p>
                <p className="text-xl font-extrabold text-rose-600 mt-0.5">
                  {selectedDetailItem.deaths.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">CFR Rate</p>
                <p className="text-xl font-extrabold text-amber-700 mt-0.5">
                  {selectedDetailItem.cfr}%
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">NLP Confidence</p>
                <p className="text-xl font-extrabold text-[#0060A9] mt-0.5">
                  {Math.round(selectedDetailItem.confidence * 100)}%
                </p>
              </div>
            </div>

            {/* Modal Details Grid */}
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500">Country &amp; Region:</span>
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <CountryFlag countryName={selectedDetailItem.country} shape="rounded" size="xs" />
                  <span>
                    {selectedDetailItem.locationName}, {selectedDetailItem.country}
                  </span>
                </div>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500">Detection / Report Date:</span>
                <span className="font-bold text-slate-800">{selectedDetailItem.dateFormatted}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500">Raw NLP Label:</span>
                <span className="font-mono font-bold text-slate-800">{selectedDetailItem.rawDisease}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500">Information Source:</span>
                <div className="flex items-center gap-1 font-bold text-slate-800">
                  <SocialMediaIcon platform={selectedDetailItem.sourceType} size="xs" />
                  <span>{selectedDetailItem.sourceName}</span>
                </div>
              </div>
            </div>

            {/* Symptoms Tags */}
            {selectedDetailItem.symptoms && selectedDetailItem.symptoms.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Detected Clinical Symptoms:
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedDetailItem.symptoms.map((sym, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 capitalize"
                    >
                      {sym}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Content / Narrative snippet */}
            {selectedDetailItem.content && (
              <div>
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Intelligence Narrative Summary (Extracted by NLP):
                </p>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed font-sans max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {selectedDetailItem.content}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              {selectedDetailItem.url && (
                <a
                  href={selectedDetailItem.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-[#0060A9] hover:bg-blue-100 transition cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open Source Link</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setSelectedDetailItem(null)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
