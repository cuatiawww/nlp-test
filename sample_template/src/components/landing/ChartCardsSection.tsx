'use client'

import { useEffect, useRef, useState } from 'react'

type ChartInstance = { destroy: () => void; update: (mode?: string) => void }
type ChartConstructor = new (canvas: HTMLCanvasElement, config: any) => ChartInstance
type FacilityFilter = 'rumah-sakit' | 'puskesmas' | 'pustu' | 'klinik' | 'posyandu' | 'bbkk'
type RekapTotals = {
  total_rs?: string | number
  total_puskesmas?: string | number
  total_pustu?: string | number
  total_klinik?: string | number
  total_posyandu?: string | number
  total_bkk?: string | number
} | null

function getChartConstructor(): ChartConstructor | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { Chart?: ChartConstructor }).Chart ?? null
}

const FASKES_META = [
  { id: 'rumah-sakit', label: 'Rumah Sakit', shortLabel: 'Rumah Sakit', key: 'total_rs', color: '#2f80ed' },
  { id: 'puskesmas', label: 'Puskesmas', shortLabel: 'Puskesmas', key: 'total_puskesmas', color: '#4ac97a' },
  { id: 'pustu', label: 'Pustu', shortLabel: 'Pustu', key: 'total_pustu', color: '#ffa62b' },
  { id: 'klinik', label: 'Klinik', shortLabel: 'Klinik', key: 'total_klinik', color: '#9b51e0' },
  { id: 'posyandu', label: 'Posyandu', shortLabel: 'Posyandu', key: 'total_posyandu', color: '#f45ca1' },
  { id: 'bbkk', label: 'BBKK/BKK/LKK', shortLabel: 'BBKK/\nBKK/LKK', key: 'total_bkk', color: '#39c6cf' },
] as const

let chartJsLoaded = false
const chartJsCallbacks: (() => void)[] = []

function loadChartJs(cb: () => void) {
  if (typeof window === 'undefined') return
  if (chartJsLoaded) {
    cb()
    return
  }
  chartJsCallbacks.push(cb)
  if (chartJsCallbacks.length > 1) return

  const script = document.createElement('script')
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
  script.onload = () => {
    chartJsLoaded = true
    chartJsCallbacks.forEach((fn) => fn())
  }
  document.head.appendChild(script)
}

function useChartJs(onReady: () => void) {
  useEffect(() => {
    loadChartJs(onReady)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

function formatNumber(value: number) {
  return value.toLocaleString('id-ID')
}

function fadeColor(hex: string, opacity: number) {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function toNumber(value: string | number | undefined) {
  if (typeof value === 'number') return value
  const parsed = Number.parseInt((value ?? '0').toString().replace(/[^\d-]/g, ''), 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

function buildFaskesData(rekapTotal: RekapTotals) {
  const rows = FASKES_META.map((item) => ({
    ...item,
    value: toNumber(rekapTotal?.[item.key]),
    percentage: '0,00%',
  }))
  const total = rows.reduce((sum, item) => sum + item.value, 0)
  return rows.map((item) => ({
    ...item,
    percentage:
      total > 0
        ? `${((item.value / total) * 100).toLocaleString('id-ID', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}%`
        : '0,00%',
  }))
}

function getSelectedData(selectedIds: FacilityFilter[], faskesData: ReturnType<typeof buildFaskesData>) {
  return faskesData.filter((item) => selectedIds.includes(item.id))
}

function getDataVersion(faskesData: ReturnType<typeof buildFaskesData>) {
  return faskesData.map((item) => `${item.id}:${item.value}`).join('|')
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <article
      className="relative overflow-hidden bg-white"
      style={{
        border: '1.5px solid #d6ecec',
        borderRadius: '18px',
        boxShadow: '0 10px 28px rgba(15, 143, 150, 0.06)',
      }}
    >
      <div className="p-5 sm:p-6">
        <div className="mb-5">
          <h3 className="text-[18px] font-bold uppercase leading-tight text-[#1f3131] sm:text-[20px]">
            {title}
          </h3>
          {description ? (
            <p className="mt-2 text-[15px] leading-relaxed text-[#5f7a79] sm:text-[16px]">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </article>
  )
}

function RingkasanFaskesCard({
  selectedIds,
  onSelectionChange,
  faskesData,
  loading,
}: {
  selectedIds: FacilityFilter[]
  onSelectionChange: (selectedIds: FacilityFilter[]) => void
  faskesData: ReturnType<typeof buildFaskesData>
  loading: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartInstance | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const filteredData = getSelectedData(selectedIds, faskesData)
  const dataVersion = getDataVersion(faskesData)
  const selectedIdsVersion = selectedIds.join('|')
  const totalValue = filteredData.map((item) => item.value).reduce((sum, value) => sum + value, 0)
  const isAllActive = selectedIds.length === FASKES_META.length
  const displayActiveIndex = isAllActive ? activeIndex : null

  const toggleSelection = (id: FacilityFilter) => {
    const nextIds = selectedIds.includes(id)
      ? selectedIds.filter((itemId) => itemId !== id)
      : [...selectedIds, id]

    onSelectionChange(nextIds.length === 0 ? FASKES_META.map((item) => item.id) : nextIds)
  }

  const syncColors = (index: number | null) => {
    const chart = chartRef.current as unknown as {
      data: { datasets: { backgroundColor: string[] }[] }
      update: (mode?: string) => void
    } | null

    if (!chart) return

    chart.data.datasets[0].backgroundColor = filteredData.map((item, itemIndex) =>
      index === null || itemIndex === index ? item.color : fadeColor(item.color, 0.2)
    )
    chart.update('none')
  }

  const buildChart = () => {
    const ChartCtor = getChartConstructor()
    if (!canvasRef.current || !ChartCtor) return
    chartRef.current?.destroy()

    chartRef.current = new ChartCtor(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: filteredData.map((item) => item.label),
        datasets: [
          {
            data: filteredData.map((item) => item.value),
            backgroundColor: filteredData.map((item) => item.color),
            borderColor: '#ffffff',
            borderWidth: 4,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '69%',
        animation: { duration: 900 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#153838',
            titleColor: '#ffffff',
            bodyColor: '#d7f2ef',
            padding: 12,
            displayColors: false,
            callbacks: {
              label: (context: { dataIndex: number }) => {
                const item = filteredData[context.dataIndex]
                return `${item.label}: ${formatNumber(item.value)} (${item.percentage})`
              },
            },
          },
        },
        onHover: (_: unknown, elements: { index: number }[]) => {
          const nextIndex = elements.length > 0 ? elements[0].index : null
          if (nextIndex !== activeIndex) {
            setActiveIndex(nextIndex)
          }
        },
        onClick: (_: unknown, elements: { index: number }[]) => {
          if (elements.length === 0) {
            setActiveIndex(null)
            return
          }
          const clicked = elements[0].index
          setActiveIndex((current) => (current === clicked ? null : clicked))
        },
      },
    })
  }

  useChartJs(buildChart)
  useEffect(() => {
    if (getChartConstructor()) {
      buildChart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdsVersion, dataVersion])

  useEffect(() => {
    syncColors(displayActiveIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayActiveIndex, selectedIdsVersion, dataVersion])

  useEffect(() => () => chartRef.current?.destroy(), [])

  return (
    <SectionCard
      title="Ringkasan Faskes Secara Nasional"
      description="Ringkasan ini menampilkan proporsi fasilitas kesehatan secara nasional per jenis layanan. Gunakan daftar di samping untuk menyorot atau memfilter kategori pada chart."
    >
      <div className={`grid grid-cols-1 gap-6 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] lg:items-center ${loading ? 'opacity-75' : 'opacity-100'}`}>
        <div className="relative mx-auto h-[240px] w-full max-w-[280px] sm:h-[280px] sm:max-w-[320px]">
          <canvas
            ref={canvasRef}
            aria-label="Ringkasan Faskes Secara Nasional"
            role="img"
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#516b6b] sm:text-[14px] sm:tracking-[0.2em]">
              {isAllActive ? 'Total' : `${selectedIds.length} Jenis Aktif`}
            </span>
            <span className="mt-2 text-[26px] font-bold leading-none text-[#1d2f2f] sm:text-[42px]">
              {formatNumber(totalValue)}
            </span>
            <span className="mt-1.5 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2c5756] sm:mt-2 sm:text-[15px] sm:tracking-[0.12em]">
              {isAllActive ? 'Faskes' : 'Faskes'}
            </span>
          </div>
        </div>

        <div className="grid gap-3">
          {faskesData.map((item, index) => {
            const isSelected = selectedIds.includes(item.id)
            const isMuted = !isSelected
            return (
              <button
                key={item.label}
                type="button"
                onMouseEnter={() => {
                  if (isAllActive) setActiveIndex(index)
                }}
                onMouseLeave={() => {
                  if (isAllActive) setActiveIndex(null)
                }}
                onClick={() => toggleSelection(item.id)}
                className={`flex items-center justify-between rounded-[14px] border px-4 py-3 text-left transition ${
                  isMuted ? 'opacity-45' : 'opacity-100'
                }`}
                style={{
                  borderColor: isSelected ? fadeColor(item.color, 0.42) : '#d9e9e8',
                  background: isSelected ? fadeColor(item.color, 0.08) : '#ffffff',
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3.5 w-3.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <div>
                    <p className="text-[14px] font-semibold text-[#233737]">{item.label}</p>
                    <p className="text-[12px] text-[#668484]">{item.percentage}</p>
                  </div>
                </div>
                <span className="text-[16px] font-bold text-[#163434]">
                  {formatNumber(item.value)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </SectionCard>
  )
}

function SebaranJenisFaskesCard({
  selectedIds,
  faskesData,
  loading,
}: {
  selectedIds: FacilityFilter[]
  faskesData: ReturnType<typeof buildFaskesData>
  loading: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartInstance | null>(null)
  const filteredData = getSelectedData(selectedIds, faskesData)
  const dataVersion = getDataVersion(faskesData)
  const selectedIdsVersion = selectedIds.join('|')
  const isAllActive = selectedIds.length === FASKES_META.length

  const buildChart = () => {
    const ChartCtor = getChartConstructor()
    if (!canvasRef.current || !ChartCtor) return
    chartRef.current?.destroy()
    const isMobile = window.innerWidth < 640

    const valueLabelsPlugin = {
      id: 'valueLabelsPlugin',
      afterDatasetsDraw(chart: {
        ctx: CanvasRenderingContext2D
        data: { datasets: { data: number[] }[] }
        getDatasetMeta: (datasetIndex: number) => {
          data: Array<{ x: number; y: number; base: number }>
        }
      }) {
        const { ctx } = chart
        const meta = chart.getDatasetMeta(0)
        ctx.save()
        ctx.font = isMobile ? '700 10px Arial' : '700 11px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0

        filteredData.forEach((item, index) => {
          const bar = meta.data[index]
          if (!bar) return

          const barHeight = Math.abs(bar.base - bar.y)
          const isSmallBar = barHeight < (isMobile ? 28 : 34)
          const labelY = isSmallBar ? bar.y - 9 : (bar.base + bar.y) / 2
          ctx.fillStyle = isSmallBar ? '#2d4e4d' : '#ffffff'
          ctx.fillText(formatNumber(item.value), bar.x, labelY)
        })

        ctx.restore()
      },
    }

    chartRef.current = new ChartCtor(canvasRef.current, {
      type: 'bar',
      data: {
        labels: filteredData.map((item) =>
          item.id === 'bbkk' ? ['BBKK/', 'BKK/LKK'] : item.shortLabel
        ),
        datasets: [
          {
            data: filteredData.map((item) => item.value),
            backgroundColor: filteredData.map((item) => item.color),
            borderRadius: isMobile ? 4 : 10,
            borderSkipped: false,
            barPercentage: 0.72,
            categoryPercentage: filteredData.length === 1 ? 0.46 : 0.76,
            minBarLength: isMobile ? 10 : 22,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#153838',
            titleColor: '#ffffff',
            bodyColor: '#d7f2ef',
            padding: 12,
            displayColors: false,
            callbacks: {
              label: (context: { dataIndex: number }) => {
                const item = filteredData[context.dataIndex]
                return `${formatNumber(item.value)} faskes (${item.percentage})`
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: '#425d5d',
              font: { size: isMobile ? 11 : 12, weight: '600' },
              maxRotation: 0,
              minRotation: 0,
            },
          },
          y: {
            beginAtZero: true,
            suggestedMax: isAllActive
              ? 300000
              : Math.max((filteredData[0]?.value ?? 0) * 1.2, 1000),
            grid: { color: 'rgba(24, 128, 132, 0.10)' },
            border: { display: false },
            ticks: {
              stepSize: isAllActive
                ? 100000
                : Math.max(1, Math.ceil((filteredData[0]?.value ?? 0) / 4 / 1000) * 1000),
              color: '#6e8b8a',
              font: { size: 12 },
              callback: (value: string | number) => {
                if (Number(value) === 0) return '0'
                if (!isAllActive && Number(value) < 1000) return formatNumber(Number(value))
                return `${Math.round(Number(value) / 1000)} RB`
              },
            },
          },
        },
      },
      plugins: [valueLabelsPlugin],
    })
  }

  useChartJs(buildChart)
  useEffect(() => {
    if (getChartConstructor()) {
      buildChart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdsVersion, dataVersion])
  useEffect(() => () => chartRef.current?.destroy(), [])

  return (
    <SectionCard
      title="Grafik Sebaran Per Jenis Faskes"
      description="Grafik batang ini memperlihatkan perbandingan jumlah faskes pada setiap jenis layanan. Nilai pada sumbu vertikal menampilkan volume fasilitas untuk memudahkan analisis kategori tertinggi dan terendah."
    >
      <div className="rounded-[16px] border border-[#e3f1f0] bg-[linear-gradient(180deg,#fcffff_0%,#f5fbfb_100%)] p-3 sm:p-4">
        <div className={`h-[340px] sm:h-[380px] ${loading ? 'opacity-75' : 'opacity-100'}`}>
          <canvas
            ref={canvasRef}
            aria-label="Grafik Sebaran Per Jenis Faskes"
            role="img"
          />
        </div>
      </div>
    </SectionCard>
  )
}

export default function ChartCardsSection({
  rekapTotal,
  loading = false,
}: {
  rekapTotal: RekapTotals
  loading?: boolean
}) {
  const faskesData = buildFaskesData(rekapTotal)
  const [selectedIds, setSelectedIds] = useState<FacilityFilter[]>(
    FASKES_META.map((item) => item.id)
  )

  return (
    <section className="w-full border-t border-[#e0eeee] bg-[#f4fafa] py-6">
      <div className="w-full px-4 sm:px-5 lg:px-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RingkasanFaskesCard
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            faskesData={faskesData}
            loading={loading}
          />
          <SebaranJenisFaskesCard selectedIds={selectedIds} faskesData={faskesData} loading={loading} />
        </div>
      </div>
    </section>
  )
}
