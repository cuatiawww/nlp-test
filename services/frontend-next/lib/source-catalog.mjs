export function sourceCatalogType(source) {
  const catalog = source?.catalog_type || source?.config?.catalog_type
  if (typeof catalog === 'string' && catalog.trim()) return catalog.trim()
  return source?.source_type || 'web'
}

export function sourceValidityStatus(source) {
  const value = source?.validity_status || source?.config?.validity_status
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function sourceOrigin(source) {
  const value = source?.source_origin || source?.config?.source_origin
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function sourceCredibilityType(catalogType, sourceType = 'web') {
  switch (String(catalogType || sourceType).trim().toLowerCase()) {
    case 'official government sites':
      return 'government'
    case 'local news':
      return 'news'
    case 'google':
      return 'web'
    case 'facebook':
      return 'social_media'
    case 'html':
    case 'chart':
      return 'web'
    case 'json':
      return 'api'
    case 'xml':
      return 'rss'
    default:
      return String(sourceType || 'web').toLowerCase()
  }
}
