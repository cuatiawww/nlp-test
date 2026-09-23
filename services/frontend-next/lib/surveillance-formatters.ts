/**
 * Utility functions to standardize surveillance typography to English.
 */

/**
 * Normalizes alert and severity levels to standardized English typography.
 * AWAS / Critical -> CRITICAL
 * SIAGA / High -> HIGH ALERT
 * WASPADA / Watch -> WATCH
 * NORMAL / Monitored -> NORMAL
 */
export function formatSeverityEn(severity?: string | null): string {
  if (!severity) return 'NORMAL'
  const s = severity.toUpperCase().trim()
  if (s === 'AWAS' || s === 'CRITICAL') return 'CRITICAL'
  if (s === 'SIAGA' || s === 'HIGH' || s === 'HIGH ALERT') return 'HIGH ALERT'
  if (s === 'WASPADA' || s === 'WATCH' || s === 'WARNING' || s === 'GUARDED') return 'WATCH'
  if (s === 'NORMAL' || s === 'BASELINE' || s === 'MONITORED') return 'NORMAL'
  return s
}

/**
 * Normalizes source channels and media types to standardized English typography.
 * Berita Online / BERITA ONLINE -> ONLINE NEWS
 * Media Sosial / MEDIA SOSIAL -> SOCIAL MEDIA
 * Laporan Resmi -> OFFICIAL REPORT
 * RSS Feeds -> RSS FEEDS
 */
export function formatSourceTypeEn(sourceType?: string | null): string {
  if (!sourceType) return 'ONLINE NEWS'
  const s = sourceType.toLowerCase().trim()
  if (s === 'berita online' || s === 'berita_online' || s === 'news' || s === 'online news') {
    return 'ONLINE NEWS'
  }
  if (s === 'media sosial' || s === 'media_sosial' || s === 'social media') {
    return 'SOCIAL MEDIA'
  }
  if (
    s === 'laporan resmi' ||
    s === 'laporan_resmi' ||
    s === 'official' ||
    s === 'official report' ||
    s === 'official api'
  ) {
    return 'OFFICIAL REPORT'
  }
  if (s === 'rss' || s === 'rss feeds' || s === 'rss_feeds') {
    return 'RSS FEEDS'
  }
  return sourceType.toUpperCase()
}
