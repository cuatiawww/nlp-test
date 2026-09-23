import { DEFAULT_NAVIGATION_CONFIG, SidebarGroupConfig } from '@/lib/menu'
import { SYSTEM_MODULES, CONSOLE_SYSTEM_MODULES } from '@/lib/modules'

export interface NavSubItemInfo {
  label: string
  href: string
  icon?: string
}

export interface NavRouteInfo {
  isNav: boolean
  label?: string
  href?: string
  iconName?: string
  groupTitle?: string
  description?: string
  subItems?: NavSubItemInfo[]
}

/**
 * Checks if a given pathname matches any registered navigation route.
 * Looks into:
 * 1. Active dynamic navigation menu from database settings (settings.navigation_menu)
 * 2. Default static navigation configuration (DEFAULT_NAVIGATION_CONFIG)
 * 3. System modules catalog (SYSTEM_MODULES)
 * 4. System console modules (CONSOLE_SYSTEM_MODULES)
 */
export function checkNavigationRoute(
  pathname: string,
  dynamicMenu?: SidebarGroupConfig[] | null
): NavRouteInfo {
  if (!pathname) return { isNav: false }

  // Clean pathname: remove query params, trailing slashes, and next basePath '/nlp'
  let clean = pathname.split('?')[0].trim()
  if (clean.startsWith('/nlp/') || clean === '/nlp') {
    clean = clean.slice(4) || '/'
  }
  clean = clean.replace(/\/+$/, '') || '/'

  // 1. Check dynamic navigation configured in database (settings.navigation_menu)
  if (dynamicMenu && Array.isArray(dynamicMenu) && dynamicMenu.length > 0) {
    for (const group of dynamicMenu) {
      if (group.enabled === false) continue
      for (const item of group.items || []) {
        if (item.enabled === false) continue
        const itemClean = normalizeNavPath(item.href)
        if (itemClean && itemClean === clean) {
          return {
            isNav: true,
            label: item.label,
            href: item.href,
            iconName: item.icon,
            groupTitle: group.title,
            subItems: (item.subItems || [])
              .filter((s) => s.enabled !== false)
              .map((s) => ({ label: s.label, href: s.href, icon: s.icon })),
          }
        }

        // Check sub-items
        for (const sub of item.subItems || []) {
          if (sub.enabled === false) continue
          const subClean = normalizeNavPath(sub.href)
          if (subClean && subClean === clean) {
            return {
              isNav: true,
              label: sub.label,
              href: sub.href,
              iconName: sub.icon || item.icon,
              groupTitle: `${group.title} / ${item.label}`,
            }
          }
        }
      }
    }
  }

  // 2. Check static default navigation config (DEFAULT_NAVIGATION_CONFIG)
  for (const group of DEFAULT_NAVIGATION_CONFIG) {
    if (group.enabled === false) continue
    for (const item of group.items || []) {
      if (item.enabled === false) continue
      const itemClean = normalizeNavPath(item.href)
      if (itemClean && itemClean === clean) {
        return {
          isNav: true,
          label: item.label,
          href: item.href,
          iconName: item.icon,
          groupTitle: group.title,
          subItems: (item.subItems || [])
            .filter((s) => s.enabled !== false)
            .map((s) => ({ label: s.label, href: s.href, icon: s.icon })),
        }
      }

      for (const sub of item.subItems || []) {
        if (sub.enabled === false) continue
        const subClean = normalizeNavPath(sub.href)
        if (subClean && subClean === clean) {
          return {
            isNav: true,
            label: sub.label,
            href: sub.href,
            iconName: sub.icon || item.icon,
            groupTitle: `${group.title} / ${item.label}`,
          }
        }
      }
    }
  }

  // 3. Check SYSTEM_MODULES catalog
  for (const mod of SYSTEM_MODULES) {
    const modClean = normalizeNavPath(mod.path)
    if (modClean && modClean === clean) {
      return {
        isNav: true,
        label: mod.label,
        href: mod.path,
        groupTitle: mod.category,
        description: mod.description,
      }
    }
  }

  // 4. Check CONSOLE_SYSTEM_MODULES catalog
  for (const mod of CONSOLE_SYSTEM_MODULES) {
    const modClean = normalizeNavPath(mod.path)
    if (modClean && modClean === clean) {
      return {
        isNav: true,
        label: mod.label,
        href: mod.path,
        groupTitle: mod.groupTitle || mod.category,
        description: mod.description,
      }
    }
  }

  return { isNav: false }
}

function normalizeNavPath(href?: string | null): string {
  if (!href) return ''
  let clean = href.split('?')[0].trim()
  if (clean.startsWith('/nlp/') || clean === '/nlp') {
    clean = clean.slice(4) || '/'
  }
  return clean.replace(/\/+$/, '') || '/'
}
