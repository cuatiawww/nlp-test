'use client'

import {
  ChevronDown,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Tv,
  FileSpreadsheet,
  Settings as SettingsIcon,
  Users as UsersIcon,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuthUser, logout, AuthUser } from "@/lib/auth";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSettings } from "@/lib/settings-context";

export default function DashboardHeader({
  onToggleSidebar,
  authenticated = true,
  consoleMode = false,
}: {
  onToggleSidebar: () => void;
  authenticated?: boolean;
  consoleMode?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [profile, setProfile] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => setUser(getAuthUser()), []);

  const logoSrc = settings.sidebar_logo_url || `${PUBLIC_BASE_PATH}/abvc-logo.webp`;
  
  const appTitle = consoleMode
    ? "SYSTEM MANAGEMENT CONSOLE"
    : (settings.app_name || "ASEAN REAL-TIME AI SURVEILLANCE DATA");
    
  const appSubtitle = consoleMode
    ? "Centralized System Management, Branding & Configuration Portal"
    : (settings.app_tagline || "Real-time multilingual data monitoring");

  return (
    <header className="w-full border-b-2 border-[#0060A9]/20 bg-white">
      <div className="relative flex min-h-[118px] items-stretch overflow-visible bg-[#f0f6fc]">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-100"
          style={{ backgroundImage: `url('${PUBLIC_BASE_PATH}/bg%20header.png')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/75 via-white/45 to-white/65" />
        <div className="relative grid w-full gap-5 px-4 py-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <button
              onClick={onToggleSidebar}
              aria-label={t("header.openMenu")}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-white"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link
              href={consoleMode ? "/console/settings" : "/"}
              className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt="Logo"
                className="h-auto max-h-[62px] w-[132px] shrink-0 object-contain md:w-[168px]"
                onError={(e) => {
                  e.currentTarget.src = `${PUBLIC_BASE_PATH}/abvc-logo.webp`;
                }}
              />
              <div className="min-w-0 border-[#0060A9]/25 md:border-l md:pl-5">
                <div className="flex items-center gap-2">
                  <h1 className="max-w-[720px] text-lg font-extrabold uppercase leading-tight text-slate-900 sm:text-2xl md:text-3xl">
                    {appTitle}
                  </h1>
                  {consoleMode && (
                    <span className="hidden sm:inline-flex items-center rounded-md bg-[#0060A9]/10 px-2 py-0.5 text-xs font-bold text-[#0060A9] border border-[#0060A9]/20">
                      ADMIN CONSOLE
                    </span>
                  )}
                </div>
                <p className="mt-2 hidden max-w-[760px] text-xs leading-relaxed text-slate-600 sm:block md:text-sm lg:text-base">
                  {appSubtitle}
                </p>
              </div>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
            <LanguageSwitcher />

            {/* In Console Mode: Show Console Tabs (Settings, Users) + Button to return to Surveillance Dashboard */}
            {consoleMode ? (
              <div className="hidden items-center rounded-2xl border border-[#0060A9]/15 bg-white/75 p-1.5 shadow-sm sm:flex">
                <Link
                  href="/console/settings"
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    pathname?.startsWith("/console/settings")
                      ? "bg-[#0060A9] text-white hover:bg-[#004b85]"
                      : "text-slate-700 hover:bg-white hover:text-[#0060A9]"
                  }`}
                >
                  <SettingsIcon className="h-4 w-4" />
                  Settings
                </Link>
                <Link
                  href="/console/users"
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    pathname?.startsWith("/console/users")
                      ? "bg-[#0060A9] text-white hover:bg-[#004b85]"
                      : "text-slate-700 hover:bg-white hover:text-[#0060A9]"
                  }`}
                >
                  <UsersIcon className="h-4 w-4" />
                  Users
                </Link>
                <Link
                  href="/reports/cms"
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    pathname?.startsWith("/console/reports-cms")
                      ? "bg-[#0060A9] text-white hover:bg-[#004b85]"
                      : "text-slate-700 hover:bg-white hover:text-[#0060A9]"
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Reports CMS
                </Link>
                <Link
                  href="/"
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-[#0060A9]"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard ↗
                </Link>
              </div>
            ) : (
              /* In Regular Dashboard Mode: Show standard Dashboard, TV mode, and Laporan */
              <div className="hidden items-center rounded-2xl border border-[#0060A9]/15 bg-white/75 p-1.5 shadow-sm sm:flex">
                <Link
                  href="/"
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    pathname === "/"
                      ? "bg-[#0060A9] text-white hover:bg-[#004b85]"
                      : "text-slate-700 hover:bg-white hover:text-[#0060A9]"
                  }`}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {t("header.dashboard")}
                </Link>
                <Link
                  href="/tv"
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    pathname === "/tv"
                      ? "bg-[#0060A9] text-white hover:bg-[#004b85]"
                      : "text-slate-700 hover:bg-white hover:text-[#0060A9]"
                  }`}
                >
                  <Tv className="h-4 w-4" />
                  {t("header.tvMode")}
                </Link>
                <Link
                  href="/reports"
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    pathname?.startsWith("/reports") || pathname?.startsWith("/laporan")
                      ? "bg-[#0060A9] text-white hover:bg-[#004b85]"
                      : "text-slate-700 hover:bg-white hover:text-[#0060A9]"
                  }`}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {t("header.reports") || "REPORTS"}
                </Link>
              </div>
            )}

            {!authenticated ? (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#0060A9] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#004b85]"
              >
                <LogIn className="h-4 w-4" />
                {t("header.login")}
              </Link>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setProfile((prev) => !prev)}
                  className="inline-flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#0060A9] text-xs font-bold text-white">
                    {user?.username ? user.username.charAt(0).toUpperCase() : "U"}
                  </span>
                  <span>{user?.username || "Account"}</span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
                {profile && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                      <p className="font-semibold text-slate-800">{user?.username}</p>
                      <p className="capitalize text-slate-400">{user?.role || "user"}</p>
                    </div>
                    {consoleMode ? (
                      <Link
                        href="/"
                        onClick={() => setProfile(false)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <LayoutDashboard className="h-4 w-4 text-slate-400" />
                        Surveillance Dashboard
                      </Link>
                    ) : null}
                    <button
                      onClick={() => logout()}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      {t("header.logout")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
