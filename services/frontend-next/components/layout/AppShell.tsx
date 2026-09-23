'use client'

import { useEffect, useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { sidebarMenu, consoleMenu, SidebarGroup, convertConfigToSidebarGroups } from "@/lib/menu";
import DashboardSidebar from "./DashboardSidebar";
import DashboardHeader from "./DashboardHeader";
import { isLoggedIn, getAuthUser, hasModuleAccess, AuthUser } from "@/lib/auth";
import Footer from "./Footer";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSettings } from "@/lib/settings-context";

const guestMenu: SidebarGroup[] = [
  {
    title: "SURVEILLANCE",
    titleKey: "sidebar.sections.monitoring",
    items: [
      { label: "Home", labelKey: "sidebar.items.home", icon: undefined, href: "/" },
      { label: "Main Dashboard", labelKey: "sidebar.items.mainDashboard", icon: undefined, href: "/main-dashboard" },
      { label: "Lite Dashboard", labelKey: "sidebar.items.liteDashboard", icon: undefined, href: "/lite-dashboard" },
      { label: "ASEAN Countries", labelKey: "sidebar.items.aseanCountries", icon: undefined, href: "/asean-countries" },
      { label: "ASEAN +3", labelKey: "sidebar.items.asean3", icon: undefined, href: "/asean-3" },
      { label: "Outside ASEAN", labelKey: "sidebar.items.outsideAsean", icon: undefined, href: "/outside-asean" },
      { label: "Analysis Dashboard", labelKey: "sidebar.items.analysisDashboard", icon: undefined, href: "/analysis-dashboard" },
      { label: "Web Services Dashboard", labelKey: "sidebar.items.webServicesDashboard", icon: undefined, href: "/web-services-dashboard" },
      { label: "Disease Dashboard", labelKey: "sidebar.items.diseaseDashboard", icon: undefined, href: "/disease-dashboard" },
      { label: "Crawling Dashboard", labelKey: "sidebar.items.crawlingDashboard", icon: undefined, href: "/crawling-dashboard" },
      { label: "TV Mode", labelKey: "header.tvMode", icon: undefined, href: "/tv" },
      { label: "Reports", labelKey: "header.reports", icon: undefined, href: "/reports" },
    ],
  },
];

export default function AppShell({
  children,
  publicMode = false,
  tvMode = false,
  consoleMode = false,
}: {
  children: React.ReactNode;
  publicMode?: boolean;
  tvMode?: boolean;
  consoleMode?: boolean;
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(!publicMode);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const isDirectoryPage = pathname === '/countries' || pathname === '/diseases';

  useEffect(() => {
    const logged = isLoggedIn();
    setAuthenticated(logged);
    if (logged) {
      setCurrentUser(getAuthUser());
    } else {
      setCurrentUser(null);
    }

    const handleStorageChange = () => {
      const isLog = isLoggedIn();
      setAuthenticated(isLog);
      setCurrentUser(isLog ? getAuthUser() : null);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Close sidebar drawer automatically on page/route navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Filter menu groups according to user role and permitted modules
  const activeMenu = useMemo(() => {
    if (tvMode) return [];
    if (!authenticated) return guestMenu;

    const dynamicGroups = (settings.navigation_menu && settings.navigation_menu.length > 0)
      ? convertConfigToSidebarGroups(settings.navigation_menu)
      : sidebarMenu;

    const baseGroups = consoleMode
      ? [
          consoleMenu[0], // SYSTEM MANAGEMENT (Console tools: Settings, Modul, CMS, Users, etc.)
          ...dynamicGroups, // Dynamic Navigation configured by administrator!
        ]
      : dynamicGroups;

    // Admin or wildcard permission has access to everything
    if (!currentUser || currentUser.role?.toLowerCase() === 'admin' || currentUser.permissions?.includes('*')) {
      return baseGroups;
    }

    // Filter items based on module access
    return baseGroups
      .map((group) => {
        const filteredItems = group.items.filter((item) => {
          if (!item.href) return true;
          // Business Process doc is accessible
          if (item.href === '/business-process') return true;
          return hasModuleAccess(currentUser, item.href, settings.navigation_menu);
        });

        return {
          ...group,
          items: filteredItems,
        };
      })
      .filter((group) => group.items.length > 0 || (group.id && group.id.startsWith('grp_')));
  }, [tvMode, authenticated, consoleMode, currentUser, settings.navigation_menu]);

  if (tvMode)
    return (
      <main className="min-h-screen bg-slate-950 text-white">{children}</main>
    );

  return (
    <main className="flex min-h-screen flex-col bg-[#f8fafc] text-slate-900">
      {sidebarOpen && (
        <button
          type="button"
          aria-label={t("common.closeSidebar")}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-[55] bg-slate-900/35 backdrop-blur-[1px]"
        />
      )}
      <div className="print:hidden">
        <DashboardSidebar
          open={sidebarOpen}
          menuGroups={activeMenu}
          onClose={() => setSidebarOpen(false)}
        />
      </div>
      <div className="print:hidden">
        <DashboardHeader
          authenticated={authenticated}
          consoleMode={consoleMode}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />
      </div>
      <div className={`w-full flex-1 ${isDirectoryPage ? 'py-0' : 'py-3 md:py-5'}`}>{children}</div>
      <div className="print:hidden">
        <Footer />
      </div>
    </main>
  );
}
