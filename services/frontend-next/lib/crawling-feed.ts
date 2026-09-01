import type { DiseaseEvent } from "@/types";

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

function cleanTitle(title?: string | null): string {
  const value = title?.replace(/\s+/g, " ").trim();
  return value || "Disease information signal detected";
}

export function toCrawlingFeedItem(event: DiseaseEvent): CrawlingFeedItem {
  const country = countryForEvent(event);
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
  };
}

export function relativeTime(value: string, now = Date.now()): string {
  const timestamp = new Date(value).getTime();
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return "Just now";
  if (seconds < 60) return seconds + "s ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

