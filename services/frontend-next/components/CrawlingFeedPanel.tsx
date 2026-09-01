"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, ExternalLink, Radio, Search } from "lucide-react";
import { useCrawlingFeed } from "@/hooks/useCrawlingFeed";
import { relativeTime, type CrawlingFeedItem } from "@/lib/crawling-feed";

type Translation = (key: string, params?: Record<string, string | number>) => string;

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  t: Translation;
  translateDisease: (name?: string | null) => string;
};

export default function CrawlingFeedPanel({ collapsed, onToggle, t, translateDisease }: Props) {
  const { items, loading, connected } = useCrawlingFeed();
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const feedRef = useRef<HTMLDivElement>(null);
  const previousRects = useRef(new Map<string, DOMRect>());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items.slice(0, 50);
    return items
      .filter((item) =>
        [item.title, item.disease, item.location, item.countryName, item.source]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .slice(0, 50);
  }, [items, query]);

  useLayoutEffect(() => {
    const container = feedRef.current;
    if (!container) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nextRects = new Map<string, DOMRect>();
    container.querySelectorAll<HTMLElement>("[data-feed-id]").forEach((element) => {
      const id = element.dataset.feedId;
      if (!id) return;
      const nextRect = element.getBoundingClientRect();
      nextRects.set(id, nextRect);
      const previousRect = previousRects.current.get(id);
      if (!previousRect || reduceMotion) return;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaY) < 1) return;
      element.animate(
        [{ transform: "translateY(" + deltaY + "px)" }, { transform: "translateY(0)" }],
        { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    });
    previousRects.current = nextRects;
  }, [filteredItems]);


  return (
    <div className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-2xl border border-[#cfe0f1] bg-white/95 shadow-[0_8px_24px_rgba(0,96,169,.1)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-2.5">
        <div className={collapsed ? "hidden" : "flex min-w-0 items-center gap-2"}>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-1">
            <Activity className="h-3.5 w-3.5 text-[#0060A9]" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-black uppercase tracking-wider text-[#0060A9]">
              {t("tv.liveCrawlingFeedTitle")}
            </h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
              <span className={connected ? "live-dot" : "h-1.5 w-1.5 rounded-full bg-slate-300"} />
              <span>{connected ? t("tv.liveCrawlingStatus") : t("tv.collectorReconnecting")}</span>
            </p>
          </div>
        </div>
        <button
          onClick={onToggle}
          aria-label={collapsed ? t("tv.expandFeed") : t("tv.collapseFeed")}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-[#0060A9]" /> : <ChevronLeft className="h-3.5 w-3.5 text-[#0060A9]" />}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="border-b border-slate-100 bg-white p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("tv.searchPlaceholder")}
                aria-label={t("tv.searchPlaceholder")}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs font-semibold outline-none focus:border-[#0060A9]"
              />
            </div>
          </div>
          <div ref={feedRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50/40 p-2">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => (
                <CrawlingFeedCard key={item.id} item={item} now={now} t={t} translateDisease={translateDisease} />
              ))
            ) : (
              <EmptyFeed loading={loading} connected={connected} t={t} />
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 p-2 text-[9px] font-bold text-slate-500">
            <span>{t("tv.crawlingFeedCount", { count: items.length })}</span>
            <span className="flex items-center gap-1 text-[#0060A9]">
              <Radio className="h-3 w-3" />
              {t("tv.collectorActive")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function CrawlingFeedCard({
  item,
  now,
  t,
  translateDisease,
}: {
  item: CrawlingFeedItem;
  now: number;
  t: Translation;
  translateDisease: (name?: string | null) => string;
}) {
  const content = (
    <article data-feed-id={item.id} className="animate-feed-in rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none" aria-hidden="true">{item.flag}</span>
            <h4 className="truncate text-[10px] font-black uppercase tracking-wide text-[#0060A9]">{item.countryName}</h4>
          </div>
          <p className="mt-1 line-clamp-2 text-xs font-bold leading-snug text-slate-900">{item.title}</p>
        </div>
        <time className="shrink-0 pt-0.5 text-[9px] font-bold text-slate-400">{relativeTime(item.detectedAt, now)}</time>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-1.5 border-t border-slate-100 pt-1.5 text-[9px] font-semibold text-slate-500">
        {item.disease && <span className="truncate">{translateDisease(item.disease)}</span>}
        {item.location && <><span className="text-slate-300">•</span><span className="truncate">{item.location}</span></>}
        {item.source && <><span className="text-slate-300">•</span><span className="truncate text-[#0060A9]">{item.source}</span></>}
      </div>
      {item.sourceUrl && (
        <div className="mt-1 flex items-center gap-1 text-[8.5px] font-bold text-slate-400">
          <ExternalLink className="h-2.5 w-2.5" />
          {t("tv.crawledSource")}
        </div>
      )}
    </article>
  );

  return item.sourceUrl ? (
    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block">
      {content}
    </a>
  ) : content;
}

function EmptyFeed({
  loading,
  connected,
  t,
}: {
  loading: boolean;
  connected: boolean;
  t: Translation;
}) {
  return (
    <div className="flex h-full min-h-52 flex-col items-center justify-center px-5 text-center">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-[#0060A9]">
        <Activity className={loading ? "h-5 w-5 animate-pulse" : "h-5 w-5"} />
      </div>
      <p className="mt-3 text-xs font-black text-slate-700">{t("tv.waitingCrawlingSignals")}</p>
      <p className="mt-1 max-w-[220px] text-[10px] font-medium leading-relaxed text-slate-500">
        {t("tv.monitoringDiseaseSources")}
      </p>
      <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[9px] font-black text-[#0060A9]">
        <span className={connected ? "live-dot" : "h-1.5 w-1.5 rounded-full bg-slate-300"} />
        {t("tv.collectorActive")}
      </span>
    </div>
  );
}
