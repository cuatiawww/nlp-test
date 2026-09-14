"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEvents } from "@/lib/api";
import { timestampMs, toCrawlingFeedItem, type CrawlingFeedItem } from "@/lib/crawling-feed";

const MAX_ITEMS = 100;
// Keep the polling window short enough for a new crawler result to feel live
// while avoiding a request on every render.
const POLL_INTERVAL_MS = 3_000;

export function useCrawlingFeed() {
  const [items, setItems] = useState<CrawlingFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // Concurrently query web/RSS and social channels to guarantee both sections
      // remain populated in the TV crawling feed without one starving the other.
      // Keep the connection state truthful when one or all event requests
      // fail. Promise.all with swallowed errors made a dead backend look live.
      const channelResults = await Promise.allSettled([
        fetchEvents({ source_type: "rss", per_page: 50 }),
        fetchEvents({ source_type: "web", per_page: 25 }),
        fetchEvents({ source_type: "social_media", per_page: 50 }),
      ]);
      const channelEvents = channelResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      let requestSucceeded = channelEvents.length > 0;

      const eventMap = new Map();
      for (const ev of channelEvents.flat()) {
        if (ev && ev.id) eventMap.set(ev.id, ev);
      }
      let events = Array.from(eventMap.values());
      if (events.length === 0) {
        try {
          events = await fetchEvents({ per_page: MAX_ITEMS });
          requestSucceeded = true;
        } catch {
          // Preserve the last rendered items while showing the disconnected state.
        }
      }
      if (!mounted.current) return;
      const nextItems = events
        .map(toCrawlingFeedItem)
        .sort((a, b) => {
          const nextTime = timestampMs(b.detectedAt);
          const previousTime = timestampMs(a.detectedAt);
          return (Number.isFinite(nextTime) ? nextTime : 0) - (Number.isFinite(previousTime) ? previousTime : 0);
        });
      setItems((previous) => {
        const known = new Set(nextItems.map((item) => item.id));
        const merged = [...nextItems, ...previous.filter((item) => !known.has(item.id))].slice(0, MAX_ITEMS);
        const unchanged = merged.length === previous.length && merged.every((item, index) =>
          item.id === previous[index]?.id && item.detectedAt === previous[index]?.detectedAt
        );
        return unchanged ? previous : merged;
      });
      setConnected(requestSucceeded);
    } catch {
      if (mounted.current) setConnected(false);
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  return { items, loading, connected };
}
