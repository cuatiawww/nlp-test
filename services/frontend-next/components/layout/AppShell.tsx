'use client'

import { useEffect, useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import { sidebarMenu, consoleMenu, SidebarGroup } from "@/lib/menu";
import DashboardSidebar from "./DashboardSidebar";
import DashboardHeader from "./DashboardHeader";
import { isLoggedIn, getAuthUser, hasModuleAccess, AuthUser } from "@/lib/auth";
import Footer from "./Footer";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const guestMenu: SidebarGroup[] = [
  {
    title: "SURVEILLANCE",
    titleKey: "sidebar.sections.monitoring",
    items: [
      { label: "Home", labelKey: "sidebar.items.home", icon: undefined, href: "/" },
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

    const baseGroups = consoleMode ? consoleMenu : sidebarMenu;

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
          return hasModuleAccess(currentUser, item.href);
        });

        return {
          ...group,
          items: filteredItems,
        };
      })
      .filter((group) => group.items.length > 0);
  }, [tvMode, authenticated, consoleMode, currentUser]);

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
