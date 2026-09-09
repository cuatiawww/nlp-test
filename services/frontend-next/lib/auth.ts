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
  { id: 'dashboard', label: 'Dashboard & Peta', description: 'Surveillance Dashboard, peta sebaran & kejadian', category: 'Surveillance & Monitoring', path: '/' },
  { id: 'events', label: 'Kejadian Penyakit', description: 'Log kejadian penyakit, kasus, dan verifikasi data', category: 'Surveillance & Monitoring', path: '/events' },
  { id: 'sources', label: 'Data Sources', description: 'Manajemen sumber feed crawler berita dan API', category: 'Surveillance & Monitoring', path: '/sources' },
  { id: 'analyze', label: 'URL Analysis', description: 'Analisis interaktif artikel web dan dokumen PDF', category: 'Surveillance & Monitoring', path: '/analyze' },
  { id: 'processing', label: 'Processing & Queue', description: 'Monitoring antrian worker dan status crawling', category: 'Surveillance & Monitoring', path: '/processing' },
  { id: 'reports', label: 'Reports & Matrix', description: 'Laporan epidemiologi dan matriks rekapitulasi', category: 'Surveillance & Monitoring', path: '/reports' },
  { id: 'tv', label: 'TV Command Center', description: 'Tampilan layar lebar TV dashboard command center', category: 'Surveillance & Monitoring', path: '/tv' },

  // Master Data & Configuration
  { id: 'locations', label: 'Wilayah / Locations', description: 'Master data wilayah administratif dan koordinat', category: 'Master Data & Configuration', path: '/locations' },
  { id: 'credibility', label: 'Source Credibility', description: 'Skor kredibilitas dan reputasi media sumber', category: 'Master Data & Configuration', path: '/source-credibility' },
  { id: 'outbreak_rules', label: 'Outbreak Rules', description: 'Konfigurasi ambang batas dan aturan sinyal KLB', category: 'Master Data & Configuration', path: '/outbreak-rules' },
  { id: 'nlp_config', label: 'NLP Labels & Keywords', description: 'Label NER, kamus kata kunci, dan model bahasa', category: 'Master Data & Configuration', path: '/nlp-labels' },

  // System Management
  { id: 'console_users', label: 'Manajemen Pengguna', description: 'Pembuatan akun dan hak akses modul pengguna', category: 'System Management', path: '/console/users' },
  { id: 'console_settings', label: 'Pengaturan & Audit', description: 'Branding aplikasi dan riwayat audit aktivitas', category: 'System Management', path: '/console/settings' },
];

export const ROLE_PRESET_MODULES: Record<string, string[]> = {
  admin: ['*'],
  data_analyst: ['dashboard', 'events', 'sources', 'analyze', 'processing', 'reports', 'locations'],
  epidemiologi: ['dashboard', 'events', 'analyze', 'reports', 'locations', 'outbreak_rules', 'nlp_config'],
  executive: ['dashboard', 'events', 'reports', 'tv'],
  skk: ['dashboard', 'sources', 'reports', 'processing'],
  // legacy fallbacks
  operator: ['dashboard', 'events', 'sources', 'analyze', 'reports'],
  viewer: ['dashboard', 'reports'],
};

export function hasModuleAccess(user: AuthUser | null, moduleKeyOrPath: string): boolean {
  if (!user) return false;
  const role = user.role?.toLowerCase();
  if (role === 'admin' || user.permissions?.includes('*')) return true;

  if (user.permissions?.includes(moduleKeyOrPath)) return true;

  // Path mapping check
  const target = SYSTEM_MODULES.find(m => m.path === moduleKeyOrPath || m.id === moduleKeyOrPath);
  if (target && user.permissions?.includes(target.id)) return true;

  // Group paths check
  if (moduleKeyOrPath === '/' && user.permissions?.includes('dashboard')) return true;
  if (moduleKeyOrPath.startsWith('/events') && user.permissions?.includes('events')) return true;
  if (moduleKeyOrPath.startsWith('/sources') && user.permissions?.includes('sources')) return true;
  if (moduleKeyOrPath.startsWith('/analyze') && user.permissions?.includes('analyze')) return true;
  if (moduleKeyOrPath.startsWith('/processing') && user.permissions?.includes('processing')) return true;
  if ((moduleKeyOrPath.startsWith('/reports') || moduleKeyOrPath.startsWith('/laporan')) && user.permissions?.includes('reports')) return true;
  if (moduleKeyOrPath.startsWith('/tv') && user.permissions?.includes('tv')) return true;
  if (moduleKeyOrPath.startsWith('/locations') && user.permissions?.includes('locations')) return true;
  if (moduleKeyOrPath.startsWith('/source-credibility') && user.permissions?.includes('credibility')) return true;
  if (moduleKeyOrPath.startsWith('/outbreak-rules') && user.permissions?.includes('outbreak_rules')) return true;
  if ((moduleKeyOrPath.startsWith('/nlp-labels') || moduleKeyOrPath.startsWith('/nlp-keywords') || moduleKeyOrPath.startsWith('/language-markers') || moduleKeyOrPath.startsWith('/extraction-rules') || moduleKeyOrPath.startsWith('/language-models')) && user.permissions?.includes('nlp_config')) return true;
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
