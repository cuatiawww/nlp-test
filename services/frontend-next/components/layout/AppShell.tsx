'use client'

import { useEffect, useState } from "react";
import { sidebarMenu, consoleMenu } from "@/lib/menu";
import DashboardSidebar from "./DashboardSidebar";
import DashboardHeader from "./DashboardHeader";
import { isLoggedIn } from "@/lib/auth";
import Footer from "./Footer";
import EwsConsent from "./EwsConsent";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const guestMenu = [
  {
    title: "PEMANTAUAN",
    titleKey: "sidebar.sections.monitoring",
    items: [{ label: "Home", labelKey: "sidebar.items.home", icon: undefined, href: "/" }],
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(!publicMode);
  useEffect(() => {
    setAuthenticated(isLoggedIn());
  }, []);

  if (tvMode)
    return (
      <main className="min-h-screen bg-slate-950 text-white">{children}</main>
    );

  // When consoleMode is true, use the dedicated consoleMenu!
  const activeMenu = consoleMode
    ? consoleMenu
    : (authenticated ? sidebarMenu : guestMenu);

  return (
    <main className="flex min-h-screen flex-col bg-[#f8fafc] text-slate-900">
      {sidebarOpen && (
        <button
          type="button"
          aria-label={t("common.closeSidebar")}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[1px]"
        />
      )}
      <DashboardSidebar
        open={sidebarOpen}
        menuGroups={activeMenu}
        onClose={() => setSidebarOpen(false)}
      />
      <DashboardHeader
        authenticated={authenticated}
        consoleMode={consoleMode}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />
      <div className="w-full flex-1 py-3 md:py-5">{children}</div>
      <Footer />
      <EwsConsent />
    </main>
  );
}
