'use client'

import { useEffect, useRef, useState } from 'react'

type ChartInstance = { destroy: () => void }
type ChartConstructor = new (canvas: HTMLCanvasElement, config: any) => ChartInstance

function getChartConstructor(): ChartConstructor | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { Chart?: ChartConstructor }).Chart ?? null
}

let chartJsLoaded = false
const chartJsCallbacks: (() => void)[] = []

function loadChartJs(cb: () => void) {
  if (typeof window === 'undefined') return
  if (chartJsLoaded) { cb(); return }
  chartJsCallbacks.push(cb)
  if (chartJsCallbacks.length > 1) return
  const s = document.createElement('script')
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
  s.onload = () => {
    chartJsLoaded = true
    chartJsCallbacks.forEach(fn => fn())
  }
  document.head.appendChild(s)
}

function useChartJs(onReady: () => void) {
  useEffect(() => {
    loadChartJs(onReady)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

// ─── Hex → rgba helper ───────────────────────────────────────────────────────

function hexFade(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ─── Tooltip defaults ─────────────────────────────────────────────────────────

const TT = {
  backgroundColor: '#0f2e2e',
  titleColor: '#fff',
  bodyColor: '#cde8e8',
  padding: 10,
  cornerRadius: 8,
  displayColors: false,
}

// ─── Card Shell ───────────────────────────────────────────────────────────────

function Card({
  title,
  description,
  badge,
  children,
  footer,
}: {
  title: string
  description: string
  badge?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <article
      className="group flex flex-col bg-white transition-all duration-300 hover:shadow-[0_12px_40px_rgba(15,143,150,0.10)] hover:-translate-y-1"
      style={{
        border: '1.5px solid #d6ecec',
        borderRadius: '16px',
        minHeight: '420px',
        overflow: 'hidden',
      }}
    >
      <div className="flex flex-col flex-1 p-5">
        {/* Header */}
        <div className="mb-4">
          {badge && (
            <span className="inline-flex items-center gap-1 mb-2 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-[#e8faf9] text-[#0f8f96] border border-[#b8e8e6]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1dc7bf] animate-pulse" />
              {badge}
            </span>
          )}
          <h3 className="text-[16px] sm:text-[18px] font-bold tracking-wide text-[#2f2f2f] uppercase leading-tight">
            {title}
          </h3>
          <p className="mt-1 text-[13px] sm:text-[14px] text-[#4b4b4b] leading-relaxed">
            {description}
          </p>
        </div>

        {/* Chart area */}
        <div className="flex-1 flex flex-col">
          {children}
        </div>

        {/* Footer legend */}
        {footer && (
          <div className="mt-4 pt-3 border-t border-[#f0f7f7]">
            {footer}
          </div>
        )}
      </div>
    </article>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({
  items,
  activeIndex,
  onHover,
  onClick,
}: {
  items: { color: string; label: string }[]
  activeIndex?: number | null
  onHover?: (i: number | null) => void
  onClick?: (i: number | null) => void
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
      {items.map((l, i) => (
        <button
          key={l.label}
          onMouseEnter={() => onHover?.(i)}
          onMouseLeave={() => onHover?.(null)}
          onClick={() => onClick?.(activeIndex === i ? null : i)}
          className={`flex items-center gap-1.5 text-[12px] transition-all duration-200 ${
            activeIndex != null && activeIndex !== i ? 'opacity-30' : 'opacity-100'
          }`}
        >
          <span
            className="w-2.5 h-2.5 rounded-[3px] shrink-0 transition-transform duration-200"
            style={{
              background: l.color,
              transform: activeIndex === i ? 'scale(1.35)' : 'scale(1)',
            }}
          />
          <span className="text-[#4a6a6a] font-medium">{l.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Card 1: Interactive Donut ────────────────────────────────────────────────

const DLI_DATA = [
  { label: 'Siap Penuh',     value: 36,   color: '#1dc7bf' },
  { label: 'Siap Parsial',   value: 30.7, color: '#4d90d0' },
  { label: 'Belum Siap',     value: 23.5, color: '#fbbf24' },
  { label: 'Perlu Validasi', value: 9.8,  color: '#c9dcdc' },
]

function DliStatusCard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartInstance | null>(null)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [centerLabel, setCenterLabel] = useState<{ label: string; value: string } | null>(null)

  const applyHighlight = (idx: number | null) => {
    const chart = chartRef.current as unknown as {
      data: { datasets: { backgroundColor: string[]; borderColor: string[]; hoverOffset: number[] }[] }
      tooltip?: { setActiveElements: (els: { datasetIndex: number; index: number }[], pos: object) => void }
      update: (mode?: string) => void
    }
    if (!chart) return

    if (idx !== null) {
      chart.data.datasets[0].backgroundColor = DLI_DATA.map((d, i) =>
        i === idx ? d.color : hexFade(d.color, 0.15)
      )
      chart.data.datasets[0].borderColor = DLI_DATA.map((_, i) =>
        i === idx ? '#fff' : 'rgba(255,255,255,0.2)'
      )
      chart.tooltip?.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 })
    } else {
      chart.data.datasets[0].backgroundColor = DLI_DATA.map(d => d.color)
      chart.data.datasets[0].borderColor = DLI_DATA.map(() => '#fff')
      chart.tooltip?.setActiveElements([], {})
    }
    chart.update('none')
  }

  const handleSetActive = (idx: number | null) => {
    setActiveIdx(idx)
    if (idx !== null) {
      setCenterLabel({ label: DLI_DATA[idx].label, value: `${DLI_DATA[idx].value}%` })
    } else {
      setCenterLabel(null)
    }
    applyHighlight(idx)
  }

  const buildChart = () => {
    const ChartCtor = getChartConstructor()
    if (!canvasRef.current || !ChartCtor) return
    chartRef.current?.destroy()

    chartRef.current = new ChartCtor(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: DLI_DATA.map(d => d.label),
        datasets: [{
          data: DLI_DATA.map(d => d.value),
          backgroundColor: DLI_DATA.map(d => d.color),
          hoverBackgroundColor: DLI_DATA.map(d => d.color),
          borderWidth: 3,
          borderColor: '#fff',
          hoverBorderWidth: 3,
          hoverOffset: 16,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: { animateRotate: true, duration: 900 },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TT,
            callbacks: {
              label: (c: { label: string; raw: unknown }) => ` ${c.label}: ${c.raw}%`,
            },
          },
        },
        onClick: (_: unknown, elements: { index: number }[]) => {
          if (elements.length > 0) {
            const i = elements[0].index
            handleSetActive(activeIdx === i ? null : i)
          }
        },
      },
    })
  }

  useChartJs(buildChart)
  useEffect(() => () => { chartRef.current?.destroy() }, [])

  return (
    <Card
      title="Status DLI INEY 6.1"
      description="Menyajikan informasi dan memantauan terkini terkait status pencapaian DLI pada platform INEY 6.1."
      footer={
        <Legend
          items={DLI_DATA.map(d => ({ color: d.color, label: `${d.label} (${d.value}%)` }))}
          activeIndex={activeIdx}
          onClick={handleSetActive}
        />
      }
    >
      <div className="relative flex-1 min-h-[220px]">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Donut chart status DLI INEY 6.1"
          style={{ cursor: 'pointer' }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {centerLabel ? (
            <>
              <span className="text-[26px] font-bold text-[#0f8f96] leading-none">
                {centerLabel.value}
              </span>
              <span className="text-[12px] text-[#7a9a9a] mt-1 text-center max-w-[80px] leading-tight">
                {centerLabel.label}
              </span>
            </>
          ) : (
            <>
              <span className="text-[12px] text-[#aac5c5] font-medium">Total</span>
              <span className="text-[24px] font-bold text-[#1a2e2e]">100%</span>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── Card 2: Stacked Bar ──────────────────────────────────────────────────────

const PROVINSI_COLORS = ['#1dc7bf', '#4d90d0', '#fbbf24', '#c9dcdc']
const PROVINSI_LABELS = ['Siap Penuh', 'Siap Parsial', 'Belum Siap', 'Perlu Validasi']

const PROVINSI_BASE_COLORS = ['#1dc7bf', '#4d90d0', '#fbbf24', '#c9dcdc']

function CapaianProvinsiCard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartInstance | null>(null)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const activeIdxRef = useRef<number | null>(null)

  const applyBarHighlight = (idx: number | null) => {
    const chart = chartRef.current as unknown as {
      data: { datasets: { backgroundColor: string }[] }
      update: (mode?: string) => void
    }
    if (!chart) return
    chart.data.datasets.forEach((ds, i) => {
      ds.backgroundColor = idx === null || i === idx
        ? PROVINSI_BASE_COLORS[i]
        : hexFade(PROVINSI_BASE_COLORS[i], 0.15)
    })
    chart.update('none')
  }

  const handleBarClick = (idx: number | null) => {
    const next = activeIdxRef.current === idx ? null : idx
    activeIdxRef.current = next
    setActiveIdx(next)
    applyBarHighlight(next)
  }

  useChartJs(() => {
    const ChartCtor = getChartConstructor()
    if (!canvasRef.current || !ChartCtor) return
    chartRef.current?.destroy()
    chartRef.current = new ChartCtor(canvasRef.current, {
      type: 'bar',
      data: {
        labels: ['Jawa Barat', 'Jawa Tengah', 'Jawa Timur'],
        datasets: [
          { label: 'Siap Penuh',     data: [42, 38, 55], backgroundColor: '#1dc7bf' },
          { label: 'Siap Parsial',   data: [28, 32, 22], backgroundColor: '#4d90d0' },
          { label: 'Belum Siap',     data: [20, 18, 15], backgroundColor: '#fbbf24' },
          { label: 'Perlu Validasi', data: [10, 12,  8], backgroundColor: '#c9dcdc' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900 },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TT,
            callbacks: {
              label: (c: { dataset: { label: string }; raw: unknown }) =>
                ` ${c.dataset.label}: ${c.raw}%`,
            },
          },
        },
        onClick: (_: unknown, elements: { datasetIndex: number }[]) => {
          if (elements.length > 0) {
            handleBarClick(elements[0].datasetIndex)
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 12 }, color: '#7a9a9a' },
          },
          y: {
            stacked: true,
            max: 100,
            grid: { color: 'rgba(0,0,0,0.04)', lineWidth: 1 },
            border: { display: false },
            ticks: {
              callback: (v: unknown) => `${v}%`,
              font: { size: 12 },
              color: '#7a9a9a',
              stepSize: 20,
            },
          },
        },
      },
    })
  })

  useEffect(() => () => { chartRef.current?.destroy() }, [])

  return (
    <Card
      title="Capaian Per Provinsi"
      description="Menyajikan rincian data dan perbandingan progres pencapaian target program secara spesifik untuk masing-masing provinsi."
      footer={
        <Legend
          items={PROVINSI_LABELS.map((l, i) => ({ color: PROVINSI_COLORS[i], label: l }))}
          activeIndex={activeIdx}
          onClick={handleBarClick}
        />
      }
    >
      <div className="flex-1 min-h-[220px] relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Stacked bar chart capaian per provinsi"
          style={{ cursor: 'pointer' }}
        />
      </div>
    </Card>
  )
}

// ─── Card 3: Horizontal Bar ───────────────────────────────────────────────────

function TopGapAlatCard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartInstance | null>(null)

  useChartJs(() => {
    const ChartCtor = getChartConstructor()
    if (!canvasRef.current || !ChartCtor) return
    chartRef.current?.destroy()
    chartRef.current = new ChartCtor(canvasRef.current, {
      type: 'bar',
      data: {
        labels: ['Timbangan Bayi', 'Infant Warmer', 'HB Meter', 'Stadiometer', 'Nebulizer'],
        datasets: [{
          data: [3200, 2900, 2400, 2100, 1800],
          backgroundColor: [
            'rgba(29,199,191,0.92)',
            'rgba(29,199,191,0.76)',
            'rgba(29,199,191,0.62)',
            'rgba(29,199,191,0.50)',
            'rgba(29,199,191,0.38)',
          ],
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900 },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TT,
            callbacks: {
              label: (c: { raw: unknown }) => ` Kekurangan: ${Number(c.raw).toLocaleString('id-ID')} unit`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            border: { display: false },
            ticks: { font: { size: 12 }, color: '#7a9a9a' },
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 12 }, color: '#4a6a6a' },
          },
        },
      },
    })
  })

  useEffect(() => () => { chartRef.current?.destroy() }, [])

  return (
    <Card
      title="Top Gap Alat Kesehatan"
      description="Menampilkan daftar wilayah dengan tingkat kekurangan alat kesehatan terbesar untuk diprioritaskan."
    >
      <div className="flex-1 min-h-[260px] relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Horizontal bar chart top gap alat kesehatan"
        />
      </div>
    </Card>
  )
}

// ─── Card 4: Radar ────────────────────────────────────────────────────────────

const RADAR_DATA = [
  { label: 'Ibu',     value: 78 },
  { label: 'BBL',     value: 65 },
  { label: 'Anak',    value: 82 },
  { label: 'Remaja',  value: 55 },
  { label: 'Gizi',    value: 70 },
]

function KesiapanLayananCard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<ChartInstance | null>(null)

  useChartJs(() => {
    const ChartCtor = getChartConstructor()
    if (!canvasRef.current || !ChartCtor) return
    chartRef.current?.destroy()
    chartRef.current = new ChartCtor(canvasRef.current, {
      type: 'radar',
      data: {
        labels: RADAR_DATA.map(d => d.label),
        datasets: [{
          label: 'Kesiapan (%)',
          data: RADAR_DATA.map(d => d.value),
          backgroundColor: 'rgba(29,199,191,0.10)',
          borderColor: '#1dc7bf',
          borderWidth: 2,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#1dc7bf',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#1dc7bf',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900 },
        plugins: {
          legend: { display: false },
          tooltip: {
            ...TT,
            callbacks: {
              label: (c: { raw: unknown }) => ` Kesiapan: ${c.raw}%`,
            },
          },
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 25,
              font: { size: 9 },
              backdropColor: 'transparent',
              color: '#aac5c5',
            },
            grid: { color: 'rgba(29,199,191,0.12)' },
            angleLines: { color: 'rgba(29,199,191,0.15)' },
            pointLabels: { font: { size: 11, weight: '600' }, color: '#4a6a6a' },
          },
        },
      },
    })
  })

  useEffect(() => () => { chartRef.current?.destroy() }, [])

  return (
    <Card
      title="Kesiapan Layanan"
      description="Menampilkan status kesiapan fasilitas kesehatan dalam menyelenggarakan pelayanan standar kepada masyarakat."
      footer={
        <div className="grid grid-cols-2 gap-1.5">
          {RADAR_DATA.map(d => (
            <div key={d.label} className="flex items-center justify-between bg-[#f5fbfb] rounded-lg px-2.5 py-1.5">
              <span className="text-[10px] text-[#7a9a9a] font-medium">{d.label}</span>
              <span
                className="text-[11px] font-bold"
                style={{ color: d.value >= 75 ? '#0f8f96' : d.value >= 60 ? '#f59e0b' : '#ef4444' }}
              >
                {d.value}%
              </span>
            </div>
          ))}
        </div>
      }
    >
      <div className="flex-1 min-h-[200px] relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Radar chart kesiapan layanan"
        />
      </div>
    </Card>
  )
}

// ─── Section Export ───────────────────────────────────────────────────────────

export default function ChartCardsSection() {
  return (
    <section className="w-full bg-[#f4fafa] py-6 border-t border-[#e0eeee]">
      <div className="w-full px-4 sm:px-5 lg:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DliStatusCard />
          <CapaianProvinsiCard />
          <TopGapAlatCard />
          <KesiapanLayananCard />
        </div>
      </div>
    </section>
  )
}
