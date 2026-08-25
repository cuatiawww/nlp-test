"use client";

import { Home, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { SidebarGroup } from "@/lib/menu";

type Props = {
  open: boolean;
  menuGroups: SidebarGroup[];
  onClose: () => void;
};

const iconMap: Record<string, any> = {};
const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/nlp";
const basePath = (() => {
  try {
    return new URL(configuredBase).pathname.replace(/\/$/, "");
  } catch {
    return configuredBase.replace(/\/$/, "");
  }
})();

export default function DashboardSidebar({ open, menuGroups, onClose }: Props) {
  const pathname = usePathname();

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

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen w-[280px] border-r border-slate-100 bg-white text-slate-800 shadow-[2px_0_12px_rgba(0,0,0,0.03)] transition-transform duration-300 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="h-[4px] bg-[#047D78]" />
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
            <Image
              src={`${basePath}/Logo-Kemenkes.png`}
              alt="Logo Kementerian Kesehatan"
              width={38}
              height={38}
              className="h-auto w-full"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-wide text-slate-800">
              DISEASE SURVEILLANCE AI
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Kementerian Kesehatan RI
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Tutup"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="h-[calc(100vh-80px)] space-y-5 overflow-y-auto px-3 py-4">
        {menuGroups.map((group) => (
          <section key={group.title}>
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              {group.title}
            </p>
            <div className="mt-2 space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon || Home;
                const active = isActive(item);
                if (item.url) {
                  return (
                    <a
                      key={item.label}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.03em] text-slate-600 transition hover:bg-slate-50 hover:text-[#047D78]"
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </a>
                  );
                }
                return (
                  <Link
                    key={item.label}
                    href={item.href || "/"}
                    onClick={onClose}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-[0.03em] transition ${
                      active
                        ? "rounded-l-none rounded-r-xl border-l-4 border-[#047D78] bg-teal-50/70 font-bold text-[#047D78]"
                        : "text-slate-600 hover:bg-slate-50 hover:text-[#047D78]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
}
