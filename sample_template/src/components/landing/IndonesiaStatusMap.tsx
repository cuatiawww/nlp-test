'use client'

import { useState } from 'react'

type FacilityStatus = 'Siap Penuh' | 'Siap Parsial' | 'Belum Siap' | 'Perlu Validasi'

const statusColors: Record<FacilityStatus, string> = {
  'Siap Penuh': '#0a7a82',
  'Siap Parsial': '#1dc7bf',
  'Belum Siap': '#7dd9d5',
  'Perlu Validasi': '#4d90d0',
}

const statusColorsDark: Record<FacilityStatus, string> = {
  'Siap Penuh': '#095f66',
  'Siap Parsial': '#17a8a1',
  'Belum Siap': '#5ec5c0',
  'Perlu Validasi': '#3a7ab8',
}

type ProvinceData = {
  id: string
  name: string
  status: FacilityStatus
  totalFaskes: number
  path: string
}

// Simplified SVG paths for Indonesian provinces
// Coordinates scaled to fit within a 600x340 viewBox
const provinces: ProvinceData[] = [
  {
    id: 'aceh',
    name: 'Aceh',
    status: 'Siap Penuh',
    totalFaskes: 420,
    path: 'M 28,38 L 42,30 L 58,28 L 68,34 L 72,46 L 64,56 L 50,62 L 36,58 L 26,48 Z',
  },
  {
    id: 'sumut',
    name: 'Sumatera Utara',
    status: 'Siap Parsial',
    totalFaskes: 680,
    path: 'M 68,34 L 90,28 L 106,32 L 112,44 L 106,58 L 90,66 L 72,62 L 64,56 L 72,46 Z',
  },
  {
    id: 'sumbar',
    name: 'Sumatera Barat',
    status: 'Belum Siap',
    totalFaskes: 310,
    path: 'M 90,66 L 106,58 L 118,64 L 122,78 L 114,90 L 98,94 L 84,88 L 80,76 Z',
  },
  {
    id: 'riau',
    name: 'Riau',
    status: 'Siap Parsial',
    totalFaskes: 370,
    path: 'M 106,58 L 128,52 L 146,56 L 152,70 L 142,82 L 124,86 L 112,80 L 110,68 Z',
  },
  {
    id: 'kepri',
    name: 'Kepulauan Riau',
    status: 'Perlu Validasi',
    totalFaskes: 180,
    path: 'M 146,56 L 162,50 L 172,58 L 168,70 L 154,74 L 144,68 Z',
  },
  {
    id: 'jambi',
    name: 'Jambi',
    status: 'Belum Siap',
    totalFaskes: 290,
    path: 'M 110,90 L 128,86 L 144,90 L 148,104 L 138,116 L 120,118 L 106,110 L 104,98 Z',
  },
  {
    id: 'sumsel',
    name: 'Sumatera Selatan',
    status: 'Siap Penuh',
    totalFaskes: 520,
    path: 'M 120,118 L 140,112 L 158,116 L 164,130 L 156,144 L 136,148 L 116,144 L 110,132 Z',
  },
  {
    id: 'bengkulu',
    name: 'Bengkulu',
    status: 'Belum Siap',
    totalFaskes: 185,
    path: 'M 102,126 L 116,122 L 120,136 L 112,148 L 98,148 L 90,138 L 94,128 Z',
  },
  {
    id: 'babel',
    name: 'Bangka Belitung',
    status: 'Perlu Validasi',
    totalFaskes: 145,
    path: 'M 152,106 L 166,102 L 174,110 L 170,122 L 156,124 L 148,116 Z',
  },
  {
    id: 'lampung',
    name: 'Lampung',
    status: 'Siap Parsial',
    totalFaskes: 430,
    path: 'M 130,152 L 150,148 L 162,156 L 158,170 L 142,176 L 126,170 L 122,160 Z',
  },
  {
    id: 'banten',
    name: 'Banten',
    status: 'Siap Penuh',
    totalFaskes: 380,
    path: 'M 168,178 L 182,172 L 192,178 L 190,192 L 174,196 L 164,188 Z',
  },
  {
    id: 'dki',
    name: 'DKI Jakarta',
    status: 'Siap Penuh',
    totalFaskes: 520,
    path: 'M 194,178 L 204,174 L 210,182 L 206,192 L 196,194 L 190,186 Z',
  },
  {
    id: 'jabar',
    name: 'Jawa Barat',
    status: 'Siap Parsial',
    totalFaskes: 820,
    path: 'M 192,178 L 220,170 L 244,174 L 252,186 L 244,200 L 216,206 L 194,202 L 188,192 Z',
  },
  {
    id: 'jateng',
    name: 'Jawa Tengah',
    status: 'Siap Parsial',
    totalFaskes: 760,
    path: 'M 244,174 L 274,170 L 298,174 L 306,186 L 298,200 L 266,206 L 244,202 L 238,190 Z',
  },
  {
    id: 'diy',
    name: 'DI Yogyakarta',
    status: 'Siap Penuh',
    totalFaskes: 220,
    path: 'M 268,200 L 282,196 L 292,202 L 288,214 L 272,216 L 262,210 Z',
  },
  {
    id: 'jatim',
    name: 'Jawa Timur',
    status: 'Siap Penuh',
    totalFaskes: 870,
    path: 'M 298,174 L 334,170 L 358,174 L 366,186 L 356,200 L 318,206 L 298,202 L 292,190 Z',
  },
  {
    id: 'bali',
    name: 'Bali',
    status: 'Siap Parsial',
    totalFaskes: 280,
    path: 'M 364,182 L 378,178 L 386,186 L 382,198 L 366,200 L 358,192 Z',
  },
  {
    id: 'ntb',
    name: 'NTB',
    status: 'Belum Siap',
    totalFaskes: 195,
    path: 'M 386,182 L 406,178 L 416,186 L 412,198 L 394,200 L 384,192 Z',
  },
  {
    id: 'ntt',
    name: 'NTT',
    status: 'Belum Siap',
    totalFaskes: 230,
    path: 'M 416,186 L 450,180 L 466,188 L 462,202 L 432,208 L 412,202 Z',
  },
  {
    id: 'kalbar',
    name: 'Kalimantan Barat',
    status: 'Belum Siap',
    totalFaskes: 310,
    path: 'M 230,80 L 266,72 L 294,78 L 304,94 L 294,110 L 264,118 L 234,114 L 220,98 Z',
  },
  {
    id: 'kalteng',
    name: 'Kalimantan Tengah',
    status: 'Siap Parsial',
    totalFaskes: 280,
    path: 'M 264,118 L 294,110 L 322,116 L 334,130 L 322,146 L 290,152 L 260,146 L 250,132 Z',
  },
  {
    id: 'kalsel',
    name: 'Kalimantan Selatan',
    status: 'Siap Penuh',
    totalFaskes: 295,
    path: 'M 322,116 L 346,112 L 360,120 L 356,134 L 338,140 L 318,136 L 312,124 Z',
  },
  {
    id: 'kaltim',
    name: 'Kalimantan Timur',
    status: 'Perlu Validasi',
    totalFaskes: 265,
    path: 'M 294,78 L 330,72 L 360,78 L 372,94 L 362,114 L 334,120 L 308,114 L 296,98 Z',
  },
  {
    id: 'kaltara',
    name: 'Kalimantan Utara',
    status: 'Belum Siap',
    totalFaskes: 120,
    path: 'M 330,72 L 360,66 L 380,72 L 376,86 L 358,92 L 332,88 Z',
  },
  {
    id: 'sulut',
    name: 'Sulawesi Utara',
    status: 'Siap Parsial',
    totalFaskes: 210,
    path: 'M 390,78 L 418,70 L 436,76 L 438,88 L 424,96 L 396,94 L 384,86 Z',
  },
  {
    id: 'gorontalo',
    name: 'Gorontalo',
    status: 'Belum Siap',
    totalFaskes: 145,
    path: 'M 390,96 L 410,92 L 424,98 L 420,110 L 402,114 L 386,108 Z',
  },
  {
    id: 'sulteng',
    name: 'Sulawesi Tengah',
    status: 'Siap Parsial',
    totalFaskes: 250,
    path: 'M 376,96 L 406,90 L 430,96 L 438,110 L 424,122 L 390,126 L 366,120 L 358,108 Z',
  },
  {
    id: 'sulbar',
    name: 'Sulawesi Barat',
    status: 'Perlu Validasi',
    totalFaskes: 130,
    path: 'M 364,118 L 378,114 L 386,122 L 382,138 L 366,140 L 356,132 Z',
  },
  {
    id: 'sulsel',
    name: 'Sulawesi Selatan',
    status: 'Siap Parsial',
    totalFaskes: 480,
    path: 'M 378,122 L 400,116 L 416,122 L 420,138 L 408,152 L 386,156 L 368,148 L 362,134 Z',
  },
  {
    id: 'sultra',
    name: 'Sulawesi Tenggara',
    status: 'Perlu Validasi',
    totalFaskes: 195,
    path: 'M 404,138 L 424,132 L 440,138 L 438,152 L 420,158 L 400,154 Z',
  },
  {
    id: 'maluku',
    name: 'Maluku',
    status: 'Belum Siap',
    totalFaskes: 175,
    path: 'M 466,128 L 488,120 L 504,128 L 502,144 L 482,150 L 460,144 L 454,134 Z',
  },
  {
    id: 'malut',
    name: 'Maluku Utara',
    status: 'Siap Penuh',
    totalFaskes: 155,
    path: 'M 470,96 L 490,88 L 506,94 L 504,108 L 486,114 L 466,110 L 460,100 Z',
  },
  {
    id: 'papbar',
    name: 'Papua Barat',
    status: 'Perlu Validasi',
    totalFaskes: 130,
    path: 'M 514,104 L 542,96 L 558,104 L 556,120 L 534,126 L 510,120 L 504,112 Z',
  },
  {
    id: 'papua',
    name: 'Papua',
    status: 'Siap Parsial',
    totalFaskes: 220,
    path: 'M 542,96 L 590,88 L 610,96 L 608,120 L 576,128 L 540,124 L 530,112 Z',
  },
  {
    id: 'papsel',
    name: 'Papua Selatan',
    status: 'Belum Siap',
    totalFaskes: 95,
    path: 'M 550,124 L 580,120 L 598,128 L 594,144 L 566,148 L 544,142 Z',
  },
  {
    id: 'papteng',
    name: 'Papua Tengah',
    status: 'Perlu Validasi',
    totalFaskes: 110,
    path: 'M 560,104 L 590,100 L 610,108 L 606,124 L 574,128 L 550,122 Z',
  },
]

const legendItems: FacilityStatus[] = ['Siap Penuh', 'Siap Parsial', 'Belum Siap', 'Perlu Validasi']

export default function IndonesiaStatusMap() {
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FacilityStatus | null>(null)

  const filteredProvinces = activeFilter
    ? provinces.filter((p) => p.status === activeFilter)
    : provinces

  const filteredIds = new Set(filteredProvinces.map((p) => p.id))

  const hovered = provinces.find((p) => p.id === hoveredProvince)

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-[#d9eceb] bg-[#f0fafa]">
      {/* Map SVG */}
      <svg
        viewBox="0 -10 640 240"
        className="h-full w-full"
        style={{ background: 'transparent' }}
      >
        {/* Ocean background */}
        <rect x="0" y="-10" width="640" height="250" fill="#daf3f4" />

        {provinces.map((province) => {
          const isActive = filteredIds.has(province.id)
          const isHovered = hoveredProvince === province.id
          const color = isActive ? statusColors[province.status] : '#c8dede'
          const stroke = isHovered ? '#ffffff' : '#ffffff'
          const strokeWidth = isHovered ? 1.5 : 0.8
          const opacity = isActive ? (isHovered ? 1 : 0.92) : 0.4

          return (
            <path
              key={province.id}
              d={province.path}
              fill={color}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              style={{
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                filter: isHovered ? 'brightness(1.08)' : 'none',
              }}
              onMouseEnter={() => setHoveredProvince(province.id)}
              onMouseLeave={() => setHoveredProvince(null)}
            />
          )
        })}
      </svg>

      {/* Tooltip on hover */}
      {hovered && (
        <div
          className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-xl border border-[#c8e6e5] bg-white/95 px-4 py-2.5 shadow-lg"
          style={{ zIndex: 20, minWidth: 180 }}
        >
          <p className="text-sm font-bold text-[#2a3838]">{hovered.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: statusColors[hovered.status] }}
            />
            <span className="text-xs text-[#4a5858]">{hovered.status}</span>
          </div>
          <p className="mt-0.5 text-xs text-[#6a7878]">
            Total Faskes:{' '}
            <span className="font-semibold text-[#2a3838]">{hovered.totalFaskes.toLocaleString('id')}</span>
          </p>
        </div>
      )}

      {/* Legend — always visible, clickable for filtering */}
      <div className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded-lg border border-[#c8e6e5] bg-white/95 p-2 shadow-sm sm:bottom-4 sm:left-4 sm:max-w-none sm:rounded-xl sm:p-3">
        <p className="mb-1.5 text-[11px] font-bold text-[#2a3838] sm:mb-2 sm:text-xs">Legenda Status</p>
        <ul className="space-y-1 sm:space-y-1.5">
          {legendItems.map((item) => {
            const isSelected = activeFilter === item
            return (
              <li
                key={item}
                className="flex cursor-pointer items-center gap-1.5 text-[11px] transition-opacity sm:gap-2 sm:text-xs"
                style={{
                  opacity: activeFilter && !isSelected ? 0.45 : 1,
                }}
                onClick={() => setActiveFilter(isSelected ? null : item)}
              >
                <span
                  className="inline-block h-3 w-3 rounded-[3px] transition-all sm:h-3.5 sm:w-3.5"
                  style={{
                    backgroundColor: statusColors[item],
                    outline: isSelected ? `2px solid ${statusColors[item]}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
                <span
                  className="font-medium"
                  style={{ color: isSelected ? statusColors[item] : '#404848' }}
                >
                  {item}
                </span>
              </li>
            )
          })}
        </ul>
        {activeFilter && (
          <button
            className="mt-1.5 w-full rounded-md py-1 text-[10px] font-semibold text-[#0f8f96] hover:bg-[#f0fafa] sm:mt-2 sm:text-[11px]"
            onClick={() => setActiveFilter(null)}
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Province count badge */}
      <div className="absolute bottom-4 right-4 rounded-lg border border-[#c8e6e5] bg-white/90 px-3 py-1.5">
        <p className="text-[11px] font-semibold text-[#4a5858]">
          {activeFilter
            ? `${filteredProvinces.length} Provinsi`
            : `${provinces.length} Provinsi`}
        </p>
      </div>
    </div>
  )
}
