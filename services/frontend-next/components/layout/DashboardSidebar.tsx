'use client'

import { X, ChevronDown, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { SidebarGroup, SidebarItem } from "@/lib/menu";
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
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  // Auto-expand parent module if current URL matches any sub-item
  useEffect(() => {
    const nextExpanded: Record<string, boolean> = {};
    menuGroups.forEach((group) => {
      group.items.forEach((item) => {
        if (item.subItems && item.subItems.length > 0) {
          const hasActiveChild = item.subItems.some((sub) => {
            if (!sub.href || sub.href === '#') return false;
            return sub.href === '/' ? pathname === '/' : pathname.startsWith(sub.href);
          });
          if (hasActiveChild) {
            nextExpanded[item.id || item.label] = true;
          }
        }
      });
    });
    setExpandedItems((prev) => ({ ...prev, ...nextExpanded }));
  }, [pathname, menuGroups]);

  const toggleExpand = (key: string) => {
    setExpandedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isItemActive = (item: SidebarItem) => {
    if (item.href === "/") return pathname === "/";
    if (item.href && item.href !== "#") return pathname.startsWith(item.href);
    if (item.subItems && item.subItems.length > 0) {
      return item.subItems.some((sub) => {
        if (sub.href === "/") return pathname === "/";
        return sub.href ? pathname.startsWith(sub.href) : false;
      });
    }
    return false;
  };

  const isSubActive = (sub: SidebarItem) => {
    if (sub.href === "/") return pathname === "/";
    return sub.href ? pathname.startsWith(sub.href) : false;
  };

  const logoSrc = settings.sidebar_logo_url || `${PUBLIC_BASE_PATH}/abvc-logo.webp`;
  const appTitle = settings.app_name || "ASEAN REAL-TIME AI SURVEILLANCE DATA";
  const appSubtitle = settings.app_tagline || "Real-time multilingual data monitoring";

  const resolveTargetUrl = (href?: string) => {
    if (!href || href === "#") return "#";
    if (href.startsWith("http")) return href;
    const cleanPath = href.startsWith("/") ? href : `/${href}`;
    const basePath = PUBLIC_BASE_PATH.replace(/\/$/, "");
    if (cleanPath === basePath) return "/";
    if (cleanPath.startsWith(`${basePath}/`)) {
      return cleanPath.slice(basePath.length) || "/";
    }
    return cleanPath;
  };

  return (
    <aside
      className={`fixed left-0 top-0 z-[60] h-screen w-[280px] border-r border-slate-100 bg-white text-slate-800 shadow-[2px_0_12px_rgba(0,0,0,0.03)] transition-transform duration-300 ${
        open ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"
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
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="h-[calc(100vh-80px)] overflow-y-auto px-3 py-4">
        {menuGroups.map((group, groupIdx) => (
          <div key={group.id || group.titleKey || group.title || groupIdx} className="mb-6">
            <div className="px-3 pb-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
              {group.title || (group.titleKey ? t(group.titleKey) : "")}
            </div>
            {group.items.length === 0 ? (
              <p className="px-3 py-1 text-xs text-slate-400 italic">No modules</p>
            ) : (
              <ul className="space-y-1">
                {group.items.map((item, itemIdx) => {
                  const itemKey = item.id || item.label || `item-${groupIdx}-${itemIdx}`;
                  const Icon = item.icon;
                  const active = isItemActive(item);
                  const hasSubs = item.subItems && item.subItems.length > 0;
                  const isExpanded = !!expandedItems[itemKey];
                  const targetUrl = resolveTargetUrl(item.href);

                  return (
                    <li key={itemKey}>
                      <div className="flex items-center">
                        <Link
                          href={hasSubs && (!item.href || item.href === "#") ? "#" : targetUrl}
                          onClick={(e) => {
                            if (hasSubs && (!item.href || item.href === "#")) {
                              e.preventDefault();
                              toggleExpand(itemKey);
                              return;
                            }
                            onClose();
                            if (item.href && item.href !== "#") {
                              if (pathname === item.href) {
                                e.preventDefault();
                              }
                            }
                          }}
                          className={`flex-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
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
                            {item.label || (item.labelKey ? t(item.labelKey) : "")}
                          </span>
                          {item.badge && (
                            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              {item.badge}
                            </span>
                          )}
                        </Link>

                        {hasSubs && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(itemKey)}
                            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
                            aria-label="Toggle sub-menu"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Sub-modules (Sub-Menu) Accordion */}
                      {hasSubs && isExpanded && (
                        <ul className="mt-1 ml-5 pl-3 border-l-2 border-slate-100 space-y-1">
                          {item.subItems!.map((sub, subIdx) => {
                            const subKey = sub.id || sub.label || `sub-${subIdx}`;
                            const SubIcon = sub.icon;
                            const subActive = isSubActive(sub);
                            const subUrl = resolveTargetUrl(sub.href);

                            return (
                              <li key={subKey}>
                                <Link
                                  href={subUrl}
                                  onClick={(e) => {
                                    onClose();
                                    if (sub.href && sub.href !== "#" && pathname === sub.href) {
                                      e.preventDefault();
                                    }
                                  }}
                                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                                    subActive
                                      ? "bg-[#0060A9]/10 text-[#0060A9] font-bold"
                                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                                  }`}
                                >
                                  {SubIcon && (
                                    <SubIcon
                                      className={`h-3.5 w-3.5 shrink-0 ${
                                        subActive ? "text-[#0060A9]" : "text-slate-400"
                                      }`}
                                    />
                                  )}
                                  <span className="truncate">
                                    {sub.label || (sub.labelKey ? t(sub.labelKey) : "")}
                                  </span>
                                  {sub.badge && (
                                    <span className="ml-auto text-[9px] font-bold px-1 py-0.2 rounded bg-blue-50 text-blue-600">
                                      {sub.badge}
                                    </span>
                                  )}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
