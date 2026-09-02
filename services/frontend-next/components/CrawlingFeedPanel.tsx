"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  Layers,
  Radio,
  Search,
  Share2,
} from "lucide-react";
import { useCrawlingFeed } from "@/hooks/useCrawlingFeed";
import { relativeTime, type CrawlingFeedItem, type FeedChannel } from "@/lib/crawling-feed";
import CountryFlag from "@/components/CountryFlag";

const MAX_VISIBLE_PER_COUNTRY = 2;
const MAX_VISIBLE_ITEMS = 50;

type Translation = (key: string, params?: Record<string, string | number>) => string;
export type FeedViewMode = "all" | "web" | "social";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  t: Translation;
  translateDisease: (name?: string | null) => string;
};

export default function CrawlingFeedPanel({ collapsed, onToggle, t, translateDisease }: Props) {
  const { items, loading, connected } = useCrawlingFeed();
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<FeedViewMode>("all");
  const [now, setNow] = useState(() => Date.now());
  const feedRef = useRef<HTMLDivElement>(null);
  const previousRects = useRef<Map<string, DOMRect>>(new Map());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const counts = useMemo(() => {
    let web = 0;
    let social = 0;
    for (const item of items) {
      if (item.channel === "social") social++;
      else web++;
    }
    return { all: items.length, web, social };
  }, [items]);

  const filterItems = (list: CrawlingFeedItem[], channelFilter?: FeedChannel) => {
    const normalizedQuery = query.trim().toLowerCase();
    let filtered = list;

    if (channelFilter) {
      filtered = filtered.filter((item) => item.channel === channelFilter);
    }

    if (normalizedQuery) {
      filtered = filtered.filter((item) =>
        [item.title, item.disease, item.location, item.countryName, item.source, item.platform]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      );
    }

    const countryCounts = new Map<string, number>();
    return filtered
      .filter((item) => {
        const count = countryCounts.get(item.countryCode) ?? 0;
        if (count >= MAX_VISIBLE_PER_COUNTRY) return false;
        countryCounts.set(item.countryCode, count + 1);
        return true;
      })
      .slice(0, MAX_VISIBLE_ITEMS);
  };

  const webItems = useMemo(() => filterItems(items, "web"), [items, query]);
  const socialItems = useMemo(() => filterItems(items, "social"), [items, query]);
  const allItems = useMemo(() => filterItems(items), [items, query]);

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
  }, [allItems, webItems, socialItems, viewMode]);

  const handleOpenChannel = (channel: FeedViewMode) => {
    setViewMode(channel);
    if (collapsed) {
      onToggle();
    }
  };

  if (collapsed) {
    return (
      <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl border border-[#cfe0f1] bg-white/95 p-1.5 shadow-[0_8px_24px_rgba(0,96,169,.12)] backdrop-blur-xl">
        <button
          onClick={onToggle}
          title={t("tv.expandFeed") || "Buka Live Feed"}
          aria-label={t("tv.expandFeed") || "Buka Live Feed"}
          className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-[#0060A9] transition hover:border-blue-300 hover:bg-blue-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <div className="my-0.5 h-px w-6 bg-slate-200" />

        {/* Quick Web Crawling button */}
        <button
          onClick={() => handleOpenChannel("web")}
          title={`Buka Crawling Web & Berita (${counts.web})`}
          className={`group relative grid h-8 w-8 place-items-center rounded-xl border transition ${
            viewMode === "web"
              ? "border-[#0060A9] bg-[#0060A9] text-white shadow-sm"
              : "border-blue-200 bg-blue-50/80 text-[#0060A9] hover:bg-blue-100"
          }`}
        >
          <Globe className="h-4 w-4" />
          {counts.web > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[8px] font-black text-white ring-1 ring-white">
              {counts.web > 99 ? "99+" : counts.web}
            </span>
          )}
        </button>

        {/* Quick Social Media Crawling button */}
        <button
          onClick={() => handleOpenChannel("social")}
          title={`Buka Crawling Media Sosial (${counts.social})`}
          className={`group relative grid h-8 w-8 place-items-center rounded-xl border transition ${
            viewMode === "social"
              ? "border-purple-600 bg-purple-600 text-white shadow-sm"
              : "border-purple-200 bg-purple-50/80 text-purple-600 hover:bg-purple-100"
          }`}
        >
          <Share2 className="h-4 w-4" />
          {counts.social > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-purple-600 px-1 text-[8px] font-black text-white ring-1 ring-white">
              {counts.social > 99 ? "99+" : counts.social}
            </span>
          )}
        </button>

        {/* Quick All Feed (2 Section) button */}
        <button
          onClick={() => handleOpenChannel("all")}
          title={`Buka 2 Section: Web + Sosmed (${counts.all})`}
          className={`group relative grid h-8 w-8 place-items-center rounded-xl border transition ${
            viewMode === "all"
              ? "border-slate-800 bg-slate-800 text-white shadow-sm"
              : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Layers className="h-4 w-4" />
          {counts.all > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-slate-700 px-1 text-[8px] font-black text-white ring-1 ring-white">
              {counts.all > 99 ? "99+" : counts.all}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto flex h-full flex-col overflow-hidden rounded-2xl border border-[#cfe0f1] bg-white/95 shadow-[0_8px_24px_rgba(0,96,169,.1)] backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 p-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-1">
            <Activity className="h-3.5 w-3.5 text-[#0060A9]" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-black uppercase tracking-wider text-[#0060A9]">
              {t("tv.liveCrawlingFeedTitle") || "LIVE ASEAN CRAWLING WEB & SOCIAL MEDIA"}
            </h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
              <span className={connected ? "live-dot" : "h-1.5 w-1.5 rounded-full bg-slate-300"} />
              <span>{connected ? t("tv.liveCrawlingStatus") || "Crawling ASEAN disease sources" : t("tv.collectorReconnecting") || "Reconnecting..."}</span>
            </p>
          </div>
        </div>
        <button
          onClick={onToggle}
          aria-label={t("tv.collapseFeed") || "Tutup Feed"}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white transition hover:bg-slate-100"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-[#0060A9]" />
        </button>
      </div>

      {/* Segmented View Switcher */}
      <div className="grid grid-cols-3 gap-1 border-b border-slate-200 bg-slate-100/80 p-1 text-[10px] font-extrabold">
        <button
          onClick={() => setViewMode("all")}
          title="Tampilkan 2 Section (Atas Web, Bawah Sosmed)"
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition ${
            viewMode === "all"
              ? "bg-white text-[#0060A9] shadow-sm ring-1 ring-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Semua (2 Section)</span>
          <span className="rounded-md bg-slate-100 px-1 text-[8.5px] font-black text-slate-500">
            {counts.all}
          </span>
        </button>

        <button
          onClick={() => setViewMode("web")}
          title="Tampilkan Khusus Web & Berita Online"
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition ${
            viewMode === "web"
              ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-200"
              : "text-slate-600 hover:text-blue-700"
          }`}
        >
          <Globe className="h-3.5 w-3.5 text-blue-600" />
          <span>Web Only</span>
          <span className="rounded-md bg-blue-50 px-1 text-[8.5px] font-black text-blue-600">
            {counts.web}
          </span>
        </button>

        <button
          onClick={() => setViewMode("social")}
          title="Tampilkan Khusus Media Sosial"
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition ${
            viewMode === "social"
              ? "bg-white text-purple-700 shadow-sm ring-1 ring-purple-200"
              : "text-slate-600 hover:text-purple-700"
          }`}
        >
          <Share2 className="h-3.5 w-3.5 text-purple-600" />
          <span>Sosmed Only</span>
          <span className="rounded-md bg-purple-50 px-1 text-[8.5px] font-black text-purple-600">
            {counts.social}
          </span>
        </button>
      </div>

      {/* Search Input */}
      <div className="border-b border-slate-100 bg-white p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              viewMode === "web"
                ? "Cari di berita web & portal..."
                : viewMode === "social"
                  ? "Cari di media sosial (X, IG, Reddit)..."
                  : "Cari penyakit, lokasi, sumber..."
            }
            aria-label="Cari feed"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs font-semibold outline-none transition focus:border-[#0060A9] focus:bg-white"
          />
        </div>
      </div>

      {/* Content Area */}
      <div ref={feedRef} className="flex flex-1 flex-col overflow-hidden bg-slate-100/50 p-2">
        {viewMode === "all" ? (
          /* 2-SECTION DUAL BLOCK CARD (ATAS: WEB, BAWAH: SOSMED) */
          <div className="flex h-full flex-col gap-2 overflow-hidden">
            {/* Block Card 1: Web & Berita Online */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-blue-200/80 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-[10.5px] font-black tracking-wide text-blue-900">
                  <Globe className="h-3.5 w-3.5 text-blue-600" />
                  WEB CRAWLING & BERITA
                </span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-black text-blue-700">
                  {webItems.length} Data
                </span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {webItems.length > 0 ? (
                  webItems.map((item) => (
                    <CrawlingFeedCard key={item.id} item={item} now={now} t={t} translateDisease={translateDisease} />
                  ))
                ) : (
                  <EmptyChannelFeed channel="web" t={t} />
                )}
              </div>
            </div>

            {/* Block Card 2: Media Sosial */}
            <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-purple-200/80 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-purple-100 bg-purple-50/70 px-3 py-1.5">
                <span className="flex items-center gap-1.5 text-[10.5px] font-black tracking-wide text-purple-900">
                  <Share2 className="h-3.5 w-3.5 text-purple-600" />
                  MEDIA SOSIAL (X, IG, REDDIT)
                </span>
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-black text-purple-700">
                  {socialItems.length} Data
                </span>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {socialItems.length > 0 ? (
                  socialItems.map((item) => (
                    <CrawlingFeedCard key={item.id} item={item} now={now} t={t} translateDisease={translateDisease} />
                  ))
                ) : (
                  <EmptyChannelFeed channel="social" t={t} />
                )}
              </div>
            </div>
          </div>
        ) : viewMode === "web" ? (
          /* Web Only Full View */
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-blue-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-black text-blue-900">
                <Globe className="h-4 w-4 text-blue-600" />
                WEB CRAWLING & PORTAL BERITA
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9.5px] font-black text-blue-700">
                {webItems.length} Berita
              </span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {webItems.length > 0 ? (
                webItems.map((item) => (
                  <CrawlingFeedCard key={item.id} item={item} now={now} t={t} translateDisease={translateDisease} />
                ))
              ) : (
                <EmptyChannelFeed channel="web" t={t} />
              )}
            </div>
          </div>
        ) : (
          /* Social Media Only Full View */
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-purple-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-purple-100 bg-purple-50/70 px-3 py-2">
              <span className="flex items-center gap-1.5 text-xs font-black text-purple-900">
                <Share2 className="h-4 w-4 text-purple-600" />
                MEDIA SOSIAL (X, INSTAGRAM, REDDIT, MASTODON)
              </span>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[9.5px] font-black text-purple-700">
                {socialItems.length} Postingan
              </span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {socialItems.length > 0 ? (
                socialItems.map((item) => (
                  <CrawlingFeedCard key={item.id} item={item} now={now} t={t} translateDisease={translateDisease} />
                ))
              ) : (
                <EmptyChannelFeed channel="social" t={t} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 p-2 text-[9px] font-bold text-slate-500">
        <span className="flex items-center gap-2">
          <span>{allItems.length} sinyal termonitor</span>
        </span>
        <span className="flex items-center gap-1 text-[#0060A9]">
          <Radio className="h-3 w-3" />
          <span>Realtime Live Feed</span>
        </span>
      </div>
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
  const isSocial = item.channel === "social";

  const content = (
    <article
      data-feed-id={item.id}
      className={`animate-feed-in rounded-xl border bg-white p-2.5 shadow-sm transition-all hover:shadow-md ${
        isSocial
          ? "border-purple-200/80 hover:border-purple-400 hover:bg-purple-50/30"
          : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <CountryFlag
              countryCode={item.countryCode}
              countryName={item.countryName}
              shape="circle"
              size="sm"
            />
            <h4 className="truncate text-[10px] font-black uppercase tracking-wide text-[#0060A9]">
              {item.countryName}
            </h4>

            {/* Source Channel Badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8.5px] font-extrabold ${
                isSocial
                  ? "bg-purple-100 text-purple-700 ring-1 ring-purple-200"
                  : "bg-blue-100 text-blue-700 ring-1 ring-blue-200"
              }`}
            >
              {isSocial ? <Share2 className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
              <span>{item.platform || (isSocial ? "Sosmed" : "Web")}</span>
            </span>
          </div>

          <p className="mt-1 line-clamp-2 text-xs font-bold leading-snug text-slate-900">
            {item.title}
          </p>
        </div>
        <time className="shrink-0 pt-0.5 text-[9px] font-bold text-slate-400">
          {relativeTime(item.detectedAt, now)}
        </time>
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-1.5 border-t border-slate-100 pt-1.5 text-[9px] font-semibold text-slate-500">
        {item.disease && <span className="truncate font-bold text-slate-700">{translateDisease(item.disease)}</span>}
        {item.location && (
          <>
            <span className="text-slate-300">•</span>
            <span className="truncate">{item.location}</span>
          </>
        )}
        {item.source && (
          <>
            <span className="text-slate-300">•</span>
            <span className="truncate text-[#0060A9]">{item.source}</span>
          </>
        )}
      </div>

      {item.sourceUrl && (
        <div className="mt-1.5 flex items-center gap-1 text-[8.5px] font-bold text-slate-400">
          <ExternalLink className="h-2.5 w-2.5" />
          <span>{t("tv.crawledSource") || "Buka sumber asli"}</span>
        </div>
      )}
    </article>
  );

  return item.sourceUrl ? (
    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block">
      {content}
    </a>
  ) : (
    content
  );
}

function EmptyChannelFeed({ channel, t }: { channel: "web" | "social"; t: Translation }) {
  const isSocial = channel === "social";
  return (
    <div className="flex h-32 flex-col items-center justify-center p-3 text-center">
      <div className={`rounded-xl p-2 ${isSocial ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"}`}>
        {isSocial ? <Share2 className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
      </div>
      <p className="mt-2 text-[10px] font-bold text-slate-600">
        {isSocial ? "Belum ada sinyal sosial media baru" : "Belum ada berita web baru"}
      </p>
    </div>
  );
}
