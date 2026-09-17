const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export type AuthUser = {
  token: string;
  user_id: string;
  username: string;
  role: string;
  permissions?: string[];
};

export interface SystemModule {
  id: string;
  label: string;
  description: string;
  category: 'Surveillance & Monitoring' | 'Master Data & Configuration' | 'System Management';
  path: string;
}

export const SYSTEM_MODULES: SystemModule[] = [
  // Surveillance & Monitoring
  { id: 'dashboard', label: 'Dashboard & Map', description: 'Surveillance dashboard, distribution map, and events', category: 'Surveillance & Monitoring', path: '/' },
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
  { id: 'disease_master', label: 'Disease Master', description: 'WHO ICD-11 disease concepts used by the NLP pipeline', category: 'Master Data & Configuration', path: '/disease-master' },
  { id: 'credibility', label: 'Source Credibility', description: 'Source media credibility scores and reputation', category: 'Master Data & Configuration', path: '/source-credibility' },
  { id: 'outbreak_rules', label: 'Outbreak Rules', description: 'Outbreak thresholds and alert rule configuration', category: 'Master Data & Configuration', path: '/outbreak-rules' },
  { id: 'nlp_config', label: 'NLP Labels & Keywords', description: 'NER labels, keyword dictionaries, and language models', category: 'Master Data & Configuration', path: '/nlp-labels' },
  { id: 'interoperability', label: 'Interoperability', description: 'Manage external APIs, feeds, and service integration status', category: 'Master Data & Configuration', path: '/interoperability' },

  // System Management
  { id: 'console_users', label: 'User Management', description: 'Create accounts and manage module permissions', category: 'System Management', path: '/console/users' },
  { id: 'console_settings', label: 'Settings & Audit', description: 'Application branding and activity audit history', category: 'System Management', path: '/console/settings' },
];

export const ROLE_PRESET_MODULES: Record<string, string[]> = {
  admin: ['*'],
  data_analyst: ['dashboard', 'events', 'sources', 'analyze', 'manual_crawler', 'crawl_history', 'processing', 'reports', 'locations', 'disease_master'],
  epidemiologi: ['dashboard', 'events', 'analyze', 'manual_crawler', 'crawl_history', 'reports', 'locations', 'disease_master', 'outbreak_rules', 'nlp_config'],
  executive: ['dashboard', 'events', 'reports', 'tv'],
  skk: ['dashboard', 'sources', 'manual_crawler', 'crawl_history', 'reports', 'processing'],
  // legacy fallbacks
  operator: ['dashboard', 'events', 'sources', 'analyze', 'manual_crawler', 'crawl_history', 'reports'],
  viewer: ['dashboard', 'reports'],
};

export function hasModuleAccess(user: AuthUser | null, moduleKeyOrPath: string): boolean {
  if (!user) return false;
  const role = user.role?.toLowerCase();
  if (role === 'admin' || role === 'superadmin' || role === 'webmaster' || user.permissions?.includes('*')) return true;

  if (user.permissions?.includes(moduleKeyOrPath)) return true;

  // Path mapping check
  const target = SYSTEM_MODULES.find(m => m.path === moduleKeyOrPath || m.id === moduleKeyOrPath);
  if (target && user.permissions?.includes(target.id)) return true;

  // Group paths check
  if (moduleKeyOrPath === '/' && user.permissions?.includes('dashboard')) return true;
  if (moduleKeyOrPath.startsWith('/events') && user.permissions?.includes('events')) return true;
  if (moduleKeyOrPath.startsWith('/sources') && user.permissions?.includes('sources')) return true;
  if (moduleKeyOrPath.startsWith('/analyze') && user.permissions?.includes('analyze')) return true;
  if (moduleKeyOrPath.startsWith('/manual-crawler') && user.permissions?.includes('manual_crawler')) return true;
  if (moduleKeyOrPath.startsWith('/crawl-history') && (user.permissions?.includes('crawl_history') || user.permissions?.includes('manual_crawler'))) return true;
  if (moduleKeyOrPath.startsWith('/processing') && user.permissions?.includes('processing')) return true;
  if ((moduleKeyOrPath.startsWith('/reports') || moduleKeyOrPath.startsWith('/laporan')) && user.permissions?.includes('reports')) return true;
  if (moduleKeyOrPath.startsWith('/tv') && user.permissions?.includes('tv')) return true;
  if (moduleKeyOrPath.startsWith('/locations') && user.permissions?.includes('locations')) return true;
  if (moduleKeyOrPath.startsWith('/disease-master') && (user.permissions?.includes('disease_master') || user.permissions?.includes('locations') || user.permissions?.includes('nlp_config'))) return true;
  if (moduleKeyOrPath.startsWith('/source-credibility') && user.permissions?.includes('credibility')) return true;
  if (moduleKeyOrPath.startsWith('/outbreak-rules') && user.permissions?.includes('outbreak_rules')) return true;
  if ((moduleKeyOrPath.startsWith('/nlp-labels') || moduleKeyOrPath.startsWith('/nlp-keywords') || moduleKeyOrPath.startsWith('/language-markers') || moduleKeyOrPath.startsWith('/extraction-rules') || moduleKeyOrPath.startsWith('/language-models')) && user.permissions?.includes('nlp_config')) return true;
  if (moduleKeyOrPath.startsWith('/interoperability') && user.permissions?.includes('interoperability')) return true;
  if (moduleKeyOrPath.startsWith('/console/users') && user.permissions?.includes('console_users')) return true;
  if (moduleKeyOrPath.startsWith('/console/settings') && user.permissions?.includes('console_settings')) return true;

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
