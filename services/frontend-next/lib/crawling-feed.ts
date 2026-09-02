import type { DiseaseEvent } from "@/types";

export type FeedChannel = "web" | "social";

export type CrawlingFeedItem = {
  id: string;
  countryCode: string;
  countryName: string;
  flag: string;
  title: string;
  disease?: string | null;
  location?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  detectedAt: string;
  channel: FeedChannel;
  platform: string;
};

type CountryMeta = {
  code: string;
  name: string;
  flag: string;
  aliases: string[];
};

export const ASEAN_COUNTRIES: CountryMeta[] = [
  { code: "ID", name: "Indonesia", flag: "🇮🇩", aliases: ["indonesia", "id"] },
  { code: "MY", name: "Malaysia", flag: "🇲🇾", aliases: ["malaysia", "my"] },
  { code: "SG", name: "Singapore", flag: "🇸🇬", aliases: ["singapore", "sg"] },
  { code: "TH", name: "Thailand", flag: "🇹🇭", aliases: ["thailand", "th"] },
  { code: "PH", name: "Philippines", flag: "🇵🇭", aliases: ["philippines", "ph"] },
  { code: "VN", name: "Vietnam", flag: "🇻🇳", aliases: ["vietnam", "viet nam", "vn"] },
  { code: "BN", name: "Brunei", flag: "🇧🇳", aliases: ["brunei", "brunei darussalam", "bn"] },
  { code: "KH", name: "Cambodia", flag: "🇰🇭", aliases: ["cambodia", "kampuchea", "kh"] },
  { code: "LA", name: "Laos", flag: "🇱🇦", aliases: ["laos", "lao", "la"] },
  { code: "MM", name: "Myanmar", flag: "🇲🇲", aliases: ["myanmar", "burma", "mm"] },
  { code: "TL", name: "Timor-Leste", flag: "🇹🇱", aliases: ["timor-leste", "timor lest", "timor", "tl"] },
];

const fallbackCountry: CountryMeta = { code: "ASEAN", name: "ASEAN Region", flag: "🌏", aliases: [] };

function findCountry(value: string | null | undefined): CountryMeta | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;

  return ASEAN_COUNTRIES.find((country) =>
    country.aliases.some((alias) => {
      if (alias.length <= 2) return normalized === alias;
      return normalized === alias || normalized.includes(alias);
    }),
  );
}

function countryFromSource(sourceUrl?: string | null, sourceName?: string | null): CountryMeta | undefined {
  const source = (sourceUrl || "") + " " + (sourceName || "");
  const lowerSource = source.toLowerCase();
  const suffixes: Record<string, string> = {
    ".id": "ID", ".my": "MY", ".sg": "SG", ".th": "TH", ".ph": "PH",
    ".vn": "VN", ".bn": "BN", ".kh": "KH", ".la": "LA", ".mm": "MM", ".tl": "TL",
  };
  const code = Object.entries(suffixes).find(([suffix]) => lowerSource.includes(suffix))?.[1];
  return code ? ASEAN_COUNTRIES.find((country) => country.code === code) : findCountry(sourceName);
}

export function countryForEvent(event: DiseaseEvent): CountryMeta {
  return findCountry(event.country) ?? findCountry(event.location_name) ?? countryFromSource(event.url, event.source_name) ?? fallbackCountry;
}

export function sourceDomain(url?: string | null, sourceName?: string | null): string | null {
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // Keep the collector source name when an older record contains a malformed URL.
    }
  }
  return sourceName?.trim() || null;
}

export function detectChannelAndPlatform(event: DiseaseEvent): { channel: FeedChannel; platform: string } {
  const sourceType = (event.source_type || "").toLowerCase();
  const sourceName = (event.source_name || "").toLowerCase();
  const url = (event.url || "").toLowerCase();
  const domain = sourceDomain(event.url, event.source_name)?.toLowerCase() || "";

  if (
    sourceType === "social_media" ||
    url.includes("twitter.com") ||
    url.includes("x.com") ||
    url.includes("t.co") ||
    domain.includes("twitter") ||
    domain.includes("x.com") ||
    sourceName.includes("twitter") ||
    sourceName.includes("x.com")
  ) {
    return { channel: "social", platform: "X (Twitter)" };
  }

  if (url.includes("instagram.com") || domain.includes("instagram") || sourceName.includes("instagram")) {
    return { channel: "social", platform: "Instagram" };
  }

  if (url.includes("reddit.com") || domain.includes("reddit") || sourceName.includes("reddit")) {
    return { channel: "social", platform: "Reddit" };
  }

  if (
    url.includes("mastodon") ||
    domain.includes("mastodon") ||
    sourceName.includes("mastodon") ||
    url.includes("mstdn") ||
    url.includes("fosstodon")
  ) {
    return { channel: "social", platform: "Mastodon" };
  }

  if (url.includes("facebook.com") || url.includes("fb.com") || domain.includes("facebook") || sourceName.includes("facebook")) {
    return { channel: "social", platform: "Facebook" };
  }

  if (url.includes("t.me") || url.includes("telegram") || domain.includes("telegram") || sourceName.includes("telegram")) {
    return { channel: "social", platform: "Telegram" };
  }

  if (url.includes("tiktok.com") || domain.includes("tiktok") || sourceName.includes("tiktok")) {
    return { channel: "social", platform: "TikTok" };
  }

  if (url.includes("youtube.com") || url.includes("youtu.be") || domain.includes("youtube") || sourceName.includes("youtube")) {
    return { channel: "social", platform: "YouTube" };
  }

  if (sourceType === "social_media" || sourceType === "api") {
    return { channel: "social", platform: event.source_name || "Social Media" };
  }

  return {
    channel: "web",
    platform: domain || event.source_name || "Web Portal",
  };
}

function cleanTitle(title?: string | null): string {
  const value = title?.replace(/\s+/g, " ").trim();
  return value || "Disease information signal detected";
}

export function toCrawlingFeedItem(event: DiseaseEvent): CrawlingFeedItem {
  const country = countryForEvent(event);
  const { channel, platform } = detectChannelAndPlatform(event);
  return {
    id: event.id,
    countryCode: country.code,
    countryName: country.name,
    flag: country.flag,
    title: cleanTitle(event.title),
    disease: event.disease_classification,
    location: event.location_name,
    source: sourceDomain(event.url, event.source_name),
    sourceUrl: event.url,
    detectedAt: event.created_at ?? event.published_at ?? new Date().toISOString(),
    channel,
    platform,
  };
}

/** Backend timestamps are serialized by PostgreSQL without an offset but represent UTC. */
export function timestampMs(value: string): number {
  const normalized = value.trim().replace(" ", "T");
  if (!normalized) return Number.NaN;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  return Date.parse(hasTimezone ? normalized : normalized + "Z");
}

export function relativeTime(value: string, now = Date.now()): string {
  const timestamp = timestampMs(value);
  if (!Number.isFinite(timestamp)) return "0s ago";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return seconds + "s ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}
