'use client'

import { X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { SidebarGroup } from "@/lib/menu";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSettings } from "@/lib/settings-context";

type Props = {
  open: boolean;
  menuGroups: SidebarGroup[];
  onClose: () => void;
};

export default function DashboardSidebar({ open, menuGroups, onClose }: Props) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { settings } = useSettings();

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  const isActive = (item: SidebarGroup["items"][0]) => {
    if (item.href === "/") return pathname === "/";
    if (item.href) return pathname.startsWith(item.href);
    return false;
  };

  const logoSrc = settings.sidebar_logo_url || `${PUBLIC_BASE_PATH}/abvc-logo.webp`;
  const appTitle = settings.app_name || "ASEAN REAL-TIME AI SURVEILLANCE DATA";
  const appSubtitle = settings.app_tagline || "Real-time multilingual data monitoring";

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen w-[280px] border-r border-slate-100 bg-white text-slate-800 shadow-[2px_0_12px_rgba(0,0,0,0.03)] transition-transform duration-300 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="h-[4px] bg-[#0060A9]" />
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt="Logo"
              className="h-auto w-full max-h-8 object-contain"
              onError={(e) => {
                e.currentTarget.src = `${PUBLIC_BASE_PATH}/abvc-logo.webp`;
              }}
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-wide text-slate-800 truncate uppercase">
              {appTitle}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 truncate">
              {appSubtitle}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label={t("common.closeSidebar")}
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="h-[calc(100vh-80px)] overflow-y-auto px-3 py-4">
        {menuGroups.map((group, groupIdx) => (
          <div key={group.titleKey || group.title || groupIdx} className="mb-6">
            <div className="px-3 pb-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              {group.titleKey ? t(group.titleKey) : group.title}
            </div>
            <ul className="space-y-1">
              {group.items.map((item, itemIdx) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <li key={item.labelKey || item.label || itemIdx}>
                    <Link
                      href={item.href || "#"}
                      onClick={() => {
                        if (window.innerWidth < 1024) onClose();
                      }}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                        active
                          ? "bg-[#0060A9]/10 text-[#0060A9]"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      {Icon && (
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? "text-[#0060A9]" : "text-slate-400"
                          }`}
                        />
                      )}
                      <span className="truncate">
                        {item.labelKey ? t(item.labelKey) : item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
