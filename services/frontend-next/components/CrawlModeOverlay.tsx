'use client'

import { Database, ExternalLink, Globe2, Radio } from 'lucide-react'
import type { CrawlingFeedItem } from '@/lib/crawling-feed'

type Props = {
  active: boolean
  items: CrawlingFeedItem[]
  locale?: string
}

type Point = { x: string; y: string }

const COUNTRY_POINTS: Record<string, Point> = {
  ID: { x: '43%', y: '66%' },
  MY: { x: '39%', y: '51%' },
  SG: { x: '47%', y: '55%' },
  TH: { x: '43%', y: '35%' },
  PH: { x: '69%', y: '43%' },
  VN: { x: '57%', y: '34%' },
  BN: { x: '57%', y: '59%' },
  KH: { x: '52%', y: '43%' },
  LA: { x: '50%', y: '30%' },
  MM: { x: '35%', y: '32%' },
  TL: { x: '61%', y: '73%' },
  OUTSIDE_ASEAN: { x: '78%', y: '24%' },
}

const FALLBACK_POINT: Point = { x: '50%', y: '42%' }
const HUB_POINT = { x: '50%', y: '79%' }

function sourceLabel(item: CrawlingFeedItem) {
  return item.source || item.platform || item.countryName
}

function formatNumber(value: number, locale: string) {
  return value.toLocaleString(locale)
}

export default function CrawlModeOverlay({ active, items, locale = 'en-US' }: Props) {
  if (!active) return null

  const visibleItems = items.filter((item) => item.sourceUrl).slice(0, 18)
  const processedCount = items.length

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div className="absolute inset-0 bg-slate-950/10" />

      <div className="absolute left-1/2 top-[12%] -translate-x-1/2 rounded-full border border-white/30 bg-slate-950/55 px-4 py-2 text-center text-white shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
          <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-300" />
          Live Crawl Mode
        </div>
        <p className="mt-1 text-[9px] font-semibold text-slate-200">
          News sources flowing into NLP processing
        </p>
      </div>

      {Object.entries(COUNTRY_POINTS).map(([code, point]) => (
        <span
          key={code}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_0_4px_rgba(103,232,249,.16),0_0_18px_rgba(103,232,249,.9)]"
          style={{ left: point.x, top: point.y }}
          aria-hidden="true"
        />
      ))}

      {visibleItems.map((item, index) => {
        const point = COUNTRY_POINTS[item.countryCode] || FALLBACK_POINT
        return (
          <a
            key={`${item.id}-${index}`}
            href={item.sourceUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="crawl-flight pointer-events-auto absolute flex max-w-[230px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl border border-white/35 bg-slate-950/70 px-2.5 py-2 text-left text-white shadow-[0_8px_30px_rgba(15,23,42,.28)] backdrop-blur-md transition hover:border-cyan-200 hover:bg-slate-900/90"
            style={{
              left: point.x,
              top: point.y,
              animationDelay: `${(index % 9) * 420}ms`,
              ['--source-x' as string]: point.x,
              ['--source-y' as string]: point.y,
            }}
            title={`Open source: ${item.title}`}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-cyan-200/30 bg-cyan-400/15 text-cyan-200">
              <Globe2 className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[9px] font-black uppercase tracking-wide text-cyan-200">
                {item.countryName} · {sourceLabel(item)}
              </span>
              <span className="mt-0.5 block truncate text-[10px] font-bold text-white">
                {item.title}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[8px] font-semibold text-slate-300">
                <ExternalLink className="h-2.5 w-2.5" /> Open source link
              </span>
            </span>
          </a>
        )
      })}

      <div className="absolute left-1/2 top-[79%] -translate-x-1/2 -translate-y-1/2">
        <div className="crawl-hub-pulse absolute inset-[-18px] rounded-full border border-cyan-300/50" />
        <div className="relative flex min-w-[180px] flex-col items-center rounded-2xl border border-cyan-200/50 bg-slate-950/80 px-5 py-3 text-center text-white shadow-[0_0_40px_rgba(34,211,238,.3)] backdrop-blur-lg">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
            <Database className="h-4 w-4" />
            NLP Processing Hub
          </div>
          <p className="mt-1 text-[9px] font-semibold text-slate-300">
            {formatNumber(processedCount, locale)} live feed item{processedCount === 1 ? '' : 's'}
          </p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
            Processing stream
          </span>
        </div>
      </div>

      <style jsx>{`
        .crawl-flight {
          animation: crawl-flight 5.8s cubic-bezier(.22, 1, .36, 1) infinite;
        }

        .crawl-hub-pulse {
          animation: crawl-hub-pulse 2.2s ease-out infinite;
        }

        @keyframes crawl-flight {
          0% {
            left: var(--source-x);
            top: var(--source-y);
            opacity: 0;
            transform: translate(-50%, -50%) scale(.72);
          }
          10% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          72% {
            left: ${HUB_POINT.x};
            top: ${HUB_POINT.y};
            opacity: 1;
            transform: translate(-50%, -50%) scale(.86);
          }
          86%, 100% {
            left: ${HUB_POINT.x};
            top: ${HUB_POINT.y};
            opacity: 0;
            transform: translate(-50%, -50%) scale(.55);
          }
        }

        @keyframes crawl-hub-pulse {
          0%, 100% { opacity: .35; transform: scale(.82); }
          50% { opacity: .9; transform: scale(1.08); }
        }

        @media (prefers-reduced-motion: reduce) {
          .crawl-flight, .crawl-hub-pulse { animation: none; }
          .crawl-flight { opacity: .9; }
        }
      `}</style>
    </div>
  )
}
