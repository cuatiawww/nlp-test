'use client'

import {
  ChevronDown,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Tv,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getAuthUser, logout, AuthUser } from "@/lib/auth";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export default function DashboardHeader({
  onToggleSidebar,
  authenticated = true,
}: {
  onToggleSidebar: () => void;
  authenticated?: boolean;
}) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => setUser(getAuthUser()), []);

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
              href="/"
              className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:gap-5"
            >
              <Image
                src={`${PUBLIC_BASE_PATH}/abvc-logo.webp`}
                alt="Logo ABVC"
                width={170}
                height={62}
                className="h-auto w-[132px] shrink-0 md:w-[168px]"
                priority
              />
              <div className="min-w-0 border-[#0060A9]/25 md:border-l md:pl-5">
                <h1 className="max-w-[720px] text-lg font-extrabold uppercase leading-tight text-slate-900 sm:text-2xl md:text-3xl">
                  {t("header.title")}
                </h1>
                <p className="mt-2 hidden max-w-[760px] text-xs leading-relaxed text-slate-600 sm:block md:text-sm lg:text-base">
                  {t("header.subtitle")}
                </p>
              </div>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
            <LanguageSwitcher />

            <div className="hidden items-center rounded-2xl border border-[#0060A9]/15 bg-white/75 p-1.5 shadow-sm sm:flex">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-xl bg-[#0060A9] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#004b85]"
              >
                <LayoutDashboard className="h-4 w-4" />
                {t("header.dashboard")}
              </Link>
              <Link
                href="/tv"
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white hover:text-[#0060A9]"
              >
                <Tv className="h-4 w-4" />
                {t("header.tvMode")}
              </Link>
            </div>
            {!authenticated ? (
              <Link
                href="/login"
                className="flex h-12 items-center gap-2 rounded-xl bg-[#0060A9] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#004b85]"
              >
                <LogIn className="h-4 w-4" />
                {t("header.login")}
              </Link>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setProfile((v) => !v)}
                  className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 shadow-sm"
                >
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#0060A9] to-blue-500 font-bold text-white">
                    {user?.username?.[0]?.toUpperCase() || "A"}
                  </div>
                  <span className="hidden text-sm font-bold sm:block">
                    {user?.username || "Admin"}
                  </span>
                  <ChevronDown className="h-4 w-4" />
                </button>
                {profile && (
                  <div className="absolute right-0 top-14 z-40 w-52 rounded-xl border bg-white p-2 shadow-xl">
                    <button
                      onClick={logout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
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
      <div className="h-[3px] bg-gradient-to-r from-[#0060A9] via-[#0060A9]/40 to-transparent" />
    </header>
  );
}
