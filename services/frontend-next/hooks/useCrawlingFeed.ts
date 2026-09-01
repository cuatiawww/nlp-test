"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEvents } from "@/lib/api";
import { toCrawlingFeedItem, type CrawlingFeedItem } from "@/lib/crawling-feed";

const MAX_ITEMS = 100;
const POLL_INTERVAL_MS = 5_000;

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
      const events = await fetchEvents({ per_page: MAX_ITEMS });
      if (!mounted.current) return;
      const nextItems = events.map(toCrawlingFeedItem);
      setItems((previous) => {
        const known = new Set(nextItems.map((item) => item.id));
        const merged = [...nextItems, ...previous.filter((item) => !known.has(item.id))].slice(0, MAX_ITEMS);
        const unchanged = merged.length === previous.length && merged.every((item, index) =>
          item.id === previous[index]?.id && item.detectedAt === previous[index]?.detectedAt
        );
        return unchanged ? previous : merged;
      });
      setConnected(true);
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
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
    };
  }, [refresh]);

  return { items, loading, connected };
}
