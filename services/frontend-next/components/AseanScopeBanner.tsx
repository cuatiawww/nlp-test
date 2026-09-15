"use client";

import { ASEAN_SCOPE_BANNER, ASEAN_SCOPE_HINT, isAseanDefaultScope } from "@/lib/asean-scope";

export default function AseanScopeBanner({
  country,
}: {
  country?: string | null;
}) {
  if (country && !isAseanDefaultScope(country) && country !== "global") {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-[11px] font-semibold text-slate-600">
        Totals shown: {country} only (one of 11 ASEAN + Timor-Leste jurisdictions).
      </div>
    );
  }
  if (country === "global") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
        Totals shown: Global (outside-ASEAN events included). Default remains ASEAN 11 jurisdictions.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-[11px] font-semibold text-sky-950">
      <span className="font-black uppercase tracking-wide text-[#0060A9]">{ASEAN_SCOPE_BANNER}</span>
      <span className="mt-0.5 block font-medium text-slate-600">{ASEAN_SCOPE_HINT}</span>
    </div>
  );
}
