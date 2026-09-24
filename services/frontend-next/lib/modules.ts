import {
  SidebarGroupConfig,
  DEFAULT_NAVIGATION_CONFIG,
} from '@/lib/menu'

export interface SystemModule {
  id: string
  label: string
  description: string
  category: 'Surveillance & Monitoring' | 'Master Data & Configuration' | 'System Management'
  path: string
}

export const SYSTEM_MODULES: SystemModule[] = [
  // Surveillance & Monitoring
  { id: 'home', label: 'Home Portal', description: 'Personalized command landing page, surveillance overview, and launchpad', category: 'Surveillance & Monitoring', path: '/' },
  { id: 'main_dashboard', label: 'Main Dashboard', description: 'ASEAN disease spatial outbreak map, outbreak events, and epidemiological surveillance metrics', category: 'Surveillance & Monitoring', path: '/main-dashboard' },
  { id: 'dashboard', label: 'Surveillance Dashboard', description: 'Surveillance dashboard, distribution map, and events', category: 'Surveillance & Monitoring', path: '/main-dashboard' },
  { id: 'lite_dashboard', label: 'Lite Dashboard', description: 'Public Guest situational awareness and regional outbreak summary', category: 'Surveillance & Monitoring', path: '/lite-dashboard' },
  { id: 'asean_countries', label: 'ASEAN Countries', description: 'Surveillance and cross-border threat monitoring across the 11 ASEAN member states', category: 'Surveillance & Monitoring', path: '/asean-countries' },
  { id: 'asean_3', label: 'ASEAN +3', description: 'Expanded regional surveillance covering 11 ASEAN states plus China, Japan, and South Korea', category: 'Surveillance & Monitoring', path: '/asean-3' },
  { id: 'outside_asean', label: 'Outside ASEAN', description: 'Global disease surveillance, international outbreaks, and non-ASEAN threat horizons', category: 'Surveillance & Monitoring', path: '/outside-asean' },
  { id: 'analysis_dashboard', label: 'Analysis Dashboard', description: 'Consolidated URL and document NLP extraction intelligence, accuracy metrics, and text-mining triage', category: 'Surveillance & Monitoring', path: '/analysis-dashboard' },
  { id: 'web_services_dashboard', label: 'Web Services Dashboard', description: 'Internal microservices mesh health, external environmental geoproxies, and interoperability API catalog', category: 'Surveillance & Monitoring', path: '/web-services-dashboard' },
  { id: 'crawling_dashboard', label: 'Crawling Dashboard', description: 'Web ingestion, scraper operations, and collection pipeline intelligence', category: 'Surveillance & Monitoring', path: '/crawling-dashboard' },
  { id: 'disease_dashboard', label: 'Disease Dashboard', description: 'Local disease concepts, morbidity trends, and disease surveillance', category: 'Surveillance & Monitoring', path: '/disease-dashboard' },
  { id: 'executive_dashboard', label: 'Executive Dashboard', description: 'Macro situational awareness, strategic threat triage, and policy briefing', category: 'Surveillance & Monitoring', path: '/executive-dashboard' },
  { id: 'events', label: 'Disease Events', description: 'Disease event logs, cases, and data verification', category: 'Surveillance & Monitoring', path: '/events' },
  { id: 'sources', label: 'Data Sources', description: 'Manage news feeds and API collection sources', category: 'Surveillance & Monitoring', path: '/sources' },
  { id: 'analyze', label: 'URL Analysis', description: 'Analyze a single web article or PDF independently', category: 'Surveillance & Monitoring', path: '/analyze' },
  { id: 'manual_crawler', label: 'Manual Crawler', description: 'Run an on-demand disease and location surveillance crawl', category: 'Surveillance & Monitoring', path: '/manual-crawler' },
  { id: 'crawl_history', label: 'Crawl History', description: 'Browse stored health-surveillance crawl results (non-health noise hidden by default)', category: 'Surveillance & Monitoring', path: '/crawl-history' },
  { id: 'processing', label: 'Processing & Queue', description: 'Monitor worker queues and collection status', category: 'Surveillance & Monitoring', path: '/processing' },
  { id: 'reports', label: 'Reports & Matrix', description: 'Epidemiological reports and summary matrices', category: 'Surveillance & Monitoring', path: '/reports' },
  { id: 'tv', label: 'TV Command Center', description: 'Wide-screen command center dashboard view', category: 'Surveillance & Monitoring', path: '/tv' },

  // Master Data & Configuration
  { id: 'locations', label: 'Locations', description: 'Administrative location master data and coordinates', category: 'Master Data & Configuration', path: '/locations' },
  { id: 'disease_master', label: 'Disease Master', description: 'Local disease concepts used by the NLP pipeline', category: 'Master Data & Configuration', path: '/disease-master' },
  { id: 'credibility', label: 'Source Credibility', description: 'Source media credibility scores and reputation', category: 'Master Data & Configuration', path: '/source-credibility' },
  { id: 'outbreak_rules', label: 'Outbreak Rules', description: 'Outbreak thresholds and alert rule configuration', category: 'Master Data & Configuration', path: '/outbreak-rules' },
  { id: 'nlp_config', label: 'NLP Labels & Keywords', description: 'NER labels, keyword dictionaries, and language models', category: 'Master Data & Configuration', path: '/nlp-labels' },
  { id: 'interoperability', label: 'Interoperability', description: 'Manage external APIs, feeds, and service integration status', category: 'Master Data & Configuration', path: '/interoperability' },

  // System Management
  { id: 'console_users', label: 'User Management', description: 'Create accounts and manage module permissions', category: 'System Management', path: '/console/users' },
  { id: 'console_settings', label: 'Settings & Audit', description: 'Application branding and activity audit history', category: 'System Management', path: '/console/settings' },
  { id: 'configuration_modul', label: 'Configuration Modul', description: 'Configure navigation groups, modules, and sub-modules for sidebar', category: 'System Management', path: '/console/configuration-modul' },
]

export interface ActiveSubModule {
  id: string
  label: string
  path: string
  icon?: string
  enabled: boolean
  aliases: string[]
}

export interface ActiveModule {
  id: string
  label: string
  description?: string
  category: string
  groupId?: string
  groupTitle?: string
  path: string
  icon?: string
  order?: number
  enabled: boolean
  subItems?: ActiveSubModule[]
  aliases: string[]
}

export interface ActiveModuleCategory {
  name: string
  iconName: string
  groupId?: string
  modules: ActiveModule[]
}

// Dedicated Console / System Management modules that are always available for role assignment
export const CONSOLE_SYSTEM_MODULES: ActiveModule[] = [
  {
    id: 'console_users',
    label: 'User Management',
    description: 'Create user accounts, custom roles, and module access control matrices',
    category: 'System Management',
    groupId: 'grp_system_management',
    groupTitle: 'System Management',
    path: '/console/users',
    icon: 'Users',
    enabled: true,
    aliases: ['console_users', '/console/users', 'users'],
  },
  {
    id: 'console_settings',
    label: 'Configuration & Branding',
    description: 'Application branding, system logos, and operational parameters',
    category: 'System Management',
    groupId: 'grp_system_management',
    groupTitle: 'System Management',
    path: '/console/settings',
    icon: 'Settings',
    enabled: true,
    aliases: ['console_settings', '/console/settings', 'settings'],
  },
  {
    id: 'configuration_modul',
    label: 'Configuration Modul',
    description: 'Configure navigation groups, modules, and sub-modules for sidebar',
    category: 'System Management',
    groupId: 'grp_system_management',
    groupTitle: 'System Management',
    path: '/console/configuration-modul',
    icon: 'SlidersHorizontal',
    enabled: true,
    aliases: ['configuration_modul', '/console/configuration-modul'],
  },
  {
    id: 'reports_cms',
    label: 'Publication CMS & Reports',
    description: 'Manage publication issues, bulletins, and report CMS content',
    category: 'System Management',
    groupId: 'grp_system_management',
    groupTitle: 'System Management',
    path: '/reports/cms',
    icon: 'FileText',
    enabled: true,
    aliases: ['reports_cms', '/reports/cms', 'cms'],
  },
  {
    id: 'audit_logs',
    label: 'Activity Audit Logs',
    description: 'View administrative and operational system activity logs',
    category: 'System Management',
    groupId: 'grp_system_management',
    groupTitle: 'System Management',
    path: '/console/settings?tab=audit',
    icon: 'History',
    enabled: true,
    aliases: ['audit_logs', '/console/settings?tab=audit', 'audit'],
  },
]

/**
 * Generates an array of all lookup aliases for a module to ensure 100% backward
 * compatibility with legacy string permissions ('dashboard', 'events', 'locations')
 * as well as new dynamic identifiers ('mod_1789972871932', '/nlp-ai').
 */
export function getModuleAliases(id: string, href?: string): string[] {
  const aliases = new Set<string>()
  if (id) {
    aliases.add(id)
    if (id.startsWith('mod_')) {
      aliases.add(id.slice(4))
    }
  }
  if (href) {
    aliases.add(href)
    const cleanPath = href.split('?')[0].replace(/^\//, '')
    if (cleanPath) {
      aliases.add(cleanPath)
      aliases.add(cleanPath.replace(/-/g, '_'))
      aliases.add(cleanPath.replace(/\//g, '_'))
    } else {
      aliases.add('dashboard')
      aliases.add('home')
    }
  }

  // Cross-reference with SYSTEM_MODULES definitions
  for (const sysMod of SYSTEM_MODULES) {
    if (sysMod.id === id || (href && sysMod.path === href.split('?')[0])) {
      aliases.add(sysMod.id)
      aliases.add(sysMod.path)
    }
  }

  return Array.from(aliases)
}

/**
 * Extracts and unifies all currently active modules from the navigation menu configuration.
 * Includes both dynamically configured modules (from settings.navigation_menu) and
 * core system management console modules.
 */
export function getActiveModules(navigationMenu?: SidebarGroupConfig[]): ActiveModule[] {
  const groupsToProcess = Array.isArray(navigationMenu) && navigationMenu.length > 0
    ? navigationMenu
    : DEFAULT_NAVIGATION_CONFIG

  const result: ActiveModule[] = []
  const seenIds = new Set<string>()

  // 1. Process navigation menu groups
  for (const grp of groupsToProcess) {
    if (grp.enabled === false) continue

    const categoryTitle = grp.title || 'Other Modules'

    if (Array.isArray(grp.items)) {
      for (const item of grp.items) {
        if (item.enabled === false) continue
        if (!item.id || seenIds.has(item.id)) continue

        seenIds.add(item.id)

        // Process sub-modules if present
        const subItems: ActiveSubModule[] = []
        if (Array.isArray(item.subItems)) {
          for (const sub of item.subItems) {
            if (sub.enabled === false) continue
            subItems.push({
              id: sub.id,
              label: sub.label,
              path: sub.href || '',
              icon: sub.icon,
              enabled: true,
              aliases: getModuleAliases(sub.id, sub.href),
            })
          }
        }

        // Find best description: from SYSTEM_MODULES, or sub-modules summary, or route
        let description = ''
        const sysMatch = SYSTEM_MODULES.find(m => m.id === item.id || (item.href && m.path === item.href))
        if (sysMatch?.description) {
          description = sysMatch.description
        } else if (subItems.length > 0) {
          description = `Includes: ${subItems.map(s => s.label).join(', ')}`
        } else if (item.href) {
          description = `Route: ${item.href}`
        } else {
          description = `${item.label} module`
        }

        result.push({
          id: item.id,
          label: item.label,
          description,
          category: categoryTitle,
          groupId: grp.id,
          groupTitle: categoryTitle,
          path: item.href || '',
          icon: item.icon || 'Folder',
          order: item.order,
          enabled: true,
          subItems: subItems.length > 0 ? subItems : undefined,
          aliases: getModuleAliases(item.id, item.href),
        })
      }
    }
  }

  // 2. Append Console System Management modules (if not already present)
  for (const consoleMod of CONSOLE_SYSTEM_MODULES) {
    if (!seenIds.has(consoleMod.id)) {
      seenIds.add(consoleMod.id)
      result.push(consoleMod)
    }
  }

  return result
}

/**
 * Organizes active modules into categories with appropriate icons for UI display.
 */
export function getActiveCategories(activeModules: ActiveModule[]): ActiveModuleCategory[] {
  const categoryMap = new Map<string, ActiveModule[]>()

  for (const mod of activeModules) {
    const cat = mod.category || 'Other Modules'
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, [])
    }
    categoryMap.get(cat)!.push(mod)
  }

  const result: ActiveModuleCategory[] = []

  // Helper to map category name to a clean Lucide icon
  const getCategoryIcon = (name: string): string => {
    const lower = name.toLowerCase()
    if (lower.includes('home') || lower.includes('monitoring')) return 'Activity'
    if (lower.includes('dashboard')) return 'LayoutDashboard'
    if (lower.includes('config') || lower.includes('master')) return 'Sliders'
    if (lower.includes('doc') || lower.includes('process')) return 'BookText'
    if (lower.includes('system') || lower.includes('admin') || lower.includes('console')) return 'Settings2'
    return 'Layers'
  }

  for (const [name, modules] of categoryMap.entries()) {
    result.push({
      name,
      iconName: getCategoryIcon(name),
      groupId: modules[0]?.groupId,
      modules,
    })
  }

  return result
}

/**
 * Checks whether an active module is permitted under a given permissions list.
 */
export function isModulePermitted(mod: ActiveModule, permissions?: string[]): boolean {
  if (!permissions || permissions.length === 0) return false
  if (permissions.includes('*')) return true
  if (permissions.includes(mod.id)) return true
  if (mod.path && permissions.includes(mod.path)) return true
  if (mod.aliases && mod.aliases.some(a => permissions.includes(a))) return true

  // Also check if any of its subItems are permitted
  if (mod.subItems && mod.subItems.length > 0) {
    if (
      mod.subItems.some(
        sub =>
          permissions.includes(sub.id) ||
          permissions.includes(sub.path) ||
          sub.aliases.some(a => permissions.includes(a))
      )
    ) {
      return true
    }
  }

  return false
}

/**
 * Resolves an ID, slug, or path into a human-readable module title.
 */
export function resolveModuleLabel(idOrPath: string, activeModules: ActiveModule[]): string {
  if (!idOrPath) return ''
  if (idOrPath === '*') return 'All Modules'

  // 1. Direct match on module id or path
  const direct = activeModules.find(m => m.id === idOrPath || m.path === idOrPath)
  if (direct) return direct.label

  // 2. Check aliases
  const aliasMatch = activeModules.find(m => m.aliases && m.aliases.includes(idOrPath))
  if (aliasMatch) return aliasMatch.label

  // 3. Check subItems
  for (const mod of activeModules) {
    if (mod.subItems) {
      const sub = mod.subItems.find(
        s => s.id === idOrPath || s.path === idOrPath || s.aliases.includes(idOrPath)
      )
      if (sub) return `${mod.label} › ${sub.label}`
    }
  }

  // 4. Fallback to SYSTEM_MODULES
  const sys = SYSTEM_MODULES.find(m => m.id === idOrPath || m.path === idOrPath)
  if (sys) return sys.label

  // 5. Clean formatting fallback
  return idOrPath
    .replace(/^mod_/, '')
    .replace(/^sub_/, '')
    .replace(/^\//, '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .toUpperCase()
}
