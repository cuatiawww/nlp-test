import Image from 'next/image'
import type { MetricCard } from './types'

type MetricsSectionProps = {
  cards: MetricCard[]
  title: string
  subtitle: string
}

export default function MetricsSection({ cards, title, subtitle }: MetricsSectionProps) {
  return (
    <section className="px-4 py-5 md:px-6">
      <h1 className="text-3xl font-extrabold leading-tight text-slate-900 md:text-4xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">{subtitle}</p>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          return (
            <article key={card.title} className="rounded-2xl border border-[#cfe3e2] bg-white p-4 shadow-sm">
              <div className="flex min-h-[122px] items-center gap-3">
                <div className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${card.iconTone}`}>
                  <Image src={card.icon} alt={card.title} width={28} height={28} className="h-7 w-7 object-contain" />
                </div>
                <div className="flex flex-1 flex-col">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{card.title}</p>
                  <p className="mt-1 text-4xl font-extrabold leading-[0.95] tracking-tight text-slate-800">{card.value}</p>
                  <p className="mt-auto pt-3 text-xs leading-relaxed text-slate-500">{card.delta}</p>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
