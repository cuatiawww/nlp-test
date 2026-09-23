import {
  SYSTEM_MODULES,
  type SystemModule,
  getActiveModules,
  isModulePermitted,
  type ActiveModule,
} from './modules';
import type { SidebarGroupConfig } from './menu';

export { SYSTEM_MODULES, type SystemModule };

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const NAV_CACHE_KEY = "sys_nav_cache";

let memoryNavMenu: SidebarGroupConfig[] | null = null;

export function setNavigationCache(menu: SidebarGroupConfig[] | null | undefined) {
  if (Array.isArray(menu) && menu.length > 0) {
    memoryNavMenu = menu;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(NAV_CACHE_KEY, JSON.stringify(menu));
      } catch {}
    }
  }
}

export function getNavigationCache(): SidebarGroupConfig[] | null {
  if (memoryNavMenu) return memoryNavMenu;
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(NAV_CACHE_KEY);
      if (stored) {
        memoryNavMenu = JSON.parse(stored);
        return memoryNavMenu;
      }
    } catch {}
  }
  return null;
}

export type AuthUser = {
  token: string;
  user_id: string;
  username: string;
  role: string;
  permissions?: string[];
  full_name?: string;
  display_name?: string;
  email?: string;
};

export const ROLE_PRESET_MODULES: Record<string, string[]> = {
  admin: ['*'],
  data_analyst: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'events', 'sources', 'analyze', 'manual_crawler', 'crawl_history', 'processing', 'reports', 'locations', 'disease_master'],
  epidemiologi: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'events', 'analyze', 'manual_crawler', 'crawl_history', 'reports', 'locations', 'disease_master', 'outbreak_rules', 'nlp_config'],
  executive: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'events', 'reports', 'tv'],
  skk: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'sources', 'manual_crawler', 'crawl_history', 'reports', 'processing'],
  // legacy fallbacks
  operator: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'events', 'sources', 'analyze', 'manual_crawler', 'crawl_history', 'reports'],
  viewer: ['home', 'main_dashboard', 'dashboard', 'executive_dashboard', 'reports'],
};

export function hasModuleAccess(
  user: AuthUser | null,
  moduleKeyOrPath: string,
  navigationMenu?: SidebarGroupConfig[]
): boolean {
  if (!user) return false;
  const role = user.role?.toLowerCase();
  if (role === 'admin' || role === 'superadmin' || role === 'webmaster' || user.permissions?.includes('*')) return true;

  // Direct permission match
  if (user.permissions?.includes(moduleKeyOrPath)) return true;

  // Clean path (remove query params)
  const cleanPath = moduleKeyOrPath.split('?')[0];

  // 1. Dynamic active modules check from active navigation configuration
  const activeMenu = navigationMenu || getNavigationCache();
  const activeModules: ActiveModule[] = getActiveModules(activeMenu || undefined);

  for (const mod of activeModules) {
    const isTargetMod =
      mod.id === moduleKeyOrPath ||
      mod.path === cleanPath ||
      (mod.aliases && mod.aliases.includes(moduleKeyOrPath)) ||
      (mod.aliases && mod.aliases.includes(cleanPath)) ||
      (mod.path && mod.path !== '/' && cleanPath.startsWith(mod.path));

    if (isTargetMod) {
      if (isModulePermitted(mod, user.permissions)) {
        return true;
      }
    }

    // Check sub-modules
    if (mod.subItems && mod.subItems.length > 0) {
      for (const sub of mod.subItems) {
        const isTargetSub =
          sub.id === moduleKeyOrPath ||
          sub.path === cleanPath ||
          (sub.aliases && sub.aliases.includes(moduleKeyOrPath)) ||
          (sub.aliases && sub.aliases.includes(cleanPath)) ||
          (sub.path && sub.path !== '/' && cleanPath.startsWith(sub.path));

        if (isTargetSub) {
          // If parent module or sub-module itself is permitted, allow access
          if (
            isModulePermitted(mod, user.permissions) ||
            user.permissions?.includes(sub.id) ||
            user.permissions?.includes(sub.path) ||
            sub.aliases.some((a) => user.permissions?.includes(a))
          ) {
            return true;
          }
        }
      }
    }
  }

  // 2. Fallback to static SYSTEM_MODULES path mapping
  const target = SYSTEM_MODULES.find(m => m.path === cleanPath || m.id === moduleKeyOrPath);
  if (target && user.permissions?.includes(target.id)) return true;

  // 3. Fallback to group paths check
  if (cleanPath.startsWith('/lite-dashboard') && (user.permissions?.includes('lite_dashboard') || user.permissions?.includes('dashboard'))) return true;
  if (cleanPath.startsWith('/asean-countries') && (user.permissions?.includes('asean_countries') || user.permissions?.includes('dashboard'))) return true;
  if (cleanPath.startsWith('/asean-3') && (user.permissions?.includes('asean_3') || user.permissions?.includes('dashboard'))) return true;
  if (cleanPath.startsWith('/outside-asean') && (user.permissions?.includes('outside_asean') || user.permissions?.includes('dashboard'))) return true;
  if (cleanPath.startsWith('/analysis-dashboard') && (user.permissions?.includes('analysis_dashboard') || user.permissions?.includes('dashboard'))) return true;
  if (cleanPath.startsWith('/web-services-dashboard') && (user.permissions?.includes('web_services_dashboard') || user.permissions?.includes('dashboard'))) return true;
  if (cleanPath.startsWith('/crawling-dashboard') && (user.permissions?.includes('crawling_dashboard') || user.permissions?.includes('dashboard'))) return true;
  if (cleanPath.startsWith('/disease-dashboard') && (user.permissions?.includes('disease_dashboard') || user.permissions?.includes('dashboard'))) return true;
  if (cleanPath === '/') return true;
  if (cleanPath.startsWith('/main-dashboard') && (user.permissions?.includes('main_dashboard') || user.permissions?.includes('dashboard'))) return true;
  if (cleanPath.startsWith('/executive-dashboard') && (user.permissions?.includes('executive_dashboard') || user.permissions?.includes('dashboard') || user.permissions?.includes('reports') || user.permissions?.includes('tv'))) return true;
  if (cleanPath.startsWith('/events') && user.permissions?.includes('events')) return true;
  if (cleanPath.startsWith('/sources') && user.permissions?.includes('sources')) return true;
  if (cleanPath.startsWith('/analyze') && user.permissions?.includes('analyze')) return true;
  if (cleanPath.startsWith('/manual-crawler') && user.permissions?.includes('manual_crawler')) return true;
  if (cleanPath.startsWith('/crawl-history') && (user.permissions?.includes('crawl_history') || user.permissions?.includes('manual_crawler'))) return true;
  if (cleanPath.startsWith('/processing') && user.permissions?.includes('processing')) return true;
  if ((cleanPath.startsWith('/reports') || cleanPath.startsWith('/laporan')) && user.permissions?.includes('reports')) return true;
  if (cleanPath.startsWith('/tv') && user.permissions?.includes('tv')) return true;
  if (cleanPath.startsWith('/locations') && user.permissions?.includes('locations')) return true;
  if (cleanPath.startsWith('/disease-master') && (user.permissions?.includes('disease_master') || user.permissions?.includes('locations') || user.permissions?.includes('nlp_config'))) return true;
  if (cleanPath.startsWith('/source-credibility') && user.permissions?.includes('credibility')) return true;
  if (cleanPath.startsWith('/outbreak-rules') && user.permissions?.includes('outbreak_rules')) return true;
  if ((cleanPath.startsWith('/nlp-labels') || cleanPath.startsWith('/nlp-keywords') || cleanPath.startsWith('/language-markers') || cleanPath.startsWith('/extraction-rules') || cleanPath.startsWith('/language-models')) && user.permissions?.includes('nlp_config')) return true;
  if (cleanPath.startsWith('/interoperability') && user.permissions?.includes('interoperability')) return true;
  if (cleanPath.startsWith('/console/users') && user.permissions?.includes('console_users')) return true;
  if (cleanPath.startsWith('/console/settings') && user.permissions?.includes('console_settings')) return true;
  if (cleanPath.startsWith('/console/configuration-modul') && (user.permissions?.includes('configuration_modul') || user.permissions?.includes('console_settings'))) return true;

  return false;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL || "/nlp";
  let basePath = configured.replace(/\/$/, "");
  try {
    basePath = new URL(configured).pathname.replace(/\/$/, "");
  } catch {}
  window.location.href = basePath || "/";
}
